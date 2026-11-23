import json

from experience import CHAPTER_CLEAR_EXP, LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
nod, frontier = 'nod-town', 'winter-frontier-switchback'
entry, hub, road = 'snezhnaya-entry', 'snezhnaya-hub', 'snezhnaya-field'
cut, coach, station = 'white-pass-cut', 'white-pass-coach', 'white-pass-station'
woods, ridge, basin = 'white-pass-woods', 'white-pass-ridge', 'white-rainbow-basin'
ticket, trail, summit = 'white-pass-ticket', 'white-pass-trail', 'white-pass-summit'
boss = 'original-frost-antler'


def session(level, node, progress=0):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[level-1]['maple_reference_total_exp_to_reach']+progress, 'quest')
    core.enterStoryNode(s, node)
    return s


def place(s,x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def gate(s,x,destination):
    place(s,x)
    core.action(s,'story_nearby_portal')
    assert s.story.node==destination,(s.story.node,destination,s.storyNotice)


def inspect(s,x,quest,to_count,y=480):
    place(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[quest].count==to_count


def step(s,count,**keys):
    controls=lua.table_from(keys)
    for _ in range(count):
        core.step(s,1/60,controls)


def hit(s,enemy,attack=500):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,
        atk=attack,dir=1,radial=True,mult=1,range=75,limit=1,element='physical',
        gain=0,color='#ffd083',critRate=0)))


def report(s,id,design):
    before=s.progression.questXp
    core.action(s,'story_report:'+id)
    core.action(s,'story_report:'+id)
    assert s.story.quests[id].status=='complete'
    assert s.progression.questXp-before==QUEST_REPORT_EXP['Q-SNE-'+design]


def saved(s):
    return validate_save(native(core.checkpoint(s)))


def resume(s):
    return core.restore(lua.table_from(saved(s),recursive=True),12)


# No story completion requirement between regions. Earn the boundary with in-game
# kills, using a fixture that starts 2 level-136 kills short of Lv140.
earned = session(139,nod,LEVELS[138]['required_exp_to_next']-2*LEVELS[135]['normal_enemy_base_exp'])
gate(earned,1380,nod)
gate(earned,814,frontier)
assert len(earned.enemies)==28
for i in (1,2):
    hit(earned,earned.enemies[i])
assert earned.progression.level==140 and not list(earned.story.quests.keys())
gate(earned,60,nod)
gate(earned,1380,entry)
gate(earned,1380,hub)
gate(earned,1380,road)
gate(earned,865,cut)
gate(earned,1750,cut)

# Probe the end of the band with the snow shelf's own ordinary enemies.
almost = session(159,ridge,LEVELS[158]['required_exp_to_next']-LEVELS[154]['normal_enemy_base_exp'])
hit(almost,almost.enemies[1])
assert almost.progression.level==160

s=session(156,hub)
browser_fixture=saved(s)
gate(s,800,hub)
core.action(s,'story_accept:'+ticket)
gate(s,1380,road)
gate(s,865,cut)
route_cart=next(e for e in s.enemies.values() if e.spawnId=='white-pass-route-cart')
assert len(s.enemies)==28
hit(s,route_cart)
assert s.story.quests[ticket].count==0
inspect(s,282,ticket,1)
other=next(e for e in s.enemies.values() if e.spawnId!=route_cart.spawnId and e.hp>0)
hit(s,other)
assert s.story.quests[ticket].count==1
step(s,370)
hit(s,route_cart)
assert s.story.quests[ticket].count==2
inspect(s,685,ticket,2)
core.action(s,'jump')
step(s,60,jump=True)
assert s.actors[s.active].y==382
core.action(s,'story_collect')
assert s.story.quests[ticket].count==3
gate(s,60,road)
gate(s,60,hub)
report(s,ticket,'M01')
footprints='white-pass-footprints'
core.action(s,'story_accept:'+footprints)
gate(s,1380,road)
gate(s,865,cut)
inspect(s,440,footprints,1)
place(s,580)
core.action(s,'jump')
step(s,60,jump=True)
assert s.actors[s.active].y==382
core.action(s,'story_collect')
assert s.story.quests[footprints].count==2
gate(s,60,road)
gate(s,60,hub)
report(s,footprints,'S02')
gate(s,800,coach)
assert s.voyage.kind=='train'
step(s,180)
core.action(s,'pause')
before=s.t
step(s,180)
assert s.t==before and s.story.node==coach
core.action(s,'pause')
step(s,360)
assert s.story.node==station and s.voyage is None
assert resume(s).story.node==station

