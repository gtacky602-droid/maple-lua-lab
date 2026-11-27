"""Play the Sumeru story from the checkpoint earned by the preceding fresh route."""

from hashlib import sha256
import json
import subprocess
import sys

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


hub = 'sumeru-hub'
after_revisits = '--after-revisits' in sys.argv
work = ROOT/'work'/('sumeru-revisits-route' if after_revisits else 'sumeru-fresh-route')
work.mkdir(parents=True, exist_ok=True)
predecessor = 'test_inazuma_revisits.py' if after_revisits else 'test_inazuma_fresh_route.py'
subprocess.run([sys.executable, str(ROOT/predecessor)], stdout=subprocess.DEVNULL, check=True)
source = 'epilogue-sumeru.json' if after_revisits else 'sumeru-save.json'
source_bytes = (ROOT/'work/inazuma-fresh-route'/source).read_bytes()
checkpoint = validate_save(json.loads(source_bytes))
assert checkpoint['story']['node'] == hub and checkpoint['progression']['level'] == 60

graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, gates in exits.items() for edge in gates}
lua, core = runtime()
state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
trail = TrailWalk(lua, core, state, edges, exits)
attack = {dx: lua.table_from(dict(left=dx < 0, right=dx > 0, attack=True)) for dx in (-1, 0, 1)}
jump_attack = lua.table_from(dict(attack=True, jump=True))
milestones = []


def act(key):
    core.action(state, key)


def frame():
    return core.frame(state, 'sprite', 'legacy')


def cross(*destinations):
    for destination in destinations:
        trail.cross(destination)


def near(x, y=480):
    trail.approach(x, y, 'quest objective')


def collect(x, y=480, key='story_collect'):
    near(x, y)
    act(key)


def accept(id):
    act('story_accept:' + id)
    quest = state.story.quests[id]
    assert quest.status == 'active', (id, state.storyNotice)
    return quest


def mark(id):
    p = state.progression
    row = dict(id=id, seconds=round(state.t, 2), level=p.level, total=p.total, questXp=p.questXp,
               killXp=p.killXp, kills=state.kills)
    milestones.append(row)
    print(id, p.level, p.total, flush=True)


def report(id):
    act('story_report:' + id)
    quest = state.story.quests[id]
    assert quest.status == 'complete' and quest.cycles == 1, (id, quest.count, state.storyNotice)
    mark(id)


def fight(quest, cleared_count, approach):
    near(*approach)
    for _ in range(1600):
        if quest.count == cleared_count:
            return
        actor = trail.actor
        assert actor.hp > 0, (state.story.node, actor.hp, state.returns)
        enemies = [enemy for enemy in state.enemies.values() if enemy.hp > 0]
        target = min(enemies, key=lambda enemy: abs(enemy.x - actor.x) + abs(enemy.y - actor.y))
        dx = 0 if abs(actor.x - target.x) < 30 else (-1 if actor.x > target.x else 1)
        if dx == 0 and target.y < actor.y - 35:
            act('jump')
            controls = jump_attack
        else:
            controls = attack[dx]
        core.step(state, 1 / 60, controls)
    raise AssertionError((state.story.node, quest.count, native(trail.actor), state.storyNotice))


roots, bank = 'sumeru-river-roots', 'sumeru-river-bank'
first = 'sumeru-leaf-crossing'
quest = accept(first)
cross(roots)
collect(315)
collect(714, 391)
collect(924, 391)
assert quest.count == 3 and any(p.leafBridge for p in state.platforms.values())
cross(bank)
fight(quest, 4, (353, 480))
collect(1350)
cross(hub)
report(first)

junction, root_path, branch, stop = (
    'sumeru-canopy-junction', 'sumeru-root-slope', 'sumeru-branch-run', 'sumeru-observation-stop',
)
second = 'sumeru-forest-levels'
quest = accept(second)
cross(junction)
collect(330)
collect(726, 388)
assert frame().storyAirflow.selection == '葉だけ開く'
collect(726, 388, 'story_airflow_commit')
assert quest.count == 1
collect(726, 388)
collect(726, 388)
collect(726, 388, 'story_airflow_commit')
assert quest.count == 2
cross(root_path)
collect(824, 390)
cross(stop, branch)
collect(653, 302)
cross(stop)
collect(823, 390)
cross(junction, stop, hub)
report(second)

approach, terrace, observatory = (
    'sumeru-observatory-approach', 'sumeru-observatory-terrace', 'sumeru-sky-observatory',
)
third = 'sumeru-observatory-map'
quest = accept(third)
cross(stop, approach)
fight(quest, 1, (302, 480))
cross(terrace)
fight(quest, 2, (850, 480))
collect(1525, 390)
cross(observatory)
collect(826, 391)
cross(hub)
report(third)

collei = 'sum-collei-guide'
quest = accept(collei)
collect(515)
cross('sum-collei-trail')
collect(647, 396)
assert quest.count == 1
collect(441)
collect(982)
cross('sum-collei-rainfork')
collect(331)
collect(802)
cross('sum-collei-welcome')
collect(512)
cross(hub)
report(collei)

wanderer = 'sum-wanderer-observation'
quest = accept(wanderer)
collect(415)
cross('sum-wanderer-trail')
collect(287)
collect(607, 396)
near(711, 303)
collect(942, 303)
collect(1251)
cross('sum-wanderer-hollow')
collect(273)
collect(452)
for _ in range(200):
    core.step(state, 1 / 60, trail.idle)
assert quest.count == 7
near(698, 390)
near(868, 297)
collect(1048, 297)
cross(hub)
report(wanderer)

