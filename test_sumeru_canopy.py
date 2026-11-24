import json

from experience import LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from tools.ruin_guardian_test import exercise_ruin_guardian
from savegame import validate_save
from tools.original_boss_lifecycle import check_original_boss_retry


lua,core=runtime()
hub='sumeru-hub'
roots,bank,junction,root_path,branch,stop,approach,terrace,observatory=(
    'sumeru-river-roots','sumeru-river-bank','sumeru-canopy-junction','sumeru-root-slope',
    'sumeru-branch-run','sumeru-observation-stop','sumeru-observatory-approach',
    'sumeru-observatory-terrace','sumeru-sky-observatory')
first,second,third='sumeru-leaf-crossing','sumeru-forest-levels','sumeru-observatory-map'
rewards=[
    (QUEST_REPORT_EXP['Q-SUM-M01'],1600,2),
    (QUEST_REPORT_EXP['Q-SUM-M02'],2200,3),
    (QUEST_REPORT_EXP['Q-SUM-M03'],3800,4),
]
step=lua.eval('function(C,s,n,right,left) for _=1,n do C.step(s,1/60,{right=right,left=left}) end end')


def frame(s): return core.frame(s,'sprite','legacy')
def checkpoint(s): return validate_save(native(core.checkpoint(s)))
def restore(s): return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def move(s,x,y=480):
    actor=s.actors[s.active]
    actor.x,actor.y,actor.vy,actor.ground=x,y,0,True


def gate(s,x,dest,y=480,ride=False):
    move(s,x,y)
    f=frame(s)
    portal=f.storyNearbyPortal
    assert portal and portal.available and portal.to==dest,(s.story.node,dest,native(portal))
    source=s.story.node
    core.action(s,'story_nearby_portal')
    if ride:
        assert s.story.node==source and frame(s).storyLift.seconds==1.55
        step(core,s,96,False,False)
    assert s.story.node==dest


def collect(s,q,count,x,y=480,key='story_collect'):
    move(s,x,y)
    core.action(s,key)
    assert s.story.quests[q].count==count,(q,count,s.storyNotice)


def defeat(s):
    for enemy in list(s.enemies.values()):
        core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,atk=1200,dir=1,
            radial=True,mult=1,range=60,limit=1,element='physical',gain=0,color='#ffe0ab',critRate=0)))


def report(s,q,reward):
    before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    for _ in range(2): core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
    received=tuple(a-b for a,b in zip(after,before))
    assert received==reward,(q,reward,received)


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[59]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
fixture=checkpoint(s)
core.action(s,'story_accept:'+first)
gate(s,875,roots)
collect(s,first,1,315)
move(s,985)
hp,returns=s.actors[1].hp,s.returns
for _ in range(90):
    step(core,s,1,True,False)
    if '川から幹の手前' in (s.storyNotice or ''): break
assert s.actors[1].x==948 and s.actors[1].hp==hp and s.returns==returns
move(s,714,391)
assert frame(s).storySurveyMap.id=='river-canopy'
collect(s,first,2,714,391)
collect(s,first,3,924,391)
s=restore(s)
assert s.story.node==hub
gate(s,875,roots)
assert any(p.leafBridge and p.y==391 for p in s.platforms.values())
move(s,920,391)
before=s.returns
for _ in range(350):
    if s.actors[1].x>=1640: break
    step(core,s,1,True,False)
assert s.actors[1].y==391 and s.actors[1].x>=1640 and s.returns==before
gate(s,1645,bank,391)
defeat(s)
assert s.story.quests[first].count==4
collect(s,first,5,1350)
gate(s,1529,hub)
report(s,first,rewards[0])

core.action(s,'story_accept:'+second)
gate(s,1026,junction)
collect(s,second,1,330)
collect(s,second,1,726,388)
assert frame(s).storyAirflow.selection=='葉だけ開く'
collect(s,second,1,726,388,key='story_airflow_commit')
for _ in range(2): collect(s,second,1,726,388)
collect(s,second,2,726,388,key='story_airflow_commit')
s=restore(s)
gate(s,1026,junction)
assert any(p.leafBridge and p.y==388 and not p.preview for p in s.platforms.values())
gate(s,1422,branch,388)
gate(s,55,junction)
gate(s,1550,root_path)
collect(s,second,3,824,390)
gate(s,1450,stop,390)
gate(s,369,branch)
assert s.actors[1].y==391 and s.actors[1].x==1320
collect(s,second,4,653,302)
gate(s,1434,stop,391)
collect(s,second,5,823,390)
gate(s,239,junction,ride=True)
assert s.actors[1].x==1007
gate(s,1007,stop,ride=True)
assert s.actors[1].x==239
gate(s,55,hub)
report(s,second,rewards[1])
coop_fixture=checkpoint(s)

core.action(s,'story_accept:'+third)
gate(s,1162,stop)
gate(s,1339,approach)
defeat(s)
assert s.story.quests[third].count==1
gate(s,1720,terrace,391)
move(s,850)
assert any(d.source=='canopy-fungus-source-v1.png' and d.h==149 for d in frame(s).draws.values())
boss=next(e for e in s.enemies.values() if e.boss)
assert boss.hp==375
battle=exercise_ruin_guardian(lua,core,s,'original-canopy-fungus')
kill_xp,mora=s.progression.killXp,s.mora
defeat(s)
assert s.story.quests[third].count==2 and (s.progression.killXp,s.mora)==(kill_xp,mora)
collect(s,third,3,1525,390)
s.actors[1].hp=10
gate(s,1744,observatory,390)
assert s.actors[1].hp==s.actors[1].maxhp
collect(s,third,4,826,391)
gate(s,55,hub)
report(s,third,rewards[2])
s=restore(s)
assert s.endgame.bosses['original-canopy-fungus'].clears==1
gate(s,1282,observatory)
move(s,826,391)
assert frame(s).storySurveyMap.id=='sumeru-height-map'
collect(s,third,4,826,391)
assert s.storyNotice.startswith('観測所の地図')
gate(s,55,hub)
gate(s,1380,'sumeru-field')


def reenter_terrace(state):
    gate(state, 1282, observatory)
    gate(state, 228, terrace)


check_original_boss_retry(lua, core, restore(s), 'original-canopy-fungus', third, reenter_terrace)

proof=dict(leafAfterReload=True,walkedLeafBridge=True,riverFallRecovery=True,wrongAdjustmentRejected=True,
    bothRoutesConverge=True,liftRoundTrip=True,battle=battle,bossClearSaved=True,observatoryHeals=True,
    savedSurvey=True,oldGate=True,oneTimePayouts=True,
    rewards=rewards)
(ROOT/'evidence/sumeru-canopy-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/sumeru-canopy-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
(ROOT/'work/coop-original-canopy-fungus-fixture.json').write_text(json.dumps(coop_fixture),encoding='utf8')
print(proof)
