"""Verify the selected export of each backdrop against its measured RGB raster."""
import argparse
import hashlib
import json
from pathlib import Path

from lupa.lua53 import LuaRuntime
from PIL import Image, ImageDraw


def location_coverage(sources, root):
    """Count stage-specific five-tier bindings separately from shared lab backdrops."""
    graph = json.loads((root / 'content/story-graph.json').read_text('utf8'))
    nodes = {n['id']: n for n in graph['nodes']}
    assigned = {}
    for path in sorted((root / 'assets').glob('*-background-generation.json')):
        for row in json.loads(path.read_text('utf8')).get('scenes', []):
            if row.get('source') not in sources or not row.get('node'):
                continue
            for node in [row['node'], *row.get('sharedNodes', [])]:
                assert node in nodes and node not in assigned, (path.name, node)
                assigned[node] = row['source']
    assert set(assigned.values()) == set(sources)
    coverage = {'allStages': {'total': len(nodes), 'verified': len(assigned)}}
    for category, prefix in [('domainHunts', 'sites-hunt-'), ('branchHunts', 'branch-hunt-')]:
        ids = [node for node in nodes if node.startswith(prefix)]
        pending = [node for node in ids if node not in assigned]
        by_region = {}
        for node in ids:
            count = by_region.setdefault(nodes[node]['region'], {'total': 0, 'verified': 0})
            count['total'] += 1
            count['verified'] += int(node in assigned)
        coverage[category] = {'total': len(ids), 'verified': len(ids)-len(pending),
                              'byRegion': by_region, 'pending': pending}
    for label, filename in [('fieldBosses', 'field-boss-spawns.json'), ('weeklyBosses', 'weekly-boss-spawns.json')]:
        roster = json.loads((root / 'content' / filename).read_text('utf8'))[label]
        arenas = sorted({boss[key] for boss in roster for key in ('node', 'innerNode') if boss.get(key)})
        assert all(stage in nodes for stage in arenas)
        pending = [stage for stage in arenas if stage not in assigned]
        coverage[label] = {'totalArenas': len(arenas), 'verified': len(arenas)-len(pending), 'pending': pending}
        if label == 'fieldBosses':
            for subgroup, is_legend in [('normalBosses', False), ('localLegends', True)]:
                rooms = {boss['node'] for boss in roster if boss['id'].startswith('legend-') == is_legend}
                missing = sorted(rooms - assigned.keys())
                coverage[subgroup] = {'totalArenas': len(rooms), 'verified': len(rooms)-len(missing), 'pending': missing}
    trials = json.loads((root/'content/stygian-matches.json').read_bytes())['matches']
    arenas = {spec['node'] for spec in trials.values()}
    assert arenas <= nodes.keys()
    pending = sorted(arenas - assigned.keys())
    coverage['stygianBosses'] = {'totalArenas': len(arenas), 'verified': len(arenas)-len(pending), 'pending': pending}
    return coverage


def check(codec, directory):
    lua=LuaRuntime(encoding=None)
    ctx=lua.table()
    lua.execute(codec.read_bytes())(ctx)
    groups={}
    for i, row in enumerate(json.loads((directory/'files.json').read_text('utf8')), start=1):
        raw=(directory/row['file']).read_bytes()
        assert len(raw)==row['bytes']
        scenes=lua.execute(raw)
        filename=row['source'].encode()
        assert list(scenes.keys())==[filename]
        scene=scenes[filename]
        n=row['rectangles']
        assert scene[b'count']==n-4096
        ctx[b'profiles'][i]=scene[b'base']
        key=row['file'].encode()
        ctx[b'scenerySplits'][key]=scene[b'details']
        profile=ctx[b'refinedScenery'](key,ctx[b'profile'](i))
        runs=profile[b'runs']
        assert len(runs)==n
        image=Image.new('RGB',(512,288))
        draw=ImageDraw.Draw(image)
        for index in range(1,n+1):
            rect=runs[index]
            x,y,w,h,color=(rect[j] for j in range(1,6))
            draw.rectangle((x,y,x+w-1,y+h-1),fill=color.decode())
        assert hashlib.sha256(image.tobytes()).hexdigest()==row['rgbSha256'],row['file']
        group=groups.setdefault(row['source'],{})
        assert n not in group, (row['source'],n)
        group[n]=len(raw)
    for costs in groups.values():
        assert list(costs)==[4096,4608,5120,5632,6144]
        assert all(a<b for a,b in zip(costs.values(),list(costs.values())[1:]))
    return {'codecSha256':hashlib.sha256(codec.read_bytes()).hexdigest(),'verifiedModules':sum(map(len,groups.values())),
            'dimensions':[512,288],'fileBytesByRectangles':groups,
            'locationCoverage':location_coverage(groups,Path(__file__).resolve().parents[1])}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('codec',type=Path,nargs='?',default=Path(__file__).resolve().parents[1]/'assets/MapleCodec.lua')
    parser.add_argument('--directory',type=Path,default=Path('work/scenery-download-check'))
    args=parser.parse_args()
    report=check(args.codec,args.directory)
    Path('evidence/scenery-download-tiers.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(f"{report['verifiedModules']} independent Lua exports matched the displayed tiers.")
