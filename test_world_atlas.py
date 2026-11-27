"""Verify the Lua atlas, visible exits, level review, and the imported entrance plan."""

from argparse import ArgumentParser
from collections import Counter
import json
from pathlib import Path

from build_world_atlas import BOSS_STAGE_FIELDS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


atlas = read('content/world-atlas.json')
plan = read('design/world/atlas-route-plan.json')
graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
suspended = {node['id'] for node in nodes.values() if node['region'] in graph.get('suspendedRegions', {})}
fields = {point['field'] for region in atlas['regions'] for point in region['points'] if 'field' in point}
drafts = {point['id']: point for region in atlas['regions'] for point in region['draft']}
assert len(atlas['regions']) == 24
assert {p['id'] for r in atlas['regions'] for p in r['points']} == nodes.keys()
assert len(fields) == plan['live_bound_fields'] == 979
assert plan['official_fields'] == 873 and plan['provisional_layout_fields'] == 106
assert not drafts and not plan['draft_field_approaches']
pending = {point['field'] for region in atlas['regions'] for point in region['points'] if point.get('entrancePending')}
assert not pending and not plan['unverified_entrance_exteriors']
assert {site['field'] for site in plan['confirmed_entrance_exteriors']} == {'teyvat:10009', 'teyvat:85351', 'teyvat:98500'}
snapshot = read('design/world/editor-snapshot.json')
reviews = {frozenset(row['fields']): row for row in plan['sites_only_route_review']}
active = {frozenset((edge['a'], edge['b'])) for edge in snapshot['data']['edges']}
assert reviews.keys() <= active
if snapshot['editor_revision'] == 0:
    assert sum(row['finding']=='implemented_as_lab_route' for row in reviews.values()) == 137
    assert len(reviews) == 421
assert not (fields & drafts.keys()) and len(fields) + len(drafts) == plan['imported_fields'] == 979
roster = {
    stage: row
    for row in read('content/encounters.json')['encounters']
    if (stage := row.get(BOSS_STAGE_FIELDS[row['kind']]))
}
previews = set(read('content/field-boss-openings.json'))
previews.update(read('content/stygian-openings.json'))
previews.update(read('content/weekly-opening-parts.json'))
previews.update(boss['node'] for boss in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if boss.get('mapIdleArt'))
for stage in roster.keys() & previews:
    roster[stage] = {**roster[stage], 'placementPreview': True}
legends = {row['encounter_id']: row for row in read('design/world/encounters.json')['legends']}
for boss in read('content/field-boss-spawns.json')['fieldBosses']:
    if boss['id'].startswith('legend-'):
        source = legends[boss['id']].get('source_enemy_base')
        roster[boss['node']] = {'id': boss['id'], 'kind': 'legend', 'name': boss['name'],
                                'placementPreview': True,
                                **({'aliases': [source]} if source else {})}
boss_points = {p['id']: p['boss'] for r in atlas['regions'] for p in r['points'] if 'boss' in p}
challenges = {b['node']: b['storyChallenge'] for b in (
    read('content/field-boss-spawns.json')['fieldBosses'] + read('content/weekly-boss-spawns.json')['weeklyBosses']
) if b.get('storyChallenge')}
challenges.update({b['node']: b['challenge'] for b in read('content/stygian-matches.json')['matches'].values()})
assert {stage: p['challenge'] for stage, p in boss_points.items() if p.get('challenge')} == {
    stage: challenges[stage] for stage in roster if stage in challenges
}
current_quests = [q for q in graph['quests'] if not q.get('legacyOnly')]
commission_targets = {q['target'] for q in current_quests if q['kind'] == 'boss'}
itinerary_battles = {(step['node'], step['boss']) for q in current_quests
                     for step in q.get('itinerary', []) if step['kind'] == 'boss'}
assert Counter(p['kind'] for stage, p in boss_points.items()
               if p.get('challenge') in commission_targets or (stage, p.get('challenge')) in itinerary_battles) == {
    'normal': 64, 'weekly': 16, 'stygian': 7,
}
assert {stage: {key:value for key,value in p.items() if key not in ('challenge','accessQuests')} for stage,p in boss_points.items()} == {
    stage: {key: row[key] for key in ('id', 'name', 'kind', 'aliases', 'placementPreview') if key in row}
    for stage, row in roster.items()
}
access = {stage: p['accessQuests'] for stage, p in boss_points.items() if p.get('accessQuests')}
assert len(access) == 21 and sum(map(len, access.values())) == 23
assert all(boss_points[stage]['kind'] == 'legend' for stage in access)
assert access['night-trial-tlatzacuilotl'] == ['natlan-sulfurous-resonant-stones']
assert access['ochka-bronzelock-island-court'] == ['ochka-floating-island-spiritway']
assert access['frost-mushteshir-inner-chamber'] == ['frost-commander-console-test', 'frost-wujian-access-survey']
assert 'vivianne-legend-bank' not in access
for entry in plan['draft_field_approaches']:
    stage = entry['anchor']
    assert entry['terminus'] and not entry['runtime_gate']
    assert stage in nodes and nodes[stage]['level'] == entry['minimum_to_approach']
    assert drafts[entry['field']]['anchor'] == stage
