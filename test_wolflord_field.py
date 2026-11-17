import json
import math
from runtime import ROOT, native, runtime
from savegame import validate_save
from experience import LEVELS, RUNTIME_EXP

lua,c=runtime()
s=c.new(12)
c.action(s,'story_start')
c.grantExp(s,LEVELS[53]['maple_reference_total_exp_to_reach'],'quest')
hub,quest='inazuma-port','wolflord-commission'
c.enterStoryNode(s,hub)
c.action(s,'story_accept:'+quest)
assert s.story.quests[quest].status=='active'
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/wolflord-field-fixture.json').write_text(json.dumps(validate_save(native(c.checkpoint(s)))),encoding='utf8')
a=s.actors[1]
a.x=1205
c.action(s,'story_nearby_portal')
assert s.story.node=='tsurumi-coast'
a.x=1340
c.action(s,'story_nearby_portal')
assert s.story.node=='wolflord-field-ruins'
slot=s.fieldSlots['boss-22060101']
b=slot.enemy
s.actors[2].hp=0
empty=lua.table()

def spot(x):
    a.x,a.y,a.inv,a.vy,a.ground=x,480,0,0,True

def wait(move,t):
    for _ in range(1800):
        if slot.cast and slot.cast.move.id==move and slot.cast.tick==t:
            return slot.cast
        c.step(s,1/60,empty)
    raise AssertionError((move,t))

def hit(y=480):
    c.resolveCast(s,lua.table_from({'id':1,'atk':20,'x':b.x-50,'y':y,'dir':1,'range':125,'limit':2,
                                    'mult':1,'element':'physical','color':'#fff0ac','gain':1}))

spot(b.x-100)
hp=b.hp
hit()
assert b.hp==hp-19 and math.isclose(480-b.hitBottom,.35*88)
ram=wait('FWL01',60)
target,origin=ram.dest,b.x
spot(b.x+101)
wait('FWL01',102)
assert math.isclose(b.y,410) and ram.dest==target and b.x==origin and b.hitBottom<405
hp=b.hp
hit()
assert b.hp==hp
hit(b.y)
assert b.hp==hp-19
spot(target)
hp=a.hp
wait('FWL01',155)
assert b.x==target and b.y==480 and a.hp==hp-22 and ram.seen[1]
wait('FWL01',168)
assert b.x==target and a.hp==hp-22
spot(b.x-100)
tail=wait('FWL02',48)
assert tail.dir==-1 and b.facing==-1
hp=a.hp
wait('FWL02',108)
assert a.hp==hp and not tail.seen[1]
spot(b.x+95)
wait('FWL02',109)
assert a.hp==hp-20 and tail.seen[1] and b.facing==-1
spot(b.x+95)
wait('FWL02',126)
assert a.hp==hp-20
spot(b.x-96)
jaw=wait('FWL03',48)
assert jaw.dir==-1
hp=a.hp
for i,fire in enumerate((84,120),1):
    a.inv=0
    wait('FWL03',fire+15)
    assert jaw.shots[i] and a.hp==hp-14*i
wait('FWL03',168)
assert not any(jaw.projectiles.values()) and len(s.enemies)==1
wait('FWL03',180)
f,g=c.frame(s,'rect','legacy'),c.frame(s,'rect','h32c16')
assert f.t==g.t and g.commands<f.commands
b.hp=1
hit()
assert slot.phase=='respawn' and s.story.quests[quest].count==1
saved=validate_save(native(c.checkpoint(s)))
assert saved['fieldBosses']['boss-22060101']['waitTicks']==3600
r=c.restore(lua.table_from(saved,recursive=True),12)
assert r.story.node==hub
xp,mora=r.progression.questXp,r.mora
for _ in range(2): c.action(r,'story_report:'+quest)
assert (r.progression.questXp-xp,r.mora-mora)==(4000,300)
result={'attacks':['FWL01','FWL02','FWL03'],'ramLockedAndAirborneHurtbox':True,'tailHitsRearOnly':True,
        'twoFixedLineSkulls':True,'physicalReachesHeadAtRest':True,'commands':{'standard':f.commands,'light':g.commands},
        'questReportOnce':True,'killXp':LEVELS[53]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']}
(ROOT/'evidence/wolflord-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
