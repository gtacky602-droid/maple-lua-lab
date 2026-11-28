import json
import math
from runtime import ROOT, native, runtime
from savegame import validate_save
from experience import LEVELS, RUNTIME_EXP

lua,c=runtime()
s=c.new(12)
c.action(s,'story_start')
c.grantExp(s,LEVELS[19]['maple_reference_total_exp_to_reach'],'quest')
hub,quest='dragonspine-camp','cryo-hypostasis-commission'
c.enterStoryNode(s,hub)
c.action(s,'story_accept:'+quest)
assert s.story.quests[quest].status=='active'
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/cryo-hypostasis-field-fixture.json').write_text(json.dumps(validate_save(native(c.checkpoint(s)))),encoding='utf8')
c.enterStoryNode(s,'dragonspine-depth')
a=s.actors[1]
a.x=1320
c.action(s,'story_nearby_portal')
assert s.story.node=='cryo-hypostasis-field-basin'
slot=s.fieldSlots['boss-20040501']
b=slot.enemy
s.actors[2].hp=0
empty=lua.table()

def spot(x):
    a.x,a.y,a.inv,a.vy,a.ground=x,480,0,0,True

def wait(move,t):
    for _ in range(1400):
        if slot.cast and slot.cast.move.id==move and slot.cast.tick==t:
            return slot.cast
        c.step(s,1/60,empty)
    raise AssertionError((move,t))

def hit(element='physical'):
    c.resolveCast(s,lua.table_from({'id':1,'atk':20,'x':b.x-50,'y':480,'dir':1,'range':125,'limit':2,
                                    'mult':1,'element':element,'color':'#fff0ac','gain':1}))

spot(b.x-92)
hp=b.hp
hit('cryo')
assert b.hp==hp
hit()
assert b.hp==hp-19 and math.isclose(480-b.hitBottom,.45*88)
wheel=wait('FHC01',54)
dest,origin=wheel.dest,b.x
assert c.frame(s).fieldBoss.label=='氷輪の直走・走路から離れるか跳び越す'
spot(b.x+93)
wait('FHC01',107)
assert wheel.dest==dest and wheel.dir==-1 and b.x==origin and abs(dest-origin)<=176
spot(dest)
hp=a.hp
wait('FHC01',143)
assert b.x==dest and a.hp==hp-18 and wheel.seen[1][1]
spot(dest)
wait('FHC01',150)
assert a.hp==hp-18
assert c.frame(s).fieldBoss.recoveryTicks==120
spot(b.x-85)
palms=wait('FHC02',90)
assert a.hp==hp-18 and not palms.seen[1][1]
spot(b.x-44)
wait('FHC02',91)
assert a.hp==hp-35 and palms.seen[1][1]
spot(b.x-92)
fall=wait('FHC03',48)
points=[fall.points[i] for i in range(1,4)]
assert all(abs(x-y)>=.8*88 for x,y in zip(points,points[1:]))
hp=a.hp
spot(b.x+100)
wait('FHC03',106)
assert [fall.points[i] for i in range(1,4)]==points
for i,tick in enumerate((108,144,180),1):
    spot(points[i-1])
    wait('FHC03',tick)
    assert a.hp==hp-12*i and fall.seen[i][1]
    assert c.frame(s).fieldBoss.label==f'三本の落氷 {i}/3・床の番号を避ける'
spot(points[2])
wait('FHC03',198)
assert a.hp==hp-36 and len(s.enemies)==1
f,g=c.frame(s,'rect','legacy'),c.frame(s,'rect','h32c16')
assert f.t==g.t and g.commands<f.commands
spot(b.x-100)
second_wheel=wait('FHC01',102)
hp=a.hp
c.action(s,'jump')
for _ in range(41):
    c.step(s,1/60,lua.table_from({'jump':True}))
assert second_wheel.tick==143 and a.hp==hp and not second_wheel.seen[1][1]
b.hp=1
hit()
assert slot.phase=='respawn' and s.story.quests[quest].count==1
saved=validate_save(native(c.checkpoint(s)))
assert saved['fieldBosses']['boss-20040501']['waitTicks']==3600
r=c.restore(lua.table_from(saved,recursive=True),12)
assert r.story.node==hub
xp,mora=r.progression.questXp,r.mora
for _ in range(2): c.action(r,'story_report:'+quest)
assert (r.progression.questXp-xp,r.mora-mora)==(1500,300)
result={'attacks':['FHC01','FHC02','FHC03'],'wheelLockedSingleHit':True,'wheelJumpable':True,'clapBoundedSingleHit':True,
        'threeDistinctFixedPoints':True,'physicalReachesIceImmuneCore':True,'commands':{'standard':f.commands,'light':g.commands},
        'questReportOnce':True,'killXp':LEVELS[19]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']}
(ROOT/'evidence/cryo-hypostasis-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
