"""Verify atlas-only battle directions and follow each actual Lua scene change."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


atlas = read('content/world-atlas.json')
regions = {point['id']: region['id'] for region in atlas['regions'] for point in region['points']}
graph = read('content/story-graph.json')
edges = {(node['id'], edge['to']): edge for node in graph['nodes'] for edge in node['exits']}
specs = {boss['controller']: boss for boss in read('content/weekly-boss-spawns.json')['weeklyBosses']
         if boss.get('atlasTransfer')}
assert set(specs) == {'narwhal', 'false_moon'}

lua, core = runtime()
idle = lua.table()


def guide(state, target, *, keep_open=False):
    if not state.worldMap:
        core.action(state, 'world_map_toggle')
    core.action(state, 'world_map_region:' + regions[target])
    core.action(state, 'world_map_select:' + target)
    view = core.frame(state, 'sprite', 'legacy').worldMap
    assert view.selected.id == target
    data = native(view)
    if not keep_open:
        core.action(state, 'world_map_close')
    return data


def ready(level, hub):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, hub)
    return s


def position(s, x):
    actor = s.actors[s.active]
    actor.x, actor.y, actor.vy, actor.ground = x, 480, 0, True


def prepare(name, hub):
    spec = specs[name]
    outer, inner, level = spec['node'], spec['innerNode'], spec['level']
    assert (outer, inner) not in edges and (inner, outer) not in edges
    s = ready(level - 1, hub)
    blocked = guide(s, inner)['guide']
    assert blocked['reason'] == f'必要Lv{level}' and blocked['status'] == 'blocked'
    assert [stop['id'] for stop in blocked['stops']] == [outer, inner] and blocked['battle']
    s = ready(level, hub)
    outbound = guide(s, inner)
    assert outbound['selected']['battleScene']
    assert [leg['mode'] for leg in outbound['guide']['stops']] == ['walk', 'battle']
    assert outbound['guide']['status'] == 'battle' and outbound['guide']['stops'][1]['hint'] == spec['atlasTransfer']['enter']

    TrailWalk(lua, core, s, edges, {}).cross(outer)
    adjacent = guide(s, outer)['routes']
    assert any(row['id'] == inner and row['label'] == '戦闘中に移動' for row in adjacent)
    core.action(s, 'story_portal:' + inner)
    assert s.story.node == outer
    slot, live_spec = core.currentWeeklyBoss(s)
    assert slot and live_spec.innerNode == inner
    return s, slot, live_spec, outbound['guide']


def until(s, condition, limit=9500):
    for _ in range(limit):
        if condition():
            return
        core.step(s, 1 / 60, idle)
    raise AssertionError(s.story.node)


def returning(s, spec, hub, *, retreat):
    view = guide(s, spec.node)['guide']
    assert view['status'] == 'battle' and len(view['stops']) == 1
    leg = view['stops'][0]
    assert (leg['from'], leg['id'], leg['label'], leg['hint']) == (
        spec.innerNode, spec.node, '戦闘中に帰還', spec.atlasTransfer.leave)
    route_to_hub = guide(s, hub)['guide']
    assert [leg['id'] for leg in route_to_hub['stops']] == ([hub] if retreat else [spec.node, hub])
    assert route_to_hub['status'] == ('ready' if retreat else 'battle')
    return view, route_to_hub


def narwhal():
    hub = 'fontaine-hub'
    s, slot, spec, outbound = prepare('narwhal', hub)
    s.actors[1].inv, s.actors[2].hp = 300, 0
    until(s, lambda: s.story.node == spec.innerNode and slot.stage == 'inner')
    back, hub_route = returning(s, spec, hub, retreat=True)
    until(s, lambda: slot.shadow and not slot.shadow.invulnerable)
    shadow = slot.shadow
    position(s, shadow.x - 62)
    a = s.actors[s.active]
    a.dir, a.atk, a.lock, a.cd.normal = 1, 10000, 0, 0
    assert core.attack(s, a, 'normal')
    until(s, lambda: s.story.node == spec.node and slot.stage == 'weak')
    assert slot.returned == 1
    assert guide(s, spec.node)['guide']['status'] == 'here'
    return dict(outbound=outbound, returnGuide=back, retreat=hub_route, actualReturnStage=slot.stage)


def false_moon():
    hub = 'nod-town'
    s, slot, spec, outbound = prepare('false_moon', hub)
    s.actors[1].inv, s.actors[2].hp = 300, 0
    position(s, spec.rift.x)
    until(s, lambda: slot.cast and slot.cast.key == 'WM13' and slot.cast.t >= spec.rift.enterTick)
    core.action(s, 'encounter_interact')
    assert slot.cast.confirm
    until(s, lambda: s.story.node == spec.innerNode)
    back, hub_route = returning(s, spec, hub, retreat=False)
    position(s, spec.rift.exitX)
    until(s, lambda: slot.cast and slot.cast.key == 'WM15')
    core.action(s, 'encounter_interact')
    until(s, lambda: s.story.node == spec.node and slot.stage == 'outer')
    assert guide(s, spec.node)['guide']['status'] == 'here'
    return dict(outbound=outbound, returnGuide=back, routeToTown=hub_route, actualReturnStage=slot.stage)


def shared_map_refresh():
    host, peer = [prepare('narwhal', 'fontaine-hub')[0] for _ in range(2)]
    room = core.newCoop(host)
    core.attachCoop(room, host)
    core.attachCoop(room, peer)
    slot = room.weeklySlot
    _, spec = core.currentWeeklyBoss(host)
    slot.h, slot.queued = spec.hostility.max, True
    before = guide(host, spec.innerNode, keep_open=True)
    assert before['guide']['status'] == 'battle'
    for _ in range(360):
        core.stepCoop(room, 1 / 60)
        if host.story.node == spec.innerNode:
            break
    after = native(core.frame(host, 'sprite', 'legacy').worldMap)
    assert host.story.node == peer.story.node == spec.innerNode
    assert after['revision'] > before['revision'] and after['guide']['status'] == 'here'
    assert after['selected']['current'] and before['selected']['id'] == after['selected']['id']
    return dict(keptMapOpen=True, currentAfterSharedTransition=True, beforeRevision=before['revision'],
                afterRevision=after['revision'])


if __name__ == '__main__':
    evidence = dict(narwhal=narwhal(), falseMoon=false_moon(), coop=shared_map_refresh(),
                    directPortalRejected=True, underleveledEntranceBlocked=True)
    (ROOT / 'evidence/atlas-battle-routes-lua.json').write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('Battle atlas Lua: both real transitions, returns, and live co-op map refresh passed.')
