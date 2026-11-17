import json
import math
from runtime import ROOT, native, runtime
from savegame import validate_save
from experience import LEVELS, RUNTIME_EXP

lua,c=runtime()
s=c.new(12)
c.action(s,'story_start')
c.grantExp(s,LEVELS[49]['maple_reference_total_exp_to_reach'],'quest')
hub,quest='inazuma-town','pyro-hypostasis-commission'
c.enterStoryNode(s,hub)
c.action(s,'story_accept:'+quest)
assert s.story.quests[quest].status=='active'
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/pyro-hypostasis-field-fixture.json').write_text(json.dumps(validate_save(native(c.checkpoint(s)))),encoding='utf8')
a=s.actors[1]
a.x=1230
c.action(s,'story_nearby_portal')
assert s.story.node=='pyro-hypostasis-field-terrace'
slot=s.fieldSlots['boss-20040601']
b=slot.enemy
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

spot(b.x-103)
hp=b.hp
hit(element='pyro')
assert b.hp==hp
hit()
assert b.hp==hp-19 and math.isclose(480-b.hitBottom,.45*88)
boar=wait('FHP01',54)
dest,origin=boar.dest,b.x
spot(b.x+103)
wait('FHP01',107)
assert boar.dest==dest and boar.dir==-1 and b.x==origin and abs(dest-origin)<=1.8*88
spot(dest-10)
hp=a.hp
wait('FHP01',131)
assert b.x==dest and a.hp==hp-18 and boar.seen[1]
spot(dest-10)
wait('FHP01',150)
assert a.hp==hp-18
spot(b.x-96)
snake=wait('FHP02',48)
hp=a.hp
for i,fire in enumerate((96,132,168),1):
    a.inv=0
    wait('FHP02',fire+15)
    assert snake.shots[i] and a.hp==hp-12*i
assert snake.dir==-1
wait('FHP02',216)
assert not any(snake.projectiles.values())
spot(b.x-100)
fist=wait('FHP03',54)
target=fist.dest
spot(b.x+101)
wait('FHP03',96)
assert math.isclose(b.y,368) and fist.dest==target
hp=b.hp
hit()
assert b.hp==hp
hit(b.y)
assert b.hp==hp-19
spot(target)
hp=a.hp
wait('FHP03',113)
assert a.hp==hp
wait('FHP03',114)
assert b.x==target and b.y==480 and a.hp==hp-23 and fist.seen[1]
spot(target)
wait('FHP03',150)
assert a.hp==hp-23 and len(s.enemies)==1
f,g=c.frame(s,'rect','legacy'),c.frame(s,'rect','h32c16')
assert f.t==g.t and g.commands<f.commands
assert len([e for e in s.events.values() if e.kind=='hurt' and e.element=='pyro'])==5

# Defeating a fist during ascent cancels the later landing and gives one kill.
spot(b.x-100)
a.hp=a.maxhp
wait('FHP03',96)
b.hp=1
hit(b.y)
assert slot.phase=='respawn' and s.story.quests[quest].count==1
spot(b.x)
hp=a.hp
for _ in range(32): c.step(s,1/60,empty)
assert a.hp==hp
saved=validate_save(native(c.checkpoint(s)))
assert saved['fieldBosses']['boss-20040601']['waitTicks']==3568
r=c.restore(lua.table_from(saved,recursive=True),12)
assert r.story.node==hub
xp,mora=r.progression.questXp,r.mora
for _ in range(2): c.action(r,'story_report:'+quest)
assert (r.progression.questXp-xp,r.mora-mora)==(4000,300)
result={'attacks':['FHP01','FHP02','FHP03'],'boarLockedSingleHit':True,'threeFixedLineProjectiles':True,
        'fistTracksHeightAndCancelsOnKill':True,'physicalReachesFireImmuneCore':True,'commands':{'standard':f.commands,'light':g.commands},
        'questReportOnce':True,'killXp':LEVELS[49]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']}
(ROOT/'evidence/pyro-hypostasis-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
