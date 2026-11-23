"""Verify returning bubbles, their owners, and player-specific underwater routes."""
import json
from time import monotonic, sleep

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_aquatic_crabs import equipped_fixture, pulse, swimmers, through
from test_coop_branch_legends import SPECS, actor_at, level, read, run_until, verify_credit, view
from test_coop_childe import run
from test_coop_dry_legends import at, dive, edge
from test_coop_local import Client, LOCK, SESSIONS, advance, lab

CH='legend-fontaine_chassanion'
CO='legend-fontaine_mageblade_corrouge'
HUB='fontaine-hub'
OUT,TOWER='fon-wp-55765','morte-tower-sluice'
WORKSHOP,WATER='fon-wp-55784','erinnyes-root-waterway'
STARTS={CH:OUT,CO:WORKSHOP}
PASSAGES={CH:TOWER,CO:WATER}
QUESTS={CH:'fon-morte-sluice-survey',CO:'fon-erinnyes-root-water-survey'}
COUNTS={CH:4,CO:5}


def quest_state(core,s,id,reported):
    quest=QUESTS[id]
    core.enterStoryNode(s,STARTS[id])
    core.enterStoryNode(s,PASSAGES[id])
    core.enterStoryNode(s,HUB)
    core.action(s,'story_accept:'+quest)
    s.story.quests[quest].count=COUNTS[id] if reported else 1
    if reported:
        core.action(s,'story_report:'+quest)
        assert s.story.quests[quest].status=='complete'
    core.enterStoryNode(s,STARTS[id])


def fixtures(lua,core):
    for name,id in [('fontaine-bubble',CH),('fontaine-corrouge',CO)]:
        equipped_fixture(lua,core,name)
        original=read(f'work/coop-{name}-fixture.json')
        s=core.restore(lua.table_from(original,recursive=True))
        quest_state(core,s,id,True)
        save=validate_save(native(core.checkpoint(s)))
        (ROOT/f'work/coop-{name}-reported.json').write_text(json.dumps(save),encoding='utf8')


def event_count(s,kind):
    return sum(e.kind==kind for e in s.events.values())


def ready_room(core,id):
    spec,parties=swimmers(core,id)
    room=core.newCoop(parties[0])
    members=[core.attachCoop(room,s) for s in parties]
    slot=room.fieldSlot
    step=lambda:core.stepCoop(room,TICK)
    opening=spec['moves'][0]['steps'][0]
    ready=opening.get('setAt',opening['first'])
    run_until(step,lambda:slot.cast and slot.cast.tick==ready)
    return spec,parties,room,members,step,slot.cast.strikes[1]


def aim(s,strike):
    actor_at(s,strike.x-65,strike.y+28).dir=1


def returned(core,id,departure=None):
    spec,parties,room,members,step,strike=ready_room(core,id)
    host,guest,other,spectator=parties
    boss=room.fieldSlot.enemy
    cast=room.fieldSlot.cast
    assert (strike.setAt is not None)==(id==CO)
    assert pulse(core,host,boss)>0 and not event_count(guest,'hit')
    for s in (host,guest): aim(s,strike)
    assert all(core.frame(s).storySwimCombat.reflect.ready for s in parties[:2])
    hp=boss.hp
    core.action(guest,'skill1')
    assert event_count(guest,'swim_bubble_return')==1 and boss.hp==hp
    assert not core.frame(host).storySwimCombat.reflect.ready
    assert core.frame(guest).storySwimCombat.reflect.cooldown>0
    assert core.frame(host).storySwimCombat.reflect.cooldown==0
    core.action(host,'skill1')
    assert not event_count(host,'swim_bubble_return') and event_count(guest,'swim_bubble_return')==1
    warnings=view(core,host)['warnings']
    assert sum(w.get('returning',False) for w in warnings)==1
    assert all(view(core,s)['warnings']==warnings for s in parties)
    delay=strike.reflection.arrives-cast.tick
    for s in parties: actor_at(s,boss.x-130,boss.y+28)
    if departure in ('stay','leave-lethal'):
        boss.hp=1
        hp=1
    if departure in ('leave','leave-lethal','resume'):
        arena=spec['node']
        core.enterStoryNode(guest,STARTS[id])
        core.detachCoop(members[1])
        if departure=='leave':
            core.enterStoryNode(guest,HUB)
            preset={'setId':'paleFlame','subpair':'atk_crit'}
            for slot in (1,2):
                assert core.giveArtifact(guest,slot,20,3,preset)
                item=guest.inventory['items'][len(guest.inventory['items'])]
                core.action(guest,'artifact_equip:'+str(item.id))
            assert guest.actors[1].artifactPhysicalBonus==.25
        if departure=='resume':
            for i,s in ((0,host),(2,other),(3,spectator)):
                core.enterStoryNode(s,STARTS[id])
                core.detachCoop(members[i])
            frozen=room.tick,cast.tick
            run(step,delay+2)
            assert frozen==(room.tick,cast.tick) and boss.hp==hp
            for i,s in enumerate(parties):
                core.enterStoryNode(s,arena)
                core.attachCoop(room,s,members[i])
                actor_at(s,boss.x-130,boss.y+28)
    run(step,delay-1)
    assert boss.hp==hp and not event_count(guest,'swim_bubble_impact')
    step()
    assert boss.hp<hp and strike.reflection.impact
    assert not event_count(host,'swim_bubble_impact') and not event_count(other,'swim_bubble_impact')
    if departure in ('leave','leave-lethal'):
        assert not event_count(guest,'swim_bubble_impact') and not event_count(guest,'hit')
        assert not guest.kills
        if departure=='leave-lethal':
            assert boss.hp==0 and room.fieldSlot.phase=='cleared'
            assert host.kills==1 and host.mora==spec['mora'] and host.endgame.bosses[id].clears==1
            assert not any(s.kills for s in parties[1:])
        else:
            assert room.fieldSlot.phase=='combat'
    else:
        assert event_count(guest,'swim_bubble_impact')==event_count(guest,'hit')==1
        if departure=='stay':
            assert room.fieldSlot.phase=='cleared'
            return verify_credit(core,parties,id,spec['mora'])
    return hp-boss.hp


