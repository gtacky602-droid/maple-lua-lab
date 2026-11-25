"""Traverse Snezhnaya's domain trails and the snow road to the Furiosa clearing."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, nodes, read, start, write, write_fixture

hub = 'snezhnaya-hub'
routes = [
    (100705, 'sne-wp-100658', 'sneCentralIcewall', 2230),
    (100706, 'white-pass-cut', 'sneWestCutting', 610),
    (100707, 'sne-wp-100695', 'sneCityUnderpass', 2230),
]
hosts = [host for _, host, *_ in routes]
write_fixture('sne-domains-terrain',160,hub,hosts)
report = {f'sites-hunt-{id}':check_field(f'sites-hunt-{id}',host,hub,159,key,x,
                                         population_count=3 if id==100707 else 48)
          for id,host,key,x in routes}
fields = {k:n['scenery'] for k,n in nodes.items() if n['region']=='スネージナヤ' and k.startswith('sites-hunt-')}
assert fields == {r['node']:r['key'] for r in read('assets/sne-domains-background-generation.json')['scenes']}
host=hosts[2]
s=start(159,[host],hub)
for actor in s.actors.values():
    actor.inv=1000
walk=TrailWalk(lua,core,s,gates,exits)
core.action(s,'story_fast:'+host)
under='sites-hunt-100707'
trail='sne-obsession-scar-upper-trail'
outlook='sne-furiosa-domain-outlook'
walk.cross(under)
core.action(s,'world_map_focus:'+outlook)
guide=core.frame(s).worldMap.guide
assert [stop.id for stop in guide.stops.values()]==[trail,outlook]
core.action(s,'world_map_close')
for dest in (trail,outlook,trail,under):
    walk.cross(dest)
assert walk.actor.y==391
report['furiosaRoute']={'from':under,'stops':[trail,outlook],'returnY':walk.actor.y,'level':159}
s=start(158,[host],hub)
core.action(s,'story_fast:'+host)
core.action(s,'world_map_focus:'+outlook)
early=[stop.id for stop in core.frame(s).worldMap.guide.stops.values()]
assert early==[trail,outlook]
core.action(s,'world_map_close')
walk=TrailWalk(lua,core,s,gates,exits)
walk.cross(trail)
walk.cross(outlook)
report['furiosaRoute']['level158FromWaypoint']=early
quest='daily-sne-elites'
s=start(160,hosts,hub)
core.dailyBind(s,'db1057bb6eb1480293b758f3b629bf66',20806,None)
core.action(s,'daily_accept:'+quest)
card=next(q for q in core.frame(s).daily.activeSlots.values() if q.id==quest)
opts=list(card.targetNodes.values())
rooms=['sites-hunt-100705-pocket-1','sites-hunt-100706-pocket-1']
assert set(opts)=={'white-pass-cut','sne-survey-outskirts',*rooms}
row=next(q for q in s.daily.ledger.activeSlots.values() if q.id==quest)
for count,room in enumerate(rooms,1):
    core.enterStoryNode(s,room)
    enemy=s.enemies[1]
    assert enemy.dailyElite and core.defeatEnemy(s,enemy,1) and row.count==count
report['eliteCommission']={'locations':opts,'credited':rooms}
write('evidence/sne-domains-terrain-lua.json',report)
print('Three hunting grounds, the Lv160 elite gates and the two-step Furiosa trail passed.')
