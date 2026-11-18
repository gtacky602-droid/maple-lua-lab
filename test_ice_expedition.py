import copy
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save


lua, core = runtime()
camp, works, passage, vault = 'novokichev-camp', 'novo-frozen-works', 'novo-drift-passage', 'novo-ice-vault'
first, second, third = 'novo-expedition-ready', 'novo-equipment-route', 'novo-return-report'
boss = 'original-ice-crawler'
group = ('novo-drift-west-guard','novo-drift-upper-guard','novo-drift-east-guard')
batch = lua.eval('function(C,s,n,keys) for _=1,n do C.step(s,1/60,keys) end end')


def step(s, n, **keys):
    batch(core,s,n,lua.table_from(keys))


def move(s, x, y=480):
    a = s.actors[s.active]
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def gate(s, x, destination, *, y=480, opened=True):
    move(s,x,y)
    portal = core.frame(s,'sprite','legacy').storyNearbyPortal
    assert portal.to == destination and portal.available is opened, (s.story.node,destination,portal.reason)
    core.action(s,'story_nearby_portal')
    if opened:
        assert s.story.node == destination


def collect(s, x, y, q, count):
    move(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[q].count == count


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def cast(s, enemy, strength=100):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=strength,dir=1,
        radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))


def kill(s, id):
    enemy=next(e for e in s.enemies.values() if e.spawnId==id)
    cast(s,enemy,600)
    assert enemy.hp==0


def report(s, q, expected):
    before = s.progression.questXp,s.mora,s.inventory.upgradeOre
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status == 'complete'
    actual=s.progression.questXp,s.mora,s.inventory.upgradeOre
    assert tuple(a-b for a,b in zip(actual,before))==expected


gear=core.new(12)
core.action(gear,'story_start')
gear.mora=4000000
for slot,rarity in [(1,3),(2,4),(3,5)]: core.giveArtifact(gear,slot,40,rarity)
core.action(gear,'artifact_equip:1')
core.action(gear,'artifact_equip:3')
items=gear.inventory['items']
wallet=gear.mora
core.action(gear,'artifact_imprint:1')
assert gear.mora==wallet and not items[1].imprintStars
for id,cap in [(1,3),(2,4),(3,5)]:
    for _ in range(cap): core.action(gear,f'artifact_upgrade:{id}')
hp=gear.actors[1].maxhp
wallet=gear.mora
core.action(gear,'artifact_imprint:1')
core.action(gear,'artifact_imprint:1')
assert gear.mora==wallet-200000 and items[1].imprintStars==1 and gear.actors[1].maxhp>hp
stat=core.artifactStats(items[3]);core.action(gear,'artifact_imprint:3')
assert core.artifactStats(items[3])>stat and core.partyImprint(gear)==2
core.action(gear,'swap');core.action(gear,'artifact_equip:2')
wallet=gear.mora
for _ in range(4): core.action(gear,'artifact_imprint:2')
assert items[2].imprintStars==3 and gear.mora==wallet-1200000 and core.partyImprint(gear)==5
assert abs(core.damageFactor(gear,lua.table_from({'id':1}),lua.table_from({'barrier':50}),'physical')-.19)<1e-8
core.action(gear,'barrier_trial:50')
assert core.barrierStrength(gear)==50
core.action(gear,'barrier_from_equipment')
assert core.barrierStrength(gear)==5
core.action(gear,'companion:columbina')
assert core.partyImprint(gear)==2 and core.frame(gear,'sprite','legacy').imprintTrial==2
gear=restore(gear)
core.action(gear,'companion:amber')
assert core.partyImprint(gear)==5 and gear.inventory['items'][2].companionId=='amber'
old=checkpoint(gear)
del old['inventory']['items'][1]['companionId']
validate_save(old)
migrated=core.restore(lua.table_from(old,recursive=True),12)
assert migrated.inventory['items'][2].companionId=='amber' and core.partyImprint(migrated)==5
for field,value in [('companionId','impossible'),('imprintStars',4),('imprintStars',True),('enhance',12)]:
    bad=copy.deepcopy(old);bad['inventory']['items'][1][field]=value
    try: validate_save(bad)
    except ValueError: pass
    else: raise AssertionError((field,value))

