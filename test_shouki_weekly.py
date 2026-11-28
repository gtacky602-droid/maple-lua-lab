"""Check the Shouki weekly controller, contextual inputs and persistent reward."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub, node, quest = 'sumeru-hub', 'shouki-godmaking-arena', 'shouki-weekly-commission'
uid = 'boss-29070101'
ticks = lua.eval('function(C,s,n,hold) for i=1,n do C.step(s,1/60,{jump=hold}) end end')
manifest = json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_SUMERU.json').read_text(encoding='utf8'))


def act(s,key):
    core.action(s,key)


def save(s):
    return validate_save(native(core.checkpoint(s)))


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground,a.inv = x,y,0,True,0


def start():
    s=core.new(12)
    act(s,'story_start')
    core.grantExp(s,LEVELS[63]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def arena():
    s=start()
    core.enterStoryNode(s,node)
    w,spec=core.currentWeeklyBoss(s)
    s.actors[2].hp=0
    place(s.actors[1],70)
    return s,w,spec


def events(s,key):
    return [e for e in s.events.values() if e.kind=='shouki:'+key]

def machine_art(s):
    return [d for d in core.frame(s,'sprite').draws.values() if d.source=='shouki-idle-source-v1.png']


def art(s):
    return machine_art(s)[0]


def attack(s,x,damage=12):
    a=s.actors[1]
    place(a,x-40)
    a.dir,a.atk,a.lock,a.cd.normal=1,damage,0,0
    assert core.attack(s,a,'normal')


def enter_p2(s,w,spec,charge=0):
    w.charge=charge
    attack(s,w.primary.x,10000)
    assert w.stage=='rise' and w.primary.hp==spec.p2Hp and s.kills==0
    assert w.primary.invulnerable and len(s.enemies)==1 and len(w.blocks)==0
    ticks(core,s,spec.moves.WN08.total)
    assert (w.stage,w.shield,w.charge)==('p2',100,charge)
    place(s.actors[1],65)


def move(s,w,spec,key):
    order=spec.orders[1 if w.stage=='p1' else 2]
    w.index=list(order.values()).index(key)+1
    w.rest=0
    ticks(core,s,1)
    assert w.cast.id==key
    return w.cast


def start_trial(s,w,spec):
    w.shield=0
    ticks(core,s,1)
    assert w.stage=='trial' and w.primary.invulnerable
    ticks(core,s,60)
    assert len(w.targets)==4
    assert len(core.frame(s,'sprite').weeklyBoss.shouki.targets)==4


checked={}
for row in manifest['entries']:
    key=row['id']
    if not key.startswith('WN') or 'total_ticks' not in row:
        continue
    s,w,spec=arena()
    rule=spec.moves[key]
    assert rule.total==row['total_ticks'] and rule.recovery==row['recovery'][0],key
    assert list(native(rule.locks))==row['lock_ticks'] and list(native(rule.windows))==row['active_windows'],key
    for field,source in [('launches','projectiles'),('floors','detached_ground')]:
        assert list(native(rule[field]))==[t for q in (row.get(source) or []) for t in q['spawn_ticks']],key
    if key not in set(spec.orders[1].values())|set(spec.orders[2].values()):
        continue
    if key in set(spec.orders[2].values()):
        enter_p2(s,w,spec)
    cast=move(s,w,spec,key)
    ticks(core,s,rule.total)
    assert w.cast is None
    started=events(s,key)[0]
    assert [round((v.t-started.t)*60) for v in events(s,key+':lock')]==list(rule.locks.values())
    assert [round((v.t-started.t)*60) for v in events(s,key+':launch')]==list(rule.launches.values())
    checked[key]=cast.t

s,w,spec=arena()
a=s.actors[1]
assert len(s.enemies)==3 and all(e.sharedHealth.id==w.primary.id for e in w.hands.values())
upper,=machine_art(s)
assert list(upper.box.values())==[87,14,868,723]
assert (upper.h,upper.y)==(1160,spec.floorY)
assert upper.x-upper.w/2<0 and upper.x+upper.w/2>960 and upper.y-upper.h<0
assert core.frame(s,'sprite').draws[1].source==upper.source
original_upper=lua.table_from(json.loads((ROOT/'assets'/spec.openingPose.file).read_bytes()),recursive=True)
for profile in ('legacy','h48c32','h32c16'):
    raw=lua.table_from({'draws':lua.table()})
    core.drawFieldDisplayArt(raw,original_upper,upper.x,upper.y,upper.h,'rect',profile,False)
    visible=[r for r in raw.draws.values() if r.x<961 and r.x+r.w>-1 and r.y<541 and r.y+r.h>-1]
    assert 0<len(visible)<len(raw.draws)
    draws=core.frame(s,'rect',profile).draws
    machine=[draws[i] for i in range(1,len(visible)+1)]
    assert all(native(d)==native(r) for d,r in zip(machine,visible,strict=True))
    assert abs(max(d.y+d.h for d in machine)-upper.y)<.051
assert [e.hitTop for e in (w.primary,*w.hands.values())]==[342,367,367]
wide=lua.table_from({'id':1,'radial':True,'x':480,'y':480,'range':300,'atk':30,'mult':1,'limit':5,
                   'playerInputAt':s.t,'element':'physical','gain':0,'color':'#fff'})
core.resolveCast(s,wide)
assert s.hits==1 and w.primary.hp<spec.hp

s,w,spec=arena()
a=s.actors[1]
c=move(s,w,spec,'WN01')
ticks(core,s,180)
assert len(w.floors)==1 and w.floors[1].element=='pyro'
floor=w.floors[1]
ticks(core,s,120)
assert w.cast is None and len(w.floors)==1
place(a,floor.x,355)
assert core.frame(s,'rect','h32c16').weeklyBoss.shouki.max==100
place(a,720)
w.charge=100
act(s,'encounter_interact')
assert len(w.floors)==0 and w.charge==0 and w.deviceCd.cryo>w.clock
tick=w.clock
w.charge=100
act(s,'encounter_interact')
assert w.charge==100 and w.deviceCd.cryo==tick+600
place(a,230)
act(s,'encounter_interact')
act(s,'jump')
ticks(core,s,4,True)
assert events(s,'WN06:lift') and a.vy<-650
place(a,557)
a.hp-=20
w.charge=100
hp=a.hp
act(s,'encounter_interact')
ticks(core,s,1)
assert a.hp==hp+spec.charge.healPulse
place(a,393)
w.charge=100
act(s,'encounter_interact')
assert w.suppressed.left>w.clock and w.stage=='p1'
place(a,883)
w.charge=100
act(s,'encounter_interact')
assert w.stage=='overload' and w.primary.invulnerable and not w.cast
ticks(core,s,60)
assert not w.primary.invulnerable and core.frame(s).weeklyBoss.shouki.exposure==360
assert (art(s).h,art(s).y)==(spec.artHeight,spec.floorY)
ticks(core,s,360)
assert w.primary.invulnerable
ticks(core,s,60)
assert w.stage=='p1' and not w.primary.invulnerable

s,w,spec=arena()
w.elementIndex=1
move(s,w,spec,'WN01')
ticks(core,s,180)
assert w.floors[1].element=='cryo'
w.charge=100
place(s.actors[1],68)
act(s,'encounter_interact')
assert len(w.floors)==0 and w.charge==0

s,w,spec=arena()
a=s.actors[1]
move(s,w,spec,'WN01')
ticks(core,s,204)
b=w.blocks[1]
place(a,b.x)
s.auto=True
ticks(core,s,1)
assert w.charge==0 and len(w.blocks)==1
s.auto=False
place(a,b.x)
ticks(core,s,1)
assert w.charge==100 and not len(w.blocks)
enter_p2(s,w,spec,100)
armored=art(s)
assert list(armored.box.values())==list(upper.box.values())
assert (armored.h,armored.y,w.primary.hitTop)==(1160,480,315)
core_hint=core.frame(s).weeklyBoss.shouki.core
assert core_hint.exposed and core_hint.x==w.primary.x and abs(core_hint.y-(480-1160*113/723))<1e-7
assert 21<core_hint.y<480 and armored.y-armored.h<0
core_outline=[{k:d[k] for k in ('x','y','w','h','color','opacity') if d[k] is not None}
              for d in core.frame(s,'sprite').draws.values() if d.kind=='rect' and d.color=='#b9f2a9'
              and abs(d.x-core_hint.x)<=22 and abs(d.y-core_hint.y)<=22]
assert len(core_outline)==5
armored_core=native(core_hint)
act(s,'encounter_interact')
assert w.aim.owner==1 and w.charge==100
act(s,'encounter_interact')
assert len(events(s,'WN14:reserve'))==1
act(s,'encounter_confirm')
ticks(core,s,36)
assert w.charge==100 and w.shield==100 and w.aim.tx==core_hint.x and w.aim.ty==core_hint.y
act(s,'encounter_cancel')
assert w.aim is None and w.charge==100
s.actors[2].hp=140
act(s,'encounter_interact')
act(s,'swap')
ticks(core,s,1)
assert w.aim is None and w.charge==100
ticks(core,s,48)
act(s,'swap')
s.actors[2].hp=0
ticks(core,s,1)
place(a,268)
for option in ('left','core'):
    previous=w.shield
    w.autoAt=w.clock+1000
    act(s,'encounter_interact')
    act(s,'encounter_target:'+option)
    act(s,'encounter_confirm')
    ticks(core,s,59)
    assert w.charge==100 and w.shield==previous
    ticks(core,s,1)
    assert w.charge==0 and w.shield==previous and w.aim.fired and w.shot, (option,w.charge,w.shield,previous)
    act(s,'encounter_cancel')
    assert w.aim.fired and w.charge==0
    ticks(core,s,120)
    assert w.aim is None
    assert w.shield==previous-25 if option=='core' else w.shield==previous
    assert len(events(s,'WN14:guard-hit'))==(1 if option=='core' else 0)
    w.charge=100
assert len(events(s,'WN14:miss'))==1 and w.primary.hp==spec.p2Hp

s,w,spec=arena()
enter_p2(s,w,spec)
attack(s,w.primary.x,10000)
assert w.primary.hp==spec.p2Hp and w.shield==99
attack(s,w.primary.x,10000)
assert w.shield==99
start_trial(s,w,spec)
trial=art(s)
assert (trial.h,trial.y)==(1160,480)
core_hint=core.frame(s).weeklyBoss.shouki.core
assert not core_hint.exposed and abs(core_hint.y-(480-1160*113/723))<1e-7
assert 21<core_hint.y<480 and trial.y-trial.h<0
for i,target in enumerate(list(w.targets.values()),1):
    old=lua.table_from({'id':1,'x':target.x-30,'y':480,'dir':1,'range':110,'atk':100,'mult':1,'gain':0,
                        'limit':1,'element':'physical','color':'#fff','playerInputAt':w.trialOpened-.2})
    core.resolveCast(s,old)
    assert target.charges==4
    for remaining in range(3,-1,-1):
        attack(s,target.x)
        assert target.charges==remaining
        ticks(core,s,2)
    assert w.charge==i*25
assert w.trialLeft==0 and len(events(s,'WN15:destroyed'))==4
assert core.frame(s).weeklyBoss.shouki.core.exposed
place(s.actors[1],120)
act(s,'encounter_interact')
act(s,'encounter_confirm')
ticks(core,s,120)
assert w.stage=='collapse' and len(events(s,'WN14:core-hit'))==1
ticks(core,s,60-w.stageTick)
assert not w.primary.invulnerable and core.frame(s).weeklyBoss.shouki.exposure==600
assert art(s).h==1160 and core.frame(s).weeklyBoss.shouki.core is None
n=w.primary.hp
attack(s,w.primary.x)
assert w.primary.hp<n
ticks(core,s,600)
assert w.stage=='collapse' and w.primary.invulnerable
ticks(core,s,60)
assert w.stage=='p2' and not w.primary.invulnerable and not w.needTrial and not w.trialFailed

s,w,spec=arena()
enter_p2(s,w,spec)
start_trial(s,w,spec)
act(s,'encounter_target:pod2')
assert core.frame(s).weeklyBoss.shouki.assist==2
assert w.targets[2].acceptsAutoTarget(s,s.actors[2]) and not w.targets[1].acceptsAutoTarget(s,s.actors[2])
ally=lua.table_from({'id':2,'x':330,'y':480,'dir':1,'range':420,'atk':100,'mult':1,'gain':0,'radial':True,
                     'limit':5,'element':'physical','color':'#fff','growthAI':True,'startedAt':s.t})
core.resolveCast(s,ally)
core.resolveCast(s,ally)
assert [p.charges for p in w.targets.values()]==[4,3,4,4]
act(s,'encounter_target:pod2')
assert core.frame(s).weeklyBoss.shouki.assist is None and not w.targets[2].acceptsAutoTarget(s,s.actors[2])

s,w,spec=arena()
enter_p2(s,w,spec)
start_trial(s,w,spec)
for target in list(w.targets.values()):
    for _ in range(4):
        attack(s,target.x)
assert w.trialLeft==0 and w.charge==100
w.stageTick=spec.trial.deadline-spec.trial.minimumFireTime+1
act(s,'encounter_interact')
assert w.aim is None
w.stageTick-=1
place(s.actors[1],120)
act(s,'encounter_interact')
assert core.frame(s).weeklyBoss.shouki.aim.canConfirm
w.stageTick+=1
assert not core.frame(s).weeklyBoss.shouki.aim.canConfirm
act(s,'encounter_confirm')
assert not w.aim.confirmed and w.charge==100
act(s,'encounter_cancel')
assert w.aim is None and w.charge==100
w.stageTick-=1
act(s,'encounter_interact')
act(s,'encounter_confirm')
ticks(core,s,60)
assert w.shot is not None
w.stageTick=spec.trial.deadline-1
target=core.frame(s).weeklyBoss.shouki.core
w.shot.x,w.shot.y,w.shot.dx,w.shot.dy=target.x-39,target.y,1,0
ticks(core,s,1)
assert w.stage=='collapse' and not events(s,'WN16')

s,w,spec=arena()
enter_p2(s,w,spec)
start_trial(s,w,spec)
ticks(core,s,spec.trial.deadline-60)
assert w.stage=='failure' and len(w.targets)==0
a=s.actors[1]
hp=a.hp
ticks(core,s,180)
assert a.hp==hp-spec.moves.WN16.damage and a.hp>0
ticks(core,s,180)
assert w.stage=='p2' and w.shield==0 and not w.primary.invulnerable
hp=w.primary.hp
attack(s,w.primary.x)
assert w.primary.hp<hp
place(a,60)
ticks(core,s,spec.trial.retryTicks)
assert w.stage=='trial' and len(events(s,'WN15'))==2

s=start()
assert core.giveArtifact(s,1,62,3)
act(s,'artifact_equip:1')
s.mora=120000
act(s,'artifact_upgrade:1')
act(s,'artifact_upgrade:1')
assert s.actors[1].maxhp>450
assert core.giveArtifact(s,2,62,3)
act(s,'artifact_equip:2')
(ROOT/'work/shouki-weekly-gear.json').write_text(json.dumps(save(s),ensure_ascii=False),encoding='utf8')
act(s,'story_accept:'+quest)
place(s.actors[1],950)
act(s,'story_portal:'+node)
assert s.story.node==node
w,spec=core.currentWeeklyBoss(s)
enter_p2(s,w,spec)
start_trial(s,w,spec)
core.enterStoryNode(s,hub)
assert not w.aim and len(w.targets)==0
core.enterStoryNode(s,node)
assert w.stage=='p1' and w.primary.hp==spec.hp and w.charge==0
enter_p2(s,w,spec)
start_trial(s,w,spec)
ticks(core,s,spec.trial.deadline-60+360)
attack(s,w.primary.x,10000)
assert w.primary.hp==0 and s.kills==1 and s.story.quests[quest].count==1
act(s,'story_fast:'+hub)
act(s,'story_report:'+quest)
again=core.restore(lua.table_from(save(s),recursive=True))
assert again.weeklySlots[uid].primary.hp==0 and again.story.quests[quest].status=='complete'

result={'live_durations':checked,'upper_hits_share_hp':True,'independent_floor_and_matrix_cooldown':True,
        'wind_and_heal':True,'paired_electro_six_seconds':True,'only_manual_actor_collects':True,
        'art_heights':{'upper':upper.h,'armored':armored.h,'trial':trial.h,'collapse':1160},
        'upper_width':upper.w,'upper_extends_past_edges':True,'machine_behind_party':True,
        'upper_torso_ends_at_source_row':737,'upper_waist_y':upper.y,
        'floor_y':spec.floorY,'waist_clearance':spec.floorY-upper.y,'waist_aligned_in_all_profiles':True,
        'armoredCore':armored_core,'armoredOutline':core_outline,
        'chest_art_aim_and_collision_aligned':True,'combat_hit_heights_unchanged':True,
        'reserve_cancel_swap_and_missed_shot':True,'hit_applies_shield_separately':True,
        'four_physical_trials_and_core_collision':True,'explicit_ai_assistance_only':True,
        'deadline_tick_prefers_accepted_impact':True,'reserved_shot_confirmation_expires':True,'exposure_ticks':600,
        'ordinary_failure_and_retry':True,'route_report_and_save':True}
(ROOT/'evidence/shouki-weekly-floor-contact-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Shouki Lua: two phases, matrices, charge and shield, terminal settlement, trial and save passed')
