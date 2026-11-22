"""Exercise Chizhang and Cineas through shared Lua and HTTP rooms."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_anemo import TICK
from test_coop_childe import run, spot
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


CHIZHANG = 'legend-liyue_rulers_of_chizhang_mountains'
CINEAS = 'legend-fontaine_cineas'
QUEST = 'fon-mapped-bygone-current'


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf8'))


SPECS = {s['id']:s for s in read('content/field-boss-spawns.json')['fieldBosses']}
NODES = {n['id']:n for n in read('content/story-graph.json')['nodes']}


def level(core,s,n):
    target=LEVELS[n-1]['maple_reference_total_exp_to_reach']
    core.grantExp(s,target-s.progression.total,'quest')
    assert s.progression.level==n


def prepare(core,s,id):
    spec=SPECS[id]
    arena=spec['node']
    level(core,s,spec['level'])
    host=NODES[arena]['exits'][0]['to']
    core.enterStoryNode(s,host)
    s.actors[2].hp=0


def hit(lua,core,state,body,power=105,**extra):
    values=dict(id=state.active,x=body.x,y=480,atk=power,range=110,dir=1,radial=True,
                mult=1,element='physical',color='#ffeac7',limit=1,gain=0,critRate=0,targetId=body.id)
    core.resolveCast(state,lua.table_from(values|extra))


def actor_at(state,x,y=480):
    a=state.actors[1]
    spot(state,x,y)
    return a


def run_until(step,predicate):
    for _ in range(1200):
        if predicate(): return
        step()
    raise AssertionError('Expected field phase did not advance')


def match(core,id):
    spec=SPECS[id]
    parties=[]
    for i in range(4):
        s=core.new(12)
        core.action(s,'story_start')
        prepare(core,s,id)
        core.enterStoryNode(s,spec['node'])
        actor_at(s,spec['home']-182)
        s.t=i*77
        parties.append(s)
    return spec,parties


def view(core,s):
    return native(core.frame(s).fieldBoss)


def damage(state):
    return [(e.target,e.value) for e in state.events.values() if e.kind=='hurt']


def verify_credit(core,parties,id,mora):
    spec=SPECS[id]
    xp=int(LEVELS[spec['level']-1]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']+.5)
    assert [(s.kills,s.mora,s.progression.killXp) for s in parties]==[(1,mora,xp)]*2+[(0,0,0)]*2
    for s in parties[:2]:
        saved=validate_save(native(core.checkpoint(s)))
        assert saved['endgame']['bosses'][id]['clears']==1
        assert id not in saved.get('fieldBosses',{})
    return xp


def chizhang(lua,core):
    spec,parties=match(core,CHIZHANG)
    host,guest,other,watcher=parties
    solo=host.fieldSlots[CHIZHANG]
    solo.index=2
    single=lambda:core.step(host,TICK)
    run_until(single,lambda:solo.cast is not None and solo.cast.tick==62)
    hit_zone=solo.cast.strikes[1]
    actor_at(host,(hit_zone.left+hit_zone.right)/2)
    single()
    assert damage(host)==[(97022,19)]
    room=core.newCoop(host)
    members=[core.attachCoop(room,s) for s in parties]
    step=lambda:core.stepCoop(room,TICK)
    # Creating a room during a solo attack retains the host's already-consumed hit.
    assert hit_zone.seen[host.actors[1]] and hit_zone.seen[1] is None
    center=(hit_zone.left+hit_zone.right)/2
    host.actors[1].inv=0
    actor_at(guest,center)
    actor_at(other,center,350)
    actor_at(watcher,1200)
    step()
    assert [damage(s) for s in parties]==[[(97022,19)],[(97022,19)],[],[]]
    slot,b=room.fieldSlot,room.fieldSlot.enemy
    run_until(step,lambda:slot.cast is not None and slot.cast.move.id=='LC03')
    c=slot.cast
    warnings=view(core,host)['warnings']
    assert [(w['number'],w['element'],w['first']) for w in warnings]==[(1,'pyro',63),(2,'cryo',111)]
    assert all(view(core,s)['warnings']==warnings for s in parties)
    for place,actor_slot in ((0,1),(1,2)):
        strike=c.strikes[actor_slot]
        run(step,strike.step.first-c.tick-1)
        for s in parties[:3]:
            actor_at(s,(strike.left+strike.right)/2,350 if s is other else 480)
        step()
        assert damage(host)[-1]==damage(guest)[-1]==((97021,16) if place==0 else (97022,19))
        assert not damage(other)

    half=(b.x+b.fieldPartner.x)/2
    hit(lua,core,host,b,x=half,range=450,limit=3,targetId=None)
    assert b.hp==b.fieldPartner.hp==960
    hit(lua,core,guest,b.fieldPartner)
    assert b.hp==b.fieldPartner.hp==860 and all(view(core,s)['hp']==860 for s in parties)
    # The partner qualifies as a nearby body even when the primary is far away.
    x=max(b.x,b.fieldPartner.x)+398
    actor_at(guest,x)
    actor_at(host,b.x)
    actor_at(other,b.x)
    actor_at(watcher,b.x)
    hit(lua,core,host,b.fieldPartner,power=10000)
    assert slot.phase=='cleared' and b.hp==b.fieldPartner.hp==0
    assert abs(guest.actors[1].x-b.x)>420
    xp=verify_credit(core,parties,CHIZHANG,280)
    for s,member in zip(parties,members):
        core.enterStoryNode(s,NODES[spec['node']]['exits'][0]['to'])
        core.detachCoop(member)
    core.enterStoryNode(host,spec['node'])
    core.attachCoop(room,host,members[0])
    assert (slot.phase,slot.generation,slot.enemy.hp)==('available',2,1060)
    return xp


def cineas(lua,core):
    spec,parties=match(core,CINEAS)
    host,guest,other,watcher=parties
    room=core.newCoop(host)
    members=[core.attachCoop(room,s) for s in parties]
    step=lambda:core.stepCoop(room,TICK)
    slot=room.fieldSlot
    slot.index=2
    run_until(step,lambda:slot.cast is not None and slot.cast.tick==59)
    c=slot.cast
    w=c.strikes[1]
    warnings=view(core,host)['warnings']
    assert all(view(core,s)['warnings']==warnings for s in parties)
    middle=(w.left+w.right)/2
    actor_at(host,middle)
    actor_at(guest,middle)
    actor_at(other,middle)
    actor_at(watcher,1305)
    core.action(other,'jump')
    members[2].input=lua.table(jump=True)
    run(step,13)
    members[2].input=None
    assert other.actors[1].y<w.source.y-49
    assert [damage(s) for s in parties]==[[(97031,23)],[(97031,23)],[],[]]
    hit(lua,core,host,slot.enemy)
    hit(lua,core,guest,slot.enemy)
    assert slot.enemy.hp==1120
    for s,member in zip(parties,members):
        core.enterStoryNode(s,NODES[spec['node']]['exits'][0]['to'])
        core.detachCoop(member)
    frozen=room.time,room.tick,c.tick
    run(step,80)
    assert (room.time,room.tick,c.tick)==frozen
    for s,member in zip(parties,members):
        core.enterStoryNode(s,spec['node'])
        core.attachCoop(room,s,member)
        actor_at(s,slot.enemy.x)
    assert slot.enemy.hp==1120 and slot.cast.tick==72
    hit(lua,core,host,slot.enemy,10000)
    assert slot.phase=='cleared'
    return verify_credit(core,parties,CINEAS,440)


def report_fixture(core,s):
    core.enterStoryNode(s,'bygone-camp')
    core.action(s,'story_accept:'+QUEST)
    q=s.story.quests[QUEST]
    assert q.status=='active'
    q.count=5
    core.action(s,'story_report:'+QUEST)
    assert q.status=='complete'
    core.enterStoryNode(s,'bygone-wp-68610')


def browser_fixtures(lua,core):
    for id in (CHIZHANG,CINEAS):
        arena=SPECS[id]['node']
        saved=read(f'work/{arena}-fixture.json')
        s=core.restore(lua.table_from(saved,recursive=True))
        s.mora=400000
        assert core.giveArtifact(s,1,82,3)
        core.action(s,'artifact_equip:1')
        core.action(s,'artifact_upgrade:1')
        assert core.giveArtifact(s,2,40,3)
        core.action(s,'artifact_equip:2')
        checkpoint=validate_save(native(core.checkpoint(s)))
        (ROOT/f'work/coop-{arena}-fixture.json').write_text(json.dumps(checkpoint),encoding='utf8')


def via_http(url,id):
    spec=SPECS[id]
    arena=spec['node']
    gate=NODES[arena]['exits'][0]
    entry=gate['to']
    inbound=next(e for e in NODES[entry]['exits'] if e['to']==arena)
    host,guest=clients=(Client(url),Client(url))
    for i,client in enumerate(clients):
        client.frame(['story_start'])
        with LOCK:
            env=SESSIONS[client.sid]
            if id==CINEAS and i==1:
                level(env['core'],env['state'],159)
                env['core'].enterStoryNode(env['state'],entry)
                env['state'].actors[2].hp=0
            else:
                prepare(env['core'],env['state'],id)
                if id==CINEAS: report_fixture(env['core'],env['state'])
    code=host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    assert cross(host,inbound['x'],arena)['coop']['map']==arena
    if id==CINEAS:
        with LOCK:
            env=SESSIONS[guest.sid]
            actor_at(env['state'],inbound['x'])
        blocked=guest.frame(['story_portal:'+arena])
        assert blocked['story']['node']==entry and '160' in blocked['storyNearbyPortal']['reason']
        with LOCK:
            level(env['core'],env['state'],160)
            actor_at(env['state'],inbound['x'])
        blocked=guest.frame(['story_portal:'+arena])
        assert blocked['story']['node']==entry and '依頼' in blocked['storyNearbyPortal']['reason']
        with LOCK:
            report_fixture(env['core'],env['state'])
    assert cross(guest,inbound['x'],arena)['coop']['map']==arena

    with LOCK:
        env=SESSIONS[host.sid]
        core,lua=env['core'],env['lua']
        st=[SESSIONS[c.sid]['state'] for c in clients]
        room=env['coop_room'].worlds[arena]
        b=room.fieldSlot.enemy
        for s,target in zip(st,(b,b.fieldPartner or b)):
            a=actor_at(s,target.x-65);a.dir,a.atk=1,42
    for c in clients: c.frame(['normal'])
    values=advance(host,guest,.11)
    assert values[0]['fieldBoss']['hp']==values[1]['fieldBoss']['hp']<spec['hp']
    hp=values[0]['fieldBoss']['hp']
    for c in clients: cross(c,gate['x'],entry)
    paused=room.tick
    advance(host,guest,.16)
    assert room.tick==paused and b.hp==hp
    for c in clients:
        cross(c,inbound['x'],arena)
    with LOCK:
        actor_at(st[0],b.x)
        actor_at(st[1],b.x+25)
        hit(lua,core,st[1],b,20)
        hit(lua,core,st[0],b,5000)
    for c in clients:
        f=c.frame(checkpoint=True)
        assert f['fieldBoss']['phase']=='cleared' and f['kills']==1
        assert f['checkpoint']['endgame']['bosses'][id]['clears']==1
    cross(host,gate['x'],entry)
    assert cross(host,inbound['x'],arena)['fieldBoss']['phase']=='cleared'
    for c in clients:
        cross(c,gate['x'],entry)
    assert cross(host,inbound['x'],arena)['coop']['enemies'][0]['hp']==spec['hp']


if __name__=='__main__':
    lua,core=runtime()
    chizhang_xp=chizhang(lua,core)
    cineas_xp=cineas(lua,core)
    browser_fixtures(lua,core)
    with lab() as url:
        for id in (CHIZHANG,CINEAS): via_http(url,id)
    proof=dict(lua=dict(participants=4, midCastRoomCreationRetainsHit=True,
                        orderedPyroCryo=True, separateHitsAndJumpEvades=True,
                        sameHpFromBothBodies=True, areaCastCountedOnce=True, rewardRangeIncludesPartner=True,
                        cineasSharedWarnings=True, liveRetreatKeepsCast=True, onlyContributorsCredited=True,
                        chizhangXp=chizhang_xp, cineasXp=cineas_xp),
               http=dict(participants=2, ordinaryInputsShared=True, cineasLevelAndReportIndividuallyRequired=True,
                         sharedDefeatSaved=True, rematchWaitsForAllToLeave=True, incompleteBattleResumes=True))
    (ROOT/'evidence/coop-branch-legends-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