max_gear=core.new(12)
core.action(max_gear,'story_start');max_gear.mora=33000000
for role in (1,2):
    for slot in range(1,6):
        assert core.giveArtifact(max_gear,slot,200,5)
        id=(role-1)*5+slot
        for _ in range(5): core.action(max_gear,f'artifact_upgrade:{id}')
        for _ in range(5): core.action(max_gear,f'artifact_imprint:{id}')
        core.action(max_gear,f'artifact_equip:{id}')
    if role==1: core.action(max_gear,'swap')
assert max_gear.mora==0 and core.partyImprint(max_gear)==50
assert core.barrierStrength(restore(max_gear))==50
core.action(max_gear,'companion:columbina')
assert core.partyImprint(max_gear)==25

s=core.new(12)
core.action(s,'story_start')
core.grantExp(s,LEVELS[199]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,'snezhnaya-hub')
fixture=checkpoint(s)
gate(s,1380,'snezhnaya-field')
gate(s,720,camp)
gate(s,1050,works,opened=False)
core.action(s,'story_accept:'+first)
move(s,450)
core.action(s,'story_expedition_trial')
assert core.frame(s,'sprite','legacy').storyExpeditionDesk.practice==10
collect(s,450,480,first,1)
report(s,first,(19500000,9200,2))

core.action(s,'story_accept:'+second)
gate(s,1050,works)
assert s.actors[1].x==160
gate(s,1595,passage,y=385,opened=False)
collect(s,991,480,second,0)
collect(s,350,480,second,1)
assert any(p.y==388 for p in s.platforms.values())
kill(s,'novo-works-hoist-guard')
collect(s,991,480,second,3)
s=restore(s)
gate(s,1050,works)
assert s.story.quests[second].count==3 and len(s.enemies)==1 and len(s.platforms)==4
kill(s,'novo-works-wheel-guard')
collect(s,1535,385,second,5)
gate(s,1435,camp)
report(s,second,(26800000,10800,4))

core.action(s,'story_accept:'+third)
gate(s,1050,works)
gate(s,1595,passage,y=385)
gate(s,1475,vault,opened=False)
kill(s,group[2])
assert s.story.quests[third].sweep[group[2]]
bad=checkpoint(s)
bad['story']['quests'][third]['sweep']['other-room-guard']=True
try: validate_save(bad)
except ValueError: pass
else: raise AssertionError('foreign guard counts')
s=restore(s)
gate(s,1050,works)
gate(s,1595,passage,y=385)
assert len(s.enemies)==2
kill(s,group[0]);kill(s,group[1])
assert s.story.quests[third].count==1 and s.story.quests[third].sweep is None
gate(s,1475,vault)
slot=s.fieldSlots[boss];s.actors[2].hp=0
move(s,slot.enemy.x-55)
for _ in range(200):
    if slot.cast: break
    step(s,1)
actor=s.actors[1]
initial=slot.enemy.hp
cast(s,slot.enemy)
closed=initial-slot.enemy.hp
assert closed==9 and slot.cast.move.id=='IC01'
actor.x=slot.cast.left-22
step(s,slot.cast.move.windup+slot.cast.move.active)
assert actor.hp==140 and slot.enemy.exposed and slot.enemy.barrier==0
initial=slot.enemy.hp
cast(s,slot.enemy)
assert initial-slot.enemy.hp>=120
before=s.progression.questXp
cast(s,slot.enemy,2000)
assert slot.phase=='respawn' and s.progression.questXp==before and s.story.quests[third].count==2
s=restore(s)
assert s.story.node==camp and s.fieldSlots[boss].phase=='respawn'
gate(s,1050,works)
gate(s,1595,passage,y=385)
assert len(s.enemies)==0
gate(s,1475,vault)
collect(s,1510,388,third,3)
gate(s,1660,camp)
report(s,third,(17133467,882270,8))
assert restore(s).story.quests[third].status=='complete'

proof=dict(realEquipmentOpticalScore=True,imprintStatsAndCaps=True,companionEquipPersists=True,tenSlots=50,
           legacyOwnerMigrates=True,zeroImprintTrial=10,bridgesAndGuardsRestored=True,
           guardGroupAnyOrderAndSaved=True,closedHit=closed,openPlateBypassesBarrier=True,
           directReturnAndReport=True,firstReport=[17133467,882270,8],killDoesNotGrantFirstReport=True)
(ROOT/'evidence/ice-expedition-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/ice-expedition-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
