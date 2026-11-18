"""Exercise light lessons and confirm that practice cannot change the adventure economy."""
from copy import deepcopy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
release, survey, echo, seven = ('growth-' + key for key in (
    'light-release', 'branch-visit', 'light-echo', 'seven-strike'))
cast_fields = ['mond-town', 'liyue-harbor', 'inazuma-port', 'sumeru-hub',
               'fontaine-hub', 'natlan-hub', 'snezhnaya-hub']
run = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')


def start(level, hub, elements=True):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    if elements:
        for node in cast_fields:
            core.enterStoryNode(state, node)
    core.enterStoryNode(state, hub)
    return state


def snapshot(state):
    return validate_save(native(core.checkpoint(state)))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def act(state, name):
    core.action(state, name)


def accept(state, quest):
    act(state, 'story_accept:' + quest)
    return state.story.quests[quest]


def report(state, quest):
    act(state, 'story_report:' + quest)
    assert state.story.quests[quest].status == 'complete'
    after = snapshot(state)
    act(state, 'story_report:' + quest)
    assert snapshot(state) == after


def drill(state, quest):
    assert state.growthTrial is None
    act(state, 'growth_practice_start:' + quest)
    assert state.growthTrial.quest == quest
    return state.growthTrial.state


def charge(state, target):
    for _ in range(38):
        if state.growthTrial.state.gauge >= target:
            return
        act(state, 'normal')
        run(core, state, 38)
    raise AssertionError('training gauge cannot be charged through ordinary attacks')


early = start(159, 'mond-town')
assert accept(early, release) is None and not core.attack(early, early.actors[1], 'SK58')
missing = start(180, 'snezhnaya-hub', elements=False)
missing.gauge = 100
assert accept(missing, seven) is None and not core.attack(missing, missing.actors[1], 'SK60')
assert missing.gauge == 100 and '未習得の元素' in missing.skillNotice
for level, skill in [(169, 'SK59'), (179, 'SK60')]:
    state = start(level, 'snezhnaya-hub')
    state.gauge = 100
    state.actors[1].light = 10
    assert not core.attack(state, state.actors[1], skill) and f'Lv{level+1}' in state.skillNotice

field = start(160, 'mond-town')
core.enterStoryNode(field, 'mond-road')
assert core.attack(field, field.actors[1], 'SK58') and field.story.growth['light-release']
run(core, field, 22)
field.actors[1].x, field.actors[1].dir = field.enemies[1].x - 55, 1
assert core.attack(field, field.actors[1], 'normal')
assert field.story.growth['light-normal']
core.enterStoryNode(field, 'mond-town')
assert accept(field, release).count == 2
report(field, release)

s = start(160, 'mond-town')
core.enterStoryNode(s, 'dragonspine-camp')
core.enterStoryNode(s, 'mond-town')
s.gauge, s.mora = 14, 12345
assert core.giveArtifact(s, 2, 31, 3)
write('work/growth-light-lv160.json', snapshot(s))
assert accept(s, release).count == 0
s.actors[1].hp, s.actors[2].hp = 87, 100
s.actors[1].cd.SK09 = 9
before = snapshot(s)
original_time = s.t
act(s, 'growth_practice_start:' + seven)
assert s.growthTrial is None
practice = drill(s, release)
assert practice.gauge == 55 and core.frame(s).growthTrial.skill == 'SK58'
assert not core.configure(s, lua.table_from([[]]*8, recursive=True))[0]
act(s, 'artifact_sell:1')
act(s, 'story_fast:dragonspine-camp')
act(s, 'light')
assert practice.gauge == 55 and s.story.quests[release].count == 0
charge(s, 60)
assert practice.gauge >= 60
initial = practice.gauge
act(s, 'light')
assert practice.gauge == initial-60 and s.story.quests[release].count == 1
run(core, s, 24)
act(s, 'normal')
assert s.story.quests[release].count == 2
assert core.frame(s).commands > 0 and s.t == original_time
inside = snapshot(s)
expected = deepcopy(before)
expected['story']['growth'] = {'light-release': True, 'light-normal': True}
expected['story']['quests'][release]['count'] = 2
assert inside == expected
reloaded = core.restore(lua.table_from(inside, recursive=True))
assert reloaded.growthTrial is None and reloaded.story.quests[release].count == 2
act(s, 'growth_practice_exit')
assert s.growthTrial is None and s.actors[1].hp == 87 and s.actors[2].hp == 100 and s.actors[1].cd.SK09 == 9
assert snapshot(s) == expected
report(s, release)

