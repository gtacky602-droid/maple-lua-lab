"""Exercise Heretic's two health pools, impact accounting, movement and rewards in Lua."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua,core=runtime()
hub,arena='sumeru-hub','sumeru-heretic-lattice'
quest,uid='heretic-weekly-commission','boss-29150101'
advance=lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
same_wall_actor=lua.eval('function(w,actor) return w.cast.child.wall.touched[actor] end')


def step(s,n):
    advance(core,s,n)


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground=x,y,0,True


def ready():
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s,LEVELS[143]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def start():
    s=ready()
    core.enterStoryNode(s,arena)
    s.actors[2].hp=0
    w,spec=core.currentWeeklyBoss(s)
    return s,w,spec


def events(s,key):
    return [e for e in s.events.values() if e.kind=='heretic:'+key]


def attack(x,power=1,actor=1,element='physical',reach=112):
    return lua.table(id=actor,atk=power,x=x-55,y=480,dir=1,range=reach,limit=2,
                     mult=1,element=element,color='#fff2d7',gain=0)


def trial(s,w,spec):
    body=w.primary
    a=s.actors[1]
    place(a,308)
    a.cd.skill1=7
    hp,gauge=a.hp,s.gauge
    cast=attack(body.x,100000)
    core.resolveCast(s,cast)
    assert w.cast.key=='WH10' and body.hp==spec.p2Hp and s.kills==0
    assert a.hp==hp and s.gauge==gauge and a.cd.skill1==7
    core.resolveCast(s,cast)
    step(s,179)
    assert w.form==1 and body.invulnerable
    step(s,1)
    assert w.form==2 and body.invulnerable
    step(s,60)
    assert w.cast.key=='WH11' and w.cast.t==0 and not body.invulnerable
    step(s,420+1)
    assert w.cast.key=='WH13' and w.cast.t==0 and body.invulnerable
    step(s,59)
    assert len(w.anchors)==0
    step(s,1)
    assert len(w.anchors)==2 and w.cast.chant==24


def break_anchor(s,w):
    body=w.primary
    anchor=w.anchors[1]
    cast=attack(anchor.x,100000)
    core.resolveCast(s,cast)
    assert anchor.hp==2
    assert not anchor.onCastContact(s,cast,anchor,1,'#fff','physical')
    step(s,11)
    core.resolveCast(s,cast)
    assert anchor.hp==2
    step(s,1)
    core.resolveCast(s,cast)
    assert anchor.hp==1
    assert not anchor.onCastContact(s,cast,anchor,1,'#fff','physical')
    step(s,12)
    core.resolveCast(s,cast)
    assert anchor.hp==0 and w.cast.breakReady and body.invulnerable
    step(s,1)
    assert w.cast.brokenAt and not body.invulnerable and len(s.enemies)==1 and not w.cast.child


s,w,spec=start()
manifest=json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_DOTTORE.json').read_text(encoding='utf8'))
cards=[row for row in manifest['entries'] if row['boss']=='heretic']
assert len(cards)==20
for row in cards:
    m=spec.moves[row['id']]
    if row['kind']=='fixed':
        assert (m.total,m.recovery)==(row['total_ticks'],row['recovery'][0]),row['id']
        assert list(native(m.locks))==row['lock_ticks'],row['id']
        assert list(native(m.windows))==row['active_windows'],row['id']

# Let all nine initial cards run and check the first three-projectile volley on the floor.
step(s,spec.noticeTicks+1)
for key in spec.p1Order.values():
    assert w.cast.key==key
    a=s.actors[1]
    if key=='WH02':
        place(a,w.primary.x+(255 if w.primary.x<480 else -255))
        a.inv=0
        step(s,112)
        assert len(events(s,'WH02:hit'))==1
        step(s,spec.moves[key].total+spec.restTicks+1-112)
    else:
        a.inv=9999
        step(s,spec.moves[key].total+spec.restTicks+1)

s,w,spec=start()
trial(s,w,spec)
a=s.actors[1]
body=w.primary
before=body.hp
place(a,711)
hp=a.hp
step(s,137)
assert w.cast.child.key=='WH14' and not w.cast.child.gap.upper
assert core.frame(s).weeklyBoss.heretic.hole.fits
assert not same_wall_actor(w,a) and a.x==711 and a.hp==hp
step(s,360)
assert w.cast.child.key=='WH14' and w.cast.child.gap.upper
assert not core.frame(s).weeklyBoss.heretic.hole.fits
assert same_wall_actor(w,a) and 30.7<=711-a.x<=30.9 and a.hp==hp
assert len(events(s,'WH14:push'))==1
place(a,711,339)
step(s,14)
assert a.x==711 and a.y==339 and len(events(s,'WH14:push'))==1
assert core.frame(s).weeklyBoss.heretic.hole.fits
break_anchor(s,w)
opened=w.cast.brokenAt
assert opened<1800
cast=attack(body.x,100000)
react=attack(body.x,100000,element='pyro')
react.reaction=True
core.resolveCast(s,react)
assert w.cast.chant==24
for i in range(22):
    step(s,12)
    s.actors[1].inv=9999
    core.resolveCast(s,cast)
    assert w.cast.chant==23-i and body.hp==before
# The inactive actor's own valid hit at the same tick uses a separate interval.
core.resolveCast(s,attack(body.x,1,2))
assert w.cast.chant==1 and body.hp==before
step(s,1799-w.cast.t)
# Deliver the last event through the real pending-cast entry point at tick 1800.
pending=attack(body.x,9800)
pending.next=s.t+1/60
pending.remaining,pending.interval=1,0
s.pending[len(s.pending)+1]=pending
step(s,1)
assert w.cast.key=='WH19' and body.hp==before and len(events(s,'WH18'))==0
assert s.kills==0 and len(events(s,'WH13:chant'))==24
step(s,59)
assert body.invulnerable
step(s,1)
v=core.frame(s,'sprite','legacy').weeklyBoss.heretic
assert v.exposure==720 and not body.invulnerable
core.resolveCast(s,attack(body.x))
assert body.hp==before-1
step(s,719)
assert not body.invulnerable
late=attack(body.x)
late.next=s.t+1/60
late.remaining,late.interval=1,0
s.pending[len(s.pending)+1]=late
step(s,1)
assert body.hp==before-1 and body.invulnerable
step(s,60)
assert not w.cast and not body.invulnerable

s,w,spec=start()
trial(s,w,spec)
body=w.primary
before=body.hp
a=s.actors[1]
a.inv=9999
step(s,1740)
assert w.cast.key=='WH18' and len(w.anchors)==0 and body.hp==before and not body.invulnerable
a.inv=0
a.hp=a.maxhp
place(a,480)
hp=a.hp
step(s,185)
assert 0<a.hp<hp and len(events(s,'WH18:hit'))==1
a.inv=9999
step(s,175+spec.restTicks+1)
assert w.cast.key=='WH16'
step(s,540+spec.restTicks+1)
assert w.cast.key=='WH17'
assert len(s.enemies)==1 and not core.frame(s,'sprite','legacy').weeklyBoss.primal
step(s,420+spec.restTicks+1)
assert w.cast.key=='WH13' and w.trialId==2

s=ready()
s.mora=480000
assert core.giveArtifact(s,1,82,3)
core.action(s,'artifact_equip:1')
core.action(s,'artifact_upgrade:1')
assert core.giveArtifact(s,2,40,3)
core.action(s,'artifact_equip:2')


def save():
    return validate_save(native(core.checkpoint(s)))


(ROOT/'work/heretic-weekly-gear.json').write_text(json.dumps(save(),ensure_ascii=False),encoding='utf8')
core.action(s,'story_accept:'+quest)
place(s.actors[1],222)
core.action(s,'story_portal:'+arena)
assert s.story.node==arena
s.actors[2].hp=0
w,spec=core.currentWeeklyBoss(s)
trial(s,w,spec)
break_anchor(s,w)
step(s,1800-w.cast.t+360)
core.resolveCast(s,attack(w.primary.x,100000))
assert s.kills==1 and w.phase=='respawn' and s.story.quests[quest].count==1
core.action(s,'story_fast:'+hub)
core.action(s,'story_report:'+quest)
restored=core.restore(lua.table_from(save(),recursive=True))
assert restored.story.quests[quest].status=='complete' and restored.weeklySlots[uid].primary.hp==0

proof={'manifest_cards':[row['id'] for row in cards],
       'p1_floor_p2_invulnerable_transition':True,'two_cores_any_one':True,
       'dedup_no_synthetic_reaction_credit':True,'minimum_actor_target_gap_ticks':12,
       'first_projectile_volley_single_hit':True,'wall_floor_path_no_push':True,'wall_upper_path_push_30_8_px_no_damage':True,
       'wall_and_reservations_cleared_on_break':True,'deadline_inclusive_tick':1800,
       'exposure_half_open':[60,780],'ordinary_damage_on_timeout':True,
       'mimic_only_attacks':True,'two_ordinary_before_repeat':True,'clear_report_restore':True}
(ROOT/'evidence/heretic-weekly-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Heretic Lua: two health pools, credit, moving wall, deadline, exposure, failure, rewards and save validated')
