"""Verify the Lua atlas, visible exits, level review, and the imported entrance plan."""

from collections import Counter
import json

from build_world_atlas import BOSS_STAGE_FIELDS
from runtime import ROOT, native, runtime


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


atlas = read('content/world-atlas.json')
plan = read('design/world/atlas-route-plan.json')
graph = read('content/story-graph.json')
nodes = {node['id']: node for node in graph['nodes']}
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
assert sum(row['finding']=='implemented_as_lab_route' for row in plan['sites_only_route_review']) == 137
assert not (fields & drafts.keys()) and len(fields) + len(drafts) == plan['imported_fields'] == 979
assert len(plan['sites_only_route_review']) == 421
roster = {
    stage: row
    for row in read('content/encounters.json')['encounters']
    if (stage := row.get(BOSS_STAGE_FIELDS[row['kind']]))
}
boss_points = {p['id']: p['boss'] for r in atlas['regions'] for p in r['points'] if 'boss' in p}
assert boss_points == {
    stage: {key: row[key] for key in ('id', 'name', 'kind', 'aliases') if key in row}
    for stage, row in roster.items()
}
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
assert {p.id: p.boss.id for p in view.bosses.values()} == {stage: row['id'] for stage, row in roster.items()}
assert view.region == 'world' and len(view.points) == 8
assert act('boss:mond-road').region == 'world'
boss_guides = Counter()
for stage, row in roster.items():
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

result = {'imported_fields':len(fields)+len(drafts),'live_runtime_fields':len(fields),
          'draft_entrance_proposals':len(drafts),'sites_only_route_reviews':len(plan['sites_only_route_review']),
          'live_exteriors_with_unverified_source_entrance':sorted(pending),
          'route_findings':dict(Counter(row['finding'] for row in plan['sites_only_route_review'])),
          'separately_labelled_level_mismatches':len(plan['level_differences']),
          'bosses_by_kind': dict(Counter(row['kind'] for row in roster.values())),
          'boss_path_status_from_level_1': dict(boss_guides),
          'hidden_area_visibility':True,'map_state_not_saved':True,'game_clock_pauses':True,
          'rendered_by_lua':True,'water_layer_and_levels':True}
(ROOT / 'evidence/world-atlas-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