quay_quest = 'sum-mapped-north-quay'
(work / 'pre-quay-save.json').write_text(json.dumps(validate_save(native(core.checkpoint(state))), ensure_ascii=False)+'\n', encoding='utf8')
quest = accept(quay_quest)
river, fork, statue, quay = 'sum-wp-28740', 'sum-wp-28741', 'sum-wp-28701', 'sum-wp-69098'
cross(river, fork, statue, quay)
collect(775)
cross(statue, fork, river, hub)
report(quay_quest)

rainforest, entry, fontaine = 'sumeru-field', 'fontaine-entry', 'fontaine-hub'
cross(rainforest)
near(1380)
blocked = frame().storyNearbyPortal
assert blocked.to == entry and not blocked.available and blocked.level == 80
act('story_nearby_portal')
assert state.story.node == rainforest
cross(hub, river, fork)

forest = 'sumeru-north-forest-floor'
bank_hunt = 'sumeru-north-bank-terraces'
lookout = 'sum-wp-28745'
high_hunt = 'sites-hunt-28753'
for id, status, level in ((forest, 'ready', 69), (bank_hunt, 'blocked', 74), (high_hunt, 'blocked', 79)):
    act('world_map_toggle')
    act('world_map_layer:hunt')
    act('world_map_select:' + id)
    guide = frame().worldMap.guide
    assert guide.status == status, (id, guide.status, guide.reason)
    if status == 'blocked':
        assert guide.reason == '必要Lv' + str(level)
    act('world_map_close')

sorties = []
recovery_trips = 0
for stage, parent, threshold in ((forest, fork, 74), (bank_hunt, lookout, 79), (high_hunt, fork, 80)):
    if state.story.node != parent:
        cross(parent)
    exp_per_enemy = LEVELS[nodes[stage]['level'] - 1]['normal_enemy_base_exp']
    for _ in range(90):
        if state.progression.level >= threshold:
            break
        if trail.actor.hp < 70:
            act('story_fast:' + hub)
            assert state.story.node == hub and trail.actor.hp == trail.actor.maxhp
            act('story_fast:' + parent)
            assert state.story.node == parent
            recovery_trips += 1
        cross(stage)
        before_kills, before_xp, before_time = state.kills, state.progression.killXp, state.t
        before_total = state.progression.total
        act('auto')
        for _ in range(4500):
            core.step(state, 1 / 60, trail.idle)
            if state.progression.level >= threshold or trail.actor.hp < 65:
                break
        act('auto')
        kills = state.kills - before_kills
        xp = state.progression.killXp - before_xp
        # One hit may defeat several enemies on the tick that reaches the return level.
        # Kills after the level-up use the +5 level-gap factor immediately.
        gap_start = LEVELS[nodes[stage]['level']+4]['maple_reference_total_exp_to_reach']
        full = min(kills, max(0, (gap_start-before_total+exp_per_enemy-1)//exp_per_enemy))
        reduced_exp = int(exp_per_enemy*RUNTIME_EXP['gap']['player_higher_by_5_to_10']+.5)
        assert xp == full*exp_per_enemy+(kills-full)*reduced_exp and state.returns == 0, (stage, trail.actor.hp, kills, xp)
        assert kills>0 or trail.actor.hp<65, (stage, 'no progress at safe HP')
        sorties.append(dict(stage=stage, kills=kills, xp=xp, seconds=round(state.t - before_time, 2)))
        cross(parent)
    assert state.progression.level == threshold, (stage, threshold, state.progression.level)
    mark('lv' + str(threshold))

cross(river, hub)
ready = validate_save(native(core.checkpoint(state)))
(work / 'fontaine-ready-save.json').write_text(json.dumps(ready, ensure_ascii=False) + '\n', encoding='utf8')
act('world_map_toggle')
act('world_map_region:region-05')
act('world_map_select:' + fontaine)
guide = frame().worldMap.guide
assert guide.status == 'ready' and [(stop.id, stop.mode) for stop in guide.stops.values()] == [
    (rainforest, 'walk'), (entry, 'walk'), (fontaine, 'walk'),
]
act('world_map_close')
cross(rainforest, entry, fontaine)
mark(fontaine)
assert state.returns == 0
saved = validate_save(native(core.checkpoint(state)))
restored = core.restore(lua.table_from(saved, recursive=True), 12)
assert restored.story.node == fontaine and restored.progression.total == state.progression.total
quests = (first, second, third, collei, wanderer, quay_quest)
assert all(restored.story.quests[id].status == 'complete' and restored.story.quests[id].cycles == 1 for id in quests)
next_quest = 'fontaine-moon-parcel'
core.action(restored, 'story_accept:' + next_quest)
assert restored.story.quests[next_quest].status == 'active'

(work / 'fontaine-save.json').write_text(json.dumps(saved, ensure_ascii=False) + '\n', encoding='utf8')
result = dict(sourceSha256=sha256(source_bytes).hexdigest(), route=milestones, completedQuests=quests, hunts=sorties, recoveryTrips=recovery_trips,
              partyWipes=state.returns, savedAndRestored=True, firstFontaineQuestAvailable=next_quest,
              scope='Continuation of the new Lv1 adventure. Scripted Lua inputs and auto-battle for hunting.')
if after_revisits:
    for id, progress in checkpoint['story']['quests'].items():
        if id.startswith(('ina-','inazuma-')) or id=='ayaka-join':
            assert saved['story']['quests'][id]==progress
    result.update(source=source,inazumaRecordsPreserved=True)
filename = 'sumeru-after-revisits.json' if after_revisits else 'sumeru-fresh-route.json'
(ROOT/'evidence'/filename).write_text(json.dumps(result, indent=2)+'\n', encoding='utf8')
