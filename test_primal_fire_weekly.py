"""Verify the revised Primal Fire design against the live Lua runtime."""
import json
from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub, node = 'natlan-hub', 'primal-fire-sundered-forge'
quest, uid = 'primal-fire-weekly-commission', 'boss-29091101'
advance = lua.eval('function(C,s,n,inp) for i=1,n do C.step(s,1/60,inp) end end')


def step(s, n, **keys):
    advance(core, s, n, lua.table(**keys))


def place(a, x, y=480):
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def start(enter=True):
    s=core.new(12)
    core.action(s,'story_start')
    core.grantExp(s, LEVELS[103]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s,hub)
    if not enter:
        return s
    core.enterStoryNode(s,node)
    s.actors[2].hp=0
    place(s.actors[1],50)
    w,spec=core.currentWeeklyBoss(s)
    return s,w,spec


def events(s, key):
    return [e for e in s.events.values() if e.kind=='primal:'+key]


def choose(s,w,spec,key):
    order=spec.first if w.form==1 else spec.second
    w.index=list(order.values()).index(key)+1
    w.rest,w.cast=0,None
    step(s,1)
    assert w.cast.key==key, key
    return w.cast


def normal(s, x, atk=4):
    a=s.actors[s.active]
    place(a,x-75)
    a.dir,a.atk,a.lock,a.cd.normal=1,atk,0,0
    assert core.attack(s,a,'normal')


def frame(s):
    return native(core.frame(s,'sprite','sprite').weeklyBoss.primal)


s,w,spec=start()
manifest=json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_PRIMAL_GATE.json').read_text(encoding='utf8'))
cards=[]
for r in manifest['entries']:
    if r['boss']!='primal_fire':
        continue
    key=r['id']
    cards.append(key)
    if key=='WG18':
        assert (spec.erosion.delay,spec.erosion.cap,spec.erosion.ratio)==(120,4,.015)
        assert spec.ground.limit==3
        continue
    m=spec.moves[key]
    assert m.total==r.get('total_ticks',r.get('deadline_ticks')), key
    assert list(native(m.locks))==r.get('lock_ticks',[]), key
    assert list(native(m.windows))==r.get('active_windows',r.get('scripted_windows',[])), key
    assert list(native(m.projectiles))==r.get('projectiles',[]), key
    if key in ('WG05','WG16'):
        assert (m.units,native(m.accept))==(12,[60,780])

normal(s,w.primary.x+15)
hits=[e for e in s.events.values() if e.kind=='hit']
assert len(hits)==1 and spec.hp-w.primary.hp==hits[0].value

s,w,spec=start()
c=choose(s,w,spec,'WG05')
step(s,59)
assert not len(w.objects)
step(s,1)
g=w.objects[1]
assert c.t==60 and g.hp==12 and w.primary.invulnerable
hp=w.primary.hp
normal(s,g.x)
step(s,7)
assert g.hp==11 and w.primary.hp==hp
normal(s,g.x)
assert g.hp==11
step(s,30)
for _ in range(11):
    s.actors[1].inv=2
    normal(s,g.x)
    step(s,36)
assert w.cast.key=='WG17' and not len(w.objects) and not len(c.shots)
assert sum(e.value for e in events(s,'WG05:gate'))==12
assert not events(s,'WG05:failed') and w.primary.hp==hp
step(s,59-w.cast.t)
assert w.primary.invulnerable
step(s,1)
assert w.phase=='exposed' and frame(s)['exposure']==480
normal(s,w.primary.x)
assert w.primary.hp<hp
step(s,480)
assert w.primary.invulnerable and w.phase=='collapse'

s,w,spec=start()
c=choose(s,w,spec,'WG05')
step(s,780)
assert len(events(s,'WG05:failed'))==1 and not len(w.objects) and not w.primary.invulnerable
step(s,59)
assert not len(c.shots)
step(s,1)
assert len(c.shots)==1 and c.shots[1].last==930

s,w,spec=start()
w.form=2
c=choose(s,w,spec,'WG16')
step(s,779)
o=w.objects[1]
o.hp=1
normal(s,o.x+240)
pending=s.pending[len(s.pending)]
pending.x,pending.dir,pending.next=o.x-75,1,s.t+1/60
step(s,1)
assert w.cast.key=='WG15' and o.hp==1 and not len(w.objects)

s,w,spec=start()
c=choose(s,w,spec,'WG06')
step(s,60)
buds=list(w.objects.values())
assert len(buds)==3 and all(o.hp==4 for o in buds)
first_id=buds[0].id
for _ in range(3):
    normal(s,buds[0].x)
    step(s,24)
step(s,180-c.t)
assert len(c.shots)==3
normal(s,buds[0].x)
assert events(s,'WG06:broken')[0].value==first_id
assert len(c.shots)==2 and all(p.owner.id!=first_id for p in c.shots.values())
step(s,720-c.t)
assert w.cast.key=='WG07' and not len(w.objects)

