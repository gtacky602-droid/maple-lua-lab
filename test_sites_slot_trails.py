"""Traverse all 32 virtual field bindings with Lua movement, ferry, rail and lift actions."""

from collections import Counter, defaultdict
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


graph = read('content/story-graph.json')
nodes = {n['id']: n for n in graph['nodes']}
exits = {id: n['exits'] for id, n in nodes.items()}
edges = {(id, e['to']): e for id, gates in exits.items() for e in gates}
placements = read('content/enemy-spawns.json')['nodes']
review = read('sources/map-research/sites-slot-trails.json')
fields = review['bindings']
assert fields == {field:n['id'] for n in nodes.values()
                  if (field := n.get('designField', '')).startswith('slot:')}
assert len(set(fields.values())) == len(fields) == 32
assert all(not nodes[id].get('mapPoint') for id in fields.values())
layout_groups = {'GAA':'hidden-01','VLM':'hidden-02','SIM':'hidden-03','NSP':'branch-08'}
expected = {f['field_id']:f for suffix in layout_groups.values()
            for f in read(f'design/world/placements/{suffix}.json')['fields']
            if f['field_id'].startswith('slot:')}
assert set(expected) == set(fields)
families = review['art_proxies']
spawn_count = 0
for key, id in fields.items():
    spec, node = expected[key], nodes[id]
    if id.startswith('sites-'):
        assert node['level'] == spec['level']
        assert all(p['w']>0 and p['x']+p['w']<=node['width'] for p in node['platforms'])
    rows = {row['id']:row for row in spec['regular_spawns']}
    if not rows:
        if spec['mode'] == 'optional_arena_only':
            assert len(placements[id]) == 1 and placements[id][0]['dailyExclude']
        else:
            assert not placements.get(id)
        continue
    registered = placements[id]
    counts = Counter(item['designSpawn'] for item in registered)
    assert counts == {sid:row['count'] for sid,row in rows.items()}
    assert all(count <= 20 for count in Counter(row['x']//960 for row in registered).values())
    for item in registered:
        p = node['platforms'][item['platform']]
        assert p['x']+24 <= item['x'] <= p['x']+p['w']-24
        assert .18*node['width'] <= item['x'] <= .82*node['width']
        row = rows[item['designSpawn']]
        assert item['level'] == row['level'] and item['respawnSeconds'] == row['respawn_seconds']
        assert item['art'] == families[row['family']][0]
    spawn_count += len(registered)

source = read('design/world/editor-snapshot.json')['data']['edges']
slot_pairs = {frozenset((edge['a'],edge['b'])) for edge in source if
              all(edge[k].startswith('slot:') for k in ('a','b'))}
assert {frozenset(row['fields']) for row in review['routes']} == slot_pairs and len(slot_pairs)==28
paths = defaultdict(list)
for row in review['routes']:
    for key in ('forward','return'):
        path = row[key]
        paths[path[0]].append((key,row))
        assert all((a,b) in edges or nodes[a]['voyage']['destination']==b for a,b in zip(path,path[1:]))


lua, core = runtime()
idle = lua.table()
batch = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')
traversed = set()
optional = set()


class SlotWalk(TrailWalk):
    def cross(self,target):
        # Isolate movement and transport from field combat. The spawn/respawn check uses a live hit below.
        for actor in self.state.actors.values():
            actor.inv = 500
        super().cross(target)

    def place(self,x,y=480):
        self.approach(x,y,'quest prop')

    def inspect(self,x,y=480,action='story_collect'):
        self.place(x,y)
        self.core.action(self.state,action)


def make(level, parent):
    state = core.new(12)
    core.action(state,'story_start')
    core.grantExp(state,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    assert state.progression.level == level
    core.enterStoryNode(state,parent)
    return state, SlotWalk(lua,core,state,edges,exits)


def published(state):
    return {node.id for node in core.frame(state).storyGraph.nodes.values()}


def run_path(walk,route):
    for a,b in zip(route,route[1:]):
        assert walk.state.story.node==a
        if (a,b) in edges:
            walk.cross(b)
        else:
            voyage = walk.state.voyage
            assert voyage and voyage.destination==b
            frame = core.frame(walk.state)
            assert frame.voyage.destination==b and not frame.voyage.stopover
            initial_scroll = frame.voyage.scroll
            assert 0<=initial_scroll<=1
            batch(core,walk.state,60)
            scroll = core.frame(walk.state).voyage.scroll
            assert (0<=scroll<initial_scroll) if voyage.reverse else (initial_scroll<scroll<=1)
            for _ in range(600):
                if walk.state.story.node==b:break
                core.step(walk.state,1/60,idle)
            assert walk.state.story.node==b and walk.state.voyage is None
        traversed.add((a,b))


def sweep(walk,id):
    visited={id}
    def visit(a):
        binding=nodes[a]['designField']
        pocket=review['optional_pockets'].get(binding)
        if pocket:
            stage=pocket['stage']
            if stage!=a:
                walk.cross(stage)
            guard=walk.state.enemies[1]
            assert len(walk.state.enemies)==1 and guard.spawnId.endswith('-guardian') and guard.storyName
            optional.add(stage)
            if stage!=a:
                walk.cross(a)
        for key,entry in paths[a]:
            route=entry[key]
            b=route[-1]
            if b in visited:continue
            visited.add(b)
            run_path(walk,route)
            visit(b)
            run_path(walk,entry['return' if key=='forward' else 'forward'])
    visit(id)
    assert walk.state.story.node==id
    return visited


def save(state):
    return validate_save(native(core.checkpoint(state)))


golden, shore = make(35,'mond-road')
assert 'sites-gaa-02' not in published(golden)
shore.inspect(1105)
assert golden.story.discovered.golden
shore.cross('golden-mainland-coast')
core.action(golden,'story_accept:golden-little-boat')
shore.inspect(345)
shore.inspect(827,390)
shore.inspect(1308)
assert golden.story.quests['golden-little-boat'].count==3
shore.cross('golden-hub')
write('work/sites-slot-browser-fixture.json',save(golden))
assert sweep(shore,'golden-hub') == {id for key,id in fields.items() if key.startswith('slot:GAA')}
assert golden.story.quests['golden-little-boat'].count==3
shore.cross('sites-gaa-02')
assert len(golden.enemies)==48
assert all(.15*golden.worldwidth <= e.patrolMin <= e.x <= e.patrolMax <= .85*golden.worldwidth for e in golden.enemies.values())
enemy=golden.enemies[1]
a=golden.actors[1]
a.x,a.y,a.dir,a.lock,enemy.hp=enemy.x-30,enemy.y,1,0,1
before=golden.kills
assert core.attack(golden,a,'normal')
batch(core,golden,1)
assert golden.kills==before+1 and enemy.hp==0 and enemy.respawn>5
for actor in golden.actors.values():
    actor.x,actor.y=86,480
batch(core,golden,370)
assert enemy.hp==enemy.maxhp, (enemy.hp,enemy.respawn,enemy.x,golden.story.node)
restored=core.restore(lua.table_from(save(golden),recursive=True),12)
assert restored.story.node=='golden-hub' and restored.story.visited['sites-gaa-02']
shore.cross('golden-hub')
shore.cross('golden-mainland-coast')
shore.cross('mond-road')

mirage, rides = make(75,'sumeru-entry')
assert 'sites-vlm-02' not in published(mirage)
rides.inspect(1050)
rides.cross('veluriyam-bottle-yard')
core.action(mirage,'story_accept:veluriyam-bottle-ticket')
rides.inspect(355)
for _ in range(3):rides.inspect(873,391)
rides.inspect(873,391,'story_airflow_commit')
rides.cross('veluriyam-hub')
rides.cross('sites-vlm-02')
rides.place(2770)
gate=core.frame(mirage).storyNearbyPortal
assert gate.to=='veluriyam-petal-stop' and not gate.available
rides.cross('veluriyam-hub')
rides.inspect(323)
rides.inspect(985,390)
rides.cross('veluriyam-bottle-yard')
core.action(mirage,'story_report:veluriyam-bottle-ticket')
assert mirage.story.quests['veluriyam-bottle-ticket'].status=='complete'
core.action(mirage,'story_fast:veluriyam-hub')
assert sweep(rides,'veluriyam-hub') == {id for key,id in fields.items() if key.startswith('slot:VLM')}
rides.cross('sumeru-entry')

paper, rail = make(95,'fontaine-hub')
assert 'sites-sim-02' not in published(paper)
rail.inspect(1050)
rail.cross('simulanka-book-room')
core.action(paper,'story_accept:simulanka-open-page')
rail.inspect(321)
for _ in range(3):rail.inspect(497)
rail.inspect(497,480,'story_paper_confirm')
assert paper.story.quests['simulanka-open-page'].count==2
rail.place(639,389)
rail.cross('simulanka-hub')
assert sweep(rail,'simulanka-hub') == {id for key,id in fields.items() if key.startswith('slot:SIM')}
assert paper.story.quests['simulanka-open-page'].count==2
rail.cross('sites-sim-02')
rail.cross('sites-sim-04')
write('work/sites-slot-rail-fixture.json',save(paper))
rail.cross('sites-star-rail-out')
mid_rail=core.restore(lua.table_from(save(paper),recursive=True),12)
assert mid_rail.story.node=='sites-sim-04' and mid_rail.voyage is None
run_path(rail,['sites-star-rail-out','sites-sim-05'])
run_path(rail,['sites-sim-05','sites-star-rail-in','sites-sim-04'])
rail.cross('sites-sim-02')
rail.cross('simulanka-hub')
rail.cross('fontaine-hub')

north, frost = make(190,'nod-field')
frost.cross('nod-special-camp')
assert sweep(frost,'nod-special-camp') == {id for key,id in fields.items() if key.startswith('slot:NSP')}
frost.cross('nod-field')
assert len(optional)==6
expected_edges={(a,b) for row in review['routes'] for key in ('forward','return')
                for a,b in zip(row[key],row[key][1:])}
assert traversed==expected_edges
for state in (golden,mirage,paper,north):
    assert save(state)

write('evidence/sites-slot-trails-lua.json',{
  'verified_fields':len(fields),'design_pair_round_trips':len(slot_pairs),'directed_transitions':len(traversed),
  'regular_enemy_placements':spawn_count,'optional_side_battles':sorted(optional),
  'safety_margin_and_respawn':True,'existing_discovery_paths':True,'save_restored_at_hub':True,
  'save_during_new_rail_restored_at_station':True,
  'existing_hidden_quest_progress_unchanged_by_new_paths':True,'level_fixtures': [35,75,95,190],
  'half_open_train_stop_reused':True,'nonstop_train_scroll_both_directions':True,
})
print(f'{len(fields)} field bindings and {len(traversed)} directed transitions passed.')
