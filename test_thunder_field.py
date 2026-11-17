import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from experience import LEVELS, RUNTIME_EXP

lua, c = runtime()
s = c.new(12)
c.action(s, 'story_start')
c.grantExp(s, LEVELS[47]['maple_reference_total_exp_to_reach'], 'quest')
c.enterStoryNode(s, 'inazuma-port')
quest = 'thunder-commission'
c.action(s, 'story_accept:'+quest)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/thunder-field-fixture.json').write_text(json.dumps(validate_save(native(c.checkpoint(s)))),encoding='utf8')
c.enterStoryNode(s, 'thunder-approach')
a = s.actors[1]
a.x = 1270
c.action(s,'story_nearby_portal')
assert s.story.node == 'thunder-field-crest'
slot = s.fieldSlots['boss-20070101']
b = slot.enemy
s.actors[2].hp = 0
empty = lua.table()

def spot(dx):
    a.x, a.y, a.inv = b.x+dx, 480, 0

def wait(move,t):
    for _ in range(1400):
        if slot.cast and slot.cast.move.id==move and slot.cast.tick==t:
            return slot.cast
        c.step(s,1/60,empty)
    raise AssertionError((move,t))

def hit(y, element='physical'):
    cast = lua.table_from({'id':1,'atk':20,'x':b.x-50,'y':y,'dir':1,'range':125,'limit':2,'mult':1,'element':element,'color':'#fff0ac','gain':1})
    c.resolveCast(s,cast)

spot(-100)
hp=b.hp
hit(480,'electro')
assert b.hp==hp
hit(480)
assert b.hp==hp-17
wing=wait('FTM01',48)
hp=a.hp
spot(159)
wait('FTM01',96)
assert a.hp==hp and not wing.seen[1]
spot(-100)
wait('FTM01',97)
assert a.hp==hp-17 and wing.seen[1]
spot(-100)
feathers=wait('FTM02',42)
assert feathers.dir==-1
for i,fired in enumerate((84,108,132),1):
    a.inv=0
    wait('FTM02',fired+14)
    assert feathers.shots[i] and a.hp==hp-17-11*i
wait('FTM02',180)
assert len(feathers.projectiles)==0
events=[e for e in s.events.values() if e.kind=='hurt' and e.element=='electro']
assert len(events)==3
spot(-100)
dash=wait('FTM03',54)
dest,origin=dash.dest,b.x
spot(120)
wait('FTM03',90)
assert dash.dest==dest and b.x==origin and b.hitBottom<405
hp=b.hp
hit(480)
assert b.hp==hp
hit(b.y)
assert b.hp==hp-17
spot(dest-b.x)
hp=a.hp
wait('FTM03',131)
assert b.x==dest and a.hp==hp-22 and dash.seen[1]
wait('FTM03',156)
assert b.x==dest and b.y==480 and b.hitBottom>405
wait('FTM03',299)
assert b.x==dest and b.y==480
f,g=c.frame(s,'rect','legacy'),c.frame(s,'rect','h32c16')
assert f.t==g.t and g.commands<f.commands
b.hp=1
hit(480)
assert slot.phase=='respawn' and s.story.quests[quest].count==1
saved=validate_save(native(c.checkpoint(s)))
assert saved['fieldBosses']['boss-20070101']['waitTicks']==3600
r=c.restore(lua.table_from(saved,recursive=True),12)
xp,mora=r.progression.questXp,r.mora
for _ in range(2): c.action(r,'story_report:'+quest)
assert (r.progression.questXp-xp,r.mora-mora)==(4000,300)
result={'attacks':['FTM01','FTM02','FTM03'],'wingBounded':True,'threeFeathers':True,'immuneToElectro':True,'airborneHurtbox':True,'dashLockedNoTeleport':True,'commands':{'standard':f.commands,'light':g.commands},'questReportOnce':True,'killXp':LEVELS[47]['normal_enemy_base_exp']*RUNTIME_EXP['roles']['field_boss']}
(ROOT/'evidence/thunder-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
