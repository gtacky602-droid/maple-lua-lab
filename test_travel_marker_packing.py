"""Check travel artwork in its map frame, including the return trolley."""
import json

from runtime import ROOT, native, runtime
from test_regional_quest_prop_packing import measure


def main():
    lua, core = runtime()
    graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
    cases = []
    for node in graph['nodes']:
        if node.get('paperLantern'):
            cases.append((node['id'], node['paperLantern']['x'], core.paperLanternArt, None))
        if node.get('voyage', {}).get('kind') == 'trolley':
            cases.append((node['id'], 0, core.trolleyArt, None))
        for edge in node['exits']:
            if edge.get('nightTotem'):
                cases.append((node['id'], edge['x'], core.nightTrialTotemArt.idle, edge.get('requires')))
    results = {}
    for node, x, art, requirement in cases:
        state = core.new(12)
        core.action(state, 'story_start')
        if requirement:
            state.story.quests[requirement['quest']] = lua.table_from(dict(status='complete', count=requirement['count']))
        core.enterStoryNode(state, node)
        state.camera = max(0, x-480)
        results[node] = {}
        for profile in ('legacy', 'h48c32', 'h32c16'):
            results[node][profile] = measure(core, state, profile)
            state.packRectArt = True
            frame = core.frame(state, 'rect', profile)
            expected = native(art.profiles[profile].runs)
            assert any(d.kind == 'rect_runs' and native(frame.rectBatches[d.batch]) == expected
                       for d in frame.draws.values()), (node, profile)
            state.packRectArt = None
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