for delta in plan['level_differences']:
    assert nodes[delta['stage']]['level'] == delta['access'] != delta['recommended']

lua, core = runtime()
s = core.new(12)
core.action(s, 'world_map_toggle')
assert core.frame(s).worldMap is None
core.action(s, 'world_map_boss:anemo-field-basin')
assert core.frame(s).worldMap is None
core.action(s, 'story_start')
before = native(core.checkpoint(s))


def act(key):
    core.action(s, 'world_map_' + key)
    return core.frame(s).worldMap


view = act('toggle')
assert view.region == 'region-01' and view.selected.id == 'mond-town'
assert view.selected.current and view.selected.level == 1
assert any(route.id == 'mond-road' for route in view.routes.values())
assert not any(group.id == 'hidden-01' for group in view.options.values())
assert act('region:hidden-01').region == 'world'
t = s.t
core.step(s, 1 / 60, lua.table_from({'right':True,'attack':True}))
assert s.t == t and native(core.checkpoint(s)) == before
assert act('here').selected.current
view = act('region:world')
assert len(view.points) == 8 and len(view.draws) > 200
view = act('layer:boss')
active_roster = {stage: row for stage, row in roster.items() if stage not in suspended}
assert {p.id: p.boss.id for p in view.bosses.values()} == {stage: row['id'] for stage, row in active_roster.items()}
assert view.region == 'world' and len(view.points) == 8
assert act('boss:mond-road').region == 'world'
assert act('boss:nod-quiet-rim').region == 'world'
boss_guides = Counter()
for stage, row in active_roster.items():
    view = act('boss:' + stage)
    assert view.layer == 'boss' and view.selected.id == stage and view.selected.boss.kind == row['kind']
    assert all(p.current or p.boss for p in view.points.values())
    assert view.guide.status in ('ready', 'blocked') and bool(view.guide.reason) == (view.guide.status == 'blocked')
    assert view.guide.stops[len(view.guide.stops)].id == stage
    boss_guides[view.guide.status] += 1
assert act('close') is None
core.step(s, 1 / 60, lua.table())
assert s.t > t

core.enterStoryNode(s, 'mond-road')
s.actors[s.active].x = 1105
core.action(s, 'story_collect')
assert s.story.discovered.golden
view = act('toggle')
assert any(group.id == 'hidden-01' for group in view.options.values())
assert act('region:hidden-01').region == 'hidden-01'
view = act('select:sites-gaa-03')
assert view.selected.id == 'sites-gaa-03'
assert any(route.label == '舟・寄港' for route in view.routes.values())
assert not act('layer:review').points[1]
act('close')
core.enterStoryNode(s, 'sites-lookout-98500')
view = act('toggle')
assert not view.selected.entrancePending and view.selected.id == 'sites-lookout-98500'
view = act('layer:surface')
assert view.selected.layer == 'surface' and '山風の荊冠' in view.selected.name
assert view.routes[1].id == 'sites-windcrown-waterfall' and view.routes[1].label == '風の流れ'
act('close')
core.enterStoryNode(s, 'fon-wp-50074')
view = act('toggle')
assert view.selected.id == 'fon-wp-50074' and view.selected.layer == 'water'
assert view.selected.level == 87
assert any(p.id == 'fon-wp-50076' and p.level == 93 for p in act('layer:water').points.values())
act('close')

core.enterStoryNode(s, 'chasm-camp')
view = act('toggle')
assert view.selected.layer == 'below' and view.region == 'official-area-6'
chasm = {p.id for p in act('layer:below').points.values()}
assert chasm == {p['id'] for r in atlas['regions'] if r['id'] == 'official-area-6' for p in r['points']}
assert len(chasm) == 17 and not act('layer:surface').points[1]

view = act('focus:golden-shadow-grotto')
assert not view.selected or view.selected.id != 'golden-shadow-grotto'
view = act('focus:sites-gaa-04-side-arena')
assert view.selected.layer == 'below'
assert view.selected.id in {p.id for p in act('layer:below').points.values()}
assert view.selected.id not in {p.id for p in act('layer:surface').points.values()}