def connect(url,id):
    entry=STARTS[id]
    host,guest=Client(url),Client(url)
    for i,c in enumerate((host,guest)):
        c.frame(['story_start'])
        with LOCK:
            env=SESSIONS[c.sid]
            core,s=env['core'],env['state']
            level(core,s,100-i)
            if id==CO or i==1:
                quest_state(core,s,id,reported=(id==CH or i==0))
            else: core.enterStoryNode(s,entry)
            s.actors[2].hp=0
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    return host,guest,code


def blocked(c,from_node,to):
    gate=edge(from_node,to)
    at(c,gate['x'],gate.get('y',480))
    frame=c.frame(['story_portal:'+to])
    assert frame['story']['node']==from_node and not frame.get('storyLift')
    return frame


def http(url,id):
    spec=SPECS[id]
    arena,host_map,guest_map=spec['node'],STARTS[id],PASSAGES[id]
    host,guest,code=connect(url,id)
    if id==CO:
        assert dive(host,host_map,guest_map)['storySwim']
        host_map=guest_map
    assert through(host,host_map,arena)['coop']['enemies'][0]['hp']==spec['hp']
    if id==CH:
        old=blocked(guest,OUT,arena)
        assert old.get('storyNearbyPortal',{}).get('to')!=arena
    assert dive(guest,STARTS[id],guest_map)['storySwim']
    assert '100' in blocked(guest,guest_map,arena)['storyNearbyPortal']['reason']
    with LOCK:
        env=SESSIONS[guest.sid]
        level(env['core'],env['state'],100)
    if id==CO:
        assert '報告' in blocked(guest,guest_map,arena)['storyNearbyPortal']['reason']
        with LOCK:
            env=SESSIONS[guest.sid]
            quest_state(env['core'],env['state'],id,True)
        assert guest.frame()['coop']['code']==code
        dive(guest,STARTS[id],guest_map)
    inside=through(guest,guest_map,arena)
    outside=host.frame()
    assert inside['coop']['code']==outside['coop']['code']==code
    assert inside['coop']['peers'][0]['map']==arena and outside['coop']['peers'][0]['map']==arena
    if id==CH:
        assert inside['storyScenery']=='bygoneResonance' and not outside.get('storyScenery')

    with LOCK:
        env=SESSIONS[host.sid]
        core=env['core']
        states=[SESSIONS[c.sid]['state'] for c in (host,guest)]
        room=env['coop_room'].worlds[arena]
        slot=room.fieldSlot
        boss=slot.enemy
        for s in states: actor_at(s,boss.x-165,boss.y+28).dir=1
    ready=spec['moves'][0]['steps'][0]
    until=monotonic()+7
    while monotonic()<until:
        advance(host,guest,.08)
        with LOCK:
            cast=slot.cast
            if cast and ready.get('setAt',ready['first'])<=cast.tick<ready['first']+9:
                assert pulse(core,states[0],boss)>0
                boss.hp=1
                aim(states[1],cast.strikes[1])
                break
        sleep(.025)
    else:
        raise AssertionError('Returnable bubble never became active')
    aimed=guest.frame(['skill1'])
    assert any(w.get('returning') for w in aimed['fieldBoss']['warnings'])
    assert any(w.get('returning') for w in host.frame()['fieldBoss']['warnings'])
    a,b=advance(host,guest,.65)
    assert a['kills']==b['kills']==1 and b['coop']['enemies'][0]['hp']==0
    assert any(e['kind']=='swim_bubble_impact' for e in b['events'])
    assert not any(e['kind']=='swim_bubble_impact' for e in a['events'])
    for client,entrance in ((host,host_map),(guest,guest_map)):
        saved=validate_save(client.frame(checkpoint=True)['checkpoint'])
        assert saved['endgame']['bosses'][id]['clears']==1
        through(client,arena,entrance)
    assert through(host,host_map,arena)['coop']['enemies'][0]['hp']==spec['hp']


if __name__=='__main__':
    lua,core=runtime()
    fixtures(lua,core)
    result={id:dict(returnDamage=returned(core,id),lethalRewardXp=returned(core,id,'stay'),
                    departedReturnDamage=returned(core,id,'leave'),resumedReturnDamage=returned(core,id,'resume'))
            for id in (CH,CO)}
    for id in (CH,CO):
        assert result[id]['departedReturnDamage']==result[id]['returnDamage']
        returned(core,id,'leave-lethal')
    with lab() as url:
        for id in (CH,CO): http(url,id)
    proof=dict(lua=dict(participants=4,encounters=result,sameBubbleCannotBeReturnedTwice=True,
                        ownerGetsImpactAndReward=True,departedReturnHasNoRemoteCredit=True,
                        departedLethalReturnSettlesPresentContributor=True,departureGearChangeKeepsLaunchedDamage=True,
                        allGoneFreezesPendingReturn=True),
               http=dict(participants=2,chassanionDifferentEntrancesAndBackgrounds=True,
                         corrougeIndividualReport=True,individualLevel100=True,
                         realInputLethalReturn=True,eachRewardSavedOnce=True,sharedRematch=True))
    (ROOT/'evidence/coop-bubble-returns-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
