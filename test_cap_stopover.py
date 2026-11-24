import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.original_boss_lifecycle import check_original_boss_retry

lua,core=runtime()
port,boat,dock='natlan-port','natlan-voyage','ochkanatlan-dock'
steps,court,kiln='ochka-tide-stairs','ochka-patched-court','ochka-sifting-kiln'
first,second,third='ochka-stopover-survey','ochka-wall-marks','ochka-sifter-clear'
boss='original-rubble-sifter'
batch=lua.eval("function(C,s,t,input) for _=1,t do C.step(s,1/60,input) end end")


def session(level,node,partial=0):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach']+partial,'quest')
    core.enterStoryNode(s,node)
    return s


def move_at(s,x,y=480):
    a=s.actors[s.active]
    a.x,a.y,a.vy,a.ground=x,y,0,True


def gate(s,x,node):
    move_at(s,x)
    core.action(s,'story_nearby_portal')
    assert s.story.node==node,(s.story.node,node,s.storyNotice)


def step(s,ticks,**keys):
    batch(core,s,ticks,lua.table_from(keys))


def inspect(s,x,q,n,*,upper=None):
    move_at(s,x)
    if upper is not None:
        core.action(s,'jump')
        step(s,60,jump=True)
        assert s.actors[s.active].y==upper
    core.action(s,'story_collect')
    assert s.story.quests[q].count==n,(q,s.story.quests[q].count,n)


def hit(s,e,amount=500):
    core.resolveCast(s,lua.table_from(dict(id=1,targetId=e.id,x=e.x,y=480,atk=amount,dir=1,
        radial=True,mult=1,range=80,limit=1,element='physical',gain=0,color='#ffd083',critRate=0)))


def saved(s):
    return validate_save(native(core.checkpoint(s)))


def resume(s):
    return core.restore(lua.table_from(saved(s),recursive=True),12)


def report(s,q,amount):
    before=(s.progression.questXp,s.mora)
    core.action(s,'story_report:'+q)
    core.action(s,'story_report:'+q)
    assert s.story.quests[q].status=='complete'
    assert (s.progression.questXp-before[0],s.mora-before[1])==amount


# Lv200 is earned via a real enemy. The cap field gate opens, additional EXP persists.
capped=session(199,'dawn-glass-divide',LEVELS[198]['required_exp_to_next']-round(
    LEVELS[194]['normal_enemy_base_exp']))
gate(capped,1790,'dawn-glass-divide')
hit(capped,capped.enemies[1])
assert capped.progression.level==200
gate(capped,1790,'dawn-crystal-field')
before=capped.progression.total
hit(capped,capped.enemies[1])
assert capped.progression.total-before==296366 and capped.progression.xp==0
assert resume(capped).progression.total==capped.progression.total

late=session(185,port)
gate(late,720,boat)
gate(late,720,boat)
step(late,3060)
gate(late,720,boat)
assert late.storyNotice=='寄港時間外'
step(late,2341)
assert late.story.node=='nod-port' and late.story.visited[dock] is None

s=session(185,port)
fixture=saved(s)
gate(s,720,boat)
step(s,1830)
gate(s,720,dock)
step(s,61*60)
assert s.story.node==dock
core.action(s,'story_accept:'+third)
assert s.story.quests[third] is None
core.action(s,'story_accept:'+first)
gate(s,525,steps)
inspect(s,623,first,0,upper=388)
inspect(s,282,first,1)
inspect(s,623,first,2,upper=388)
inspect(s,1450,first,3)
gate(s,58,dock)
report(s,first,(11200000,5100))

core.action(s,'story_accept:'+second)
gate(s,525,steps)
gate(s,1700,court)
inspect(s,501,second,1,upper=387)
enemy=next(e for e in s.enemies.values() if e.spawnId=='ochka-court-blocking-carrier')
hit(s,enemy)
assert s.story.quests[second].count==2
s=resume(s)
assert s.story.node==dock and s.story.quests[second].count==2
gate(s,525,steps)
gate(s,1700,court)
inspect(s,1290,second,3,upper=393)
gate(s,55,steps)
gate(s,58,dock)
report(s,second,(15500000,6800))
coop_fixture=saved(s)

core.action(s,'story_accept:'+third)
gate(s,525,steps)
gate(s,1700,court)
gate(s,1410,kiln)
inspect(s,1350,third,0)
move_at(s,834)
s.actors[2].hp=0
slot=s.fieldSlots[boss]
for _ in range(200):
    if slot.cast is not None: break
    step(s,1)
assert slot.cast.move.id=='RK01'
old=slot.enemy.hp
hit(s,slot.enemy,100)
assert old-slot.enemy.hp==9
hp=s.actors[1].hp
step(s,87)
assert s.actors[1].hp==hp and slot.enemy.exposed
old=slot.enemy.hp
hit(s,slot.enemy,100)
assert old-slot.enemy.hp==123 and slot.enemy.weakpoint.radius==37

for _ in range(380):
    if slot.cast is not None and slot.cast.move.id=='RK02': break
    step(s,1)
cast=slot.cast
assert cast.move.id=='RK02'
positions=[(lane.left+lane.right)/2 for lane in cast.lanes.values()]
assert sorted(lane.at for lane in cast.lanes.values())==[63,99,135]
for i,position in enumerate(positions):
    move_at(s,position)
    s.actors[1].inv=0
    step(s,63 if i==0 else 36)
assert hp-s.actors[1].hp==24
step(s,20)
assert slot.enemy.exposed
before=s.progression.questXp
hit(s,slot.enemy,1500)
assert s.story.quests[third].count==1 and s.progression.questXp==before
assert slot.phase=='respawn'
s=resume(s)
assert s.story.node==dock and s.fieldSlots[boss].phase=='respawn'
gate(s,525,steps)
gate(s,1700,court)
gate(s,1410,kiln)
inspect(s,1350,third,2)
gate(s,60,court)
gate(s,55,steps)
gate(s,58,dock)
report(s,third,(8653565,797220))
assert resume(s).story.quests[third].status=='complete'


def reenter_kiln(state):
    gate(state, 525, steps)
    gate(state, 1700, court)
    gate(state, 1410, kiln)


check_original_boss_retry(lua, core, resume(s), boss, third, reenter_kiln)
gate(s,60,boat)
assert 39.9<=s.voyage.arrives-s.t<=40.1
step(s,2401)
assert s.story.node=='nod-port'

proof=dict(newCapField=True,earnedLv200=True,postCapHitExp=296366,lateBoatContinues=True,
           disembarkedDuringStop=True,portWaitSafe=True,defendedHit=9,exposedRotorHit=123,
           safeCenter=True,threeHeatLanesOneHit=True,noBonusOnKill=True,firstReport=[8653565,797220],
           savedAfterBoss=True,continuedVoyage=True)
(ROOT/'evidence/cap-stopover-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
(ROOT/'work/cap-stopover-fixture.json').write_text(json.dumps(fixture),encoding='utf8')
(ROOT/'work/coop-original-rubble-sifter-fixture.json').write_text(json.dumps(coop_fixture),encoding='utf8')
print(proof)
