"""Validate the local pair, life and verdict timelines through the gameplay controller."""
import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub, arena, quest = 'snezhnaya-hub', 'sne-stygian-last-gate', 'stygian-ronova-commission'
spec = json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches']['ronova']
entries = json.loads((ROOT/'docs/stygian-motion-v1/MANIFEST.json').read_text(encoding='utf8'))['entries']
cards = {c['id']:c for c in entries if c['boss']=='ronova'}
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')


def step(s,n=1):
    advance(core,s,n)


def ready(level):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def place(a,x,y=480):
    a.x,a.y,a.ground,a.vy=x,y,True,0


def begin(mode='normal'):
    s=ready(164 if mode=='normal' else 200)
    core.action(s,'story_accept:'+quest)
    place(s.actors[1],1080)
    core.action(s,'story_nearby_portal')
    assert s.story.node==arena
    if mode=='normal':
        core.action(s,'stygian_start:ronova:extreme:troupe')
        assert not s.endgameRun
    core.action(s,'stygian_start:ronova:'+mode+':troupe')
    r=s.endgameRun
    assert r.life==100 and r.lamps==5
    return s,r,r.boss


def until(s,condition,limit=8000):
    for _ in range(limit):
        if condition(): return
        step(s)
    r=s.endgameRun
    raise AssertionError((r.stage,r.phase,r.status,r.cast and r.cast.key))


def at(s,r,key,t=0):
    until(s,lambda:r.cast and r.cast.key==key and r.cast.t==t)
    return r.cast


def cast(s,b,atk=500000):
    strike=lua.table(id=s.active,key='normal',x=b.x-55,y=b.y,dir=1,range=120,limit=1,mult=1,
                    element='physical',color='#fff3e4',gain=0,atk=atk,playerInputAt=s.t,startedAt=s.t)
    core.resolveCast(s,strike)


def marks(s,tag,serial=None):
    return [e for e in s.events.values() if e.kind=='stygian:ronova:'+tag and (serial is None or e.cast==serial)]


def windows(s,c):
    assert [e.tick for e in marks(s,c.key+':window',c.serial)]==[w[0] for w in cards[c.key]['active_windows']]
    assert [e.tick for e in marks(s,c.key+':lock',c.serial)]==cards[c.key]['lock_ticks']


def gentle(s):
    # Ordinary test cards can be checked away from the input route without party attrition.
    for a in s.actors.values():
        a.inv=999


def floor_pick(s,c,i):
    p=c.shadows[i]
    place(s.actors[s.active],p.x,p.sole)
    step(s)


def finish_card(s,r,key):
    c=at(s,r,key)
    step(s,c.stop)
    assert not r.cast
    windows(s,c)


