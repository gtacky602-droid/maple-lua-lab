"""Check that the atlas counts saved visits, reports, and victories in the active world."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save


def test_atlas_progress_from_earned_saves():
    lua, core = runtime()

    def restore(filename):
        save = validate_save(json.loads((ROOT / 'evidence' / filename).read_bytes()))
        state = core.restore(lua.table_from(save, recursive=True), 12)
        core.action(state, 'world_map_toggle')
        return state

    def atlas(state, region):
        core.action(state, 'world_map_region:' + region)
        return native(core.frame(state, 'sprite', 'legacy').worldMap)

    early = restore('cap-revisit-save.json')
    mondstadt = atlas(early, 'region-01')
    assert mondstadt['progress'] == dict(visited=15, total=67, reported=9, quests=27, cleared=0, bosses=7)
    core.action(early, 'world_map_layer:boss')
    assert native(core.frame(early, 'sprite', 'legacy').worldMap.progress) == mondstadt['progress']
    core.recordChallengeBoss(early, 'boss-20040201', 0)
    refreshed = native(core.frame(early, 'sprite', 'legacy').worldMap)
    assert refreshed['revision'] > mondstadt['revision']
    assert refreshed['progress'] == mondstadt['progress'] | {'cleared': 1}

    late = restore('remaining-survey-save.json')
    whole = atlas(late, 'world')
    assert whole['progress'] == dict(visited=1515, total=1516, reported=276, quests=276, cleared=142, bosses=142)
    assert len(whole['options']) == 23
    assert 'branch-08' not in {option['id'] for option in whole['options']}
    nod_krai = atlas(late, 'region-07')
    assert nod_krai['progress'] == dict(visited=150, total=150, reported=25, quests=25, cleared=15, bosses=15)
    alternate = restore('visited-lift-survey-save.json')
    graph = core.frame(late, 'sprite', 'legacy').storyGraph
    active_nodes = {node.id for node in graph.nodes.values()}
    missing = active_nodes - set(late.story.visited.keys())
    assert missing == {'liyue-cart-lift'}
    assert all(alternate.story.visited[node] for node in missing)


if __name__ == '__main__':
    test_atlas_progress_from_earned_saves()
    print('Atlas visit, quest-report and boss-clear totals verified against both earned saves')
