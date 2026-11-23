import json
from copy import deepcopy

from experience import CHAPTER_CLEAR_EXP, LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from tools.ruin_guardian_test import exercise_ruin_guardian
from savegame import validate_save


lua,core=runtime()
hub,watch,wing,runway,arena=('fontaine-hub','fontaine-stage-watch','fontaine-scenery-booth',
    'fontaine-grand-stage-approach','fontaine-grand-stage')
first,second,quest='fontaine-moon-parcel','fontaine-understage-crew','fontaine-grand-finale'
boss='original-grand-finale'
step=lua.eval('function(C,s,n,right,left,jump) for _=1,n do C.step(s,1/60,{right=right,left=left,jump=jump}) end end')


def frame(s):
    return core.frame(s,'sprite','legacy')


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(saved):
    return core.restore(lua.table_from(saved,recursive=True),12)


def move(s,x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def gate(s,x,dest,y=480):
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.to==dest and portal.available,(s.story.node,dest,native(portal))
    core.action(s,'story_nearby_portal')
    assert s.story.node==dest


def collect(s,x,n,y=480,action='story_collect'):
    move(s,x,y)
    core.action(s,action)
    assert s.story.quests[quest].count==n,(s.story.node,n,s.storyNotice)


def strike(s,enemy,atk=1600):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,
        atk=atk,dir=1,radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffe0ab',critRate=0)))


def advance(s,n):
    step(core,s,n,False,False,False)


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[79]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
core.action(s,'story_accept:'+quest)
assert s.story.quests[quest] is None
core.enterStoryNode(s,arena)
assert not len(s.enemies) and frame(s).fieldBoss is None
core.enterStoryNode(s,hub)
specs={q['id']:q for q in json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))['quests']}
for id in (first,second):
    route=specs[id]
    s.story.quests[id]=lua.table_from(dict(status='complete',count=route['goal'],cycles=1))
    for item in route['itinerary']:
        s.story.visited[item['node']]=True
fixture=checkpoint(s)
core.action(s,'story_accept:'+quest)
gate(s,1171,watch)
move(s,425)
assert any(d.kind=='text' and d.text=='エミリエ' for d in frame(s).draws.values())
collect(s,424,1)
prepared=checkpoint(s)

for choice,presses in [('cover',1),('deck',2)]:
    s=restore(prepared)
    assert s.story.node==watch
    gate(s,1157,wing)
    collect(s,700,1,action='story_airflow_commit')
    for _ in range(presses):collect(s,700,1)
    collect(s,700,2,action='story_airflow_commit')
    saved=checkpoint(s)
    assert saved['story']['quests'][quest]['stagePlan']==choice
    for invalid in ('both',None):
        record=saved['story']['quests'][quest]
        if invalid is None:
            record.pop('stagePlan',None)
        else:
            record['stagePlan']=invalid
        try:
            validate_save(saved)
        except ValueError as e:
            assert '舞台設備' in str(e)
        else:
            raise AssertionError('invalid stage plan accepted')
    record['stagePlan']=choice
    s=restore(saved)
    gate(s,1157,wing)
    gate(s,1310,runway)
    assert frame(s).storyStageLayout==choice
    assert bool(s.theaterWaveWall)==(choice=='cover')
    assert any(p.arrangementDeck for p in s.platforms.values())==(choice=='deck')
    if choice=='cover':
        move(s,669)
        step(core,s,60,True,False,False)
        assert s.actors[1].x<=692
        advance(s,330)
        assert s.actors[1].hp==s.actors[1].maxhp
        core.action(s,'jump')
        step(core,s,55,True,False,True)
        assert s.actors[1].x>798 and s.actors[1].y<=391
    else:
        move(s,571)
        core.action(s,'jump')
        step(core,s,58,True,False,True)
        assert s.actors[1].y==391 and s.actors[1].x>720
        core.action(s,'drop')
        advance(s,45)
        assert s.actors[1].ground and s.actors[1].y==480
        core.action(s,'drop')
        advance(s,45)
        assert s.actors[1].ground and s.actors[1].y==480
    for enemy in list(s.enemies.values()):
        if enemy.hp>0:strike(s,enemy)
    assert s.story.quests[quest].count==3
    gate(s,1719,arena)
    assert len(s.enemies)==1 and s.enemies[1].fieldBoss==boss

