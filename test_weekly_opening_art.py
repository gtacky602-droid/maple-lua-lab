"""Capture the first Lua draw for three weekly fights and the equivalent uncropped rectangle streams."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
specs = json.loads((ROOT/'content/weekly-boss-spawns.json').read_text('utf8'))['weeklyBosses']
nodes = {n['id']:n for n in json.loads((ROOT/'content/story-graph.json').read_text('utf8'))['nodes']}
work = ROOT/'work/weekly-opening'
work.mkdir(parents=True, exist_ok=True)
proof = {}
for boss in (v for v in specs if v.get('openingPose')):
    key = boss['controller']
    hub = 'sumeru-hub' if key == 'shouki' else 'mond-town'
    routes = {'shouki':[hub], 'dvalin':['mond-wp-24','sites-hunt-7111']}
    if key == 'andrius':
        routes[key] = [next(n for n in ('mond-wp-19','mond-road') if any(e['to']==boss['node'] for e in nodes[n]['exits']))]
    approach = routes[key]
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[boss['level']-1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, approach[0])
    core.enterStoryNode(state, hub)
    core.action(state, 'story_accept:' + key + '-weekly-commission')
    (work/(key+'-save.json')).write_text(json.dumps(validate_save(native(core.checkpoint(state)))), 'utf8')
    core.enterStoryNode(state, boss['node'])
    frame = core.frame(state, 'sprite', 'legacy')
    art = {'shouki':core.shoukiWeeklyArt.upper, 'andrius':core.andriusWeeklyArt['normal-ready'],
           'dvalin':core.dvalinWeeklyArt.hover}[key]
    draw, = [d for d in frame.draws.values() if d.source == art.source]
    data = native(draw)
    packed = json.loads((ROOT/'assets'/boss['openingPose']['file']).read_text('utf8'))
    assert data['source'] == packed['source'] and data['box'] == packed['box']
    assert (draw.x, draw.y, draw.h, draw.flip) == (boss['center'], boss['floorY']-boss['openingPose']['hover'], boss['artHeight'], False)
    streams = {}
    counts = {}
    for profile in ('legacy', 'h48c32', 'h32c16'):
        full = lua.table_from({'draws': lua.table()})
        core.drawFieldDisplayArt(full, art, draw.x, draw.y, draw.h, 'rect', profile, draw.flip)
        raw = native(full.draws)
        expected = [d for d in raw if d['x']<961 and d['x']+d['w']>-1 and d['y']<541 and d['y']+d['h']>-1]
        assert len(raw) == len(packed['profiles'][profile]['runs'])
        actual = native(core.frame(state, 'rect', profile).draws)
        first = actual.index(expected[0])
        assert actual[first:first+len(expected)] == expected
        if key == 'shouki':
            # This controller prepends its body. No discarded run may reappear among the combat cues.
            assert first == 0
            keys = ('x','y','w','h','color')
            raw_keys = {tuple(d[k] for k in keys) for d in raw}
            assert not any(tuple(d.get(k) for k in keys) in raw_keys for d in actual[len(expected):] if d['kind']=='rect')
        streams[profile] = [[r[k] for k in ('x','y','w','h','color')] for r in raw]
        counts[profile] = {'sourceRuns':len(raw), 'drawnRuns':len(expected)}
    (work/(key+'-runs.json')).write_text(json.dumps(streams,separators=(',',':')), 'utf8')
    proof[key] = {'node':boss['node'],'hub':hub,'approach':approach,'png':data,'profiles':counts}
assert set(proof) == {'shouki','andrius','dvalin'}
(ROOT/'evidence/weekly-opening-poses-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
print({k:p['profiles'] for k,p in proof.items()})
