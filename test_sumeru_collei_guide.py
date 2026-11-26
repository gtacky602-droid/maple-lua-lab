from copy import deepcopy
import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, mond = 'sumeru-hub', 'mond-town'
trail, fork, welcome = 'sum-collei-trail', 'sum-collei-rainfork', 'sum-collei-welcome'
quest, main = 'sum-collei-guide', 'sumeru-leaf-crossing'
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')


def tick(n=1, **inputs):
    advance(core, s, n, lua.table_from(inputs))


def action(key):
    core.action(s, key)


def frame():
    return core.frame(s, 'sprite', 'legacy')


def move(x, y=480):
    actor = s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground, actor.dir = x, y, 0, True, 1


def gate(x, to, available=True, y=480):
    move(x, y)
    near = frame().storyNearbyPortal
    assert near and near.to == to and near.available is available, native(near)
    before = s.story.node
    action('story_nearby_portal')
    assert s.story.node == (to if available else before)


def record():
    return s.story.quests[quest]


def collect(x, count, y=480):
    move(x, y)
    assert frame().storyNearbyMilestone
    action('story_collect')
    assert record().count == count, s.storyNotice


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def load(data):
    return core.restore(lua.table_from(data, recursive=True), 12)


def jump(y):
    action('jump')
    tick(13, jump=True)
    tick(45)
    actor = s.actors[s.active]
    assert actor.y == y and actor.ground, (actor.y, y)


def rejects(data, value, id_=quest):
    invalid = deepcopy(data)
    invalid['story']['quests'][id_]['colleiLetter'] = value
    try:
        validate_save(invalid)
    except ValueError as error:
        assert 'コレイの手紙' in str(error)
    else:
        raise AssertionError('Unrelated, premature, or invalid letter record was accepted')


s = core.new(12)
action('story_start')
core.grantExp(s, LEVELS[59]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(s, hub)
action('story_accept:' + quest)
assert not record()
s.story.quests[main] = lua.table_from(dict(status='complete', count=5, cycles=1))
for node in ('sumeru-river-roots', 'sumeru-river-bank'):
    s.story.visited[node] = True
fixture = checkpoint()
action('story_accept:' + quest)
move(748)
action('story_collect')
assert record().count == 0 and not record().colleiLetter
gate(528, trail, False)
collect(515, 1)
gate(528, trail)
action('story_fast:' + trail)
assert '休憩場所' in frame().storyNotice and not len(s.enemies)
gate(1384, fork, False)
move(647)
options=native(frame().storyWorksites[quest])
assert [(p['x'],p['y']) for p in options]==[(441,480),(647,396)]
assert all('correct' not in p for p in options)
assert not frame().storyNearbyMilestone
jump(396)
assert frame().storyHunts[quest].action==frame().storyNearbyMilestone.label
collect(647, 1, 396)
assert '分けにく' in frame().storyNotice
collect(441, 2)
assert not {p['point'] for p in options}.intersection(p['point'] for p in native(frame().storyWorksites[quest]))
actor = s.actors[s.active]
actor.hp = actor.maxhp-45
move(864)
jump(390)
collect(864, 2, 390)
assert actor.hp == actor.maxhp-45 and '雨宿り' in frame().storyNotice
collect(982, 3)
assert actor.hp == actor.maxhp-13
gate(1384, fork)
assert frame().storyColleiGuide.rain
gate(553, welcome, False, 389)
assert '増水' in frame().storyNotice
collect(331, 4)
collect(536, 4, 389)
assert '水が柵' in frame().storyNotice
gate(1272, welcome, False)
partway = checkpoint()
rejects(partway, 'held')
s = load(partway)
assert s.story.node == hub
gate(528, trail)
gate(1384, fork)
assert frame().storyColleiGuide.rain
gate(553, welcome, False, 389)
collect(802, 5)
gate(1272, welcome)
assert not frame().storyColleiGuide.rain
assert frame().storyColleiGuide.guestX == 581
collect(512, 6)
tick(42)
guest = frame().storyColleiGuide.guestX
assert 581 < guest < 708
action('pause')
tick(180)
assert frame().storyColleiGuide.guestX == guest
action('pause')
tick(120)
assert frame().storyColleiGuide.guestX == 708
gate(965, hub)
before = (s.progression.questXp, s.mora)
action('story_report:' + quest)
action('story_report:' + quest)
reward = [s.progression.questXp-before[0], s.mora-before[1]]
assert reward == [QUEST_REPORT_EXP['Q-SUM-S03'],2100]
assert record().status == 'complete' and not record().colleiLetter
assert s.kills == 0
finished = checkpoint()
rejects(finished, 'sent-twice')
rejects(finished, 'held', main)
s = load(finished)
action('story_fast:' + trail)
assert s.story.node == trail and frame().storyColleiGuide.rest
actor = s.actors[s.active]
actor.hp = actor.maxhp-11
action('story_collect')
assert actor.hp == actor.maxhp
gate(1384, fork)
assert not frame().storyColleiGuide.rain
gate(553, welcome, True, 389)
assert frame().storyColleiGuide.guestX == 708
gate(965, hub)
collect(748, 6)
assert record().colleiLetter == 'held' and '預かりました' in frame().storyNotice
s = load(checkpoint())
assert record().colleiLetter == 'held'
action('story_fast:' + mond)
assert s.story.node == mond
collect(232, 6)
assert record().colleiLetter == 'delivered' and '渡しました' in frame().storyNotice
collect(232, 6)
assert '何度も読んだ' in frame().storyNotice
s = load(checkpoint())
assert record().colleiLetter == 'delivered' and s.story.node == mond
action('story_fast:' + hub)
move(748)
action('story_collect')
assert record().colleiLetter == 'delivered' and not frame().storyNearbyMilestone
assert (s.progression.questXp, s.mora) == (before[0]+reward[0],before[1]+reward[1])
checkpoint()

proof = {
    'prerequisiteAndWrongChoices': True, 'jumpAndSafeRest': True, 'rainGateAndRestore': True,
    'guestMovesAndPauses': True, 'finishedBeforeLetter': True, 'mapRestAndDryShortcut': True,
    'optionalLetterAndReread': True, 'letterRestoresAndRejectsInvalid': True, 'reward': reward,
}
(ROOT/'evidence/sum-collei-guide-lua.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/sum-collei-guide-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
print(proof)
