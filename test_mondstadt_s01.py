"""Play the Mondstadt roadside rest quest and verify its saved world changes."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'mond-rest-stop'
town, road, site = 'mond-town','mond-road','mond-roadside-rest'
s = core.new(12)
core.action(s,'story_start')
core.action(s,'story_accept:'+qid)
assert not s.story.quests[qid]
seed = native(core.checkpoint(s))
seed['story']['quests']['amber-join'] = {'status':'complete','count':4,'cycles':1}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/mondstadt-s01-fixture.json').write_text(json.dumps(seed),encoding='utf8')


def save():
    return validate_save(native(core.checkpoint(s)))


def restore(d):
    return core.restore(lua.table_from(validate_save(d),recursive=True),12)


def step(**input):
    core.step(s,1/60,lua.table_from(input))


def walk(x,attack=False):
    for _ in range(900):
        a=s.actors[s.active]
        if abs(a.x-x)<8:
            return
        step(right=a.x<x,left=a.x>x,attack=attack)
    raise AssertionError(('walk',s.story.node,x))


def through(node, available=True):
    gate=core.frame(s).storyNearbyPortal
    assert gate and gate.to==node and gate.available==available,native(gate)
    previous=s.story.node
    core.action(s,'story_nearby_portal')
    assert s.story.node==(node if available else previous)


def reach(available=True):
    walk(1380)
    through(road)
    walk(550,attack=True)
    through(site,available)


def interact(label):
    f=core.frame(s)
    assert f.storyNearbyRest and label in f.storyNearbyRest.label
    core.action(s,'story_collect')


def defeat(id,x):
    walk(x,attack=True)
    for _ in range(540):
        if q.rest.defeated[id]:
            return
        step(attack=True)
    raise AssertionError(('fight',id))


def jump(height):
    for _ in range(120):
        step(jump=True)
        a=s.actors[s.active]
        if a.ground and a.y==height:
            return
    raise AssertionError(('land',height))


s=restore(seed)
reach(False)
walk(110,attack=True)
through(town)
core.action(s,'story_accept:'+qid)
q=s.story.quests[qid]
reach()
assert len(s.enemies)==2
defeat('mond-rest-slime',315)
assert q.count==0 and q.rest.defeated['mond-rest-slime']
s=restore(save())
q=s.story.quests[qid]
reach()
assert {e.spawnId for e in s.enemies.values()}=={'mond-rest-hilichurl'}
defeat('mond-rest-hilichurl',758)
assert q.count==1 and not len(s.enemies)
walk(515)
assert not core.frame(s).storyNearbyRest
core.action(s,'jump')
jump(392)
interact('板を拾う')
core.action(s,'story_collect')
assert q.count==2
core.action(s,'drop')
jump(480)
walk(750)
interact('落ち葉')
assert q.count==3
walk(925)
interact('ノエルに声')
assert q.count==4 and not core.frame(s).storyRest.ready
s=restore(save())
q=s.story.quests[qid]
reach()
walk(1050)
interact('椅子を置く')
assert q.count==5 and core.frame(s).storyRest.ready
walk(990)
a,companion=s.actors[1],s.actors[2]
a.hp,companion.hp=50,60
core.action(s,'pause')
core.action(s,'story_collect')
assert a.hp==50
core.action(s,'pause')
interact('お茶')
assert a.hp==85 and companion.hp==60
interact('お茶')
interact('お茶')
assert a.hp==a.maxhp and q.count==5

walk(110)
through(road)
walk(110,attack=True)
through(town)
xp,mora=s.progression.questXp,s.mora
core.action(s,'story_report:'+qid)
core.action(s,'story_report:'+qid)
assert q.status=='complete' and q.cycles==1
assert (s.progression.questXp,s.mora)==(xp+26,mora+120)
finished=save()
bad=deepcopy(finished)
del bad['story']['quests'][qid]['rest']['defeated']['mond-rest-slime']
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('finished rest site accepted without cleared guards')

s=restore(finished)
reach()
assert core.frame(s).storyRest.ready and len(s.enemies)==0
walk(990)
s.actors[1].hp=10
interact('お茶')
assert s.actors[1].hp==45 and s.story.quests[qid].status=='complete'
(ROOT/'evidence/mondstadt-s01-lua.json').write_text(json.dumps({
    'prerequisite_and_gate':True,'ordinary_combat':True,'defeated_guard_survives_save':True,
    'grounded_jump_for_boards':True,'sweeping_bench_and_chair':True,
    'chair_and_healing_survive_restore':True,'healing_active_actor_and_capped':True,
    'one_time_report':{'xp':26,'mora':120},
},indent=2)+'\n',encoding='utf8')
print('Mondstadt S01 guards, repair, chair, heating tea, report and restore passed')