assert accept(s, survey).count == 0
act(s, 'growth_branch_observe')
assert s.story.quests[survey].count == 0
core.enterStoryNode(s, 'dragonspine-depth')
act(s, 'growth_branch_observe')
assert s.story.quests[survey].count == 0
s.actors[1].x, s.actors[1].y = 540, 480
assert core.frame(s).growthBranchObserve
act(s, 'story_collect')
assert s.story.quests[survey].count == 1
core.enterStoryNode(s, 'mond-town')
report(s, survey)

hunter = start(160, 'mond-town')
assert accept(hunter, survey).count == 0
core.enterStoryNode(hunter, 'chenyu-depth')
target = next(e for e in hunter.enemies.values() if e.spawnId and not e.boss)
hunter.actors[1].x, hunter.actors[1].y, hunter.actors[1].dir = target.x-50, target.y, 1
hunter.actors[1].atk, target.hp = 1000, 1
assert core.attack(hunter, hunter.actors[1], 'normal')
assert target.hp == 0 and hunter.story.quests[survey].count == 1

peak = start(180, 'snezhnaya-hub')
peak.mora, peak.gauge = 2468, 22
write('work/growth-light-lv180.json', snapshot(peak))
assert accept(peak, echo).count == 0
e = drill(peak, echo)
charge(peak, 60)
act(peak, 'light')
run(core, peak, 24)
act(peak, 'slot2')
run(core, peak, 3)
assert peak.story.quests[echo].count == 0 and '先に' in e.skillNotice
act(peak, 'slot1')
run(core, peak, 32)
act(peak, 'slot2')
run(core, peak, 2)
assert peak.story.quests[echo].count == 0
run(core, peak, 10)
assert peak.story.quests[echo].count == 1
act(peak, 'growth_practice_exit')
report(peak, echo)
assert peak.story.quests[survey] is None

assert accept(peak, seven).count == 0
u = drill(peak, seven)
act(peak, 'light')
assert u.gauge == 30
run(core, peak, 24)
act(peak, 'slot3')
run(core, peak, 2)
assert peak.story.quests[seven].count == 0 and '100' in u.skillNotice
act(peak, 'growth_practice_retry')
u = peak.growthTrial.state
assert u.gauge == 90 and peak.gauge == 22
charge(peak, 100)
act(peak, 'slot3')
run(core, peak, 1)
assert u.gauge < 6 and u.ultimate and peak.story.quests[seven].count == 1
run(core, peak, 170)
assert not u.ultimate and u.damage > 0 and u.kills == 0 and peak.gauge == 22
act(peak, 'growth_practice_exit')
report(peak, seven)

write('evidence/growth-light-lua.json', {
    'skill_levels': [160, 170, 180], 'seven_elements_require_region_start': True,
    'open_world_use_before_quest': True,
    'light_activation_and_effective_normal': True,
    'branch_observe_and_separate_ordinary_hunt': True,
    'actual_eligible_echo_hit': True, 'shared_gauge_and_seven_strike': True,
    'practice_state_hp_ct_loadout_inventory_currency_saved_safely': True,
    'no_dependency_on_previous_growth_quests': True, 'all_four_reports': True,
})
print('Growth Q-G09–12: region mastery, live and isolated practice, exploration, shared gauge and reports passed')
