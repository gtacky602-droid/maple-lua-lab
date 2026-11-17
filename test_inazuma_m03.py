"""Exercise the Inazuma chapter finale with ordinary Lua controls and checkpoint rules."""
import json
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
qid = 'inazuma-lantern-contest'
port, road, town = 'inazuma-port', 'inazuma-road', 'inazuma-town'
shore, cave, cape = 'inazuma-forest-shore', 'inazuma-sea-cave', 'inazuma-shiomi-cape'
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, sum(core.expNeeded(level) for level in range(1, 40)), 'quest')
core.enterStoryNode(s, port)
core.action(s, 'story_accept:'+qid)
assert not s.story.quests[qid]
fixture = native(core.checkpoint(s))
fixture['story']['quests'].update({
    'inazuma-moving-lantern': {
        'status':'complete', 'cycles':1, 'count':6,
        'lantern':{'inspected':{'box-leaf':True, 'stone-shadow':True, 'eaten-nuts':True}},
    },
    'inazuma-torii-maze': {
        'status':'complete', 'cycles':1, 'count':5,
        'forest':{'looped':True, 'defeated':{f'inazuma-thicket-{i}':True for i in range(1,4)}},
    },
})
validate_save(fixture)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/inazuma-m03-fixture.json').write_text(json.dumps(fixture), encoding='utf8')


def restore(data):
    return core.restore(lua.table_from(validate_save(data), recursive=True))


def save():
    return native(core.checkpoint(s))


def step(**keys):
    core.step(s, 1/60, lua.table_from(keys))


def walk(x, attack=False):
    for _ in range(900):
        a = s.actors[s.active]
        if abs(a.x-x)<8:
            return
        step(right=a.x<x, left=a.x>x, attack=attack)
    raise AssertionError(('walk', s.story.node, x))


def through(node, allowed=True):
    near = core.frame(s).storyNearbyPortal
    assert near and near.to==node and near.available==allowed, native(near)
    previous = s.story.node
    core.action(s, 'story_nearby_portal')
    assert s.story.node==(node if allowed else previous)


def reach_shore():
    walk(1380)
    through(road)
    walk(1380, attack=True)
    through(town)
    walk(940)
    through(shore)
    walk(850)


def interact(text):
    clue = core.frame(s).storyNearbyContest
    assert clue and text in clue.label, native(clue)
    core.action(s,'story_collect')


def phase():
    return core.frame(s).storyContest.stage


def fight(next_phase):
    walk(716, attack=True)
    for _ in range(900):
        if phase()==next_phase:
            return
        step(attack=True)
    raise AssertionError(('fight', phase(), native(s.actors), native(s.enemies)))


s = restore(fixture)
reach_shore()
through(cave, False)
walk(1240)
through(town)
walk(110)
through(road)
walk(110, attack=True)
through(port)
core.action(s,'story_accept:'+qid)
reach_shore()
through(cave)
walk(1320)
through(cape, False)
walk(440)
interact('勝負を申し込む')
assert phase()==1 and len(s.enemies)==1
kills, mora, combat_exp = s.kills, s.mora, s.progression.killXp
fight(2)
assert len(s.enemies)==0
walk(560)
interact('左の灯籠')
assert '紙吹雪' in core.frame(s).storyContest.message
walk(760)
interact('中央の灯籠')
for _ in range(330): step(attack=True)
assert phase()==2 and len(s.enemies)==0
assert s.kills==kills and (s.mora,s.progression.killXp)==(mora,combat_exp)

s = restore(save())
reach_shore()
through(cave)
assert phase()==2 and len(s.enemies)==0
walk(960)
interact('右の灯籠')
assert phase()==3 and len(s.enemies)==1
combat_exp, kills, mora = s.progression.killXp,s.kills,s.mora
fight(4)
assert len(s.enemies)==0
assert s.kills==kills and (s.mora,s.progression.killXp)==(mora,combat_exp)
walk(1320)
through(cape)
walk(675)
interact('海と町')
assert phase()==5
walk(110)
through(cave)
walk(110)
through(shore)
walk(1240)
through(town)
walk(110)
through(road)
walk(110, attack=True)
through(port)
q = s.story.quests[qid]
xp, mora = s.progression.questXp, s.mora
for _ in range(2): core.action(s,'story_report:'+qid)
assert (q.status,q.cycles,s.progression.questXp,s.mora)==('complete',1,xp+383670,mora+550)

s = restore(save())
reach_shore()
through(cave)
walk(440)
interact('再戦')
assert phase()==1 and core.frame(s).storyContest.replay
kills, mora, xp = s.kills, s.mora, s.progression.questXp
fight(2)
walk(960)
interact('右の灯籠')
fight(5)
assert not core.frame(s).storyContest.replay
assert (s.kills,s.mora,s.progression.questXp)==(kills,mora,xp)
walk(1320)
through(cape)
assert s.story.quests[qid].status=='complete'

evidence = {
    'requires_M02':True, 'cave_and_cape_gates':True, 'first_and_final_battle':True,
    'wrong_answers_retry':True, 'observation_has_no_combat_targets':True,
    'observation_survives_restore':True, 'cape_visit_and_revisit':True,
    'replay_without_repeat_rewards':True, 'one_time_reward':{'xp':383670,'mora':550},
}
(ROOT/'evidence/inazuma-m03-lua.json').write_text(json.dumps(evidence, indent=2)+'\n', encoding='utf8')
print('Inazuma M03 battles, reflection, checkpoint, scenic exit and rewardless rematch passed')
