"""Shared combat and individual entrance quests for three Natlan Local Legends."""
import json
import subprocess
import sys

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_branch_legends import NODES, SPECS, actor_at, damage, hit, level, run_until, view
from test_coop_late_branch_bosses import difference, normal_rewards, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_ruin_guardians import QUESTS, TICK, balances, cross, edge


HUB='natlan-hub'
SAPPHO='legend-natlan_sappho'
BALACHKO='legend-natlan_balachko'
COCIJO='legend-natlan_cocijo'
ROUTES={
    SAPPHO: ('nat-wp-72438',(),None),
    BALACHKO: ('nat-wp-72422',('sites-hunt-73160','toyac-rainbow-key-cave'),'natlan-rainbow-cave-keys'),
    COCIJO: ('nat-wp-77772',('toyac-electro-crystal-shore',),'natlan-toyac-electro-crystals'),
}


def start(core,start_level):
    state=core.new(12)
    core.action(state,'story_start')
    core.enterStoryNode(state,HUB)
    level(core,state,start_level)
    return state


def write_fixture(core):
    state=start(core,120)
    for slot in (1,2):
        assert core.giveArtifact(state,slot,40,3)
        core.action(state,'artifact_equip:'+str(slot))
    for approach,_,_ in ROUTES.values():
        core.enterStoryNode(state,approach)
    core.enterStoryNode(state,HUB)
    checkpoint=validate_save(native(core.checkpoint(state)))
    (ROOT/'work/coop-natlan-entry-legends-fixture.json').write_text(json.dumps(checkpoint),encoding='utf8')


def shared_attacks(lua,core,id):
    spec=SPECS[id]
    players=[start(core,spec['level']) for _ in range(4)]
    for state in players:
        core.enterStoryNode(state,spec['node'])
        state.actors[2].hp=0
        actor_at(state,spec['home']-82)
    host,guest,jumper,spectator=players
    room=core.newCoop(host)
    for state in players:
        core.attachCoop(room,state)
    slot=room.fieldSlot
    boss=slot.enemy
    step=lambda:core.stepCoop(room,TICK)
    if id==SAPPHO:
        for _ in range(150):
            step()
        assert slot.phase=='available' and boss.hp==spec['hp'] and boss.noAutoTarget
        hit(lua,core,host,boss,power=20)
        step()
        assert slot.phase=='notice' and not boss.noAutoTarget

    checked=[]
    for move in spec['moves']:
        for state in players:
            actor_at(state,boss.x-87)
        run_until(step,lambda:slot.cast and slot.cast.move.id==move['id'])
        cast=slot.cast
        strikes=list(cast.strikes.values())
        warnings=view(core,host)['warnings']
        assert all(view(core,s)['warnings']==warnings for s in players)
        assert [w['first'] for w in warnings]==[strike.step.first for strike in strikes]
        for index,strike in enumerate(strikes):
            timing=strike.step
            run_until(step,lambda:cast.tick==timing.first-1)
            center=strike['from'] if timing.wave or timing.travel else (strike.left+strike.right)/2
            body=host if index%2==0 else guest
            other=guest if body is host else host
            actor_at(body,center)
            actor_at(other,strike.right+40)
            actor_at(jumper,center,spec['floorY']-timing.height-24)
            actor_at(spectator,strike.left-40)
            before=[len(damage(s)) for s in players]
            step()
            assert [len(damage(s))-n for s,n in zip(players,before)]==[int(s is body) for s in players]
            assert damage(body)[-1]==(spec['entity'],timing.damage)
            active=view(core,host)['warnings']
            assert all(view(core,s)['warnings']==active for s in players)
            current=next(w for w in active if w['number']==index+1)
            assert current['left']<=current['activeLeft']<current['activeRight']<=current['right']
            if timing.wave or timing.travel:
                assert current['activeRight']-current['activeLeft']<current['right']-current['left']
                assert (boss.x!=strike['from'])==bool(timing.travel)
            actor_at(body,center)
            step()
            assert len(damage(body))==before[players.index(body)]+1
        checked.append(dict(id=move['id'],warningTicks=[strike.step.first for strike in strikes]))

    prior=[balances(s) for s in players]
    for state in players:
        actor_at(state,boss.x)
    hit(lua,core,guest,boss,power=40)
    hit(lua,core,host,boss,power=10000)
    assert slot.phase=='cleared'
    award=normal_rewards(spec)
    assert [difference(balances(s),p) for s,p in zip(players,prior)]==[award]*2+[(0,0,0,0)]*2
    for state in (host,guest):
        checkpoint=validate_save(native(core.checkpoint(state)))
        assert checkpoint['endgame']['bosses'][id]['clears']==1
        assert id not in checkpoint.get('fieldBosses',{})
    return dict(players=4,sharedHP=spec['hp'],moves=checked,sharedSweptMotion=True,
                heightAndDistanceAvoidDamage=True,singleContactPerStrike=True,
                onlyContributorsRewarded=True,killExp=award[1],mora=award[2])


def locked(client,entrance,reason):
    with LOCK:
        actor_at(SESSIONS[client.sid]['state'],entrance['x'],entrance.get('y',480))
    view=client.frame(['story_portal:'+entrance['to']])
    flag=view['storyNearbyPortal']
    assert flag['to']==entrance['to'] and not flag['available'] and reason in flag['reason'], flag


