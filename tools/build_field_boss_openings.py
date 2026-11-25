"""Capture field bosses once their encounter is visible, using the actual Lua pose."""
import json
from functools import partial

from build_group_legend_openings import ROOT, capture, read, runtime


def sprite_files():
    by_image = {}
    for path in sorted((ROOT / 'assets').glob('*sprites*.json')):
        data = read(path)
        if not isinstance(data, dict) or not {'profiles', 'source', 'box'} <= data.keys():
            continue
        key = data['source'], tuple(data['box'])
        by_image.setdefault(key, []).append(path.name)
    return by_image


def styles_for(boss, draws, by_image, gallery):
    styles = []
    for i, draw in enumerate(draws):
        key = draw['source'], tuple(draw['box'])
        files = by_image[key]
        if len(files) > 1:
            files = [name for name in files if gallery.get(name, {}).get('id') == boss['controller']]
        assert len(files) == 1, (boss['id'], files)
        file = files[0]
        identifier = boss['id']
        name = boss['name']
        if boss['controller'] == 'icewind':
            dancer = 'コッペリア' if file.startswith('coppelia-') else 'コペリウス'
            name = ('主役・' if i == 0 else '相方・') + dancer
            if i:
                identifier = 'boss-' + str(-boss['entity'])
        elif boss['controller'] == 'oceanid':
            name = '純水精霊・本体' if i == 0 else '水の幻形・イノシシ'
            if i == 0:
                identifier += '-host'
        elif boss['controller'] == 'bathysmal':
            name = 'アビサルヴィシャップ・噛氷' if i == 0 else 'アビサルヴィシャップ・呑雷'
            if i:
                identifier += '-partner'
        elif len(draws) > 1:
            assert boss['controller'] in ('anemoHypostasis', 'electroHypostasis', 'geoHypostasis')
            if '-shell-' in file:
                name = '外殻 ' + str(i + 1)
                identifier += '-shell-' + str(i + 1)
            else:
                assert '-core-' in file
                name = '元素の核'
        styles.append(dict(file=file, name=name, placementId=identifier))
    return styles


def build():
    lua, core = runtime()
    work = ROOT / 'work/field-boss-openings'
    work.mkdir(parents=True, exist_ok=True)
    nodes = {n['id']: n for n in read('content/story-graph.json')['nodes']}
    gallery = {r['file']: r for r in read('content/boss-art-gallery.json')['items']}
    by_image = sprite_files()
    result = {}
    for boss in read('content/field-boss-spawns.json')['fieldBosses']:
        if boss['id'].startswith('legend-'):
            continue
        styles = partial(styles_for, boss, by_image=by_image, gallery=gallery)
        key = boss['node']
        result[key] = capture(lua, core, boss, nodes[key], gallery, work, styles)
    (ROOT / 'content/field-boss-openings.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n', 'utf8')


if __name__ == '__main__':
    build()
