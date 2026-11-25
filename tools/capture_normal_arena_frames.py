"""Export the scene selection fields that the local Lua game sends on entering each normal boss room."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from runtime import native, runtime


def capture():
    _, core = runtime()
    roster = json.loads((ROOT / 'content/field-boss-spawns.json').read_bytes())['fieldBosses']
    rooms = {}
    for boss in roster:
        if boss['id'].startswith('legend-'):
            continue
        node = boss['node']
        state = core.new(12)
        core.action(state, 'story_start')
        core.enterStoryNode(state, node)
        frame = core.frame(state, 'sprite', 'legacy')
        assert frame.story.active and frame.story.node == node
        assert node not in rooms
        rooms[node] = {
            'campaign': {'zone': frame.campaign.zone},
            'story': {'node': frame.story.node, 'active': frame.story.active},
            'storyScenery': frame.storyScenery,
            'storyCleared': frame.storyCleared,
            'storyLocalLight': native(frame.storyLocalLight) if frame.storyLocalLight is not None else None,
        }
    output = ROOT / 'work/normal-arena-frames.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(rooms, ensure_ascii=False, indent=2)+'\n', 'utf8')
    print(f'{len(rooms)} normal boss room frames')


if __name__ == '__main__':
    capture()
