"""Round-trip the visible Shouki upper body at the same floor, camera, and draw order."""
import gzip
import json
from runtime import ROOT, native, runtime
from test_coop_local import expand_rectangles


def sizes(packet):
    raw = json.dumps(packet, separators=(',', ':'), ensure_ascii=False, sort_keys=True).encode()
    return {'json': len(raw), 'gzip': len(gzip.compress(raw, compresslevel=1, mtime=0))}


lua, core = runtime()
state = core.new(12)
core.action(state, 'story_start')
core.enterStoryNode(state, 'shouki-godmaking-arena')
results = []
for camera in (0, 80, 173):
    state.camera = camera
    for profile in ('legacy', 'h48c32', 'h32c16'):
        state.packRectArt = None
        reference = native(core.frame(state, 'rect', profile).draws)
        state.packRectArt = True
        frame = core.frame(state, 'rect', profile)
        packet = dict(draws=native(frame.draws), rectBatches=native(frame.rectBatches))
        body = packet['draws'][0]
        assert body['kind'] == 'rect_runs' and body['batch'] == len(packet['rectBatches'])
        assert body['y'] + body['h'] == 480
        assert list(expand_rectangles(packet)) == reference
        runs = packet['rectBatches'][-1]
        old = dict(draws=reference[:len(runs)] + packet['draws'][1:], rectBatches=packet['rectBatches'][:-1])
        before, after = sizes(old), sizes(packet)
        assert after['gzip'] < before['gzip']
        results.append(dict(camera=camera, profile=profile, visible=len(runs), before=before, after=after))
(ROOT/'evidence/shouki-visible-batch-sizes.json').write_text(json.dumps(results, indent=2)+'\n', encoding='utf8')
print(results[:3])
