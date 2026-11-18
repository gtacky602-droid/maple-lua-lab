import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, roots = 'sumeru-hub', 'sumeru-river-roots'
trail, hollow = 'sum-wanderer-trail', 'sum-wanderer-hollow'
main, quest, legacy = 'sumeru-leaf-crossing', 'sum-wanderer-observation', 'wanderer-join'
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')


def tick(n=1, **inputs):
    advance(core, s, n, lua.table_from(inputs))


def action(key):
    core.action(s, key)


def frame():
    return core.frame(s, 'sprite', 'legacy')


def move(x, y=480):
    actor = s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground = x, y, 0, True


def record(id_=quest):
    return s.story.quests[id_]


def see_hollow():
    return any(n.id == hollow for n in frame().storyGraph.nodes.values())


def gate(x, to, available=True):
    move(x)
    near = frame().storyNearbyPortal
    assert near and near.to == to and near.available is available, native(near)
    source = s.story.node
    action('story_nearby_portal')
    assert s.story.node == (to if available else source)


def collect(x, count, y=480, id_=quest):
    move(x, y)
    assert frame().storyNearbyMilestone
    action('story_collect')
    assert record(id_).count == count


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def load(data):
    return core.restore(lua.table_from(data, recursive=True), 12)


def jump(y):
    action('jump')
    tick(13, jump=True)
    tick(44)
    actor = s.actors[s.active]
    assert actor.y == y and actor.ground, (actor.y, y)


def no_rewards():
    return (s.kills, s.hits, s.progression.killXp, s.progression.questXp, s.mora)


s = core.new(12)
action('story_start')
core.grantExp(s, LEVELS[59]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(s, hub)
action('companion:beidou')
fixture = checkpoint()
action('story_accept:' + quest)
action('story_accept:' + legacy)
assert not record() and not record(legacy) and not see_hollow()
action('story_accept:' + main)
gate(875, roots)
collect(315, 1, id_=main)
move(714, 391)
assert any((d.source or '').startswith('wanderer-idle-') for d in frame().draws.values())
collect(714, 2, 391, id_=main)
assert '枝の上の放浪者' in frame().storyNotice and record(main).status == 'active'
gate(56, hub)
action('story_accept:' + quest)
gate(618, trail, False)
collect(415, 1)
gate(618, trail)
collect(287, 2)
move(607)
assert not frame().storyNearbyMilestone
jump(396)
collect(607, 3, 396)
move(711, 396)
jump(303)
collect(942, 4, 303)
move(1367)
assert not frame().storyNearbyPortal and not see_hollow()
collect(1251, 5)
assert see_hollow()
gate(1367, hollow)
move(452)
action('story_collect')
assert record().count == 5 and not s.wandererAssistAt
collect(273, 6)
assert frame().storyWandererSurvey.defeated == 0 and not len(s.enemies)
gate(1288, hub, False)
move(452)
before = no_rewards()
collect(452, 6)
assert frame().storyWandererSurvey.working and not frame().storyNearbyMilestone
move(1048, 297)
action('story_collect')
assert record().count == 6
tick(100)
assert frame().storyWandererSurvey.defeated == 1
action('pause')
time = s.t
tick(200)
assert s.t == time and frame().storyWandererSurvey.working
action('pause')
partial = checkpoint()
tick(100)
assert record().count == 7 and frame().storyWandererSurvey.defeated == 2
assert no_rewards() == before and s.companion == 'beidou' and s.active == 1, (before, no_rewards(), s.companion, s.active)

s = load(partial)
assert s.story.node == hub and see_hollow() and record().count == 6
gate(618, trail)
gate(1367, hollow)
assert not frame().storyWandererSurvey.working
collect(452, 6)
tick(200)
assert record().count == 7
s = load(checkpoint())
gate(618, trail)
gate(1367, hollow)
assert frame().storyWandererSurvey.cleared
move(698)
jump(390)
move(868, 390)
jump(297)
collect(1048, 8, 297)
gate(1288, hub)
xp, mora = s.progression.questXp, s.mora
action('story_report:' + quest)
action('story_report:' + quest)
reward = [s.progression.questXp - xp, s.mora - mora]
assert reward == [QUEST_REPORT_EXP['Q-SUM-S01'], 1850]
assert s.companion == 'beidou' and s.active == 1 and frame().storyJoined.wanderer
assert not core.starterEquipment(s, 'beidou')
action('story_select_joined:' + quest)
assert s.companion == 'wanderer' and s.actors[2].atk == 4 and s.actors[2].maxhp == 150
assert frame().starterEquipment.weapon.name == '樹上観測の入門法器'
s = load(checkpoint())
assert s.companion == 'wanderer' and frame().starterEquipment.flower.name == '根道の記録花'
gate(618, trail)
gate(1367, hollow)
collect(1048, 8, 297)
assert '下から見つけた' in frame().storyNotice and frame().storySurveyMap.id == 'wanderer-observation-record'

for status, count in [('active', 4), ('complete', 4)]:
    s = load(fixture)
    s.story.quests[legacy] = lua.table_from(dict(status=status, count=count, cycles=int(status=='complete')))
    s = load(checkpoint())
    assert not record()
    if status == 'active':
        action('story_report:' + legacy)
    assert frame().storyJoined.wanderer and record(legacy).status == 'complete'
    action('story_select_joined:' + legacy)
    assert s.companion == 'wanderer'

proof = {
    'mainMeetingBeforeReport': True, 'threeMarkersAndHeight': True, 'hiddenUntilExamined': True,
    'noCombatRewardsForAssist': True, 'pausedAssist': True, 'midAssistanceRestart': True,
    'openedShelfPersists': True, 'partyPreserved': True, 'starterEquipmentAndSelection': True,
    'completedRecordReadable': True, 'legacyCanReportAndSelect': True, 'reward': reward,
}
(ROOT/'evidence/sum-wanderer-sign-lua.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/sum-wanderer-sign-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
print(proof)
