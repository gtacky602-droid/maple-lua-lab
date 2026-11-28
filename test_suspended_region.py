"""Check the active adventure and compatibility with saves from the removed branch."""
from argparse import ArgumentParser
import json
from pathlib import Path

from experience import LEVELS
from coop_rooms import CoopRooms, RULES
from runtime import ROOT, native, runtime
from savegame import validate_save


def legacy_special_save():
    save = json.loads((ROOT / 'evidence/all-legends-expedition-save.json').read_bytes())
    save['story']['node'] = 'nod-quiet-rim'
    save['weapons']['equipped']['traveler'] = 'SW08'
    return validate_save(save)


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

    restored = core.restore(lua.table_from(legacy_special_save(), recursive=True), 12)
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
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--browser-save', type=Path)
    args = parser.parse_args()
    test_nod_krai_special_region()
    if args.browser_save:
        args.browser_save.write_text(json.dumps(legacy_special_save(), ensure_ascii=False), encoding='utf8')
    print('Nod-Krai routes, removed atlas region, archived quests and legacy save verified')
