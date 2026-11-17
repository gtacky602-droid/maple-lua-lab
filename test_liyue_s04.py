"""Play the stonemason route, save a partial solution, and verify both exhibits."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'liyue-stone-marks'
port, river, cliff = 'liyue-harbor', 'liyue-river-trail', 'liyue-cliff-planks'
post, overlook = 'liyue-quarry-post', 'liyue-craftsmen-overlook'
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, sum(core.expNeeded(level) for level in range(1, 20)), 'quest')
core.enterStoryNode(s, port)
core.action(s, 'story_accept:'+qid)
assert not s.story.quests[qid]
seed = native(core.checkpoint(s))
seed['story']['quests'] = {
    'liyue-market-delivery': {
        'status':'complete', 'count':3, 'cycles':1,
        'delivery':{'guardCleared':True, 'recovered':True, 'delivered':{'pot':True,'vessel':True,'wheel':True}},
    },
    'liyue-caravan-search': {
        'status':'complete', 'count':3, 'cycles':1, 'inspected':{'cart-ruts':True,'caravan':True},
    },
}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/liyue-s04-fixture.json').write_text(json.dumps(seed), encoding='utf8')


def load(data):
    return core.restore(lua.table_from(validate_save(data), recursive=True))


def save():
    return validate_save(native(core.checkpoint(s)))


def step(**keys):
    core.step(s,1/60,lua.table_from(keys))


def walk(x, attack=False):
    for _ in range(750):
        a=s.actors[s.active]
        if abs(a.x-x)<8:
            return
        step(right=a.x<x,left=a.x>x,attack=attack)
    raise AssertionError(('walk',s.story.node,x))


def jump(y):
    core.action(s,'jump')
    for _ in range(120):
        step(jump=True)
        a=s.actors[s.active]
        if a.ground and a.y==y:
            return
    raise AssertionError(('jump',s.story.node,y))


def through(node):
    gate=core.frame(s).storyNearbyPortal
    assert gate and gate.to==node and gate.available, native(gate)
    core.action(s,'story_nearby_portal')
    for _ in range(150):
        if s.story.node==node:
            return
        assert s.lift
        step()
    raise AssertionError(('portal',node))


def inspect(id):
    assert core.frame(s).storyNearbyStone.id==id
    core.action(s,'story_collect')


def tile(id):
    core.action(s,'story_stone_tile:'+qid+':'+id)


def from_post():
    walk(540)
    jump(391)
    jump(305)
    walk(690)


s=load(seed)
core.action(s,'story_accept:'+qid)
q=s.story.quests[qid]
walk(955)
through(river)
walk(1250,attack=True)
inspect('cut-wall')
assert q.count==1
core.action(s,'story_collect')
assert q.count==1
walk(110,attack=True)
through(port)
walk(490)
jump(350)
through(cliff)
walk(520,attack=True)
jump(395)
jump(305)
walk(905)
inspect('tool-mark')
walk(110)
through(port)
walk(1165)
through(post)
from_post()
assert not core.frame(s).storyNearbyPortal.available
core.action(s,'drop')
for _ in range(75):
    step()
walk(420)
inspect('paving-mark')
assert q.count==3 and len(list(q.stone.marked.keys()))==3
from_post()
through(overlook)
assert len(s.enemies)==0
tile('cut')
assert q.stone.sequence==0
walk(488)
jump(397)
inspect('craft-mural')
tile('cut')
tile('invented')
assert q.stone.sequence==1
tile('build')
assert q.count==3 and q.stone.sequence==0
tile('cut')
core.action(s,'pause')
tile('carry')
assert q.stone.sequence==1
core.action(s,'pause')
tile('carry')
assert q.stone.sequence==2 and q.count==3

partial=save()
bad=deepcopy(partial)
bad['story']['quests'][qid]['stone']['sequence']=3
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('Intermediate state accepted with finished sequence')
s=load(partial)
q=s.story.quests[qid]
assert s.story.node==port and q.stone.sequence==2
walk(1165)
through(post)
from_post()
through(overlook)
walk(488)
jump(397)
assert core.frame(s).storyStone.sequence==2
tile('build')
assert q.count==4 and core.frame(s).storyStone.solved
walk(550)
jump(312)
walk(820)
jump(231)
walk(980)
inspect('overlook-model')
assert q.count==5
walk(110)
through(post)
walk(1660)
through(port)
cash,xp=s.mora,s.progression.questXp
core.action(s,'story_report:'+qid)
core.action(s,'story_report:'+qid)
assert (q.status,q.cycles,s.mora,s.progression.questXp)==('complete',1,cash+240,xp+16443)
s=load(save())
walk(335)
inspect('model-exhibit')
assert core.frame(s).storyStone.exhibit

market=save()
market['story']['quests']['liyue-market-opening']={'status':'complete','count':3,'cycles':1}
s=load(market)
walk(335)
assert not core.frame(s).storyStone
walk(1190)
inspect('model-exhibit')
assert core.frame(s).storyStone.exhibit
walk(1165)
through(post)
from_post()
through(overlook)
walk(488)
jump(397)
assert core.frame(s).storyStone.modelTaken

(ROOT/'evidence/liyue-s04-lua.json').write_text(json.dumps({
    'requires_M02':True,'three_unique_marks_with_ordinary_movement':True,'overlook_gate_requires_all_marks':True,
    'wrong_sequence_resets_without_losing_marks':True,'remote_unknown_and_paused_input_rejected':True,
    'partial_sequence_survives_restore':True,'model_reachable_on_fixed_platforms':True,
    'pre_market_and_market_exhibits':True,'revisit_retains_open_mural':True,
    'one_time_reward':{'xp':16443,'mora':240},
},indent=2)+'\n',encoding='utf8')
print('Liyue S04 marks, sequence, ordinary jumps, two exhibits and checkpoints passed')
