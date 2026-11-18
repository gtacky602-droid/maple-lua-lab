"""Exercise the Apep weekly phases, defense accounting and real arena controls."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub,node,quest='sumeru-hub','apep-oasis-heart-arena','apep-weekly-commission'
uid='boss-29080101'
manifest=json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_SUMERU.json').read_text(encoding='utf8'))
ticks=lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
walk=lua.eval('function(C,s,n,hold) for i=1,n do C.step(s,1/60,{right=true,jump=hold}) end end')


def act(s,key):
    core.action(s,key)


def save(s):
    return validate_save(native(core.checkpoint(s)))


def place(a,x,y=480):
    a.x,a.y,a.vy,a.ground,a.inv=x,y,0,True,0


def start():
    s=core.new(12)
    act(s,'story_start')
    core.grantExp(s,LEVELS[67]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def arena():
    s=start()
    core.enterStoryNode(s,node)
    w,spec=core.currentWeeklyBoss(s)
    s.actors[2].hp=0
    place(s.actors[1],35)
    return s,w,spec


def hit(s,x,atk=10000):
    a=s.actors[1]
    place(a,x-34)
    a.dir,a.atk,a.lock,a.cd.normal=1,atk,0,0
    assert core.attack(s,a,'normal')


def events(s,key):
    return [e for e in s.events.values() if e.kind=='apep:'+key]


def defense(s,w,spec):
    hit(s,w.primary.x)
    assert w.stage=='expose' and w.primary.hp==spec.primeHp and s.kills==0
    ticks(core,s,spec.moves.WP05.total-1)
    assert w.stage=='expose' and not core.frame(s).weeklyBoss.damageable
    ticks(core,s,1)
    assert w.stage=='defense' and w.defense.progress==25 and len(w.defense.units)==0
    assert core.frame(s).weeklyBoss.phaseHp is None
    return w.defense


def prime(s,w,spec):
    d=defense(s,w,spec)
    d.delta=75
    ticks(core,s,1)
    assert w.stage=='rebirth' and w.defense is None
    ticks(core,s,spec.moves.WP13.total)
    assert w.stage=='prime' and w.primary.hp==spec.primeHp


def move(s,w,spec,key):
    order=spec.order[1 if w.stage=='dark' else 2]
    w.index=list(order.values()).index(key)+1
    w.rest=0
    ticks(core,s,1)
    assert w.cast.key==key
    return w.cast


def queue(s,w,roles):
    d=w.defense
    d.queue=lua.table_from([{'roles':roles,'due':d.t+1,'index':1}],recursive=True)
    d.waves=lua.table_from([True,True,True])
    ticks(core,s,1)
    return list(d.units.values())


checked={}
for row in [*manifest['entries'],*manifest['variants']]:
    key=row['id']
    if not key.startswith('WP') or 'total_ticks' not in row:
        continue
    s,w,spec=arena()
    m=spec.moves[key]
    assert (m.total,m.recovery)==(row['total_ticks'],row['recovery'][0]),key
    assert list(native(m.locks))==row['lock_ticks'] and list(native(m.windows))==row['active_windows'],key
    assert list(native(m.launches))==[t for q in row.get('projectiles',[]) for t in q['spawn_ticks']],key
    if key not in set(spec.order[1].values())|set(spec.order[2].values()):
        continue
    if key in ('WP14','WP15','WP01_PRIME'):
        prime(s,w,spec)
    c=move(s,w,spec,key)
    if key=='WP03':
        ticks(core,s,48)
        assert w.primary.underground and all(e.underground for e in w.parts.values())
        ticks(core,s,102)
        assert not w.primary.underground
    ticks(core,s,m.total-c.t)
    start_event=events(s,key)[0]
    assert w.cast is None and c.t==m.total
    for name,field in [('lock',m.locks),('launch',m.launches)]:
        assert [round((e.t-start_event.t)*60) for e in events(s,key+':'+name)]==list(field.values()),key
    checked[key]=c.t

s,w,spec=arena()
c=lua.table_from({'id':1,'radial':True,'x':480,'y':480,'range':460,'limit':7,'atk':40,
                   'mult':1,'element':'physical','gain':0,'color':'#fff'})
core.resolveCast(s,c)
assert s.hits==1 and all(e.sharedHealth.id==w.primary.id for e in w.parts.values())
s,w,spec=arena()
d=defense(s,w,spec)
ticks(core,s,59)
assert not len(d.units)
ticks(core,s,1)
assert len(d.units)==4 and d.progress==26
d.progress=97;d.t=119
one,_,second_on_left,striker=list(d.units.values())
second_on_left.x=280
striker.x=447
striker.cast=lua.table_from({'t':59,'key':'WP07','move':spec.moves.WP07,'done':lua.table()})
hit(s,one.x)
assert d.progress==97 and d.delta==3
ticks(core,s,1)
assert d.progress==97 and w.stage=='defense' and d.kills==1
assert events(s,'WP06:heart') and s.kills==0
d.progress=3;d.delta=-4
ticks(core,s,1)
assert w.stage=='failed' and w.defense is None and s.returns==0
act(s,'encounter_interact')
assert w.stage=='defense' and w.defense.progress==25 and not len(w.defense.units)

s,w,spec=arena()
d=defense(s,w,spec)
ticks(core,s,60)
d.progress=80
ticks(core,s,1)
scheduled=[q.due for q in d.queue.values()]
assert scheduled==[360,660,960]
d.progress=26
ticks(core,s,1)
d.progress=80
ticks(core,s,1)
assert [q.due for q in d.queue.values()]==scheduled
peak=0
for _ in range(12):
    d.progress=80
    ticks(core,s,80)
    peak=max(peak,len(d.units))
assert peak==8 and len(d.units)<=8

s,w,spec=arena()
d=defense(s,w,spec)
guardian,seed,breeder,linked=queue(s,w,['warden','melee','breeder','ranged'])
guardian.x,seed.x,breeder.x,linked.x=178,318,713,730
ticks(core,s,35)
assert seed.guard.id==guardian.id and linked.breeder.id==breeder.id and not linked.guard
assert breeder.shell==1
hit(s,seed.x)
assert seed.hp>0 and d.delta==0
hit(s,guardian.x)
assert guardian.hp==0 and d.delta==8
hit(s,seed.x)
assert seed.hp==0 and d.delta==11
breeder.x=linked.x-155
hit(s,linked.x)
assert linked.hp==0 and breeder.shell==0

s,w,spec=arena()
d=defense(s,w,spec)
eater,food=queue(s,w,['eater','melee'])
eater.x,food.x=280,332
place(s.actors[1],370)
ticks(core,s,90)
assert food.hp==0 and eater.fed and d.kills==0 and not events(s,'WP06:defeated')
assert events(s,'WP06:consumed')

s,w,spec=arena()
d=defense(s,w,spec)
barrier,=queue(s,w,['barrier'])
barrier.x=258
ticks(core,s,120)
assert len(d.walls)==2 and d.walls[1].hp==2
a=s.actors[1]
place(a,220)
w.actorX[1]=220
walk(core,s,18,False)
assert a.x==241 and a.y==480
act(s,'jump')
walk(core,s,40,True)
assert a.x>289
act(s,'encounter_target:wall1')
assert d.wallTarget==d.walls[1].id
wall=d.walls[1]
hit(s,wall.x,3)
assert wall.hp==1
hit(s,wall.x,3)
assert wall.hp==0 and d.wallTarget is None and d.kills==0
ticks(core,s,1)
act(s,'encounter_target:wall1')
assert d.wallTarget is None
act(s,'encounter_target:wall2')
assert d.wallTarget==d.walls[1].id and d.walls[1].slot==2

s,w,spec=arena()
d=defense(s,w,spec)
burst,=queue(s,w,['burst'])
burst.x=455
ticks(core,s,25)
assert burst.cast.key=='WP12'
ticks(core,s,149-burst.cast.t)
hit(s,burst.x)
ticks(core,s,1)
assert burst.hp==0 and d.kills==1 and not events(s,'WP06:burst'),(burst.hp,d.kills,[(e.kind,e.value) for e in s.events.values()][-12:])
assert not events(s,'WP06:heart')

s,w,spec=arena()
d=defense(s,w,spec)
burst,=queue(s,w,['burst'])
burst.x=455
ticks(core,s,175)
assert burst.hp==0 and d.kills==0 and events(s,'WP06:burst')
assert events(s,'WP06:heart')
d.progress=97
d.delta=3
ticks(core,s,1)
assert w.stage=='rebirth' and w.defense is None and len(s.enemies)==3 and s.kills==0

s,w,spec=arena()
prime(s,w,spec)
w.normal=2;w.rest=0
a,ally=s.actors[1],s.actors[2]
place(a,132)
ally.hp=140
place(ally,160,355)
ticks(core,s,1)
assert w.stage=='shelter' and w.wave.t==0
ticks(core,s,59)
assert not core.frame(s).weeklyBoss.apep.protected
ticks(core,s,1)
assert core.frame(s).weeklyBoss.apep.protected
assert all(v.open for v in core.frame(s).weeklyBoss.apep.domes.values())
ticks(core,s,660)
assert w.stage=='weak' and w.wave is None
assert [e.value for e in events(s,'WP17:protected') if e.actor==1]==[1,2,3,4]
assert [e.value for e in events(s,'WP17:protected') if e.actor==2]==[1,2,3,4]
ticks(core,s,60)
assert core.frame(s).weeklyBoss.apep.exposure==480 and not w.primary.invulnerable
before=w.primary.hp
hit(s,w.primary.x,12)
assert w.primary.hp<before
ticks(core,s,480)
assert core.frame(s).weeklyBoss.apep.exposure is None and not w.primary.invulnerable
ticks(core,s,60)
assert w.stage=='prime' and w.normal==0

s,w,spec=arena()
prime(s,w,spec)
w.normal=2;w.rest=0
place(s.actors[1],200)
ticks(core,s,1)
ticks(core,s,240)
assert [e.value for e in events(s,'WP17:hit')]==[1]
hit(s,w.primary.x)
assert w.primary.hp==0 and w.wave is None and not events(s,'WP18')

s=start()
assert core.giveArtifact(s,1,66,3)
act(s,'artifact_equip:1')
s.mora=130000
act(s,'artifact_upgrade:1')
assert core.giveArtifact(s,2,66,3)
act(s,'artifact_equip:2')
(ROOT/'work/apep-weekly-gear.json').write_text(json.dumps(save(s),ensure_ascii=False),encoding='utf8')
act(s,'story_accept:'+quest)
place(s.actors[1],780)
act(s,'story_portal:'+node)
assert s.story.node==node and s.story.quests[quest].status=='active'
w,spec=core.currentWeeklyBoss(s)
d=defense(s,w,spec)
ticks(core,s,60)
core.enterStoryNode(s,hub)
assert w.defense is None
core.enterStoryNode(s,node)
assert w.stage=='dark' and w.primary.hp==spec.hp
prime(s,w,spec)
hit(s,w.primary.x)
assert w.primary.hp==0 and s.kills==1 and s.story.quests[quest].count==1
act(s,'story_fast:'+hub)
act(s,'story_report:'+quest)
restored=core.restore(lua.table_from(save(s),recursive=True))
assert restored.story.quests[quest].status=='complete' and restored.weeklySlots[uid].primary.hp==0

result={'live_timings':checked,'shared_hitbox':True,'same_tick_progress_and_retry':True,'max_live':peak,
        'waves_not_duplicated':True,'guard_and_breeder_never_overlap':True,'prey_without_points':True,
        'obstacle_walk_jump_break':True,'burst_cancelled_by_kill_and_cleanup':True,'domes_through_final_pulse':True,
        'ally_climbs_down_to_shelter':True,'exposed_ticks':480,'outside_damage_and_lethal_cleanup':True,
        'route_report_and_save':True}
(ROOT/'evidence/apep-weekly-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Apep Lua: shared health, six roles, defense settlement, walls and domes, clear and restore passed')