enemy=s.enemies[1]
move(s,912)
assert frame(s).fieldBoss.label=='外装の駆動部'
assert any(d.source=='grand-finale-source-v1.png' and d.h==167 for d in frame(s).draws.values())
strike(s,enemy,55)
advance(s,31)
hp=enemy.hp
assert 0<hp<300
saved_battle=checkpoint(s)
elapsed=saved_battle['fieldBosses'][boss]['elapsedTicks']
assert elapsed>=31
legacy_battle=deepcopy(saved_battle)
legacy_battle['fieldBosses'][boss].pop('elapsedTicks')
assert restore(validate_save(legacy_battle)).fieldSlots[boss].enemy.hp==hp
invalid_battle=deepcopy(saved_battle)
invalid_battle['fieldBosses'][boss]['elapsedTicks']=-1
try:
    validate_save(invalid_battle)
except ValueError as error:
    assert '経過時間' in str(error)
else:
    raise AssertionError('A negative field battle clock was accepted')
s=restore(saved_battle)
gate(s,1157,wing)
gate(s,1310,runway)
gate(s,1719,arena)
assert s.enemies[1].hp==hp
battle=exercise_ruin_guardian(lua,core,s,boss)
before=(s.progression.questXp,s.progression.killXp)
strike(s,s.enemies[1])
clear=CHAPTER_CLEAR_EXP['Q-FON-M03:BOSS_FIRST']
assert s.story.quests[quest].count==4 and frame(s).fieldBoss is None
assert (s.progression.questXp,s.progression.killXp)==(before[0]+clear,before[1])
assert frame(s).storyFirstClear.xp==clear
assert any(d.kind=='text' and d.text=='制御部が見えた' for d in frame(s).draws.values())
core.storyBossDefeated(s,boss)
assert s.progression.questXp==before[0]+clear
collect(s,1176,5)
assert frame(s).storyTheaterPerformance.phase=='ready'
assert s.theaterStoppedAt==s.t
assert not any(d.color=='#d995a3' for d in frame(s).draws.values())
advance(s,28)
assert sum(d.color=='#d995a3' for d in frame(s).draws.values())==7
s=restore(checkpoint(s))
gate(s,1157,wing)
gate(s,1310,runway)
gate(s,1719,arena)
assert not len(s.enemies) and frame(s).storyTheaterPerformance.phase=='ready'
collect(s,1447,5,390)
assert frame(s).storyTheaterPerformance.phase=='wait'
collect(s,1447,5,390)
assert 'まだ合図の前' in s.storyNotice
advance(s,230)
assert frame(s).storyTheaterPerformance.phase=='missed'
collect(s,1447,5,390)
advance(s,95)
assert frame(s).storyTheaterPerformance.phase=='cue'
collect(s,1447,6,390)
assert frame(s).storyTheaterPerformance.phase=='performed'
assert s.theaterPerformedAt==s.t
gate(s,1602,hub,390)
before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
for _ in range(2):core.action(s,'story_report:'+quest)
after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
reward=(QUEST_REPORT_EXP['Q-FON-M03'],6100,5)
assert tuple(a-b for a,b in zip(after,before))==reward
s=restore(checkpoint(s))
gate(s,1320,arena)
assert s.endgame.bosses[boss].clears==1
assert s.endgame.bosses[boss].bestTicks>=elapsed
collect(s,1447,6,390)
assert s.storyNotice.startswith('主舞台の記録') and not len(s.enemies)
assert frame(s).storyTheaterPerformance.phase=='performed'
advance(s,3700)
assert not len(s.enemies) and frame(s).fieldBoss is None

proof=dict(requiresPrevious=True,staffEvacuation=True,twoPlayableLayouts=True,stagePlanValidation=True,
           coverCanBeJumpedOver=True,
           waveCollisionAndDeck=True,dropFromShelfAndGroundSafe=True,bossOnlyDuringChapterStep=True,
           bossHpAfterReload=True,elapsedTicksAfterReload=True,battle=battle,bossClearSaved=True,firstClearOnce=True,
           shutdownAfterReload=True,delayedConfetti=True,earlyAndLateCuesRetry=True,showAndReadbackAfterReload=True,
           noBossRespawnAfterShow=True,reportOnce=True,firstClearExp=clear,reward=reward)
(ROOT/'evidence/fontaine-finale-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/fontaine-finale-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
(ROOT/'work/coop-original-grand-finale-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