s,r,b=begin('extreme')
gentle(s)
until(s,lambda:r.phase=='ready')
cast(s,b)
assert b.hp==math.ceil(b.maxhp*.75)
finish_card(s,r,'RN01')
wave=at(s,r,'RN02',60)
a=s.actors[s.active]
place(a,b.x+25 if wave.dir>0 else b.x-25)
h=a.hp
step(s,6)
assert r.life==82 and a.hp==h and len(r.echoes)==1
echo=r.echoes[1]
step(s,168)
assert len(r.echoes)==1 and not r.cast
place(a,echo.x,echo.sole)
step(s)
assert r.life==100 and len(r.echoes)==0
windows(s,wave)
split=at(s,r,'RN03',66)
assert r.life==64 and [p.value for p in split.shadows.values()]==[12,12,12]
step(s,11)
floor_pick(s,split,1)
floor_pick(s,split,2)
floor_pick(s,split,3)
assert r.life==100 and split.found==3 and split.stop==split.t+96
with_event=marks(s,'life-pickup',split.serial)
assert [e.value for e in with_event]==[12,12,12]
until(s,lambda:r.stage==2 and r.phase=='ready')
cast(s,b)
assert b.hp==math.ceil(b.maxhp*.45)
finish_card(s,r,'RN04')
judge=at(s,r,'RN05',84)
x=judge.mark
a=s.actors[s.active]
place(a,x)
core.action(s,'dodge')
place(a,x)
step(s,48)
# The 27-tick dodge before the lock interval expires cannot mask the oncoming verdict.
assert a.hp==0 and r.lamps==5 and r.life==100
assert s.active!=a.id
assert len(marks(s,'authority_lethal',judge.serial))==1
step(s,6)
assert r.lamps==5 and len(marks(s,'authority_lethal',judge.serial))==1
windows(s,judge)
friend=s.actors[s.active]
place(friend,a.x,a.y)
core.action(s,'encounter_interact')
step(s,1)
place(friend,friend.x+15)
step(s)
assert r.aid is None and r.aidCooldown==0
place(friend,a.x,a.y)
core.action(s,'encounter_interact')
# This test uses a peaceful part of the next card for the scoped aid channel.
step(s,180)
assert a.hp==math.floor(a.maxhp*.25) and r.lamps==5 and r.aidCooldown>3500
trial=r.cast
assert trial.key=='RN06'
place(s.actors[s.active],105)
if trial.t<60: step(s,60-trial.t)
assert trial.found==0
floor_pick(s,trial,1)
core.action(s,'swap')
floor_pick(s,trial,2)
assert trial.found==2 and trial.stop==trial.t+132 and len(r.echoes)==1
p=r.echoes[1]
place(s.actors[s.active],p.x,p.sole)
step(s)
assert len(r.echoes)==0
finish_card(s,r,'RN10')
until(s,lambda:r.stage==3 and r.phase=='ready')
cast(s,b)
assert b.hp==math.ceil(b.maxhp*.15)
finish_card(s,r,'RN07')
finish_card(s,r,'RN11')
road=at(s,r,'RN12',89)
for px,y in spec['arena']['road']:
    place(s.actors[s.active],px,y)
    step(s)
assert road.arrived and road.stop==road.t+210
step(s,30)
v=core.frame(s,'sprite','legacy').endgameRun
assert v.pose=='RN09' and v.phase=='recover' and len(marks(s,'RN09:pose',road.serial))==1
until(s,lambda:r.stage==4 and r.phase=='ready')
final=at(s,r,'RN08',240)
place(s.actors[s.active],850)
assert r.life==64
step(s,12)
floor_pick(s,final,1)
floor_pick(s,final,2)
step(s,612-final.t)
assert final.found==2 and final.gateX and abs(final.gateX-s.actors[s.active].x)<=264
place(s.actors[s.active],final.gateX)
health=s.actors[s.active].hp
step(s,228)
assert s.actors[s.active].hp==health and len(marks(s,'RN08:verdict-safe',final.serial))==1
windows(s,final)
step(s,24)
assert r.finaleOpen and final.recover==864 and final.stop==1134
place(s.actors[1],160)
place(s.actors[2],160)
cast(s,b)
step(s)
assert r.status=='clear' and r.lamps==5 and r.reward.mora==148300
assert s.story.quests[quest].count==1 and s.returns==0
core.action(s,'endgame_exit')
core.enterStoryNode(s,hub)
core.action(s,'story_report:'+quest)
d=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(d,recursive=True))
assert restored.story.quests[quest].status=='complete' and restored.endgame.stygian['ronova:extreme'].clears==1

# Starve Life, relay once on each distinct Life-zero, then reserve exactly five returns.
s,r,b=begin()
gentle(s)
first=at(s,r,'RN02',60)
r.life=18
a=s.actors[s.active]
place(a,b.x+25 if first.dir>0 else b.x-25)
step(s,6)
assert a.hp==0 and r.life==35 and r.lamps==5 and len(marks(s,'life-relay'))==1
step(s,10)
assert r.life==35 and len(marks(s,'life-relay'))==1
core.action(s,'swap')
assert s.active!=a.id and r.life==35
place(s.actors[s.active],a.x,a.y)
core.action(s,'encounter_interact')
step(s,180)
assert a.hp>0 and r.life<=35 and r.lamps==5

