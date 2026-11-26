"""Play the one-time torii return, three observation rooms, and seaside shortcut."""
from copy import deepcopy
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid='inazuma-torii-maze'
port, road, town, clearing='inazuma-port','inazuma-road','inazuma-town','inazuma-lantern-clearing'
prints, statues, water='inazuma-torii-footprints','inazuma-torii-statues','inazuma-torii-reflections'
fight, shore='inazuma-torii-thicket','inazuma-forest-shore'
s=core.new(12)
core.action(s,'story_start')
core.grantExp(s,sum(core.expNeeded(level) for level in range(1,40)),'quest')
core.enterStoryNode(s,port)
core.action(s,'story_accept:'+qid)
assert not s.story.quests[qid]
seed=native(core.checkpoint(s))
seed['story']['quests']['inazuma-moving-lantern']={
    'status':'complete','count':6,'cycles':1,
    'lantern':{'inspected':{'box-leaf':True,'stone-shadow':True,'eaten-nuts':True}},
}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/inazuma-m02-fixture.json').write_text(json.dumps(seed),encoding='utf8')


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


def gate(node):
    near=core.frame(s).storyNearbyPortal
    assert near and near.to==node, native(near)
    return near


def through(node):
    assert gate(node).available
    core.action(s,'story_nearby_portal')
    assert s.story.node==node


def from_port():
    walk(1380)
    through(road)
    walk(1380,attack=True)
    through(town)
    walk(1080)
    through(clearing)
    walk(1020)
    through(prints)


def guide_to_statues():
    core.action(s,'world_map_focus:'+statues)
    guide=native(core.frame(s).worldMap.guide)
    core.action(s,'world_map_close')
    assert [leg['id'] for leg in guide['stops']]==[statues], guide
    return guide


def sentence(fragment):
    assert fragment in core.frame(s).storyNearbyForest.label
    core.action(s,'story_collect')


def defeat(id):
    for _ in range(520):
        if q.forest.defeated[id]:
            return
        step(attack=True)
    raise AssertionError(('enemy',id))


s=load(seed)
core.action(s,'story_accept:'+qid)
q=s.story.quests[qid]
from_port()
assert not core.frame(s).storyForest.looped
assert "一度くぐり" in guide_to_statues()["reason"]
walk(485)
core.action(s,'story_collect')
assert q.count==0
walk(1240)
assert gate(statues).available
core.action(s,'story_nearby_portal')
assert s.story.node==prints and s.actors[s.active].x==160 and q.forest.looped
walk(1240)
assert not gate(statues).available
assert "木の実" in guide_to_statues()["reason"]
core.action(s,'story_nearby_portal')
assert s.story.node==prints and s.actors[s.active].x>1200
walk(110)
through(clearing)
walk(1020)
through(prints)
assert core.frame(s).storyForest.looped

s=load(save())
q=s.story.quests[qid]
from_port()
assert core.frame(s).storyForest.looped
walk(245)
sentence('ヒント')
assert q.count==0 and '足跡' in core.frame(s).storyForest.message
for count,wrong,right,next_stage in (
    (0,855,485,statues),(1,485,855,water),(2,855,485,fight),
):
    walk(wrong)
    sentence('調べる')
    assert q.count==count and '葉の印はありません' in core.frame(s).storyForest.message
    walk(right)
    sentence('調べる')
    assert q.count==count+1 and core.frame(s).storyForest.solved
    core.action(s,'story_collect')
    assert q.count==count+1
    walk(1240)
    if next_stage==statues:
        assert guide_to_statues()["status"]=="ready"
    through(next_stage)
assert len(s.enemies)==3
walk(420,attack=True)
defeat('inazuma-thicket-1')
assert q.count==3 and s.enemies[1].hp==0 and s.enemies[1].respawn>6

s=load(save())
q=s.story.quests[qid]
from_port()
for next_stage in (statues,water,fight):
    assert core.frame(s).storyForest.solved
    walk(1240)
    if next_stage==statues:
        assert guide_to_statues()["status"]=="ready"
    through(next_stage)
assert {e.spawnId for e in s.enemies.values()}=={'inazuma-thicket-2','inazuma-thicket-3'}
walk(785,attack=True)
defeat('inazuma-thicket-2')
walk(1130,attack=True)
defeat('inazuma-thicket-3')
assert q.count==4 and all(e.hp==0 for e in s.enemies.values())
walk(1510)
assert not gate(shore).available
walk(1280)
sentence('化け狸')
assert q.count==5 and core.frame(s).storyLanternNote.challenge
walk(1510)
through(shore)
walk(1240)
through(town)
walk(110)
through(road)
walk(110,attack=True)
through(port)
cash,xp=s.mora,s.progression.questXp
core.action(s,'story_report:'+qid)
core.action(s,'story_report:'+qid)
assert (q.status,q.cycles,s.mora,s.progression.questXp)==('complete',1,cash+440,xp+186561)
finished=save()
bad=deepcopy(finished)
bad['story']['quests'][qid]['forest']['looped']=False
try:
    validate_save(bad)
except ValueError:
    pass
else:
    raise AssertionError('Completed maze accepted without its return')
s=load(finished)
assert core.frame(s).storyLanternNote.challenge
walk(1380)
through(road)
walk(1380,attack=True)
through(town)
walk(940)
through(shore)
walk(110)
through(fight)
assert len(s.enemies)==0
walk(110)
through(water)
assert core.frame(s).storyForest.solved

(ROOT/'evidence/inazuma-m02-lua.json').write_text(json.dumps({
    'requires_M01':True,'first_loop_once_even_after_restore':True,'exit_always_available':True,
    'atlas_loop_and_clue_guidance':True,'atlas_direct_gate_after_clue_and_reload':True,
    'optional_hint_and_three_two_choice_rooms':True,'wrong_choices_do_not_reset':True,
    'partial_combat_save_and_cleared_revisit':True,'bidirectional_shore_shortcut':True,
    'challenge_note_persists':True,'one_time_reward':{'xp':186561,'mora':440},
},indent=2)+'\n',encoding='utf8')
print('Inazuma M02 one-time loop, three clues, fight, shortcut and checkpoints passed')
