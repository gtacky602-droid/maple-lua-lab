import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from experience import LEVELS, RUNTIME_EXP

lua, c = runtime()
s = c.new(12)
c.action(s, 'story_start')
c.grantExp(s, LEVELS[45]['maple_reference_total_exp_to_reach'], 'quest')
c.enterStoryNode(s, 'inazuma-port')
quest = 'array-commission'
c.action(s, 'story_accept:'+quest)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/array-field-fixture.json').write_text(json.dumps(validate_save(native(c.checkpoint(s)))),encoding='utf8')
c.enterStoryNode(s, 'array-approach')
a = s.actors[1]
a.x = 1270
c.action(s,'story_nearby_portal')
assert s.story.node == 'array-field-court'
slot = s.fieldSlots['boss-24021101']
b = slot.enemy
s.actors[2].hp = 0
a.x = b.x-100
empty = lua.table()

def wait(move,t):
    for _ in range(1400):
        if slot.cast and slot.cast.move.id==move and slot.cast.tick==t:
            return slot.cast
        c.step(s,1/60,empty)
    raise AssertionError((move,t))

def hit(y):
    cast = lua.table_from({'id':1,'atk':20,'x':b.x-50,'y':y,'dir':1,'range':125,'limit':2,'mult':1,'element':'physical','color':'#fff0ac','gain':1})
    c.resolveCast(s,cast)

slash = wait('FPA01',48)
assert slash.dir==-1
a.x=b.x+100
hp=a.hp
wait('FPA01',96)
assert a.hp==hp and slash.dir==-1
a.x=b.x-100
wait('FPA01',97)
assert a.hp==hp-18
roll = wait('FPA02',42)
assert any(d.source=='array-field-poses-source-v1.png' and d.h==90 for d in c.frame(s).draws.values())
start,dest = b.x,roll.dest
hp = a.hp
wait('FPA02',125)
assert b.x==dest and start!=dest and a.hp==hp-17
a.x=b.x-95
rocket = wait('FPA03',96)
assert len(s.enemies)==1 and lua.eval('rawequal')(b,s.enemies[1]) and b.hitBottom<405 and b.y<400
hp=b.hp
hit(480)
assert b.hp==hp
hit(b.y)
assert b.hp==hp-19
wait('FPA03',150)
assert b.x==rocket.dest and b.y==480
f,g=c.frame(s,'rect','legacy'),c.frame(s,'rect','h32c16')
assert f.t==g.t and g.commands<f.commands
b.hp=1
hit(480)
assert slot.phase=='respawn' and s.story.quests[quest].count==1
saved=validate_save(native(c.checkpoint(s)))
assert saved['fieldBosses']['boss-24021101']['waitTicks']==3600
r=c.restore(lua.table_from(saved,recursive=True),12)
xp,mora=r.progression.questXp,r.mora
for _ in range(2): c.action(r,'story_report:'+quest)
assert (r.progression.questXp-xp,r.mora-mora)==(4000,300)
result={'attacks':['FPA01','FPA02','FPA03'],'bladeLocked':True,'rollSweptAndSingleHit':True,'sharedReceiver':True,'airborneHurtbox':True,'commands':{'standard':f.commands,'light':g.commands},'questReportOnce':True,'killXp':LEVELS[45]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']}
(ROOT/'evidence/array-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
