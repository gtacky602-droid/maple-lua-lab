"""Verify shared water attacks, personal defensive inputs, and the thermal gate."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_branch_legends import (
    SPECS, actor_at, damage, level, read, run_until, verify_credit, view,
)
from test_coop_childe import run
from test_coop_dry_legends import at, dive, edge
from test_coop_local import Client, LOCK, SESSIONS, advance, lab

OCEAN='legend-fontaine_ocean_circuit_judge'
IRON='legend-fontaine_iron_viscount'
HUB='fontaine-hub'
MARKER='fon-wp-50065'
WATCH='fon-wp-50044'
VENT='iron-viscount-thermal-gallery'
QUEST='fon-beryl-thermal-vents'


def report_thermal(core,s):
    core.enterStoryNode(s,WATCH)
    core.enterStoryNode(s,VENT)
    core.enterStoryNode(s,HUB)
    core.action(s,'story_accept:'+QUEST)
    s.story.quests[QUEST].count=6
    core.action(s,'story_report:'+QUEST)
    assert s.story.quests[QUEST].status=='complete'


def swimmers(core,id):
    spec=SPECS[id]
    parties=[]
    for i in range(4):
        s=core.new(12)
        core.action(s,'story_start')
        level(core,s,100)
        if id==IRON: report_thermal(core,s)
        s.mora=0
        core.enterStoryNode(s,spec['node'])
        s.actors[2].hp=0
        actor_at(s,spec['home']-160,spec['floorY']+28)
        s.t=i*73
        parties.append(s)
    return spec,parties


def pulse(core,s,boss,power=None,side=-1):
    a=actor_at(s,boss.x+side*160,boss.y+28)
    a.dir,a.cd.swimPulse=-side,0
    if power: a.atk=power
    before=boss.hp
    core.action(s,'normal')
    return before-boss.hp


def ocean(lua,core):
    spec,parties=swimmers(core,OCEAN)
    host,guest,above,observer=parties
    solo=host.fieldSlots[OCEAN]
    single=lambda:core.step(host,TICK)
    run_until(single,lambda:solo.cast and solo.cast.tick==55)
    cast=solo.cast
    assert cast.move.id=='FW11'
    strike=cast.strikes[1]
    actor_at(host,strike.origin,strike.y+25)
    single()
    assert strike.seen[1] and damage(host)==[(97061,19)]
    room=core.newCoop(host)
    members=[core.attachCoop(room,s) for s in parties]
    assert strike.seen[host.actors[1]] and strike.seen[1] is None
    actor_at(host,strike.origin,strike.y+25)
    actor_at(guest,strike.origin,strike.y+25)
    actor_at(above,strike.origin,strike.top-14)
    actor_at(observer,1400,350)
    step=lambda:core.stepCoop(room,TICK)
    step()
    assert [damage(s) for s in parties]==[[(97061,19)],[(97061,19)],[],[]]
    warning=view(core,host)['warnings'][0]
    assert all(view(core,s)['warnings']==[warning] for s in parties)
    run(step,11)
    moved=view(core,host)['warnings'][0]
    assert moved['activeLeft']<warning['activeLeft'] and moved['top']==warning['top']==strike.top
    a=actor_at(above,570,345)
    members[2].input=lua.table(up=True)
    step()
    members[2].input=None
    y=a.y
    core.action(above,'dodge')
    assert abs(a.y-y+spec['swimPlayer']['burstDistance'])<.01 and a.inv>0
    boss=room.fieldSlot.enemy
    for s in parties[:2]:
        a=actor_at(s,boss.x-160,boss.y+28)
        a.dir=1
    hp=boss.hp
    members[1].input=lua.table(attack=True)
    step()
    members[1].input=None
    assert boss.hp<hp and guest.actors[1].cd.swimPulse>0 and not host.actors[1].cd.swimPulse
    assert all(view(core,s)['hp']==boss.hp for s in parties)
    run_until(step,lambda:room.fieldSlot.cast and room.fieldSlot.cast.move.id=='FW12')
    assert boss.waterGuard
    front=pulse(core,host,boss,side=boss.facing)
    rear=pulse(core,guest,boss,side=-boss.facing)
    assert 0<front<rear and all(view(core,s)['hp']==boss.hp for s in parties)
    assert pulse(core,host,boss,10000)>0 and room.fieldSlot.phase=='cleared'
    return dict(xp=verify_credit(core,parties,OCEAN,spec['mora']),front=front,rear=rear)


def iron(core):
    spec,parties=swimmers(core,IRON)
    host,guest,above,observer=parties
    room=core.newCoop(host)
    for s in parties: core.attachCoop(room,s)
    slot,boss=room.fieldSlot,room.fieldSlot.enemy
    step=lambda:core.stepCoop(room,TICK)
    run_until(step,lambda:slot.cast and slot.cast.tick==59)
    cast=slot.cast
    assert cast.move.id=='FW21' and boss.waterGuard
    strike=cast.strikes[1]
    center=(strike.left+strike.right)/2
    for s in parties[:2]: actor_at(s,center,strike.y+25)
    actor_at(above,center,strike.top-12)
    actor_at(observer,1300,350)
    core.action(host,'skill1')
    assert core.frame(host).storySwimCombat.counter.guarding
    assert not core.frame(guest).storySwimCombat.counter.guarding
    run(step,strike.first-cast.tick)
    assert [damage(s) for s in parties]==[[],[(97062,22)],[],[]]
    assert core.frame(host).storySwimCombat.counter.ready
    assert not core.frame(guest).storySwimCombat.counter.ready
    assert all(view(core,s)['warnings']==view(core,host)['warnings'] for s in parties)
    guarded=pulse(core,guest,boss)
    assert core.frame(host).storySwimCombat.counter.ready
    counter=pulse(core,host,boss)
    assert 0<guarded<counter and not core.frame(host).storySwimCombat.counter.ready
    # A second ordinary pulse from the same player is reduced again.
    assert pulse(core,host,boss)<counter
    assert pulse(core,host,boss,10000)>0 and slot.phase=='cleared'
    return dict(xp=verify_credit(core,parties,IRON,spec['mora']),guarded=guarded,counter=counter)


def through(client,origin,to):
    gate=edge(origin,to)
    at(client,gate['x'],gate['y'])
    frame=client.frame(['story_portal:'+to])
    assert frame['story']['node']==to and frame['coop']['map']==to and frame['storySwim']
    assert frame['actors'][0]['y']==gate['arrivalY']
    return frame


def http(url,id):
    spec=SPECS[id]
    iron=id==IRON
    entry=WATCH if iron else MARKER
    approach=VENT if iron else entry
    arena=spec['node']
    host,guest=Client(url),Client(url)
    for i,client in enumerate((host,guest)):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            core,s=env['core'],env['state']
            level(core,s,100-i)
            if iron:
                if i==0: report_thermal(core,s)
                else:
                    core.enterStoryNode(s,HUB)
                    core.action(s,'story_accept:'+QUEST)
                    s.story.quests[QUEST].count=2
            core.enterStoryNode(s,entry)
            s.actors[2].hp=0
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    if iron:
        for c in (host,guest): assert dive(c,entry,approach)['storySwim']
    assert through(host,approach,arena)['coop']['enemies'][0]['hp']==spec['hp']
    gate=edge(approach,arena)
    at(guest,gate['x'],gate['y'])
    assert '100' in guest.frame(['story_portal:'+arena])['storyNearbyPortal']['reason']
    with LOCK:
        env=SESSIONS[guest.sid]
        level(env['core'],env['state'],100)
    if iron:
        assert '報告' in guest.frame(['story_portal:'+arena])['storyNearbyPortal']['reason']
        with LOCK:
            report=SESSIONS[guest.sid]
            report['core'].enterStoryNode(report['state'],HUB)
            report['state'].story.quests[QUEST].count=6
        assert guest.frame(['story_report:'+QUEST])['story']['quests'][QUEST]['status']=='complete'
        assert guest.frame(['story_fast:'+entry])['coop']['code']==code
        dive(guest,entry,approach)
    through(guest,approach,arena)
    with LOCK:
        env=SESSIONS[host.sid]
        states=[SESSIONS[c.sid]['state'] for c in (host,guest)]
        room=env['coop_room'].worlds[arena]
        boss=room.fieldSlot.enemy
        for s in states: actor_at(s,boss.x-160,boss.y+28).dir=1
    for c in (host,guest): c.frame(['normal'])
    a,g=advance(host,guest,.1)
    hp=a['fieldBoss']['hp']
    assert 0<hp==g['fieldBoss']['hp']<spec['hp']
    for c in (host,guest): through(c,arena,approach)
    frozen=room.tick
    advance(host,guest,.16)
    assert (room.tick,boss.hp)==(frozen,hp)
    for c in (host,guest):
        assert through(c,approach,arena)['coop']['enemies'][0]['hp']==hp
    with LOCK:
        pulse(env['core'],states[1],boss)
        pulse(env['core'],states[0],boss,10000)
    for c in (host,guest):
        frame=c.frame(checkpoint=True)
        assert frame['checkpoint']['endgame']['bosses'][id]['clears']==1
        through(c,arena,approach)
    assert through(host,approach,arena)['coop']['enemies'][0]['hp']==spec['hp']


def fixture(lua,core):
    s=core.restore(lua.table_from(read('work/iron-viscount-fixture.json'),recursive=True))
    report_thermal(core,s)
    (ROOT/'work/coop-iron-viscount-ready.json').write_text(
        json.dumps(validate_save(native(core.checkpoint(s)))),encoding='utf8')


if __name__=='__main__':
    lua,core=runtime()
    fixture(lua,core)
    ocean_result=ocean(lua,core)
    iron_result=iron(core)
    with lab() as url:
        for id in (OCEAN,IRON): http(url,id)
    proof=dict(lua=dict(participants=4,ocean=ocean_result,iron=iron_result,adoptionKeepsConsumedHit=True,
                        movingWaveKeepsDepth=True,directionalSwimBurst=True,heldPulseSharesHp=True,
                        guardAndCounterArePersonal=True,onlyContributorsCredited=True),
               http=dict(participants=2,individualLevelGate=True,ironReportRequiredForEach=True,
                         sharedHealthFromWaterPulses=True,retreatKeepsHpAndDepth=True,savedAndRematch=True))
    (ROOT/'evidence/coop-aquatic-crabs-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
