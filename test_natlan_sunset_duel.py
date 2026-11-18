import json

from experience import CHAPTER_CLEAR_EXP, LEVELS, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save


lua,core=runtime()
hub,meet,review,arena,rostrum=('natlan-hub','natlan-duel-entry','natlan-sunset-review',
    'natlan-sunset-arena','natlan-sunset-rostrum')
first,second,quest='natlan-ridge-flag','natlan-two-trials','natlan-sunset-duel'
boss='original-river-racer'
step=lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(checkpoint(s),recursive=True),12)


def move(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def frame(s):
    return core.frame(s,'sprite','legacy')


def gate(s,x,dest,y=480):
    move(s,x,y)
    portal=frame(s).storyNearbyPortal
    assert portal and portal.available and portal.to==dest,(s.story.node,dest,native(portal))
    core.action(s,'story_nearby_portal')
    assert s.story.node==dest


def collect(s,x,n,y=480):
    move(s,x,y)
    core.action(s,'story_collect')
    assert s.story.quests[quest].count==n,(s.story.node,n,s.storyNotice)


def strike(s,atk):
    enemy=s.enemies[1]
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=enemy.id,x=enemy.x,y=enemy.y,
        atk=atk,dir=1,radial=True,mult=1,range=60,limit=1,element='hydro',gain=0,color='#76dbe2',critRate=0)))


s=core.new(12);core.action(s,'story_start')
core.grantExp(s,LEVELS[99]['maple_reference_total_exp_to_reach'],'quest')
core.enterStoryNode(s,hub)
core.action(s,'story_accept:'+quest)
assert s.story.quests[quest] is None
routes={q['id']:q for q in json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))['quests']}
for id in (first,second):
    route=routes[id]
    record=dict(status='complete',count=route['goal'],cycles=1)
    for item in route['itinerary']:s.story.visited[item['node']]=True
    if route.get('paths'):
        record['pathProgress']={p['id']:dict(count=len(p['steps'])) for p in route['paths']}
        for path in route['paths']:
            for item in path['steps']:s.story.visited[item['node']]=True
    s.story.quests[id]=lua.table_from(record,recursive=True)
fixture=checkpoint(s)
core.action(s,'story_accept:'+quest)
gate(s,1314,meet)
collect(s,418,1)
gate(s,1240,review)
collect(s,801,2,390)
gate(s,1412,arena,390)
assert frame(s).storyDuel.phase=='warning'
move(s,650)
step(core,s,15)
assert any(d.source=='river-racer-source-v1.png' and d.h==103 for d in frame(s).draws.values())
hp=s.actors[1].hp
core.action(s,'pause');step(core,s,160);core.action(s,'pause')
assert s.actors[1].hp==hp and frame(s).storyDuel.phase=='warning'
strike(s,20)
guarded=124-s.enemies[1].hp
assert 0<guarded<20
s.actors[1].inv=0
step(core,s,100)
assert s.actors[1].hp<hp
move(s,650,390)
hp=s.actors[1].hp
step(core,s,96)
assert s.actors[1].hp==hp and frame(s).storyDuel.phase=='opening'
before=s.enemies[1].hp
strike(s,20)
assert before-s.enemies[1].hp>guarded

kept=(s.mora,s.progression.questXp,s.inventory.upgradeOre)
for actor in s.actors.values():actor.hp=0
step(core,s,1)
assert s.story.node==arena and frame(s).storyDuel.phase=='warning'
assert s.story.quests[quest].count==2 and s.enemies[1].hp==124
assert (s.mora,s.progression.questXp,s.inventory.upgradeOre)==kept
assert '仕切り直し' in s.storyNotice
strike(s,30)
hp=s.enemies[1].hp
s=restore(s)
assert s.story.node==meet
gate(s,1240,review);gate(s,1412,arena,390)
assert s.enemies[1].hp==hp

before=s.progression.questXp
strike(s,1600)
clear=CHAPTER_CLEAR_EXP['Q-NAT-M03:BOSS_FIRST']
assert s.story.quests[quest].count==3 and s.progression.questXp==before+clear
assert frame(s).storyDuel is None and frame(s).storyFirstClear.xp==clear
collect(s,1408,4)
gate(s,1560,rostrum)
collect(s,853,5,390)
gate(s,1421,hub)
before=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
for _ in range(2):core.action(s,'story_report:'+quest)
after=(s.progression.questXp,s.mora,s.inventory.upgradeOre)
reward=(QUEST_REPORT_EXP['Q-NAT-M03'],10800,6)
assert tuple(a-b for a,b in zip(after,before))==reward
s=restore(s)
gate(s,775,rostrum)
collect(s,853,5,390)
assert s.storyNotice.startswith('夕映えの記録')
gate(s,1421,hub)
gate(s,965,arena)
assert not len(s.enemies)
before=(s.progression.questXp,s.progression.killXp,s.mora,s.inventory.upgradeOre)
for _ in range(2):
    collect(s,322,5)
    assert frame(s).storyDuel.replay and s.enemies[1].hp==124
    strike(s,1600)
    assert frame(s).storyDuel is None and frame(s).fieldBoss is None
    assert (s.progression.questXp,s.progression.killXp,s.mora,s.inventory.upgradeOre)==before

proof=dict(prerequisite=True,realLaneDamage=True,upperShelfSafety=True,pauseFreezes=True,
           hydroWorksAndOpeningHelps=True,lossResetsSameArena=True,keepsRewards=True,activeHpAfterSave=True,
           firstWinOnce=True,arenaCalmAfterWin=True,recordAfterSave=True,replaysWithoutRewards=True,
           firstClearExp=clear,reward=reward)
(ROOT/'evidence/natlan-sunset-duel-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/natlan-sunset-duel-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
print(proof)
