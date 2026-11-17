"""Play Mondstadt S03 and verify the persistent cave and consumable reward."""
import json

from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
quest = 'mond-bennett-cave'
upper,depth,old='mond-bennett-ledge','mond-bennett-depth','mond-old-ground'
s = core.new(12)
core.action(s, 'story_start')
core.action(s, 'story_accept:' + quest)
assert not s.story.quests[quest]
seed = native(core.checkpoint(s))
seed['story']['quests']['amber-join'] = {'status':'complete','count':4,'cycles':1}
seed['story']['quests']['mond-old-trail'] = {
    'status':'complete','count':2,'cycles':1,'inspected':{'wheel-ruts':True}}
validate_save(seed)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/mondstadt-s03-fixture.json').write_text(json.dumps(seed), encoding='utf8')
def restore(data):
    return core.restore(lua.table_from(validate_save(data),recursive=True),12)


def saved():
    return validate_save(native(core.checkpoint(s)))


s = restore(seed)
core.action(s, 'story_accept:' + quest)
progress = s.story.quests[quest]


def step(**inputs):
    core.step(s, 1/60, lua.table_from(inputs))


def walk(x, attack=False):
    for _ in range(840):
        actor = s.actors[s.active]
        if abs(actor.x-x)<8:
            return
        step(right=actor.x<x,left=actor.x>x,attack=attack)
    raise AssertionError(('cannot walk',s.story.node,x))


def jump(y):
    core.action(s,'jump')
    for _ in range(120):
        step(jump=True)
        actor=s.actors[s.active]
        if actor.ground and actor.y==y:
            return
    raise AssertionError(('cannot jump',s.story.node,y))


def gate(dest):
    portal=core.frame(s).storyNearbyPortal
    assert portal and portal.to==dest and portal.available, native(portal)
    core.action(s,'story_nearby_portal')
    assert s.story.node==dest



def interact(label):
    assert label in core.frame(s).storyNearbyCave.label
    core.action(s,'story_collect')


def reach_cave():
    walk(1330)
    gate('mond-road')
    walk(270)
    jump(350)
    gate('mond-hill')
    walk(895,attack=True)
    gate(upper)


reach_cave()
walk(270)
interact('ベネット')
assert progress.count==1
actor=s.actors[s.active]
walk(505)
jump(400)
actor.inv=0
health=actor.hp
for _ in range(180):
    step()
    if actor.hp<health:
        break
assert health-actor.hp==12
walk(594)
jump(315)
walk(1170)
interact('宝箱')
assert progress.count==2 and s.inventory.upgradeOre==0

# The active actor actually crosses the cracked platform on the return route.
for _ in range(180):
    if s.caveFall:
        break
    step(left=True)
assert s.story.node==upper and progress.count==3 and actor.y==315
assert not any(p.x==670 and p.y==315 for p in s.platforms.values())
hp_before=[a.hp for a in s.actors.values()]
mora_before,returns_before=s.mora,s.returns
core.giveArtifact(s,1,21,3)
items_before=native(s.inventory['items'])
core.action(s,'pause')
for _ in range(60):step(left=True,jump=True)
assert s.caveFall.elapsed==0 and actor.y==315
core.action(s,'pause')
during_fall=saved()
for _ in range(15):step(right=True,jump=True)
assert 315<actor.y<480 and s.story.node==upper
for _ in range(60):
    step()
    if s.story.node==depth:
        break
assert s.story.node==depth and s.actors[s.active].y==480
assert [a.hp for a in s.actors.values()]==hp_before
assert (s.mora,s.returns,native(s.inventory['items']))==(mora_before,returns_before,items_before)
walk(1185)
portal=core.frame(s).storyNearbyPortal
assert portal.to==old and not portal.available
walk(480)
interact('鉱石')
core.action(s,'story_collect')
assert progress.count==4 and s.inventory.upgradeOre==1
walk(1185,attack=True)
gate(old)
walk(1100,attack=True)
gate(depth)
assert core.frame(s).total==2 and s.inventory.upgradeOre==1

# Restoring from the short animation reopens the safe shaft from above.
ready=saved()
s=restore(during_fall)
progress=s.story.quests[quest]
assert s.story.node=='mond-town' and progress.count==3 and s.inventory.upgradeOre==0
reach_cave()
assert not any(p.x==670 and p.y==315 for p in s.platforms.values())
walk(785)
gate(depth)
walk(480,attack=True)
interact('鉱石')
assert progress.count==4 and s.inventory.upgradeOre==1

s=restore(ready)
xp,mora=s.progression.questXp,s.mora
core.action(s,'story_report:'+quest)
core.action(s,'story_report:'+quest)
assert (s.progression.questXp-xp,s.mora-mora)==(967,160)
assert s.story.quests[quest].status=='complete'
stored=saved()
s=restore(stored)
item=s.inventory['items'][1]
s.mora=0
core.action(s,'artifact_useore:'+str(item.id))
assert item.enhance==0 and s.inventory.upgradeOre==1
s.mora=20000
core.action(s,'artifact_useore:'+str(item.id))
assert (item.enhance,s.mora,s.inventory.upgradeOre)==(4,13200,0)
core.action(s,'artifact_useore:'+str(item.id))
assert item.enhance==4 and s.inventory.upgradeOre==0
assert restore(saved()).inventory.upgradeOre==0
legacy=stored
legacy['inventory'].pop('upgradeOre')
assert restore(legacy).inventory.upgradeOre==0

(ROOT/'evidence/mondstadt-s03-lua.json').write_text(json.dumps({
    'rockfall_damage':12,'collapse_hp_bag_and_mora_preserved':True,'paused_collapse_resumes':True,
    'mid_collapse_save_resumes_through_shaft':True,'two_way_shortcut_and_repeatable_hunting':True,
    'ore_once':1,'ore_upgrade_discount_mora':400,'one_time_report':{'xp':967,'mora':160},
    'legacy_save_without_ore_loads':True
},indent=2)+'\n',encoding='utf8')
print('Mondstadt S03 Lua rockfall, safe collapse, ore, shortcut and saves passed')
