"""Walk all five Nod-Krai domain approaches and check the elite commission in each side room."""
from tools.domain_terrain_test import check_field, core, nodes, read, start, write, write_fixture

hub = 'nod-town'
routes = [
    (88121, 'nod-wp-88133', 'nodHiisiBridge', 2230),
    (88122, 'nod-wp-88140', 'nodLempoTerrace', 2230),
    (88123, 'nod-wp-88129', 'nodPahaShore', 610),
    (92859, 'nod-wp-92885', 'nodNorthPass', 2230),
    (92860, 'nod-wp-92892', 'nodFaultGate', 610),
]
hosts = [host for _, host, *_ in routes]
write_fixture('nod-islands-terrain', 140, hub, hosts)
report = {}
for num, host, scenery, x in routes:
    stage = f'sites-hunt-{num}'
    report[stage] = check_field(stage, host, hub, 140, scenery, x, population_count=3 if num==92860 else 36)
fields = {n['id']:n['scenery'] for n in nodes.values() if n['region']=='ナド・クライ' and n['id'].startswith('sites-hunt-')}
assert fields == {r['node']:r['key'] for r in read('assets/nod-islands-background-generation.json')['scenes']}
assert nodes['sites-hunt-92860']['atlasLayer']=='below'
quest = 'daily-nod-rumored-elites'
s = start(140, hosts, hub)
core.dailyBind(s,'5d70e1dff2b84fba889fe78f58101f44',20806,None)
core.action(s,'daily_accept:'+quest)
offer = next(q for q in core.frame(s).daily.activeSlots.values() if q.id==quest)
rooms = [k for k in fields if '-pocket-' in k]
shown = list(offer.targetNodes.values())
assert set(shown) == {'nod-tide-scrapyard','nod-forest-outer',*rooms}
for k in rooms:
    # A fresh accepted ledger keeps the three-kill objective open for each independent probe.
    sample = start(140, [], hub)
    core.dailyBind(sample,'5d70e1dff2b84fba889fe78f58101f44',20806,None)
    core.action(sample,'daily_accept:'+quest)
    core.action(sample,'daily_accept:daily-nod-night-patrol')
    patrol=next(q for q in sample.daily.ledger.activeSlots.values() if q.id=='daily-nod-night-patrol')
    row=next(q for q in sample.daily.ledger.activeSlots.values() if q.id==quest)
    core.enterStoryNode(sample,'sites-hunt-92860')
    assert core.defeatEnemy(sample,sample.enemies[1],1) and row.count==0 and patrol.count==1
    core.enterStoryNode(sample,k)
    enemy=sample.enemies[1]
    assert enemy.dailyElite and core.defeatEnemy(sample,enemy,1) and row.count==1
report['rumoredElites']={'targetNodes':shown,'verifiedRooms':rooms,'heavyPatrolExcluded':True}
write('evidence/nod-islands-terrain-lua.json',report)
print('Five terrain round trips, nine scenery bindings, four elite rooms and the three-enemy underground approach passed.')
