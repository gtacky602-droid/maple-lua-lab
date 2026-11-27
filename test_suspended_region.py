"""Check the active adventure and compatibility with saves from the removed branch."""
import json

from experience import LEVELS
from coop_rooms import CoopRooms, RULES
from runtime import ROOT, native, runtime
from savegame import validate_save


def test_nod_krai_special_region():
    lua, core = runtime()
    graph = json.loads((ROOT / 'content/story-graph.json').read_bytes())
    excluded_nodes = {node['id'] for node in graph['nodes']
                      if node['region'] == 'ナド・クライ特別地域（仮）'}
    excluded_quests = {'nod-special-survey', 'nod-light-path', 'nod-light-record', 'nod-rim-return'}
    assert len(excluded_nodes) == 12

    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[199]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, 'nod-town')
    core.action(state, 'story_accept:nod-rim-return')
    assert state.story.quests['nod-rim-return'] is None
    core.enterStoryNode(state, 'nod-field')
    actor = state.actors[state.active]
    actor.x, actor.y = 720, 480
    core.action(state, 'story_portal:nod-special-camp')
    assert state.story.node == 'nod-field'
    core.action(state, 'world_map_toggle')
    frame = native(core.frame(state, 'sprite', 'legacy'))
    assert frame['worldMap']['region'] == 'region-07'
    assert 'branch-08' not in {row['id'] for row in frame['worldMap']['options']}
    assert not excluded_nodes.intersection(node['id'] for node in frame['storyGraph']['nodes'])
    assert not excluded_quests.intersection(quest['id'] for quest in frame['storyGraph']['quests'])
    assert 'SW08' not in {item['id'] for item in frame['weaponView']['options']}
    core.action(state, 'world_map_close')
    actor.x = 1380
    core.action(state, 'story_portal:nod-town')
    assert state.story.node == 'nod-town'

    save = json.loads((ROOT / 'evidence/all-legends-expedition-save.json').read_bytes())
    save['story']['node'] = 'nod-quiet-rim'
    save['weapons']['equipped']['traveler'] = 'SW08'
    save = validate_save(save)
    restored = core.restore(lua.table_from(save, recursive=True), 12)
    assert restored.story.node == 'nod-town'
    assert restored.story.quests['nod-rim-return'].status == 'complete'
    assert core.equippedWeapon(restored, 'traveler') == 'SW08'
    coop = CoopRooms().view({'state': restored, 'core': core, 'rank_player': None})
    assert not excluded_nodes.intersection(RULES['nodes'])
    assert len(coop['sites']) == 392
    assert 'ナド・クライ特別地域（仮）・入口拠点' not in coop['sites']
    assert coop['eligible']
    core.action(restored, 'story_fast:nod-special-camp')
    assert restored.story.node == 'nod-town'
    validate_save(native(core.checkpoint(restored)))


if __name__ == '__main__':
    test_nod_krai_special_region()
    print('Nod-Krai routes, removed atlas region, archived quests and legacy save verified')