footwork='white-pass-footwork'
core.action(s,'story_accept:'+footwork)
inspect(s,450,footwork,0)
core.action(s,'jump')
step(s,60,jump=True)
assert s.actors[s.active].y==390
core.action(s,'story_collect')
assert s.story.quests[footwork].count==1
for _ in range(90):
    actor=s.actors[s.active]
    if actor.x>=660 and actor.ground and actor.y==480:
        break
    step(s,1,right=True)
assert abs(s.actors[s.active].x-670)<25
core.action(s,'story_collect')
assert s.story.quests[footwork].count==2
report(s,footwork,'S03')

core.action(s,'story_accept:'+summit)
assert s.story.quests[summit] is None
core.action(s,'story_accept:'+trail)
rest='white-pass-rest'
core.action(s,'story_accept:'+rest)
inspect(s,895,rest,1)
gate(s,1144,woods)
inspect(s,185,rest,2)
inspect(s,300,trail,1)
inspect(s,1115,trail,1)
inspect(s,1115,trail,2,y=382)
inspect(s,1660,trail,3)
gate(s,55,station)
report(s,rest,'S04')
report(s,trail,'M02')
coop_fixture=saved(s)
core.action(s,'story_accept:'+summit)
gate(s,1144,woods)
gate(s,1774,ridge)
gate(s,1774,basin)
inspect(s,1380,summit,0)
place(s,641)
slot=s.fieldSlots[boss]
step(s,110)
assert slot.enemy.recovering and slot.cast.move.id=='FR01'
core.storyBossDefeated(s,'original-snow-sweeper')
assert s.story.quests[summit].count==0
before=s.progression.questXp
normal=s.progression.killXp
hit(s,slot.enemy,1000)
assert slot.phase=='respawn' and s.story.quests[summit].count==1
first_clear=CHAPTER_CLEAR_EXP['Q-SNE-M03:BOSS_FIRST']
assert s.progression.questXp-before==first_clear
normal_reward=s.progression.killXp-normal
assert normal_reward>0
s=resume(s)
assert s.story.node==station and s.fieldSlots[boss].phase=='respawn' and s.story.quests[summit].count==1
gate(s,1144,woods)
gate(s,1774,ridge)
gate(s,1774,basin)
core.storyBossDefeated(s,boss)
assert s.progression.questXp-before==first_clear
inspect(s,1380,summit,2)
gate(s,60,ridge)
gate(s,55,woods)
gate(s,55,station)
report(s,summit,'M03')
assert resume(s).story.quests[summit].status=='complete'
assert resume(s).story.quests[footprints].status=='complete'
assert resume(s).story.quests[footwork].status=='complete'

# A level-eligible traveler can take the uphill path before ever accepting M01.
independent = session(155,hub)
gate(independent,1380,road)
gate(independent,865,cut)
gate(independent,1750,woods)
gate(independent,1774,ridge)
assert not list(independent.story.quests.keys())
gate(independent,55,woods)
gate(independent,55,station)

proof={'earnedLv140KillExp':earned.progression.killXp,'earnedLv160KillExp':almost.progression.killXp,
       'threeMainQuests':True,'sideFootprintsAndFootwork':True,'sideRestDuringM02':True,
       'walkingBypass':True,'pausedTrain':True,
       'rideSeconds':9,'restoredAtStation':True,'firstClearExp':first_clear,
       'chapterOrdinaryKillExp':normal_reward,'repeatRewardBlocked':True}
(ROOT/'evidence/white-pass-chapter.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/white-pass-fixture.json').write_text(json.dumps(browser_fixture),encoding='utf8')
(ROOT/'work/coop-original-frost-antler-fixture.json').write_text(json.dumps(coop_fixture),encoding='utf8')
print(proof)
