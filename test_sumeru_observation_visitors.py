import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
hub, meadow, terrace, store = 'sumeru-hub', 'sum-visitors-meadow', 'sum-visitors-terrace', 'sum-visitors-store'
quest, main = 'sum-fungus-visitors', 'sumeru-leaf-crossing'
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


def gate(x, to, available=True):
    move(x)
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


def defeat(enemy):
    cast = lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=250,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffe0ab',critRate=0))
    core.resolveCast(s, cast)
    assert enemy.hp == 0


def checkpoint():
    return validate_save(native(core.checkpoint(s)))


def load(data):
    return core.restore(lua.table_from(data, recursive=True), 12)


def rewards():
    return s.progression.questXp, s.mora, s.inventory.upgradeOre


s = core.new(12)
action('story_start')
core.grantExp(s, LEVELS[59]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(s, hub)
action('story_accept:' + quest)
assert not record()
s.story.quests[main] = lua.table_from(dict(status='complete', count=5, cycles=1))
for node in ('sumeru-river-roots','sumeru-river-bank'):
    s.story.visited[node] = True
fixture = checkpoint()
action('story_accept:' + quest)
gate(332, meadow, False)
collect(231, 1)
gate(332, meadow)
assert len(s.enemies) == 4 and {e.y for e in s.enemies.values()} == {480}
move(1028)
assert not frame().storyObservationVisitors.toneReady
action('story_collect')
assert record().count == 1
gate(1340, terrace, False)
for index in (1,2):
    defeat(s.enemies[index])
assert record().count == 1 and record().sweep['sum-visitor-pack-1']
s = load(checkpoint())
gate(332, meadow)
assert {e.spawnId for e in s.enemies.values()} == {'sum-visitor-pack-3','sum-visitor-pack-4'}
for enemy in list(s.enemies.values()):
    defeat(enemy)
assert record().count == 2 and not record().sweep and s.kills == 4
collect(1028, 3)
cue = frame().storyAirflowCue
tones = native(cue.notes)
assert tones == [349,440,392] and cue.pattern == '低い音 → 高い音 → 中くらいの音'
collect(1028, 3)
assert frame().storyAirflowCue.id != cue.id
gate(1340, terrace)
assert {e.y for e in s.enemies.values()} == {480,391,299}
for enemy in list(s.enemies.values()):
    defeat(enemy)
assert record().count == 4
move(1152)
assert not frame().storyNearbyMilestone
collect(1152, 5, 299)
gate(1449, store)
move(237)
s.actors[2].hp = 0
first = s.enemies[1]
before = first.x
tick(30)
assert first.x < before-45 and first.pursuit.speed > 120
for enemy in list(s.enemies.values()):
    defeat(enemy)
assert record().count == 6 and s.kills == 10
collect(919, 7)
assert frame().storyObservationVisitors.sample == 'stand'
collect(1006, 8)
before_storage = native(frame().storyAirflowCue.notes)
assert before_storage == tones
collect(1124, 9)
observer = frame().storyObservationVisitors.observerX
move(1224)
assert frame().storyObservationVisitors.observerX == observer+100
assert frame().storyObservationVisitors.sample == 'carried'
s = load(checkpoint())
gate(332, meadow)
assert not len(s.enemies)
gate(1340, terrace)
assert not len(s.enemies)
gate(1449, store)
assert not len(s.enemies) and frame().storyObservationVisitors.sample == 'carried'
collect(1326, 10)
view = frame().storyObservationVisitors
assert view.sample == 'stored' and not view.quiet
move(1006)
action('story_collect')
assert record().count == 10 and '少し待' in frame().storyNotice
action('pause')
tick(180)
assert frame().storyObservationVisitors.observerX == view.observerX
action('pause')
tick(135)
view = frame().storyObservationVisitors
assert view.quiet and view.observerX == 742
collect(1006, 11)
assert native(frame().storyAirflowCue.notes) == before_storage and frame().storyAirflowCue.pattern == cue.pattern
assert s.kills == 10
gate(1547, hub)
before = rewards()
action('story_report:' + quest)
action('story_report:' + quest)
reward = [after-start for after,start in zip(rewards(),before)]
assert reward == [QUEST_REPORT_EXP['Q-SUM-S02'],2000,3]
s = load(checkpoint())
gate(332, meadow)
gate(1340, terrace)
gate(1449, store)
assert frame().storyObservationVisitors.sample == 'stored' and frame().storyObservationVisitors.quiet
collect(1006, 11)
assert native(frame().storyAirflowCue.notes) == tones and not len(s.enemies)
assert '今も同じ' in frame().storyNotice
assert rewards() == tuple(start+added for start,added in zip(before,reward)) and s.kills == 10
checkpoint()

proof = {
    'requiresMainReport': True, 'threeFormations': True, 'partialGroupSave': True,
    'sameToneAndReread': True, 'fastPursuit': True, 'carryFollowsAndRestores': True,
    'sampleStoredAndObserverWithdraws': True, 'withdrawalPauses': True,
    'noObserverKillReward': True, 'zonesRemainClear': True, 'tones': tones, 'reward': reward,
}
(ROOT/'evidence/sum-fungus-visitors-lua.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/sum-fungus-visitors-fixture.json').write_text(json.dumps(fixture), encoding='utf8')
print(proof)
