"""Record single-body land legends' first visible idle pose after approaching on foot."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from runtime import native, runtime


def capture():
    lua, core = runtime()
    output = ROOT / 'work/land-legend-openings'
    output.mkdir(parents=True, exist_ok=True)
    right = lua.table_from({'right': True})
    bosses = json.loads((ROOT / 'content/field-boss-spawns.json').read_bytes())['fieldBosses']
    for boss in bosses:
        if boss['controller'] != 'branchLegend' or boss.get('partner') or boss.get('members'):
            continue
        node = boss['node']
        state = core.new(12)
        core.action(state, 'story_start')
        core.enterStoryNode(state, node)
        art = core.branchLegendArt[boss['art']].idle
        for ticks in range(1, 240):
            core.step(state, 1 / 60, right)
            if abs(state.actors[state.active].x - boss['home']) <= 550:
                break
        frame = core.frame(state, 'sprite', 'legacy')
        assert frame.fieldBoss and frame.fieldBoss.phase == 'available', node
        actor = native(frame.draws[1])
        assert actor['kind'] == 'boss_sprite' and actor['source'] == art.source
        result = {'node': node, 'ticks': ticks, 'camera': frame.camera, 'png': [actor]}
        for profile in ('legacy', 'h48c32', 'h32c16'):
            draws = core.frame(state, 'rect', profile).draws
            count = len(art.profiles[profile].runs)
            result[profile] = [native(draws[i]) for i in range(1, count + 1)]
            assert all(d['kind'] == 'rect' for d in result[profile])
            assert draws[count + 1] is not None
        (output / (node + '.json')).write_text(json.dumps(result, separators=(',', ':')), 'utf8')
        print(node, ticks, actor['h'], frame.camera)


if __name__ == '__main__':
    capture()
