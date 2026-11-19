"""Play through each mapped Sites hunting spur in Lua and prepare two browser saves."""

from collections import Counter
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf8')


graph = read('content/story-graph.json')
nodes = {node['id']:node for node in graph['nodes']}
exits = {id:node['exits'] for id,node in nodes.items()}
gates = {(id,gate['to']):gate for id,rows in exits.items() for gate in rows}
spawns = read('content/enemy-spawns.json')['nodes']
atlas = read('content/world-atlas.json')
positions = {p['id']:p for region in atlas['regions'] for p in region['points']}
pending = {p['field'] for region in atlas['regions'] for p in region['points'] if p.get('entrancePending')}
confirmed = {row['field'] for row in read('design/world/atlas-route-plan.json')['confirmed_entrance_exteriors']}
snapshot = read('design/world/editor-snapshot.json')['data']
source = {edge['id']:edge for edge in snapshot['edges']}
review = read('sources/map-research/sites-geographic-fields.json')
routes = {row['field']:row for row in review['routes']}
specs = {f['field_id']:f for path in (ROOT/'design/world/placements').glob('*.json')
         for f in read(path.relative_to(ROOT))['fields']}
assert len(routes)==71 and pending.isdisjoint(confirmed) and set(review['held'])==pending | confirmed
assert {f['id'] for f in snapshot['fields'] if f['role']=='hold'} >= pending | confirmed
assert not {node.get('mapPoint') for node in nodes.values()} & routes.keys()

lua, core = runtime()
batch = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def base(hub, level):
    state=core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(state,hub)
    return state


def save(state):
    return validate_save(native(core.checkpoint(state)))


def verify_spawn(stage, expected):
    data=spawns[stage]
    assert Counter(e['designSpawn'] for e in data)=={row['id']:row['count'] for row in expected}
    specs_by_id={e['id']:e for e in expected}
    for e in data:
        row=specs_by_id[e['designSpawn']]
        p=nodes[stage]['platforms'][e['platform']]
        assert p['x']+24 <= e['x'] <= p['x']+p['w']-24
        assert e['level']==row['level'] and e['respawnSeconds']==row['respawn_seconds']
        assert e['art']==review['art_proxies'][row['family']]
        assert e['dailyExclude'] is not row['counts_for_daily_kill']
    return len(data)


crossings=set()
counts=Counter()
blocked=ordinary=pockets=0
for field, row in routes.items():
    stage, host = row['stage'], row['approach']
    src=source[row['source_edge']]
    assert {src['a'],src['b']}=={field,row['anchor_field']}
    assert nodes[host]['mapPoint']==row['anchor_field'] and nodes[stage]['designField']==field
    spur_exits=[host,*row['pockets']]
    assert [edge['to'] for edge in exits[stage] if edge['to'] in spur_exits]==spur_exits
    assert row['recommended']==specs[field]['level'] and row['access']==max(row['recommended'],nodes[host]['level'])
    p=positions[stage]
    assert p['provisional'] and p['recommended']==row['recommended']
    assert p['layer']==('water' if row['mode']=='water' else 'below' if row['mode'] in ('cave','lift') else 'surface')
    layout=specs[field]['stage_layout']
    for e in spawns[stage]:
        width=nodes[stage]['width']
        assert .18*width <= e['x'] <= .82*width
    assert max(Counter(e['x']//960 for e in spawns[stage]).values())<=16
    ordinary+=verify_spawn(stage,specs[field]['regular_spawns'])
    assert len(row['pockets'])==len(specs[field]['optional_pockets'])

    level=row['access']
    level_before=level-1 if level>nodes[host]['level'] else level
    safe=nodes[host]['checkpoint']
    state=base(safe,level_before)
    core.enterStoryNode(state,host)
    assert not state.story.visited[stage]
    for actor in state.actors.values():
        actor.inv=1000
    walk=TrailWalk(lua,core,state,gates,exits)
    if level_before<level:
        gate=gates[host,stage]
        walk.approach(gate['x'],gate.get('y',480),stage)
        alert=core.frame(state).storyNearbyPortal
        assert alert.to==stage and not alert.available and alert.level==level
        core.action(state,'story_nearby_portal')
        assert state.story.node==host and not state.lift
        gap=LEVELS[level-1]['maple_reference_total_exp_to_reach']-LEVELS[level_before-1]['maple_reference_total_exp_to_reach']
        core.grantExp(state,gap,'quest')
        blocked+=1
    quest_state=native(state.story.quests)
    walk.cross(stage)
    assert len(state.enemies)==len(spawns[stage])
    assert all(e.patrolMin >= width*layout['safe_entry_exit_fraction']-0.001 for e in state.enemies.values())
    counts[row['mode']]+=1
    if row['mode']=='water':
        frame=core.frame(state)
        assert not frame.storySwim and not state.storySwimming
        core.action(state,'world_map_toggle')
        view=core.frame(state).worldMap
        assert view.selected.current and view.selected.layer=='water'
        assert any(r.id==host and r.label=='水路' for r in view.routes.values())
        core.action(state,'world_map_close')
        enemy=state.enemies[1]
        a=walk.actor
        a.x,a.y,a.dir,a.lock,enemy.hp=enemy.x-30,enemy.y,1,0,1
        before=state.kills
        assert core.attack(state,a,'normal')
        batch(core,state,1)
        assert state.kills==before+1 and enemy.hp==0
        safe_x=gates[stage,host]['x']
        for actor in state.actors.values():
            actor.x,actor.y=safe_x,480
        batch(core,state,round(60*(enemy.respawnSeconds+.3)))
        assert enemy.hp==enemy.maxhp
    checkpoint=save(state)
    restored=core.restore(lua.table_from(checkpoint,recursive=True),12)
    assert restored.story.node==safe and restored.story.visited[stage]
    for side,spec in zip(row['pockets'],specs[field]['optional_pockets']):
        assert verify_spawn(side,[spec])==1 and nodes[side]['atlasParent']==stage
        actual=state.progression.level
        required=nodes[side]['level']
        if actual<required:
            core.grantExp(state,LEVELS[required-1]['maple_reference_total_exp_to_reach']
                          -LEVELS[actual-1]['maple_reference_total_exp_to_reach'],'quest')
        for actor in state.actors.values():actor.inv=1000
        walk.cross(side)
        assert len(state.enemies)==1 and state.enemies[1].storyName==spec['name']
        walk.cross(stage)
        pockets+=1
    walk.cross(host)
    assert native(state.story.quests)==quest_state and not state.lift
    crossings.update(walk.crossings)

for name, field in [('water','teyvat:50067'),('boat','teyvat:18667')]:
    row=routes[field]
    host=row['approach']
    state=base(nodes[host]['checkpoint'],row['access'])
    core.enterStoryNode(state,host)
    write(f'work/sites-geographic-{name}-fixture.json',save(state))

assert len(crossings)==(len(routes)+pockets)*2
write('evidence/sites-geographic-fields-lua.json',{
    'field_round_trips':len(routes),'directions_traversed':len(crossings),'routes_by_terrain':dict(counts),
    'own_checkpoint_recovery':len(routes),'level_gates_exercised':blocked,
    'ordinary_placements':ordinary,'optional_pocket_round_trips':pockets,
    'underwater_corridor_rendered_ground_combat_respawn':counts['water'],
    'existing_quest_progress_preserved':True,'source_entrances_unverified':sorted(pending),
})
print(f'{len(routes)} field and {pockets} side-room round trips, {len(crossings)} directional transitions passed.')
