"""Capture the first visible group in each water or multi-body local legend encounter."""
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
    core.enterStoryNode(state, node['id'])
    swimming = boss['controller'] == 'waterLegend'
    assert bool(state.storySwimming) == swimming, node['id']
    if styles is None:
        styles = boss.get('members') or [boss] + ([boss['partner']] if boss.get('partner') else [])
    slot = state.fieldSlots[boss['id']]
    forward = lua.table_from({'right': True})
    for tick in range(1, 360):
        core.step(state, 1 / 60, forward)
        frame = core.frame(state, 'sprite', 'legacy')
        if frame.fieldBoss:
            break
    assert frame.fieldBoss and frame.fieldBoss.phase in ('available', 'notice'), (node['id'], tick)
    camera = frame.camera

    # The controller prepends only its own draws to the normal gameplay frame.
    def actor_layer(mode, profile):
        full = native(core.frame(state, mode, profile).draws)
        hp = slot.enemy.hp
        try:
            slot.enemy.hp = 0
            without = native(core.frame(state, mode, profile).draws)
        finally:
            slot.enemy.hp = hp
        assert without and full[-len(without):] == without, node['id']
        return full[:-len(without)]

    png = actor_layer('sprite', 'legacy')
    indices = [i for i, d in enumerate(png) if d['kind'] == 'boss_sprite']
    assert indices and indices[0] == 0 and len(indices) == len(styles), (node['id'], indices)
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
                    species='boss-' + gallery[file]['id'], name=name,
                    x=x, y=ground['y'], hover=ground['y'] - draw['y'], h=draw['h'],
                    anchorX=draw['anchorX'], flip=draw['flip'])
        marks = []
        for mark in png[i+1:stop]:
            assert mark['kind'] in ('rect', 'text')
            dx = mark['x'] - draw['x']
            marks.append(dict(mark, x=-dx-mark.get('w', 0) if draw['flip'] else dx, y=mark['y']-draw['y']))
        if marks:
            part['marks'] = marks
        parts.append(part)
    ref = {'png': png, 'camera': camera, 'tick': tick, 'phase': frame.fieldBoss.phase, 'swimming': swimming}
    for profile in ('legacy', 'h48c32', 'h32c16'):
        ref[profile] = actor_layer('rect', profile)
    (work / (node['id'] + '.json')).write_text(json.dumps(ref, separators=(',', ':')), 'utf8')
    return {'parts': parts}


def build():
    lua, core = runtime()
    work = ROOT / 'work/group-legend-openings'
    work.mkdir(parents=True, exist_ok=True)
    nodes = {n['id']: n for n in read('content/story-graph.json')['nodes']}
    gallery = {r['file']: r for r in read('content/boss-art-gallery.json')['items']}
    result = {}
    for boss in read('content/field-boss-spawns.json')['fieldBosses']:
        if boss['controller'] == 'waterLegend' or (boss['controller'] == 'branchLegend' and
                                                    (boss.get('members') or boss.get('partner'))):
            key = boss['node']
            result[key] = capture(lua, core, boss, nodes[key], gallery, work)
            print(key, len(result[key]['parts']), flush=True)
    (ROOT / 'content/group-legend-openings.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n', 'utf8')


if __name__ == '__main__':
    build()
