"""Check the air arena, locked previews, mark branches, and persistence through Lua."""
import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core=runtime()
hub, arena, quest='sumeru-hub','sumeru-stygian-windcourt','stygian-wanderer-commission'
spec=json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches']['wanderer']
advance=lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')


def step(s,n=1,**keys):
    advance(core,s,n,lua.table(**keys))


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground=x,y,0,True


def ready(level):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def begin(mode='normal',level=66):
    s=ready(level)
    core.action(s,'story_accept:'+quest)
    place(s.actors[1],443)
    core.action(s,'story_nearby_portal')
    assert s.story.node==arena
    if level==66:
        core.action(s,'stygian_start:wanderer:extreme:troupe')
        assert not s.endgameRun
    core.action(s,'stygian_start:wanderer:'+mode+':troupe')
    r=s.endgameRun
    s.actors[2].hp=0
    return s,r,r.boss,s.actors[1]


def until(s,predicate,limit=10000):
    for _ in range(limit):
        if predicate(): return
        step(s)
    r=s.endgameRun
    raise AssertionError((r.phase,r.stage,r.status,r.cast and r.cast.key,r.cast and r.cast.t))


def find_card(s,r,key,t=0):
    until(s,lambda:r.cast and r.cast.key==key and r.cast.t==t)
    return r.cast


def logs(s,tag,c=None):
    return [e for e in s.events.values() if e.kind=='stygian:wanderer:'+tag and (c is None or e.cast==c.serial)]


def windows(s,c):
    assert [e.tick for e in logs(s,c.key+':window',c)]==[w[0] for w in spec['moves'][c.key]['windows']]
    assert [e.tick for e in logs(s,c.key+':lock',c)]==[spec['moves'][c.key]['lock']]


def cast(s,b,atk=200000):
    strike=lua.table(id=s.active,key='normal',x=b.x-48,y=b.y,dir=1,range=124,limit=1,mult=1,
                    element='physical',color='#fff3e4',gain=0,atk=atk,
                    playerInputAt=s.t,startedAt=s.t)
    core.resolveCast(s,strike)


def collect(s,c):
    w=c.data.markWindow
    if c.t<w[1]-1: step(s,w[1]-1-c.t)
    for p in c.marks.values():
        if p.taken: continue
        a=s.actors[s.active]
        place(a,p.x)
        step(s)
        if p.y!=480: assert not p.taken
        place(a,p.x,p.y)
        step(s)
        assert p.taken
    assert c.collected==2


s,r,b,a=begin()
place(a,210)
core.action(s,'jump')
step(s,36,jump=True)
assert a.y<260 and len(logs(s,'updraft'))==1
step(s,70,jump=True)
assert a.ground and a.y==372 and len(logs(s,'updraft'))==1
# An ordinary jump off the floor, away from a wind ring, cannot reach the central ledge.
place(a,480)
core.action(s,'jump')
step(s,36,jump=True)
assert 310<a.y<350 and len(logs(s,'updraft'))==1
step(s,68)
assert a.ground and a.y==480
opening=r.cast
assert opening and opening.key=='WD01'
until(s,lambda:r.phase=='ready')
windows(s,opening)
cast(s,b)
assert b.hp==math.ceil(b.maxhp*.67)
glide=find_card(s,r,'WD02',30)
locked=glide.stopX
place(a,locked)
hp=a.hp
step(s,94)
assert glide.stopX==locked and b.y==364 and a.hp==hp
assert not logs(s,'WD02:contact',glide)
step(s,129)
windows(s,glide)
until(s,lambda:r.stage==2 and r.phase=='ready')
assert b.y==480
marks=find_card(s,r,'WD03')
collect(s,marks)
assert marks.drop and marks.recover==marks.t+30 and marks.untilTick-marks.recover==156
landing_x,landing_y=marks.drop.toX,marks.drop.toY
step(s,29)
assert b.y!=landing_y
step(s)
assert b.y==landing_y==372 and b.x==landing_x
before=b.hp
cast(s,b,75)
assert b.hp<before and r.phase=='cast'
assert core.frame(s,'sprite','legacy').endgameRun.phase=='recover'
step(s,156)
assert not logs(s,'WD03:window',marks)
dive=find_card(s,r,'WD04',46)
locked=dive.stopX
place(a,locked)
a.inv=0
hp=a.hp
step(s,81)
assert b.y<480 and a.hp==hp and dive.stopX==locked
step(s)
assert b.y==480 and a.hp<hp
step(s,134)
windows(s,dive)
cast(s,b)
assert b.hp==math.ceil(b.maxhp*.34)
until(s,lambda:r.stage==3 and r.phase=='ready')
last=find_card(s,r,'WD06')
a.inv=500
collect(s,last)
step(s,last.data.gateTick-last.t)
gate=last.gate
assert gate.half==80
place(a,gate.x)
hp=a.hp
step(s,560-last.t)
assert a.hp==hp and not any(e.tick==560 for e in logs(s,'WD06:contact',last))
step(s,280)
assert r.finaleOpen and not r.cast
windows(s,last)
between=[]
for _ in range(3):
    until(s,lambda:r.cast is not None)
    normal=r.cast
    between.append(normal.key)
    step(s,normal.untilTick)
    windows(s,normal)
assert between==['WD05','WD04','WD02']
last=find_card(s,r,'WD06',438)
assert last.collected==0 and last.gate.half==56 and last.untilTick==750
step(s,162)
assert last.untilTick-last.t==150
cast(s,b)
step(s)
assert r.status=='clear' and r.reward.first and r.reward.mora==8400
assert s.story.quests[quest].count==1 and s.returns==0
core.action(s,'endgame_exit')
core.enterStoryNode(s,hub)
core.action(s,'story_report:'+quest)
record=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(record,recursive=True))
assert restored.story.quests[quest].status=='complete'
assert restored.endgame.stygian['wanderer:normal'].clears==1

s,r,b,a=begin('extreme',157)
a.inv=500
until(s,lambda:r.phase=='ready')
cast(s,b)
until(s,lambda:r.stage==2 and r.phase=='ready')
dry=find_card(s,r,'WD03',429)
assert dry.collected==0 and not dry.drop and dry.recover==471
assert [e.tick for e in logs(s,'WD03:window',dry)]==[429]
b_hp=b.hp
s.actors[1].hp=0
step(s)
assert r.status=='failed' and r.cast is None and b.hp==b_hp and s.returns==1

fixture=ready(66)
fixture.mora=92000
assert core.giveArtifact(fixture,2,60,4)
core.action(fixture,'artifact_equip:1')
assert core.giveArtifact(fixture,1,62,4)
core.action(fixture,'artifact_equip:2')
data=validate_save(native(core.checkpoint(fixture)))
(ROOT/'work/stygian-wanderer-gear.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf8')
proof={'cards':list(spec['moves']),'ranks':[x['level'] for x in spec['modes']],
       'wind_ring_changes_real_jump_only_on_takeoff':True,'forward_glide_locks_and_has_floor_refuge':True,
       'marked_platform_requires_landing':True,'two_marks_land_boss_on_platform_for_156_ticks':True,
       'dive_hits_only_at_locked_landing':True,'finale_gate_widths':[160,112],
       'finale_openings_ticks':[240,150],'regular_cards_between_finales':between,
       'failure_cancels_cast':True,'quest_reward_report_and_save':True}
(ROOT/'evidence/stygian-wanderer-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Wanderer Lua: wind-ring lift, two wind marks, dives, both finale outcomes and records passed')