exits = {id: node['exits'] for id, node in nodes.items()}
edges = {(id, edge['to']): edge for id, gates in exits.items() for edge in gates}
detours = []
for source, target, minimum, shortcut_level, bypass in (
    ('sites-dragonspine-south-foothill', 'mond-wp-6603', 60, None,
     ['mond-wp-6599', 'mond-wp-6606', 'mond-wp-6608', 'mond-wp-6609', 'mond-wp-6603']),
    ('liyue-wp-64843', 'liyue-wp-64842', 23, 26, ['liyue-wp-64825', 'liyue-wp-64842']),
):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, sum(core.expNeeded(level) for level in range(1, minimum - 1)), 'quest')
    core.enterStoryNode(s, source)
    assert s.progression.level == minimum - 1
    guide = act('focus:' + target).guide
    assert guide.status == 'blocked' and guide.requiredLevel == minimum
    assert [leg.id for leg in guide.stops.values()] == bypass
    blocked = native(guide)
    act('close')
    if source == 'liyue-wp-64843':
        (ROOT / 'work').mkdir(exist_ok=True)
        (ROOT / 'work/atlas-chenyu-lv22.json').write_text(
            json.dumps(native(core.checkpoint(s))), encoding='utf8')

    core.grantExp(s, core.expNeeded(minimum - 1), 'quest')
    assert s.progression.level == minimum
    guide = act('focus:' + target).guide
    assert guide.status == 'ready' and [leg.id for leg in guide.stops.values()] == bypass
    act('close')
    walk = TrailWalk(lua, core, s, edges, exits)
    s.auto = False
    for stop in bypass:
        s.enemies = lua.table()
        walk.cross(stop)
    assert s.story.node == target

    result = {'from': source, 'to': target, 'blocked_at': minimum - 1, 'guide': blocked,
              'walked_at': minimum, 'walked': bypass}
    if shortcut_level is not None:
        core.grantExp(s, sum(core.expNeeded(level) for level in range(minimum, shortcut_level)), 'quest')
        core.enterStoryNode(s, source)
        shortcut = act('focus:' + target).guide
        assert shortcut.status == 'ready'
        shortcut_path = [leg.id for leg in shortcut.stops.values()]
        assert shortcut_path != bypass and max(nodes[id]['level'] for id in shortcut_path) == shortcut_level
        act('close')
        result.update(shortcut_at=shortcut_level, shortcut=shortcut_path)
    detours.append(result)

v72 = read('content/coverage.json')['boss_catalog']['official_v72_addition_check']
earned = validate_save(read(v72['victories_in']))
v72_gates = []
for boss_id in v72['normal'] + v72['local_legends']:
    arena = next(stage for stage, row in active_roster.items() if row['id'] == boss_id)
    s = core.restore(lua.table_from(earned, recursive=True), 12)
    s.auto = False
    view = act('boss:' + arena)
    assert view.selected and view.selected.id == arena
    entrances = native(view.selected.entrances)
    assert len(entrances) == 1
    entrance = entrances[0]
    source = entrance['from']
    gate = edges[source, arena]
    assert (entrance['previewX'], entrance['previewY']) == (gate['x'], gate.get('y', 480))
    assert not entrance.get('reason')
    act('close')
    core.enterStoryNode(s, source)
    walk = TrailWalk(lua, core, s, edges, exits)
    walk.cross(arena)
    walk.cross(source)
    assert s.story.node == source
    v72_gates.append({'boss': boss_id, 'approach': source, 'arena': arena,
                      'x': gate['x'], 'y': gate.get('y', 480), 'walked_out_and_back': True})

field_stages = {point['field']: point['id'] for region in atlas['regions']
                for point in region['points'] if 'field' in point}
route_save = validate_save(read('evidence/remaining-survey-save.json'))
existing_routes = []
for review in reviews.values():
    if review['finding'] != 'unverified_travel_choice':
        continue
    a, b = (field_stages[field] for field in review['fields'])
    for origin, destination in ((a, b), (b, a)):
        s = core.restore(lua.table_from(route_save, recursive=True), 12)
        core.enterStoryNode(s, origin)
        walk = TrailWalk(lua, core, s, edges, exits)
        traversed = walk.follow_atlas(destination)
        assert traversed and traversed[-1] == destination and s.returns == 0, (origin, destination)
        existing_routes.append({'from': origin, 'to': destination, 'traversed': traversed})

result = {'imported_fields':len(fields)+len(drafts),'live_runtime_fields':len(fields),
          'draft_entrance_proposals':len(drafts),'sites_only_route_reviews':len(plan['sites_only_route_review']),
          'live_exteriors_with_unverified_source_entrance':sorted(pending),
          'route_findings':dict(Counter(row['finding'] for row in plan['sites_only_route_review'])),
          'existing_routes_for_unverified_choices':existing_routes,
          'separately_labelled_level_mismatches':len(plan['level_differences']),
          'bosses_by_kind': dict(Counter(row['kind'] for row in active_roster.values())),
          'suspended_boss_stages': sorted(suspended & roster.keys()), 'v72_boss_round_trips': v72_gates,
          'boss_path_status_from_level_1': dict(boss_guides),
          'hidden_area_visibility':True,'map_state_not_saved':True,'game_clock_pauses':True,
          'rendered_by_lua':True,'water_layer_and_levels':True,'chasm_underground_stages':sorted(chasm),
          'side_arena_underground_layer':True,'quest_cave_hidden_before_reveal':True,'level_detours':detours}
parser = ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'evidence/active-atlas-entrances-lua.json')
parser.parse_args().output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