for expected in range(4,-1,-1):
    for actor in s.actors.values():
        actor.hp=0
        actor.cd.skill1=12
    s.gauge=37
    hp,stage=r.boss.hp,r.stage
    current=r.cast
    tick=current.t if current else None
    step(s)
    assert r.lamps==expected and r.wipe.wait==120 and r.status=='fighting'
    step(s,119)
    assert r.wipe.wait==1 and r.lamps==expected and all(x.hp==0 for x in s.actors.values())
    if current: assert r.cast.serial==current.serial and r.cast.t==tick
    step(s)
    assert not r.wipe and r.life==100 and r.protected==120 and r.lamps==expected
    assert all(x.hp==x.maxhp and 9.9<x.cd.skill1<10.1 for x in s.actors.values())
    assert r.boss.hp==hp and r.stage==stage and s.gauge==37 and s.returns==0
    if expected==4:
        a=s.actors[s.active]
        step(s,2)
        assert r.protected==118 and core.damageActor(s,a,40,None,False,True)==0
        core.action(s,'normal')
        assert r.protected==0

for a in s.actors.values(): a.hp=0
step(s)
v=core.frame(s,'sprite','legacy').endgameRun
assert r.status=='failed' and v.phase=='spectate' and r.lamps==0 and s.returns==0
assert len(marks(s,'lamp-spent'))==5 and len(marks(s,'returned'))==5
core.action(s,'endgame_exit')
assert s.story.node==hub and all(x.hp==x.maxhp for x in s.actors.values())

# A new attempt starts with five lamps, and a pending individual verdict cannot cross a return.
s,r,b=begin()
gentle(s)
until(s,lambda:r.phase=='ready')
cast(s,b)
short=at(s,r,'RN03',65)
r.life=1
step(s)
assert not len(short.shadows) and r.life==1 and short.stop==168 and short.recover==78
until(s,lambda:r.stage==2 and r.phase=='ready')
stale=at(s,r,'RN05',127)
for a in s.actors.values(): a.hp=0
step(s)
assert stale.waived and r.lamps==4
step(s,120)
assert r.cast.key=='RN05' and r.cast.t==127 and r.protected==120
place(s.actors[s.active],stale.mark)
step(s,12)
assert not marks(s,'authority_lethal',stale.serial)
miss=at(s,r,'RN06',59)
place(s.actors[s.active],896)
step(s,648)
assert miss.t==707 and miss.found==0
step(s)
lethal=marks(s,'authority_lethal',miss.serial)
assert len(lethal)==1 and lethal[0].tick==708 and r.lamps==4

fixture=ready(164)
fixture.mora=1250000
assert core.giveArtifact(fixture,2,76,4)
core.action(fixture,'artifact_equip:1')
assert core.giveArtifact(fixture,1,84,4)
core.action(fixture,'artifact_equip:2')
d=validate_save(native(core.checkpoint(fixture)))
(ROOT/'work/stygian-ronova-gear.json').write_text(json.dumps(d,ensure_ascii=False),encoding='utf8')
proof={'cards':list(cards),'peak_hp':12300,'life_separate_from_hp':True,'aid_interrupt_and_completion':True,
       'shadow_split_and_third_optional_return_echo':True,'all_four_threshold_stages':True,
       'safe_gate_at_840_and_recovery_864':True,'partner_death_does_not_spend_lamp':True,
       'five_returns_and_spectate_on_sixth_wipe':True,'wait_and_protection_ticks':120,
       'hp_phase_ct_and_shared_light_gauge_preserved':True,'stale_verdict_cancelled':True,
       'life_one_no_split':True,'missed_return_verdict_at_708':True,'record_and_save':True}
(ROOT/'evidence/stygian-ronova-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Ronova Lua: 12 cards, shared life, aid, judgment, five returns and saved reward passed')
