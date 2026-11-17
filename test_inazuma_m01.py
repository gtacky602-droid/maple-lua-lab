"""Sail to Inazuma, follow the trail and verify the persistent invitation."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid='inazuma-moving-lantern'
harbor, ferry, port, road, town='liyue-harbor','liyue-ferry','inazuma-port','inazuma-road','inazuma-town'
trail, clearing='inazuma-lantern-trail','inazuma-lantern-clearing'
s=core.new(12)
core.action(s,'story_start')
core.grantExp(s,sum(core.expNeeded(level) for level in range(1,40)),'quest')
core.enterStoryNode(s,harbor)
core.action(s,'story_accept:'+qid)
assert not s.story.quests[qid]
seed=validate_save(native(core.checkpoint(s)))
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/inazuma-m01-fixture.json').write_text(json.dumps(seed),encoding='utf8')


def load(data):
    return core.restore(lua.table_from(validate_save(data),recursive=True))


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


def gate(node):
    near=core.frame(s).storyNearbyPortal
    assert near and near.to==node, native(near)
    return near


def through(node):
    assert gate(node).available
    core.action(s,'story_nearby_portal')
    assert s.story.node==node


def inspect(id):
    assert core.frame(s).storyNearbyLantern.id==id
    core.action(s,'story_collect')


walk(720)
through(ferry)
for _ in range(1799):
    step()
assert s.story.node==ferry
step()
assert s.story.node==port
core.action(s,'story_accept:ayaka-join')
assert not s.story.quests['ayaka-join']
core.action(s,'story_accept:'+qid)
core.action(s,'story_accept:ayaka-join')
assert s.story.quests['ayaka-join']
assert s.companion!='ayaka'
q=s.story.quests[qid]
walk(430)
assert any(d.text=='綾華' for d in core.frame(s).draws.values())
start=core.frame(s).storyPortLanternX
assert start>240
for _ in range(60):
    step()
closer=core.frame(s).storyPortLanternX
assert closer>start
step(left=True)
for _ in range(60):
    step()
assert core.frame(s).storyPortLanternX==closer
walk(410)
inspect('ayaka-lantern')
assert q.count==1 and not core.frame(s).storyPortLanternX
walk(1380)
through(road)
walk(1380,attack=True)
through(town)
walk(580)
through(trail)
walk(305)
inspect('box-leaf')
assert q.count==2
core.action(s,'story_collect')
assert q.count==2

s=load(save())
q=s.story.quests[qid]
assert s.story.node==port and q.lantern.inspected['box-leaf']
walk(1380)
through(road)
walk(1380,attack=True)
through(town)
walk(580)
through(trail)
walk(670,attack=True)
assert not core.frame(s).storyNearbyLantern
jump(391)
inspect('stone-shadow')
walk(1100,attack=True)
for _ in range(60):
    step()
inspect('eaten-nuts')
assert q.count==4
walk(1590,attack=True)
through(clearing)
assert len(s.enemies)==0
walk(440)
inspect('left-lantern')
assert q.count==4 and not core.frame(s).storyDanuki
walk(680)
inspect('leaf-lantern')
assert q.count==5 and core.frame(s).storyDanuki
first=core.frame(s).storyDanuki.y
for _ in range(14):
    step()
assert core.frame(s).storyDanuki.y!=first
inspect('tanuki-invitation')
assert q.count==6 and core.frame(s).storyLanternNote.smile is False
walk(1210)
through(town)
walk(110)
through(road)
walk(110,attack=True)
through(port)
cash,xp=s.mora,s.progression.questXp
core.action(s,'story_report:'+qid)
core.action(s,'story_report:'+qid)
assert (q.status,q.cycles,s.mora,s.progression.questXp)==('complete',1,cash+350,xp+2800)
finished=save()
bad=deepcopy(finished)
del bad['story']['quests'][qid]['lantern']['inspected']['eaten-nuts']
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('Completed quest accepted without all clues')
s=load(finished)
assert core.frame(s).storyLanternNote.smile is True
walk(1380)
through(road)
walk(1380,attack=True)
through(town)
walk(1080)
through(clearing)
assert core.frame(s).storyDanuki and len(s.enemies)==0

legacy=deepcopy(seed)
legacy['story']['visited'][port]=True
legacy['story']['node']=port
legacy['story']['quests']['ayaka-join']={'status':'active','count':2,'cycles':0}
s=load(legacy)
assert s.story.quests['ayaka-join'].count==2 and not s.story.quests[qid]
legacy['story']['quests']['ayaka-join']={'status':'complete','count':4,'cycles':1}
s=load(legacy)
assert core.frame(s).storyJoined.ayaka

(ROOT/'evidence/inazuma-m01-lua.json').write_text(json.dumps({
    'Lv40_existing_30_second_voyage':True,'ayaka_opens_after_first_meeting':True,
    'lantern_moves_while_unwatched_and_stops_when_faced':True,'three_clues_ordinary_controls':True,
    'partial_save_and_scenic_return_gate':True,'wrong_lantern_retry_and_danuki_reveal':True,
    'invitation_smile_and_peaceful_revisit_persist':True,'legacy_ayaka_join_compatible':True,
    'one_time_reward':{'xp':2800,'mora':350},
},indent=2)+'\n',encoding='utf8')
print('Inazuma M01 voyage, watched lantern, clues, Danuki, note and legacy saves passed')
