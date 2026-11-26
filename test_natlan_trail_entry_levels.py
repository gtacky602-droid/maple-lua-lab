"""Walk and report the two Natlan trail quests at their published entry levels."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk

graph = json.loads((ROOT/'content/story-graph.json').read_bytes())
quests = {q['id']: q for q in graph['quests']}
exits = {n['id']: n['exits'] for n in graph['nodes']}
edges = {(src, e['to']): e for src, gates in exits.items() for e in gates}
lua, core = runtime()
seed = validate_save(json.loads((ROOT/'work/fontaine-fresh-route/natlan-save.json').read_bytes()))

def play(quest_id, approach):
    q = quests[quest_id]
    state = core.restore(lua.table_from(seed, recursive=True), 12)
    walk = TrailWalk(lua, core, state, edges, exits)
    assert state.story.node == q['hub'] and state.progression.level == 100
    if q['level'] > state.progression.level:
        core.grantExp(state, LEVELS[q['level']-1]['maple_reference_total_exp_to_reach']-state.progression.total, 'quest')
    assert state.progression.level == q['level']
    core.action(state, 'story_accept:'+quest_id)
    assert state.story.quests[quest_id].status == 'active'
    core.action(state, 'world_map_focus:'+q['target'])
    guide = core.frame(state).worldMap.guide
    assert guide.status == 'ready', (quest_id, guide.status)
    core.action(state, 'world_map_close')
    for dest in approach:
        walk.cross(dest)
    def inspect(spot):
        walk.approach(spot['x'], spot['y'], quest_id)
        core.action(state, 'story_collect')
    if 'paths' in q:
        for branch in q['paths']:
            spot = branch['steps'][0]
            walk.cross(spot['node'])
            inspect(spot)
            walk.cross(q['target'])
            assert state.story.quests[quest_id].pathProgress[branch['id']].count == 2
    else:
        for index, spot in enumerate(q['itinerary']):
            if index == 1:
                walk.approach(620, 414, quest_id)
                walk.approach(920, 346, quest_id)
            inspect(spot)
    assert state.story.quests[quest_id].count == q['goal']
    for dest in [*reversed(approach[:-1]), q['hub']]:
        walk.cross(dest)
    core.action(state, 'story_report:'+quest_id)
    save = validate_save(native(core.checkpoint(state)))
    assert save['story']['quests'][quest_id]['status'] == 'complete'
    return dict(quest=quest_id, startLevel=q['level'], reached=q['target'], crossings=len(walk.crossings))

results = [
    play('natlan-witztli-three-echoes', ['natlan-field','nat-wp-72428','nat-wp-72760','nat-wp-72436','witztli-sealed-stone-bank']),
    play('natlan-seaward-signs', ['natlan-field','natlan-port','nat-wp-79058','nat-wp-79056','nat-wp-79054','nat-wp-79053','night-wind-seaward-fork'])
]
(ROOT/'evidence/natlan-trail-entry-levels.json').write_text(json.dumps(results, indent=2)+'\n', encoding='utf8')
print(results)
