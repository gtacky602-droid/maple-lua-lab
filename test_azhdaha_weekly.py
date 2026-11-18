"""Verify the Azhdaha timelines, live combat, marks, one hitbox and story rewards."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
node, hub, quest = 'azhdaha-dragon-seal-arena', 'liyue-harbor', 'azhdaha-weekly-commission'
uid = 'boss-29040101'
ticks = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')
config = json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_LIYUE.json').read_text(encoding='utf8'))


def act(s, key):
    core.action(s, key)


def saved(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(saved(s),recursive=True))


def place(a,x,y=480,dir=1):
    a.x,a.y,a.vy,a.dir,a.ground=x,y,0,dir,True


def start(pair='pyro:cryo'):
    s=core.new(12)
    act(s,'story_start')
    core.grantExp(s,LEVELS[31]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    act(s,'azhdaha_pair:'+pair)
    return s


def arena(pair='pyro:cryo'):
    s=start(pair)
    core.enterStoryNode(s,node)
    w,spec=core.currentWeeklyBoss(s)
    s.actors[2].hp=0
    place(s.actors[1],75)
    s.actors[1].inv=0
    return s,w,spec


def set_form(s,w,form):
    while w.form<form:
        w.primary.hp=990 if w.form==1 else 490
        ticks(core,s,1)
        assert w.cast.id=='WZ09' and w.primary.invulnerable
        old=w.form
        ticks(core,s,395)
        assert w.form==old and w.primary.invulnerable
        ticks(core,s,1)
        assert w.form==old+1 and not w.primary.invulnerable
        ticks(core,s,144)
        assert not w.cast


def move(s,w,spec,name,x=75):
    a=s.actors[1]
    place(a,x)
    w.index=list(spec.orders[w.form].values()).index(name)+1
    w.rest=0
    ticks(core,s,1)
    assert w.cast.id==name
    return w.cast


def events(s,name,actor=None):
    return [e for e in s.events.values() if e.kind=='azhdaha:'+name and (actor is None or e.actor==actor)]


_,_,spec=arena()
rows=[row for row in config['entries']+config['variants'] if row['id'].startswith('WZ') and row['id']!='WZ13']
for row in rows:
    m=spec.moves[row['id']]
    assert m.total==row['total_ticks'] and m.recovery==row['recovery'][0]
    assert native(m.windows)==row['active_windows'] and native(m.locks)==row['lock_ticks']

branches={}
for pair in ('pyro:cryo','pyro:electro','hydro:cryo','hydro:electro'):
    s,w,spec=arena(pair)
    act(s,'azhdaha_pair:pyro:cryo')
    expected=pair.split(':')
    assert native(core.frame(s).weeklyBoss.elementSlots)==expected
    set_form(s,w,3)
    assert [event.value for event in events(s,'WZ09')]==[1,2]
    assert w.primary.hp==490
    c=move(s,w,spec,'WZ04',380)
    assert c.variant=='WZ04.infused' and c.element==expected[1]
    ticks(core,s,43)
    a=s.actors[1]
    place(a,c.zone)
    a.inv=0
    ticks(core,s,50)
    assert events(s,'WZ04:hit:'+expected[1],1)
    assert w.marks[1].element==expected[1]
    branches[pair]=[c.variant,c.element]

tested_moves={}
for row in rows:
    variant=row['id'];name=variant.split('.')[0]
    if name=='WZ09':
        continue
    pair='hydro:cryo' if variant.endswith('.hydro') else 'pyro:cryo' if variant.endswith('.cryo') else 'pyro:electro'
    s,w,spec=arena(pair)
    set_form(s,w,3 if name in ('WZ11','WZ12','WZ14') or '.' in variant and name in ('WZ04','WZ05')
             else 2 if name=='WZ10' else 1)
    c=move(s,w,spec,name)
    assert c.variant==variant
    ticks(core,s,c.move.recovery)
    assert w.phase=='recovery' and len(c.objects)==0
    tested_moves[variant]=c.move.recovery

s,w,spec=arena()
c=move(s,w,spec,'WZ08')
ticks(core,s,73)
assert w.primary.underground and w.primary.invulnerable and not core.frame(s).weeklyBoss.damageable
a=s.actors[1];place(a,w.primary.x-50)
hp=w.primary.hp
assert core.attack(s,a,'normal') and w.primary.hp==hp
ticks(core,s,227)
assert not w.primary.underground and core.frame(s).weeklyBoss.damageable

s,w,spec=arena()
set_form(s,w,2)
a=s.actors[1]
assert core.attack(s,a,'SK20')
a.waterShield.hp=1
c=move(s,w,spec,'WZ01',335)
ticks(core,s,47)
place(a,c.origin+c.dir*110)
a.inv=0
ticks(core,s,30)
assert a.waterShield is None and not w.marks[1]
assert len(events(s,'WZ01:hit:pyro',1))==1
ticks(core,s,139)
c=move(s,w,spec,'WZ01',335)
ticks(core,s,47)
place(a,c.origin+c.dir*110)
a.inv=0
ticks(core,s,26)
assert w.marks[1].element=='pyro'
core.healActor(s,a,25)
assert w.marks[1]
s.actors[2].hp=120
act(s,'swap')
assert s.active==2 and w.marks[1] and not w.marks[2]
place(a,32)
place(s.actors[2],32)
s.actors[2].lock=99999
ticks(core,s,480)
assert len(events(s,'mark-tick:pyro',1))==7 and not w.marks[1]

s,w,spec=arena()
set_form(s,w,2)
a=s.actors[1]
c=move(s,w,spec,'WZ01',335)
ticks(core,s,47)
place(a,c.origin+c.dir*110)
ticks(core,s,26)
assert w.marks[1]
assert core.attack(s,a,'SK20')
ticks(core,s,1)
assert w.marks[1] is None and events(s,'mark-cleansed',1)

s,w,spec=arena('pyro:electro')
set_form(s,w,2)
c=move(s,w,spec,'WZ10')
peaks=[]
for point in (132,204,264,276,408):
    ticks(core,s,point-c.t)
    peaks.append(len(c.objects))
assert peaks==[1,2,1,2,0]

s,w,spec=arena('hydro:electro')
set_form(s,w,3)
c=move(s,w,spec,'WZ14',955)
ticks(core,s,285)
for group in (1,2):
    impact=[event for event in events(s,'WZ14:impact') if event.value==group]
    burst=[event for event in events(s,'WZ14:secondary') if event.value==group]
    assert len(impact)==len(burst)==1 and abs((burst[0].t-impact[0].t)*60-36)<1e-6
assert not list(c.objects.values())

s,w,spec=arena('hydro:electro')
set_form(s,w,3)
c=move(s,w,spec,'WZ12',278)
walk_to=lua.eval("""function(C,s,x,n)
 for i=1,n do
  local a=s.actors[1]
  C.step(s,1/60,{right=a.x<x-4,left=a.x>x+4})
 end
