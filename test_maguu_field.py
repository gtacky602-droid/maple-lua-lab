import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from experience import LEVELS

lua, core = runtime()
s = core.new(12)
core.action(s, 'story_start')
core.grantExp(s, LEVELS[43]['maple_reference_total_exp_to_reach'], 'quest')
core.enterStoryNode(s, 'inazuma-port')
quest = 'maguu-commission'
core.action(s, 'story_accept:'+quest)
core.enterStoryNode(s, 'maguu-approach')
s.actors[1].x = 1270
core.action(s, 'story_nearby_portal')
assert s.story.node == 'maguu-field-dojo'
slot = s.fieldSlots['boss-25090101']
boss, actor = slot.enemy, s.actors[1]
s.actors[2].hp = 0
empty = lua.table()

def spot(dx):
    actor.x, actor.y, actor.inv = boss.x+dx, 480, 0

def at(move, tick):
    for _ in range(1200):
        if slot.cast and slot.cast.move.id == move and slot.cast.tick == tick:
            return slot.cast
        core.step(s, 1/60, empty)
    raise AssertionError((move,tick))

spot(-95)
at('FMK01',54)
spot(95)
hp = actor.hp
cast = at('FMK01',126)
assert cast.dir == -1 and actor.hp == hp
spot(-95)
at('FMK01',127)
assert actor.hp == hp-22
spot(-95)
at('FMK02',84)
assert actor.hp == hp-35
spot(-95)
at('FMK02',144)
assert actor.hp == hp-48
spot(-95)
at('FMK03',143)
assert actor.hp == hp-65
spot(-250)
at('FMK03',144)
assert actor.hp == hp-65
assert not any(d.source == 'maguu-mask-source-v1.png' for d in core.frame(s).draws.values())
f = core.frame(s,'rect','legacy')
g = core.frame(s,'rect','h32c16')
assert f.t==g.t and g.commands<f.commands
boss.hp = 1
hit = lua.table_from({'id':1,'atk':20,'x':boss.x-60,'y':480,'dir':1,'range':125,'limit':1,'mult':1,'element':'physical','color':'#fff0ac','gain':1})
core.resolveCast(s,hit)
assert slot.phase=='respawn' and s.story.quests[quest].count==1
saved=validate_save(native(core.checkpoint(s)))
assert saved['fieldBosses']['boss-25090101']['waitTicks']==3600
r=core.restore(lua.table_from(saved,recursive=True),12)
assert r.story.node=='inazuma-port'
xp,mora=r.progression.questXp,r.mora
for _ in range(2): core.action(r,'story_report:'+quest)
assert (r.progression.questXp-xp,r.mora-mora)==(4000,300)
result={'attacks':['FMK01','FMK02','FMK03'],'lockSide':True,'damages':[22,13,13,17],'maskExpiresTick':144,'commands':{'standard':f.commands,'light':g.commands},'questReportOnce':True,'savedRespawnTicks':3600}
(ROOT/'evidence/maguu-field-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
