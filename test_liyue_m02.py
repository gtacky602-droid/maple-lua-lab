"""Exercise both Liyue caravan routes and all restored lift directions."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'liyue-caravan-search'
port = 'liyue-harbor'
river = 'liyue-river-trail'
cliff = 'liyue-cliff-planks'
post = 'liyue-quarry-post'
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, sum(core.expNeeded(level) for level in range(1,20)), 'quest')
core.enterStoryNode(s, port)
core.action(s, 'story_accept:' + qid)
assert not s.story.quests[qid]

seed = native(core.checkpoint(s))
seed['story']['quests']['liyue-market-delivery'] = {
    'status':'complete', 'count':3, 'cycles':1,
    'delivery': {'guardCleared':True, 'recovered':True, 'delivered':{'pot':True,'vessel':True,'wheel':True}},
}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-m02-fixture.json').write_text(json.dumps(seed), encoding='utf8')


def step(**inputs):
    core.step(s, 1/60, lua.table_from(inputs))


def walk(x, attack=False):
    for _ in range(800):
        actor = s.actors[s.active]
        if abs(actor.x-x) < 8:
            return
        step(right=actor.x<x, left=actor.x>x, attack=attack)
    raise AssertionError(('cannot walk', s.story.node, x))


def jump(y):
    core.action(s,'jump')
    for _ in range(120):
        step(jump=True)
        actor=s.actors[s.active]
        if actor.ground and actor.y==y:
            return
    raise AssertionError(('cannot jump',s.story.node,y))


def gate(dest):
    nearby=core.frame(s).storyNearbyPortal
    assert nearby and nearby.to==dest and nearby.available, native(nearby)
    core.action(s,'story_nearby_portal')
    assert s.story.node==dest


def ride(dest,y,duration):
    old=s.story.node
    old_position=s.actors[s.active].x
    core.action(s,'story_nearby_portal')
    assert s.story.node==old and core.frame(s).storyLift.seconds==duration
    core.action(s,'story_start')
    assert s.story.node==old
    core.action(s,'pause')
    remaining=s.lift.remaining
    for _ in range(30):
        step(right=True)
    assert s.lift.remaining==remaining and s.actors[s.active].x==old_position
    core.action(s,'pause')
    for _ in range(round(60*duration)-1):
        step(right=True)
    assert s.story.node==old and s.actors[s.active].x==old_position
    step(right=True)
    assert s.story.node==dest and not s.lift
    assert s.actors[s.active].y==y and s.actors[s.active].ground


routes=[]
for branch,clue in [(river,'cart-ruts'),(cliff,'rest-tag')]:
    s=core.restore(lua.table_from(seed,recursive=True))
    core.action(s,'story_accept:'+qid)
    q=s.story.quests[qid]
    if branch==river:
        walk(955)
        gate(river)
        walk(1120,attack=True)
        core.action(s,'story_portal:'+cliff)
        assert s.story.node==river and not s.lift
        walk(680,attack=True)
    else:
        walk(490)
        jump(350)
        gate(cliff)
        walk(510,attack=True)
        jump(395)
        jump(305)
        walk(720,attack=True)
    assert core.frame(s).storyNearbyClue.id==clue
    core.action(s,'story_collect')
    assert q.count==1 and q.inspected[clue]
    if branch==river:
        walk(1660,attack=True)
    else:
        walk(940)
        jump(215)
        walk(1315)
        for _ in range(60):
            step()
            if s.actors[s.active].ground and s.actors[s.active].y==305:
                break
        walk(1580)
    gate(post)
    walk(385)
    assert core.frame(s).storyNearbyClue.id=='caravan'
    core.action(s,'story_collect')
    core.action(s,'story_collect')
    assert q.count==2 and q.inspected.caravan
    partial=validate_save(native(core.checkpoint(s)))
    r=core.restore(lua.table_from(partial,recursive=True))
    assert r.story.node==port and r.story.quests[qid].inspected.caravan
    walk(870,attack=True)
    for _ in range(480):
        if q.count==3:
            break
        step(attack=True)
    assert q.count==3 and core.frame(s).storyCleared
    walk(1655)
    ride(port,480,2.0)
    balance,xp=s.mora,s.progression.questXp
    core.action(s,'story_report:'+qid)
    core.action(s,'story_report:'+qid)
    assert (q.status,q.cycles,s.mora,s.progression.questXp)==('complete',1,balance+380,xp+35235)
    saved=validate_save(native(core.checkpoint(s)))
    s=core.restore(lua.table_from(saved,recursive=True))
    walk(1165)
    ride(post,480,2.0)
    assert len(s.enemies)==0
    walk(110)
    gate(river)
    walk(1120,attack=True)
    ride(cliff,395,1.6)
    ride(river,480,1.6)

    bad=deepcopy(saved)
    del bad['story']['quests'][qid]['inspected']['caravan']
    try:validate_save(bad)
    except ValueError:pass
    else:raise AssertionError('Reported rescue without caravan meeting')
    routes.append({'branch':branch,'clue':clue,'ordinary_combat':True,'rescue_restored':True})

(ROOT/'evidence/liyue-m02-lua.json').write_text(json.dumps({
    'routes':routes,'M01_prerequisite':True,'lifts_roundtrip':True,'timing_pause_and_no_movement':True,
    'partial_save':True,'one_time_reward':{'xp':35235,'mora':380},
},indent=2)+'\n',encoding='utf8')
print('Liyue M02 both routes, rescue, all lift directions, and checkpoint passed')