end""")
ticks(core,s,192)
walk_to(core,s,583,120)
assert core.frame(s).weeklyBoss.x==c.tailX and 352<s.actors[1].x<704
walk_to(core,s,815,120)
assert s.actors[1].x>704 and not events(s,'WZ12:hit:electro',1)

s,w,spec=arena('pyro:cryo')
set_form(s,w,3)
c=move(s,w,spec,'WZ12',455)
ticks(core,s,145)
a=s.actors[1]
place(a,c.slots[1][1]);a.inv=0
ticks(core,s,37)
place(a,c.slots[1][2]);a.inv=0
ticks(core,s,30)
assert [event.value for event in events(s,'WZ12:hit:cryo',1)]==[1]

s,w,spec=arena('hydro:electro')
set_form(s,w,3)
c=move(s,w,spec,'WZ12',105)
ticks(core,s,180)
assert w.tailing and len(s.enemies)==1 and s.enemies[1].id==w.primary.id
old=s.kills,s.mora
a=s.actors[1];place(a,w.primary.x-50);a.atk=10000
assert core.attack(s,a,'normal')
assert w.primary.hp==0 and s.kills==old[0]+1 and s.mora==old[1]+spec.mora and not w.cast
assert not list(w.marks.keys()) and restore(s).weeklySlots[uid].waitUntil

lethal,w,spec=arena()
a=lethal.actors[1];place(a,w.primary.x-42);a.atk=10000
assert core.attack(lethal,a,'normal')
ticks(core,lethal,1)
assert w.waitUntil and w.primary.hp==0 and not events(lethal,'WZ09')

fight=start()
assert core.giveArtifact(fight,2,36,3)
act(fight,'artifact_equip:1')
(ROOT/'work/azhdaha-weekly-gear.json').write_text(json.dumps(saved(fight),ensure_ascii=False),encoding='utf8')
act(fight,'story_accept:'+quest)
place(fight.actors[1],635)
act(fight,'story_portal:'+node)
assert fight.story.node==node
play=lua.eval("""function(C,s)
  local a=s.actors[1];local w=C.currentWeeklyBoss(s);local e=w.primary
  s.actors[2].hp=0
  for tick=1,14000 do
   local cast=w.cast
   local dx=e.x-a.x
   local goal=e.x+(dx>=0 and -76 or 76)
   if cast and cast.id=='WZ09' and cast.t<396 then goal=cast.origin+(a.x<=cast.origin and -328 or 328) end
   local move=goal-a.x;local face=math.abs(move)>7 or (math.abs(dx)>6 and dx*a.dir<0)
   if math.abs(move)<=7 then move=dx end
   local jump=cast and (cast.id=='WZ02' or cast.id=='WZ06')
   if jump and a.ground then C.action(s,'jump') end
   C.step(s,1/60,{left=face and move<0,right=face and move>0,jump=jump,attack=not e.invulnerable and dx*a.dir>=0 and math.abs(dx)<115})
   if e.hp<=0 or s.returns>0 then return tick,a.hp,e.hp,s.returns,a.atk end
  end
  return 14000,a.hp,e.hp,s.returns,a.atk
end""")
duration,hp,enemy,returns,atk=play(core,fight)
assert enemy==0 and returns==0 and len(events(fight,'WZ09'))==2
assert fight.story.quests[quest].count==1
act(fight,'story_fast:'+hub)
act(fight,'story_report:'+quest)
reward=fight.mora
act(fight,'story_report:'+quest)
assert fight.story.quests[quest].status=='complete' and fight.mora==reward
assert restore(fight).weeklySlots[uid].primary.hp==0

result={'phase_pairs':branches,'attack_timelines':tested_moves,'burrow_target_disabled':True,
        'shield_break_no_mark_and_cleanse':True,'mark_seven_ticks':True,'fire_at_most_two':True,
        'scale_impact_then_36_ticks':True,'electro_three_safe_lanes_walked':True,
        'cryo_group_once':True,'tail_lethal_with_one_reward':True,'lethal_before_absorption':True,
        'normal_only_solo':{'seconds':round(duration/60,2),'hp':hp,'atk':atk,'returns':returns}}
(ROOT/'evidence/azhdaha-weekly-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Azhdaha: 4 element pairs, authored card timings, absorption, single tail target, marks and clear passed')