def prepare_gate(client,id,quest,entry):
    if id==BALACHKO:
        for index,step in enumerate(QUESTS[quest]['itinerary'][1:],2):
            with LOCK:
                actor_at(SESSIONS[client.sid]['state'],step['x'],step['y'])
            assert client.frame(['story_collect'])['story']['quests'][quest]['count']==index
    else:
        with LOCK:
            env=SESSIONS[client.sid]
            core,lua,state=env['core'],env['lua'],env['state']
            crystals=sorted((e for e in state.enemies.values() if e.breakTarget),key=lambda e:e.x)
            assert len(crystals)==3
            prior=balances(state)
            hit(lua,core,state,crystals[0],power=80)
            assert crystals[0].hp==1 and state.story.quests[quest].count==0
            for stone in reversed(crystals):
                hit(lua,core,state,stone,power=80,element='pyro')
            assert state.story.quests[quest].count==1 and balances(state)==prior
    return cross(client,entry)


def http_route(url,id):
    spec=SPECS[id]
    approach,path,q=ROUTES[id]
    arena=spec['node']
    entry=path[-1] if path else approach
    host,guest=Client(url),Client(url)
    for client in (host,guest):
        client.frame()
        with LOCK:
            env=SESSIONS[client.sid]
            core,state=env['core'],env['state']
            core.action(state,'story_start')
            core.enterStoryNode(state,HUB)
            level(core,state,111 if id==SAPPHO and client is guest else spec['level'])
            if q:
                core.action(state,'story_accept:'+q)
            core.enterStoryNode(state,approach)
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        previous=approach
        for node in path:
            frame=cross(client,edge(previous,node))
            assert frame['coop']['code']==code
            assert frame['coop']['shared']==(node!='toyac-electro-crystal-shore')
            previous=node
    entrance=edge(entry,arena)
    departure=edge(arena,entry)
    if q:
        reason='鍵を2本' if id==BALACHKO else '電気水晶'
        locked(host,entrance,reason)
        assert prepare_gate(host,id,q,entrance)['coop']['shared']
        locked(guest,entrance,reason)
        assert prepare_gate(guest,id,q,entrance)['coop']['shared']
    else:
        assert cross(host,entrance)['coop']['shared']
        locked(guest,entrance,'112')
        with LOCK:
            env=SESSIONS[guest.sid]
            level(env['core'],env['state'],112)
        assert cross(guest,entrance)['coop']['shared']

    with LOCK:
        env=SESSIONS[host.sid]
        core,lua,state=env['core'],env['lua'],env['state']
        other=SESSIONS[guest.sid]['state']
        room=state.coop
        boss=room.fieldSlot.enemy
        for player in (state,other):
            actor=actor_at(player,boss.x-57)
            actor.dir=1
    if id==SAPPHO:
        a,b=advance(host,guest,.24)
        assert all(f['fieldBoss']['phase']=='available' and f['fieldBoss']['hp']==spec['hp'] for f in (a,b))
    with LOCK:
        for player in (state,other):
            player.actors[2].hp=0
    host.frame(['normal'])
    a,b=advance(host,guest,.38)
    hp=a['fieldBoss']['hp']
    assert 0<hp<spec['hp'] and b['fieldBoss']['hp']==hp
    for client in (host,guest):
        cross(client,departure)
    paused,hp=room.tick,boss.hp
    assert 0<hp<spec['hp']
    advance(host,guest,.12)
    assert room.tick==paused and boss.hp==hp
    for client in (host,guest):
        assert cross(client,entrance)['fieldBoss']['hp']==hp
    with LOCK:
        for player in (state,other):
            actor_at(player,boss.x)
        hit(lua,core,other,boss,power=15)
        hit(lua,core,state,boss,power=10000)
    saves=[]
    for client in (host,guest):
        frame=client.frame(checkpoint=True)
        assert frame['fieldBoss']['phase']=='cleared' and frame['kills']==1
        assert frame['checkpoint']['endgame']['bosses'][id]['clears']==1
        saves.append(frame['checkpoint'])
    cross(host,departure)
    assert cross(host,entrance)['fieldBoss']['phase']=='cleared'
    for client in (host,guest):
        cross(client,departure)
    for client in (host,guest):
        replay=cross(client,entrance)
        assert replay['coop']['enemies'][0]['hp']==spec['hp']
        assert not replay.get('fieldBoss',{}).get('warnings')
    for client,save in zip((host,guest),saves):
        restored=client.frame(restore=save)
        assert restored['story']['node']==HUB and restored['progression']['killXp']==normal_rewards(spec)[1]
        if q:
            before=SESSIONS[client.sid]['state']
            old=balances(before)
            for _ in range(2):
                restored=client.frame(['story_report:'+q])
            assert restored['story']['quests'][q]['status']=='complete'
            assert difference(balances(before),old)==report_rewards(QUESTS[q])
    return dict(players=2,individualGate=True,personalCrystals=id==COCIJO,neutralUntilHit=id==SAPPHO,
                sharedHealthPreservedByRetreat=True,manualRematchRequiresEmptyArena=True,
                personalSaveRestored=True,bothQuestReportsChecked=bool(q))


if __name__=='__main__':
    for script in ('test_natlan_first_legends.py','test_natlan_toyac_legends.py'):
        subprocess.run([sys.executable,'-X','utf8',str(ROOT/script)],check=True)
    lua,core=runtime()
    write_fixture(core)
    proof={id:{'lua':shared_attacks(lua,core,id)} for id in ROUTES}
    with lab() as url:
        for id in ROUTES:
            proof[id]['http']=http_route(url,id)
    (ROOT/'evidence/coop-natlan-entry-legends-lua-http.json').write_text(
        json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
