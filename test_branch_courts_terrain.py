"""Walk the dry hunting ledges and return to the original travel layer."""
from tools.domain_terrain_test import TrailWalk, check_field, core, exits, gates, lua, nodes, read, start, write, write_fixture

sea = 'bygone-camp'
valley = 'chenyu-camp'
routes = [
    (68600, 'bygone-wp-68600', sea, 142, 'bygoneCoralGallery', 2),
    (68603, 'bygone-wp-68603', sea, 151, 'bygoneSiltChamber', 2),
    (68607, 'bygone-wp-68607', sea, 148, 'bygoneSouthSeal', 2),
    (64825, 'liyue-wp-64825', valley, 75, 'chenyuGateTeaBanks', 36),
    (64824, 'liyue-wp-64824', valley, 84, 'chenyuSouthLimestone', 36),
]
for batch, hub, level in [('bygone-hunts', sea, 151), ('chenyu-gates', valley, 86)]:
    hosts = [host for _,host,camp,*_ in routes if camp==hub]
    if hub==sea:
        hosts += ['bygone-depth','bygone-wp-68611']
    write_fixture(batch+'-terrain', level, hub, hosts)
report = {}
for number, host, hub, level, art, population in routes:
    stage = f'branch-hunt-{number}'
    report[stage] = check_field(stage, host, hub, level, art, 690, population_count=population)

# Exercise the entire approach, including the wet or dry host before entering the hunt.
for previous, host, stage in [
    (sea, 'bygone-wp-68600', 'branch-hunt-68600'),
    ('bygone-depth', 'bygone-wp-68603', 'branch-hunt-68603'),
    ('bygone-wp-68611', 'bygone-wp-68607', 'branch-hunt-68607'),
]:
    state = start(nodes[stage]['level'], [previous], sea)
    core.enterStoryNode(state,previous)
    for actor in state.actors.values():
        actor.inv=1000
    walk=TrailWalk(lua,core,state,gates,exits)
    trip=[]
    for dest in (host,stage,host,previous):
        walk.cross(dest)
        assert bool(state.storySwimming)==bool(nodes[dest].get('swim'))
        trip.append({'node':dest,'swimming':bool(state.storySwimming),'arrivalY':walk.actor.y})
    report[stage]['roundTrip']=trip
write('evidence/branch-courts-terrain-lua.json',report)
print('Five trails, four elite rooms and all three return routes passed.')