s,w,spec=start()
a,ally=s.actors[1],s.actors[2]
place(a,350)
c=choose(s,w,spec,'WG07')
step(s,132)
assert len(w.actors[a].marks)==1 and not len(w.actors[ally].marks)
due=w.actors[a].marks[1].due
assert due-w.clock==120
ally.hp=ally.maxhp
core.healActor(s,a,a.maxhp)
core.action(s,'swap')
assert s.active==2 and len(w.actors[a].marks)==1
place(ally,740)
step(s,45)
place(a,740)
place(ally,760)
step(s,due-w.clock-1)
assert not events(s,'WG18:resolve')
a.inv=0
before=a.hp
step(s,1)
assert events(s,'WG18:resolve')[-1].actor==1 and a.hp<before

s,w,spec=start()
place(s.actors[1],420)
c=choose(s,w,spec,'WG01')
step(s,161)
assert not len(w.ground)
step(s,1)
assert len(w.ground)==1 and w.ground[1].expires-w.clock==300
step(s,170)
assert w.cast is None and len(w.ground)==1
step(s,130)
assert not len(w.ground)

s,w,spec=start()
a=s.actors[1]
w.primary.hp=spec.hp*.20
step(s,spec.noticeTicks+1)
assert w.cast.key=='WG08'
step(s,300)
assert w.form==2 and w.primary.invulnerable
step(s,60+spec.restTicks+1)
assert w.cast.key=='WG09'
step(s,215)
assert s.platforms[1].x==40 and frame(s)['left']==40
step(s,1)
assert s.platforms[1].x==128 and frame(s)['left']==128
assert s.platforms[2].x==198 and s.platforms[1].w==792
place(a,215)
core.action(s,'jump')
step(s,50,jump=True)
assert a.ground and a.y==357
place(a,133)
a.inv=0
before=a.hp
step(s,28,left=True)
assert len(events(s,'WG18:fall'))==1 and 0<a.hp<before
assert a.x>=w.left and a.y==480
place(a,460)
for _ in range(6600):
    a.inv=2
    step(s,1)
    if w.cuts==3:
        break
commits=events(s,'WG09:commit')
assert [e.value for e in commits]==[128,216,304], [e.value for e in commits]
assert all(b.t-a.t>=10 for a,b in zip(commits,commits[1:]))
assert s.platforms[1].w==616
place(a,460)
core.healActor(s,a,a.maxhp)
c=choose(s,w,spec,'WG14')
step(s,60)
assert len(w.objects)==3 and all(o.hp==6 and 304<o.x<920 for o in w.objects.values())
for o in list(w.objects.values()):
    for _ in range(6):
        normal(s,o.x)
        step(s,36)
assert w.cast.key=='WG17' and not len(w.objects) and not len(c.shots)

s=core.new(12)
core.action(s,'story_start')
core.enterStoryNode(s,node)
w,spec=core.currentWeeklyBoss(s)
normal(s,w.primary.x,atk=10000)
a=s.actors[1]
place(a,31,527)
before=a.hp
step(s,1)
assert a.hp==before and a.x>w.left and a.y==480

s=start(False)
s.mora=350000
assert core.giveArtifact(s,1,82,3)
core.action(s,'artifact_equip:1')
core.action(s,'artifact_upgrade:1')
assert core.giveArtifact(s,2,40,3)
core.action(s,'artifact_equip:2')


def save():
    return validate_save(native(core.checkpoint(s)))


(ROOT/'work/primal-fire-weekly-gear.json').write_text(json.dumps(save(),ensure_ascii=False),encoding='utf8')
core.action(s,'story_accept:'+quest)
place(s.actors[1],351)
core.action(s,'story_portal:'+node)
assert s.story.node==node and s.story.quests[quest].status=='active'
w,spec=core.currentWeeklyBoss(s)
normal(s,w.primary.x,atk=10000)
assert w.primary.hp==0 and s.kills==1 and s.story.quests[quest].count==1
assert not len(w.objects) and not len(w.ground) and len(s.enemies)==0
core.action(s,'story_fast:'+hub)
core.action(s,'story_report:'+quest)
s2=core.restore(lua.table_from(save(),recursive=True))
assert s2.story.quests[quest].status=='complete' and s2.weeklySlots[uid].primary.hp==0

result={'manifest_cards':cards,'shared_hp_contact_dedup':True,'physical_g12_from_tick_60':True,
        'per_actor_barrier_gap':24,'failed_large_orb_tick':840,'deadline_tick_rejects_new_hit':780,
        'buds_remove_owned_shots_and_fail_into_palm':True,
        'exposure_ticks':480,'erosion_owner_and_heal_independence':True,'ground_has_300_tick_life':True,
        'actual_floor_left':[40,128,216,304],'last_floor_width':616,'cuts_spaced_by_at_least_600_ticks':True,
        'fall_and_ledge_use_real_physics':True,'fall_after_victory_returns_to_safe_floor':True,
        'three_pillars_inside_final_floor':True,'reward_report_restore':True}
(ROOT/'evidence/primal-fire-weekly-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Primal Fire Lua: corrected G12 and deadline, erosion, three real floor cuts, final pillars and save passed')
