"""Compare the actual frame drawing commands on authored quest-scene fixtures."""
import json

from runtime import ROOT, native, runtime
from test_coop_local import expand_rectangles


def json_size(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode())


def measure(core, state, profile):
    reference = {'draws': native(core.frame(state, 'rect', profile).draws)}
    state.packRectArt = True
    try:
        frame = core.frame(state, 'rect', profile)
        assert frame.rectIndex is None
        packet = {'draws': native(frame.draws), 'rectBatches': native(frame.rectBatches)}
    finally:
        state.packRectArt = None
    assert list(expand_rectangles(packet)) == reference['draws']
    stamps = sum(d['kind'] == 'rect_runs' for d in packet['draws'])
    assert stamps >= len(packet['rectBatches']) > 0
    before, after = json_size(reference), json_size(packet)
    assert after < before
    return dict(before=before, after=after, stamps=stamps, batches=len(packet['rectBatches']))


def main():
    lua, core = runtime()
    room = dict(shelf='wall', seat='aisle', window='inward', station='seat',
                visited={key: True for key in ('entrance', 'shelves', 'seat', 'window')})
    scenes = [
        ('sum-wanderer-hollow', 'sum-wanderer-observation', 5, 380, {}),
        ('sum-visitors-terrace', 'sum-fungus-visitors', 4, 410, {}),
        ('sum-collei-rainfork', 'sum-collei-guide', 3, 350, {}),
        ('sum-kaveh-reading-room', 'sum-kaveh-model', 2, 310, {'roomLayout': room}),
        ('sum-nahida-dew-glade', 'sum-nahida-map', 1, 0, {}),
        ('fon-emilie-atelier', 'fon-emilie-scent', 5, 270, {}),
    ]
    results = {}
    for node, quest, count, camera, extra in scenes:
        state = core.new(12)
        core.action(state, 'story_start')
        status = 'complete' if extra.get('roomLayout') else 'active'
        record = dict(status=status, count=count, cycles=int(status=='complete'), **extra)
        state.story.quests[quest] = lua.table_from(record, recursive=True)
        core.enterStoryNode(state, node)
        state.camera = camera
        results[node] = {p: measure(core, state, p) for p in ('legacy', 'h48c32', 'h32c16')}
    assert any(row['h32c16']['stamps'] > row['h32c16']['batches'] for row in results.values())
    (ROOT/'evidence/regional-quest-prop-packing.json').write_text(json.dumps(results, indent=2)+'\n', 'utf8')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
