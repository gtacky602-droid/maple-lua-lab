"""Board all story voyages and verify timed gates, arrival, and checkpoint restores."""

import json
from collections import Counter

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


graph = json.loads((ROOT / 'content/story-graph.json').read_text(encoding='utf8'))
nodes = {node['id']: node for node in graph['nodes']}
exits = {node['id']: node['exits'] for node in nodes.values()}
edges = {(origin, edge['to']): edge for origin, gates in exits.items() for edge in gates}
voyages = [node for node in nodes.values() if node.get('voyage')]
quests = {quest['id']: quest for quest in graph['quests']}
atlas = json.loads((ROOT / 'content/world-atlas.json').read_text(encoding='utf8'))
regions = {point['id']: region['id'] for region in atlas['regions'] for point in region['points']}
lua, core = runtime()
advance = lua.eval('function(C,s,ticks) for _=1,ticks do C.step(s,1/60,{}) end end')


def setup(node, required_level, gate):
    route = node['voyage']
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[required_level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    if group := node.get('hiddenGroup'):
        s.story.discovered[group] = True
    source = nodes[route['source']]
    core.enterStoryNode(s, source['checkpoint'])
    core.enterStoryNode(s, source['id'])
    for actor in s.actors.values():
        actor.inv = 1000
    walk = TrailWalk(lua, core, s, edges, exits)
    if rule := gate.get('requires'):
        quest = quests[rule['quest']]
        walk.approach(gate['x'], gate.get('y', 480), node['id'])
        portal = core.frame(s).storyNearbyPortal
        assert portal.to == node['id'] and not portal.available and quest['name'] in portal.reason
        core.action(s, 'story_nearby_portal')
        assert s.story.node == source['id'] and not s.voyage
        for step in quest['itinerary']:
            s.story.visited[step['node']] = True
        s.story.quests[quest['id']] = lua.table_from(dict(status='complete', count=quest['goal'], cycles=1))
    return walk


def save(s):
    return validate_save(native(core.checkpoint(s)))


def restore_on_land(s, expected):
    saved = save(s)
    restored = core.restore(lua.table_from(saved, recursive=True), 12)
    assert restored.story.node == expected and not restored.voyage, (s.story.node, restored.story.node, expected)
    assert native(restored.story.visited) == native(s.story.visited)
    assert native(restored.story.discovered) == native(s.story.discovered)
    assert native(restored.story.quests) == native(s.story.quests)
    assert restored.progression.total == s.progression.total
    return saved['story']['node']


def guide(s, target):
    core.action(s, 'world_map_toggle')
    core.action(s, 'world_map_region:' + regions[target])
    core.action(s, 'world_map_select:' + target)
    view = core.frame(s).worldMap
    assert view.guide and view.selected.id == target, (s.story.node, target)
    route = native(view.guide)
    core.action(s, 'world_map_close')
    return route


def elapsed(s, seconds):
    ticks = round((seconds - (s.t - s.voyage.started)) * 60)
    assert ticks >= 0
    advance(core, s, ticks)


def finish(walk, node):
    s = walk.state
    expected = node['voyage']
    target = expected['destination']
    already_visited = s.story.visited[target]
    elapsed(s, expected['seconds'] - 1 / 60)
    assert s.story.node == node['id'] and s.story.visited[target] == already_visited
    advance(core, s, 1)
    assert s.story.node == target and not s.voyage and s.story.visited[target]
    if 'arrivalX' in expected:
        assert (walk.actor.x, walk.actor.y) == (expected['arrivalX'], expected['arrivalY'])


def verify(node):
    spec = node['voyage']
    vehicle, source, target = node['id'], spec['source'], spec['destination']
    boarding = edges[source, vehicle]
    level = max(nodes[id]['level'] for id in (source, vehicle, target))
    if rule := boarding.get('requires'):
        level = max(level, quests[rule['quest']]['level'])
    walk = setup(node, level, boarding)
    if vehicle in ('white-pass-coach', 'veluriyam-trolley-out'):
        write(f'work/world-voyage-routes/{vehicle}.json', save(walk.state))
    s = walk.state
    walk.cross(vehicle)
    frame = core.frame(s).voyage
    assert frame.destination == target and frame.kind == spec['kind'] and frame.total == spec['seconds']
    assert frame.elapsed == 0 and not frame.stopover
    planned = guide(s, target)
    assert planned['status'] == 'ready' and planned['stops'][0]['id'] == target, planned
    assert f"{spec['seconds']}秒で" in planned['stops'][0]['hint']
    assert planned['stops'][0]['automaticArrival'] and planned['stops'][0]['secondsRemaining'] == frame.seconds
    assert 'gateX' not in planned['stops'][0]
    expected_save = nodes[source]['checkpoint'] if node.get('checkpointAtEntry') else node['checkpoint']
    elapsed(s, 0.5)
    saved_at = restore_on_land(s, expected_save)
    row = dict(stage=vehicle, kind=spec['kind'], boardedAt=source, arrivedAt=target,
               duration=spec['seconds'], savedAt=saved_at, restoredAt=expected_save)
    if edge := edges.get((vehicle, target)):
        assert edge['requiresArrival']
        walk.approach(edge['x'], edge.get('y', 480), target)
        assert core.frame(s).storyNearbyPortal.reason == '到着待ち'
        core.action(s, 'story_nearby_portal')
        assert s.story.node == vehicle
        row['arrivalGateClosedBeforeArrival'] = True
    if 'stopStart' not in spec:
        finish(walk, node)
        return row

    (stop,) = [edge for edge in exits[vehicle] if edge.get('windowStart') is not None]
    stop_id = stop['to']
    start, end = stop['windowStart'], stop['windowEnd']
    assert (start, end) == (spec['stopStart'], spec['stopEnd'])
    walk.approach(stop['x'], stop.get('y', 480), stop_id)
    plan = guide(s, stop_id)
    assert plan['stops'][0]['id'] == stop_id and f'{start}〜{end}秒' in plan['stops'][0]['hint']
    elapsed(s, start - 1 / 60)
    assert not core.frame(s).storyNearbyPortal.available and not core.frame(s).voyage.stopover
    core.action(s, 'story_nearby_portal')
    assert s.story.node == vehicle
    advance(core, s, 1)
    assert core.frame(s).storyNearbyPortal.available and core.frame(s).voyage.stopover
    walk.cross(stop_id)
    assert not s.voyage
    reboard = edges[stop_id, vehicle]
    remaining = round(spec['seconds'] - reboard['resumeSeconds'], 8)
    plan = guide(s, vehicle)
    assert f'{remaining:g}秒で到着' in plan['stops'][0]['hint']
    walk.cross(vehicle)
    assert abs(core.frame(s).voyage.seconds - remaining) < 1e-8
    assert not core.frame(s).voyage.stopover
    reboard_restore = nodes[stop_id]['checkpoint'] if node.get('checkpointAtEntry') else node['checkpoint']
    restore_on_land(s, reboard_restore)
    finish(walk, node)

    missed = setup(node, level, boarding)
    s = missed.state
    missed.cross(vehicle)
    missed.approach(stop['x'], stop.get('y', 480), stop_id)
    elapsed(s, end - 1 / 60)
    assert core.frame(s).storyNearbyPortal.available and core.frame(s).voyage.stopover
    advance(core, s, 1)
    assert not core.frame(s).storyNearbyPortal.available and not core.frame(s).voyage.stopover
    after_stop = guide(s, stop_id)
    assert after_stop['status'] != 'ready' or after_stop['stops'][0]['id'] != stop_id, (vehicle, after_stop)
    core.action(s, 'story_nearby_portal')
    assert s.story.node == vehicle and not s.story.visited[stop_id]
    finish(missed, node)
    row.update(stop=stop_id, window=[start, end], reboardedFrom=stop_id, secondsAfterReboarding=remaining,
               restoredAfterReboarding=reboard_restore, atlasStopsOfferingClosedGate=True, reachedEndAfterMissingStop=True)
    return row


assert Counter(node['voyage']['kind'] for node in voyages) == {'ferry': 6, 'train': 1, 'trolley': 6}
(ROOT / 'work/world-voyage-routes').mkdir(parents=True, exist_ok=True)
results = [verify(node) for node in voyages]
write('evidence/world-voyage-routes-lua.json', dict(
    setup='Regional source and checkpoint, required XP, and two completed ticket fixtures; actual movement and portal inputs.',
    voyages=results,
))
print(f'{len(results)} voyages boarded, arrived and restored; {sum("stop" in row for row in results)} timed stops verified.')
