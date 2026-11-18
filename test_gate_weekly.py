"""Exercise the Gate encounter in the Lua runtime, including the half-open charge windows."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub, arena, quest, ident = 'mond-town','mond-gate-chess-court','gate-weekly-commission','boss-29122000'
advance=lua.eval('function(C,s,n,input) for i=1,n do C.step(s,1/60,input) end end')


def step(s,n,**keys):
    advance(core,s,n,lua.table(**keys))


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground=x,y,0,True


def start(enter=True):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[111]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    if not enter:
        return s
    core.enterStoryNode(s,arena)
    s.actors[2].hp=0
    w,spec=core.currentWeeklyBoss(s)
    return s,w,spec


def events(s,key):
    return [e for e in s.events.values() if e.kind=='gate:'+key]


def hit(s,e,atk=10000):
    a=s.actors[1]
    place(a,e.x-59)
    a.dir,a.atk,a.lock,a.cd.normal=1,atk,0,0
    assert core.attack(s,a,'normal')


def royal(s,w,spec,begin=True):
    w.pawnsDone=True
    hit(s,w.king)
    assert w.king.hp==225
    step(s,spec.noticeTicks+1)
    assert w.stage=='queen'
    hit(s,w.queen)
    step(s,1)
    assert w.stage=='finish' and w.king.hp==225
    hit(s,w.king)
    step(s,1)
    assert w.cast.key=='WT09'
    step(s,191)
    assert w.stage=='finish'
    step(s,1)
    assert w.stage=='royal' and w.king.invulnerable and w.queen.invulnerable
    if begin:
        step(s,48+spec.restTicks+1)
        assert w.cast.key=='WT17'


s,w,spec=start()
manifest=json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_PRIMAL_GATE.json').read_text(encoding='utf8'))
cards=[]
for source in manifest['entries']:
    if source['boss']!='game_before_gate':
        continue
    key=source['id']
    m=spec.moves[key]
    cards.append(key)
    if source['kind']=='fixed':
        assert (m.total,m.recovery)==(source['total_ticks'],source['recovery'][0]),key
        assert list(native(m.locks))==source['lock_ticks'],key
        assert list(native(m.windows))==source['active_windows'],key
        assert list(native(m.shots))==source.get('projectiles',[]),key
assert (spec.moves.WT17.lock_offset,list(native(spec.moves.WT17.charge_window_offset)),
        spec.moves.WT17.last_retry_start_tick)==(210,[258,294],666)

a=s.actors[1]
place(a,735)
step(s,spec.noticeTicks+1)
assert w.cast.key=='WT03' and w.king.invulnerable
c=w.cast
step(s,1)
for expected in (2,1,0):
    step(s,290)
    assert events(s,'WT04:pawn')[-1].value==expected
    if expected>0:
        assert w.cast.key=='WT03' and w.cast.shield==expected
    else:
        assert w.cast.key=='WT18'
assert all(p.broken for p in c.pawns.values()) and s.kills==0
assert len(events(s,'WT04:pawn'))==3

s,w,spec=start()
w.pawnsDone=True
w.index=3
step(s,spec.noticeTicks+1)
assert w.cast.key=='WT05' and w.cast.g==12
hp=w.king.hp
for _ in range(12):
    s.actors[1].inv=2
    hit(s,w.king,8)
    step(s,36)
    if w.cast.key=='WT18':
        break
assert w.cast.key=='WT18' and w.king.hp==hp
assert len(events(s,'WT05:barrier'))==12
step(s,48-w.cast.t)
assert w.phase=='exposure' and not w.king.invulnerable

s,w,spec=start()
royal(s,w,spec)
c=w.cast
place(s.actors[1],84)
step(s,60,interact=True)
assert c.hold and c.freeze==0
core.action(s,'dodge')
step(s,1,interact=True)
assert c.hold is None and len(events(s,'WT20:cancel:action'))==1
place(s.actors[1],84)
step(s,120,interact=True)
assert c.freeze==0
step(s,1)
step(s,91,interact=True)
assert c.freeze==50
cd=c.ready-c.t
assert cd==120
step(s,120)
step(s,91,interact=True)
assert c.freeze==100 and c.run is not None and w.cast.key=='WT17'
freeze_tick=c.t
assert freeze_tick<=600
step(s,163,right=True)
assert s.actors[1].x>=612
step(s,46)
assert c.run.goal is None
step(s,1)
goal=c.run.goal
assert goal>=612 and c.t==freeze_tick+210
step(s,36)
core.action(s,'jump')
step(s,45,jump=True)
assert w.cast.key=='WT18' and len(events(s,'WT17:collision'))==1
assert w.queen.x-w.king.x>=60
assert not events(s,'WT17:hurt') and c.run.goal==goal
step(s,48-w.cast.t)
assert w.phase=='exposure' and not w.king.invulnerable and not w.queen.invulnerable
step(s,360)
assert w.king.invulnerable and w.queen.invulnerable

s,w,spec=start()
royal(s,w,spec)
c=w.cast
c.freeze=50
place(s.actors[1],84)
step(s,509)
step(s,91,interact=True)
assert c.t==600 and c.freeze==100 and c.run.start==600
step(s,359)
assert w.cast.key=='WT17' and c.run is None and len(events(s,'WT17:lead'))==1
step(s,1)
assert c.t==960 and len(events(s,'WT17:miss'))==1

s,w,spec=start()
royal(s,w,spec)
place(s.actors[1],84)
c=w.cast
step(s,91,interact=True)
step(s,120)
step(s,91,interact=True)
first_run=c.run.start
step(s,294)
assert c.run.start==first_run+294 and len(events(s,'WT17:miss'))==1
step(s,163,right=True)
step(s,131)
assert w.cast.key=='WT18' and len(events(s,'WT17:collision'))==1

s,w,spec=start()
royal(s,w,spec,False)
step(s,48)
w.index=7
w.rest=0
place(s.actors[1],408)
step(s,1)
assert w.cast.key=='WT14'
step(s,96)
start_x=s.actors[1].x
step(s,10,right=True)
assert abs(s.actors[1].x-start_x-24.5)<.01

s,w,spec=start()
royal(s,w,spec)
for remaining in (1,0):
    hit(s,w.king)
    step(s,1)
    assert w.cast.key=='WT19'
    hp=w.queen.hp
    step(s,180)
    assert w.reviveLeft==remaining and w.king.hp+w.queen.hp==hp and w.king.hp>0
hit(s,w.king)
step(s,181)
assert w.king.retired and w.reviveLeft==0 and len(events(s,'WT19:transfer'))==2
hit(s,w.queen)
step(s,1)
assert s.kills==1 and w.primary.hp==0

s=start(False)
s.mora=430000
assert core.giveArtifact(s,1,82,3)
core.action(s,'artifact_equip:1')
core.action(s,'artifact_upgrade:1')
assert core.giveArtifact(s,2,40,3)
core.action(s,'artifact_equip:2')


def save():
    return validate_save(native(core.checkpoint(s)))


(ROOT/'work/gate-weekly-gear.json').write_text(json.dumps(save(),ensure_ascii=False),encoding='utf8')
core.action(s,'story_accept:'+quest)
place(s.actors[1],442)
core.action(s,'story_portal:'+arena)
assert s.story.node==arena and s.story.quests[quest].status=='active'
w,spec=core.currentWeeklyBoss(s)
s.actors[2].hp=0
royal(s,w,spec)
cast=lua.table(id=1,atk=100000,x=480,y=480,dir=1,radial=True,range=650,limit=2,mult=1,element='physical',color='#fff7da',gain=0)
core.resolveCast(s,cast)
assert w.king.hp==w.queen.hp==0
step(s,1)
assert s.kills==1 and s.story.quests[quest].count==1 and not events(s,'WT19')
core.action(s,'story_fast:'+hub)
core.action(s,'story_report:'+quest)
persisted=core.restore(lua.table_from(save(),recursive=True))
assert persisted.story.quests[quest].status=='complete' and persisted.weeklySlots[ident].primary.hp==0

proof={'manifest_cards':cards,'one_pawn_per_charge':True,'physical_bishop_shield':True,
       'separate_royal_bodies':True,'frost_hold_cancellation_and_cooldown':True,
       'frost_includes_tick_600':True,'lock_and_collision_relative_ticks':[210,258,294],
       'latest_retry_tick':666,'early_miss_can_retry':True,'actual_3_5_second_lure':True,'exposure_ticks':360,
       'water_vortex_walk_speed':.70,
       'transfer_conserves_hp_two_uses':True,'simultaneous_royal_defeat_has_one_reward':True,
       'quest_report_restore':True}
(ROOT/'evidence/gate-weekly-lua.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Gate Lua: pawn charges, shields, frost deadline, swept collision, shared transfer budget and save passed')
