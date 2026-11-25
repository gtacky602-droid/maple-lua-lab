"""Capture field boss starting placements from their Lua controllers."""
import json

from build_group_legend_openings import ROOT, capture, read, runtime


def build():
    lua, core = runtime()
    work = ROOT / 'work/field-boss-openings'
    work.mkdir(parents=True, exist_ok=True)
    nodes = {n['id']: n for n in read('content/story-graph.json')['nodes']}
    gallery = {r['file']: r for r in read('content/boss-art-gallery.json')['items']}
    single = {'maguu', 'aeonblight', 'baptist', 'seahorse', 'tulpa', 'legatus', 'suanni',
              'qucusaur', 'yumka', 'papilla', 'overseer', 'moonfly', 'moongecko'}
    gallery_by_id = {row['id']: row for row in gallery.values()}
    dancers = {'anemo': ('coppelia', 'コッペリア'), 'cryo': ('coppelius', 'コペリウス')}
    result = {}
    for boss in read('content/field-boss-spawns.json')['fieldBosses']:
        if boss['controller'] in single:
            node = nodes[boss['node']]
            art = gallery_by_id[boss['controller']]
            styles = [dict(file=art['file'], name=boss['name'], placementId=boss['id'])]
            result[node['id']] = capture(lua, core, boss, node, gallery, work, styles)
            continue
        if boss['controller'] != 'icewind':
            continue
        lead = boss['lead']
        partner = 'cryo' if lead == 'anemo' else 'anemo'
        styles = [
            dict(art=dancers[lead][0], name='主役・' + dancers[lead][1], placementId=boss['id']),
            dict(art=dancers[partner][0], name='相方・' + dancers[partner][1],
                 placementId='boss-' + str(-boss['entity'])),
        ]
        node = nodes[boss['node']]
        result[node['id']] = capture(lua, core, boss, node, gallery, work, styles)
    (ROOT / 'content/field-boss-openings.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n', 'utf8')


if __name__ == '__main__':
    build()
