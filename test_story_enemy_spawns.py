import json
from runtime import runtime, ROOT

lua, c = runtime()
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf-8'))
spawns = json.loads((ROOT/'content/enemy-spawns.json').read_text())['nodes']
layouts = json.loads((ROOT/'content/enemy-art-layout.json').read_text(encoding='utf8'))
hostile = {n['id'] for n in graph['nodes'] if not n.get('hub') and not n.get('peaceful')}
assert set(spawns) == hostile
results = []
for n in graph['nodes']:
    s = c.new(12)
    c.action(s, 'story_start')
    c.enterStoryNode(s, n['id'])
    expected = spawns.get(n['id'], [])
    assert len(s.enemies) == len(expected)
    assert len({e['id'] for e in expected}) == len(expected)
    for i, p in enumerate(expected, 1):
        support = n['platforms'][p['platform']]
        e = s.enemies[i]
        assert p['kind'] in (1, 2) and p['art'] in layouts and e.art == p['art']
        assert support['x']+24 <= p['x'] <= support['x']+support['w']-24
        assert (e.home,e.y,e.kind,e.spawnId) == (p['x'],support['y'],p['kind'],p['id'])
        # Existing lure movement must not pull an elevated enemy beyond its support.
        e.x = e.patrolMax-1
        s.decoys = lua.table_from([{'x': e.patrolMax+200, 'y': e.y, 'life':10, 'owner':1}], recursive=True)
        for _ in range(180): c.step(s,1/60,lua.table())
        assert e.patrolMin <= e.x <= e.patrolMax and e.y == support['y']
        e.hp=0;e.respawn=.001
        c.step(s,1/60,lua.table())
        assert e.hp == e.maxhp and e.x == e.home
    results.append({'node':n['id'],'enemy_count':len(expected)})

s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,'mond-road')
source=c.hilichurlArt.source
for profile in ['legacy','h48c32','h32c16']:
    png=c.frame(s,'sprite',profile)
    draws=[d for d in png.draws.values() if d.kind=='boss_sprite' and d.source==source]
    assert len(draws)==1 and draws[0].h==76
    # Hide other actors/enemies to count the new asset's rectangles precisely.
    for a in s.actors.values(): a.hp=0
    for i,e in s.enemies.items():
        if i!=1:e.hp=0
    rect=c.frame(s,'rect',profile)
    hp=s.enemies[1].hp;s.enemies[1].hp=0
    baseline=c.frame(s,'rect',profile)
    s.enemies[1].hp=hp
    assert sum(d.kind=='rect' for d in rect.draws.values())-sum(d.kind=='rect' for d in baseline.draws.values())==len(c.hilichurlArt.profiles[profile].runs)
s.enemies[1].hp=0
assert not any(d.source==source for d in c.frame(s,'sprite','legacy').draws.values())
(ROOT/'evidence/story-enemy-spawns.json').write_text(json.dumps({'nodes':results,'render_profiles':['legacy','h48c32','h32c16'],'lure_support_and_respawn':True,'scope':'isolated fixtures, not canonical species or full combat playtest'},indent=2)+'\n')
print('61 node spawn sets, support/lure/respawn and Hilichurl art profiles passed')

