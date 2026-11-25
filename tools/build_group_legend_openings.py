"""Extract a field controller’s first visible draw layer and build local legend previews."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from runtime import native, runtime


def read(name):
    return json.loads((ROOT / name).read_bytes())


def capture(lua, core, boss, node, gallery, work, styles=None):
    state = core.new(12)
    core.action(state, 'story_start')
    window = boss.get('storyWindow')
    if window:
        state.story.quests[window['quest']] = lua.table_from({'status': 'active', 'count': window['first']})
    core.enterStoryNode(state, node['id'])
    swimming = boss['controller'] == 'waterLegend'
    assert bool(state.storySwimming) == swimming, node['id']
    if styles is None:
        styles = boss.get('members') or [boss] + ([boss['partner']] if boss.get('partner') else [])
    forward = lua.table_from({'right': True})
    for tick in range(1, 360):
        core.step(state, 1 / 60, forward)
        frame = core.frame(state, 'sprite', 'legacy')
        if frame.fieldBoss:
            break
    assert frame.fieldBoss and frame.fieldBoss.phase in ('available', 'notice'), (node['id'], tick)
    camera = frame.camera

    def actor_layer(mode, profile):
        frame = core.frame(state, mode, profile)
        count = frame.fieldBoss.drawCount
        assert count and count > 0, node['id']
        return [native(frame.draws[i]) for i in range(1, count + 1)]

    png = actor_layer('sprite', 'legacy')
    indices = [i for i, d in enumerate(png) if d['kind'] == 'boss_sprite']
    if callable(styles):
        styles = styles([png[i] for i in indices])
    assert indices and len(indices) == len(styles), (node['id'], indices)
    parts = []
    for style, i, stop in zip(styles, indices, [*indices[1:], len(png)], strict=True):
        draw = png[i]
        file = style.get('file') or f"{style['art']}-field-idle-sprites-v{boss.get('artRevision', 1)}.json"
        asset = read('assets/' + file)
        assert (draw['source'], draw['box']) == (asset['source'], asset['box'])
        x = draw['x'] + camera
        ground = node['platforms'][0]
        assert ground['x'] <= x <= ground['x'] + ground['w']
        name = style.get('memberName') or style.get('name') or gallery[file]['name']
        if boss.get('partner') and not swimming:
            name = gallery[file]['name'].split('（')[0]
        part_id = style.get('placementId') or (boss['id'] if style is boss else 'boss-' + str(style['entity']))
        part = dict(id=part_id,
                    species='boss-' + gallery[file]['id'] if file in gallery else 'opening-' + file.split('-sprites')[0], name=name,
                    x=x, y=ground['y'], hover=ground['y'] - draw['y'], h=draw['h'],
                    anchorX=draw['anchorX'], flip=draw['flip'])
        if file not in gallery:
            part.update(file=file, box=draw['box'])
        layers = {'marks': png[i+1:stop]}
        if i == indices[0] and i:
            layers['behind'] = png[:i]
        for layer, commands in layers.items():
            marks = []
            for mark in commands:
                assert mark['kind'] in ('rect', 'text')
                dx = mark['x'] - draw['x']
                marks.append(dict(mark, x=-dx-mark.get('w', 0) if draw['flip'] else dx, y=mark['y']-draw['y']))
            if marks:
                part[layer] = marks
        parts.append(part)
    ref = {'png': png, 'camera': camera, 'tick': tick, 'phase': frame.fieldBoss.phase, 'swimming': swimming}
    for profile in ('legacy', 'h48c32', 'h32c16'):
        ref[profile] = actor_layer('rect', profile)
    (work / (node['id'] + '.json')).write_text(json.dumps(ref, separators=(',', ':')), 'utf8')
    scene = {'parts': parts}
    if window:
        scene['quest'] = {'id': window['quest'], 'count': window['first']}
    return scene


def build():
    lua, core = runtime()
    work = ROOT / 'work/group-legend-openings'
    work.mkdir(parents=True, exist_ok=True)
    nodes = {n['id']: n for n in read('content/story-graph.json')['nodes']}
    gallery = {r['file']: r for r in read('content/boss-art-gallery.json')['items']}
    result = {}
    for boss in read('content/field-boss-spawns.json')['fieldBosses']:
        if boss['id'].startswith('legend-'):
            key = boss['node']
            result[key] = capture(lua, core, boss, nodes[key], gallery, work)
            print(key, len(result[key]['parts']), flush=True)
    (ROOT / 'content/group-legend-openings.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n', 'utf8')


if __name__ == '__main__':
    build()
