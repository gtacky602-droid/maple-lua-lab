import json
import math
from runtime import ROOT, native, runtime
from savegame import validate_save
from experience import LEVELS, RUNTIME_EXP

lua,c=runtime()
s=c.new(12)
c.action(s,'story_start')
c.grantExp(s,LEVELS[51]['maple_reference_total_exp_to_reach'],'quest')
hub,quest='inazuma-port','hydro-hypostasis-commission'
c.enterStoryNode(s,hub)
c.action(s,'story_accept:'+quest)
assert s.story.quests[quest].status=='active'
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/hydro-hypostasis-field-fixture.json').write_text(json.dumps(validate_save(native(c.checkpoint(s)))),encoding='utf8')
a=s.actors[1]
a.x=1050
c.action(s,'story_nearby_portal')
assert s.story.node=='watatsumi-landing'
a.x=1340
c.action(s,'story_nearby_portal')
assert s.story.node=='hydro-hypostasis-field-cove'
slot=s.fieldSlots['boss-20040401']
b=slot.enemy
same=lua.eval('rawequal')
s.actors[2].hp=0
empty=lua.table()

def spot(x):
    a.x,a.y,a.inv,a.vy,a.ground=x,480,0,0,True

def wait(move,t):
    for _ in range(1600):
        if slot.cast and slot.cast.move.id==move and slot.cast.tick==t:
            return slot.cast
        c.step(s,1/60,empty)
    raise AssertionError((move,t))

def hit(y=480,element='physical'):
    c.resolveCast(s,lua.table_from({'id':1,'atk':20,'x':b.x-50,'y':y,'dir':1,'range':125,'limit':2,
                                    'mult':1,'element':element,'color':'#fff0ac','gain':1}))

spot(b.x-100)
hp=b.hp
hit(element='hydro')
assert b.hp==hp
hit(element='cryo')
assert b.hp==hp-19 and math.isclose(480-b.hitBottom,.4*88)
aura=b.aura
assert aura and aura.element=='cryo'
dolphin=wait('FHH01',54)
target=dolphin.dest
spot(b.x+101)
wait('FHH01',96)
assert math.isclose(b.y,368) and dolphin.dest==target and b.hitBottom<405
assert len(s.enemies)==1 and same(b,s.enemies[1]) and same(aura,b.aura)
hp=b.hp
hit()
assert b.hp==hp
hit(b.y)
assert b.hp==hp-19
spot(target)
hp=a.hp
wait('FHH01',113)
assert a.hp==hp
wait('FHH01',114)
assert b.x==target and b.y==480 and a.hp==hp-23 and dolphin.seen[1][1]
spot(target)
wait('FHH01',144)
assert a.hp==hp-23
spot(b.x-91)
ray=wait('FHH02',48)
hp=a.hp
wait('FHH02',96)
assert a.hp==hp-17 and ray.seen[1][1] and ray.dir==-1
# Stand directly in the later wave with invulnerability cleared. The same group cannot hit twice.
spot(ray.origin-153)
wait('FHH02',123)
assert a.hp==hp-17
spot(ray.origin-336)
wait('FHH02',156)
assert a.hp==hp-17
spot(b.x-99)
rain=wait('FHH03',48)
points=[rain.points[i] for i in range(1,4)]
spot(b.x+125)
wait('FHH03',104)
assert [rain.points[i] for i in range(1,4)]==points
assert min(abs(x-y) for x,y in zip(points,points[1:]))>.8*88
hp=a.hp
for i,t in enumerate((108,150,192),1):
    spot(points[i-1])
    wait('FHH03',t)
    assert a.hp==hp-12*i and rain.seen[i][1]
wait('FHH03',210)
assert len(s.enemies)==1 and same(b,s.enemies[1])
f,g=c.frame(s,'rect','legacy'),c.frame(s,'rect','h32c16')
assert f.t==g.t and g.commands<f.commands

# A player who skipped the direct contact can still be hit by the wave.
spot(b.x-93)
a.hp=a.maxhp
ray=wait('FHH02',48)
spot(ray.origin-ray.dir*120)
wait('FHH02',107)
assert not ray.seen[1][1]
spot(ray.origin+ray.dir*172)
hp=a.hp
wait('FHH02',131)
assert a.hp==hp-17 and ray.seen[1][1]
assert any(e.kind=='hurt' and e.element=='hydro' for e in s.events.values())
b.hp=1
hit()
assert slot.phase=='respawn' and s.story.quests[quest].count==1
saved=validate_save(native(c.checkpoint(s)))
assert saved['fieldBosses']['boss-20040401']['waitTicks']==3600
r=c.restore(lua.table_from(saved,recursive=True),12)
assert r.story.node==hub
xp,mora=r.progression.questXp,r.mora
for _ in range(2): c.action(r,'story_report:'+quest)
assert (r.progression.questXp-xp,r.mora-mora)==(4000,300)
result={'attacks':['FHH01','FHH02','FHH03'],'dolphinTracksHeightAndRetainsTargetAura':True,'rayAndWaveSharePerActorGroup':True,
        'threeLockedRainMarkers':True,'physicalReachesWaterImmuneCore':True,'commands':{'standard':f.commands,'light':g.commands},
        'questReportOnce':True,'killXp':LEVELS[51]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']}
(ROOT/'evidence/hydro-hypostasis-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
