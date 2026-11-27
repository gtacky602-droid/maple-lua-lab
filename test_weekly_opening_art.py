"""Capture the first Lua draw for weekly fights with authored opening poses and the equivalent uncropped rectangle streams."""
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
    hub = {'apep':'sumeru-hub', 'heretic':'sumeru-hub', 'primal_fire':'natlan-hub',
           'knave':'fontaine-hub', 'narwhal':'fontaine-hub', 'shouki':'sumeru-hub', 'signora':'inazuma-town',
           'raiden':'inazuma-town','childe':'liyue-harbor','azhdaha':'liyue-harbor','false_moon':'nod-town'}.get(key, 'mond-town')
    routes = {'shouki':[hub], 'signora':[hub], 'raiden':[hub], 'dvalin':['mond-wp-24','sites-hunt-7111']}
    if key == 'andrius':
        routes[key] = [next(n for n in ('mond-wp-19','mond-road') if any(e['to']==boss['node'] for e in nodes[n]['exits']))]
    approach = routes.get(key,[hub])
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[boss['level']-1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, approach[0])
    core.enterStoryNode(state, hub)
    core.action(state, 'story_accept:' + key.replace('_','-') + '-weekly-commission')
    (work/(key+'-save.json')).write_text(json.dumps(validate_save(native(core.checkpoint(state)))), 'utf8')
    core.enterStoryNode(state, boss['node'])
    frame = core.frame(state, 'sprite', 'legacy')
    art = {'apep':core.apepWeeklyArt.dark,'heretic':core.hereticWeeklyArt.idle,'primal_fire':core.primalWeeklyArt.idle,
           'knave':core.knaveWeeklyArt.single,'narwhal':core.narwhalWeeklyArt.whale,'shouki':core.shoukiWeeklyArt.upper, 'andrius':core.andriusWeeklyArt['normal-ready'],
           'dvalin':core.dvalinWeeklyArt.hover, 'signora':core.signoraWeeklyArt.cryo, 'raiden':core.raidenWeeklyArt.normal,
           'childe':core.childeWeeklyArt.human,'azhdaha':core.azhdahaWeeklyArt.idle,'false_moon':core.falseMoonWeeklyArt.idle}[key]
    draw, = [d for d in frame.draws.values() if d.source == art.source]
    data = native(draw)
    packed = json.loads((ROOT/'assets'/boss['openingPose']['file']).read_text('utf8'))
    assert data['source'] == packed['source'] and data['box'] == packed['box']
    assert (draw.x, draw.y, draw.flip) == (boss['center'], boss['floorY']-boss['openingPose']['hover'], boss['openingPose'].get('flip',False))
    assert abs(draw.h-boss['artHeight'])<1e-9
    assert draw.bodyBand==boss['openingPose'].get('bodyBand')
    # Held rectangles immediately follow the body sprite in the actual Lua draw list.
    draws = native(frame.draws)
    after_body = draws.index(data)+1
    held_count = len(boss['openingPose'].get('heldArt',{}).get('rects',[]))
    held = draws[after_body:after_body+held_count]
    assert all(r['kind']=='rect' for r in held)
    behind = []
    if key=='primal_fire':
        data_wings=json.loads((ROOT/'content/weekly-opening-visuals.json').read_bytes())[key]
        behind = [dict(d,x=d['x']+draw.x,y=d['y']+draw.y) for d in data_wings]
        assert len(behind)==100
        actual = draws[after_body-1-len(behind):after_body-1]
        assert [{k:d[k] for k in ('kind','x','y','w','h','color')} for d in actual]==behind
    streams = {}
    counts = {}
    for profile in ('legacy', 'h48c32', 'h32c16'):
        full = lua.table_from({'draws': lua.table()})
        if draw.bodyBand:
            core.drawTallerHumanArt(full,art,draw.x,draw.y,draw.h,'rect',profile,draw.flip,draw.opacity,0)
        else:
            core.drawFieldDisplayArt(full, art, draw.x, draw.y, draw.h, 'rect', profile, draw.flip, None, None, draw.opacity)
        raw = native(full.draws)
        expected = ([d for d in raw if d['x']<961 and d['x']+d['w']>-1 and d['y']<541 and d['y']+d['h']>-1]
                    if boss['openingPose'].get('clipToViewport') else raw)
        assert len(raw) == len(packed['profiles'][profile]['runs'])
        actual = native(core.frame(state, 'rect', profile).draws)
        assert expected[0] in actual, (key,profile,expected[0],actual[:1])
        first = actual.index(expected[0])
        assert actual[first:first+len(expected)] == expected, (key,profile)
        if behind:
            assert [{k:d[k] for k in ('kind','x','y','w','h','color')} for d in actual[first-len(behind):first]]==behind
        if key == 'shouki':
            # This controller prepends its body. No discarded run may reappear among the combat cues.
            assert first == 0
            keys = ('x','y','w','h','color')
            raw_keys = {tuple(d[k] for k in keys) for d in raw}
            assert not any(tuple(d.get(k) for k in keys) in raw_keys for d in actual[len(expected):] if d['kind']=='rect')
        assert actual[first+len(expected):first+len(expected)+held_count] == held
        streams[profile] = [[r[k] for k in ('x','y','w','h','color')] for r in raw]
        counts[profile] = {'sourceRuns':len(raw), 'drawnRuns':len(expected)}
    (work/(key+'-runs.json')).write_text(json.dumps(streams,separators=(',',':')), 'utf8')
    proof[key] = {'node':boss['node'],'hub':hub,'approach':approach,'png':data,
                  'behindRects':[[r[k] for k in ('x','y','w','h','color')] for r in behind],
                  'heldRects':[[r[k] for k in ('x','y','w','h','color')] for r in held], 'profiles':counts}
assert set(proof) == {'apep','heretic','primal_fire','knave','narwhal','shouki','andrius','dvalin',
                      'raiden','signora','childe','azhdaha','false_moon'}
(ROOT/'evidence/weekly-opening-poses-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
print({k:p['profiles'] for k,p in proof.items()})
