"""Play and probe all three weekly forms through the actual Lua hit and story paths."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
node, hub, quest = 'childe-golden-house-arena', 'liyue-harbor', 'childe-weekly-commission'
uid = 'boss-29030101'
index = json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_LIYUE.json').read_text(encoding='utf8'))
move_rows = [x for x in index['entries'] if x['boss']=='childe' and x['kind']=='attack']
ticks = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')


def checkpoint(s):
    return validate_save(native(core.checkpoint(s)))


def restored(s):
    return core.restore(lua.table_from(checkpoint(s), recursive=True))


def act(s, key):
    core.action(s,key)


def start():
    s=core.new(12)
    act(s,'story_start')
    core.grantExp(s,LEVELS[27]['maple_reference_total_exp_to_reach'],'quest')
    core.enterStoryNode(s,hub)
    return s


def place(a,x,y=480,face=1):
    a.x,a.y,a.vy,a.dir,a.ground=x,y,0,face,True


def arena():
    s=start()
    core.enterStoryNode(s,node)
    w,spec=core.currentWeeklyBoss(s)
    s.actors[1].inv=0
    s.actors[2].lock=99999
    return s,w,spec


def decisive(s,w,atk=10000):
    a=s.actors[1]
    a.atk,a.lock,a.cd.normal=atk,0,0
    place(a,w.primary.x-52,w.primary.y)
    return core.attack(s,a,'normal')


def form(s,w,spec,number):
    while w.form<number:
        assert decisive(s,w)
        ticks(core,s,spec.transitions[w.form].total)
    s.actors[1].atk=4


def move(s,w,spec,name,x=280,y=480):
    a=s.actors[1]
    place(a,x,y)
    w.index=list(spec.orders[w.form].values()).index(name)+1
    w.rest=0
    if name in ('WC02','WC05'):
        w.marks[s]='hydro'
    elif name=='WC10':
        w.marks[s]='electro'
    ticks(core,s,1)
    assert w.cast.id==name
    return w.cast


def events(s, event):
    return [e for e in s.events.values() if e.kind==event]


s,w,spec=arena()
assert [sum(spec.phaseHp.values()),spec.hp]==[960,960]
for row in move_rows:
    spec_move=spec.moves[row['id']]
    assert (spec_move.total,spec_move.recovery)==(row['total_ticks'],row['recovery'][0])
    assert native(spec_move.locks)==row['lock_ticks'] and native(spec_move.windows)==row['active_windows']

marked=s.actors[1]
archery=move(s,w,spec,'WC01',322)
ticks(core,s,37)
locked=archery.origin,archery.dir
place(marked,322,480)
marks=marked.hp
ticks(core,s,46)
assert archery.origin==locked[0] and archery.dir==locked[1]
assert w.marks[s]=='hydro' and marked.hp<marks and len(events(s,'childe:WC01:hit'))==1
act(s,'swap')
assert s.active==2 and w.marks[s]=='hydro'
place(s.actors[2],spec.edge-2)
ticks(core,s,1)
assert w.marks[s] is None and len(events(s,'childe:cleanse'))==1

s,w,spec=arena()
c=move(s,w,spec,'WC02',221,372)
ticks(core,s,54)
assert c.rainY==372
target=c.points[1]
place(s.actors[1],target,480)
ticks(core,s,42)
assert not events(s,'childe:WC02:hit')

s,w,spec=arena()
c=move(s,w,spec,'WC05',253)
ticks(core,s,73)
a=s.actors[1]
assert abs(c.emerge-c.land)>190
place(a,c.emerge)
ticks(core,s,49)
assert any(e.actor==1 and e.value==1 for e in events(s,'childe:WC05:hit'))
place(a,(c.emerge+c.land)/2)
hp=a.hp
ticks(core,s,64)
assert a.hp==hp
place(a,c.land)
ticks(core,s,19)
assert [e.value for e in events(s,'childe:WC05:hit') if e.actor==1]==[1,2]
ticks(core,s,48)
assert w.phase=='recovery' and c.total-c.recovery==180

for attack,should_counter in [('old',False),('ai',False),('manual',True)]:
    s,w,spec=arena()
    a=s.actors[1]
    c=move(s,w,spec,'WC06',w.primary.x-70)
    ticks(core,s,50)
    if attack=='manual':
        assert core.attack(s,a,'normal')
    else:
        raw={'id':1,'key':'normal','x':a.x,'y':a.y,'dir':1,'atk':4,'range':130,'limit':1,
             'gain':0,'mult':1,'element':'physical','color':'#ffffff',
             'startedAt':s.t-(2 if attack=='old' else 0),'growthAI':attack=='ai'}
        core.resolveCast(s,lua.table_from(raw))
    assert bool(c.counter)==should_counter
    ticks(core,s,72)
    assert (c.total,c.recovery)==((270,192) if should_counter else (198,120))
    assert len(events(s,'childe:guard-reserved'))==int(should_counter)

for cleanse_at in (60,105):
    s,w,spec=arena()
    form(s,w,spec,2)
    a=s.actors[1];a.inv=0
    c=move(s,w,spec,'WC10',626)
    ticks(core,s,cleanse_at)
    position=c.land
    place(a,spec.edge-2)
    ticks(core,s,1)
    assert w.marks[s] is None
    if cleanse_at==60:
        assert c.cancelled and c.total==144
        ticks(core,s,90)
        assert not events(s,'childe:WC10:hit')
    else:
        assert not c.cancelled and c.land==position
        place(a,position)
        ticks(core,s,45)
        assert any(e.actor==1 for e in events(s,'childe:WC10:hit'))

s,w,spec=arena()
form(s,w,spec,2)
c=move(s,w,spec,'WC08',641)
ticks(core,s,89)
a=s.actors[1];a.inv=0
place(a,c.finish+c.dir*171)
ticks(core,s,99)
assert not any(e.actor==1 for e in events(s,'childe:WC08:hit'))
ticks(core,s,8)
assert [e.value for e in events(s,'childe:WC08:hit') if e.actor==1]==[4]

s,w,spec=arena()
form(s,w,spec,2)
c=move(s,w,spec,'WC09',674)
ticks(core,s,95)
finish=c.segments[1].finish
ticks(core,s,37)
assert c.segments[2].start==finish
ticks(core,s,97)
assert [e.value for e in events(s,'childe:WC09:lock')]==[1,2,3]

s,w,spec=arena()
form(s,w,spec,3)
c=move(s,w,spec,'WC11',346)
place(s.actors[1],366)
ticks(core,s,194)
assert [e.value for e in events(s,'childe:WC11:hit') if e.actor==1]==[1,2]

seen={}
for row in move_rows:
    name=row['id']
    s,w,spec=arena()
    form(s,w,spec,3 if name in ('WC11','WC12') else 2 if name in ('WC07','WC08','WC09','WC10') else 1)
    c=move(s,w,spec,name)
    ticks(core,s, min(c.total-1,c.recovery))
    assert len(c.arrows)==0 and w.cast.id==name and w.phase=='recovery'
    seen[name]=c.recovery

s,w,spec=arena()
s.actors[2].hp=0
w.marks[s]='hydro'
old=s.mora,s.kills
assert decisive(s,w) and w.primary.hp==720 and w.shift and w.marks[s] is None
assert w.primary.invulnerable and w.cast is None and (s.mora,s.kills)==old
ticks(core,s,120)
assert w.form==2 and w.primary.invulnerable and decisive(s,w) and w.primary.hp==720
mid=restored(s)
assert not mid.weeklySlots[uid].shift and mid.weeklySlots[uid].primary.hp==960
ticks(core,s,60)
assert not w.shift and decisive(s,w) and w.primary.hp==420
ticks(core,s,180)
assert w.form==3 and w.primary.invulnerable and decisive(s,w) and w.primary.hp==420
ticks(core,s,60)
assert decisive(s,w) and w.waitUntil and s.kills==old[1]+1
assert s.endgame.bosses[uid].clears==1
assert checkpoint(s)['weeklyBosses'][uid]['hp']==0

fight=start()
act(fight,'story_accept:'+quest)
assert fight.story.quests[quest].status=='active'
assert core.giveArtifact(fight,2,32,3)
act(fight,'artifact_equip:1')
fixture=checkpoint(fight)
fixture['story']['quests'].pop(quest)
(ROOT/'work/childe-weekly-gear.json').write_text(json.dumps(fixture,ensure_ascii=False),encoding='utf8')
place(fight.actors[1],1040)
act(fight,'story_portal:'+node)
assert fight.story.node==node
fight.actors[2].hp=0
run=lua.eval("""function(C,s)
 local p=s.actors[1]; local w=C.currentWeeklyBoss(s); local b=w.primary
 local phases={}
 for i=1,10000 do
  local delta=b.x-p.x
  local move=math.abs(delta)>66
  local cast=w.cast
  local jump=cast and ((cast.id=='WC01' and cast.tick>=48 and cast.tick<195) or cast.id=='WC03' or cast.id=='WC09')
  if jump and p.ground and p.y>=475 then C.action(s,'jump') end
  C.step(s,1/60,{right=move and delta>0,left=move and delta<0,jump=jump,attack=not b.invulnerable})
  phases[w.form]=true
  if w.waitUntil or s.returns>0 then return i,p.hp,b.hp,s.returns,phases end
 end
 return 10000,p.hp,b.hp,s.returns,phases
end""")
elapsed,hp,boss_hp,returns,forms=run(core,fight)
assert boss_hp==0 and returns==0 and list(forms.values())==[True,True,True]
assert fight.story.quests[quest].count==1
act(fight,'story_fast:'+hub)
act(fight,'story_report:'+quest)
paid=fight.mora
act(fight,'story_report:'+quest)
assert fight.story.quests[quest].status=='complete' and fight.mora==paid
assert restored(fight).weeklySlots[uid].waitUntil is not None

(ROOT/'evidence/childe-weekly-lua.json').write_text(json.dumps({
 'timelines':seen,'riptide_swap_boundary':True,'rain_platform_only':True,
 'whale_two_windows':True,'guard_reservation_filters':True,'locked_drop_position':True,
 'phase_overspill_and_invulnerability':True,'one_clear_and_reload':True,
 'normal_only_solo':{'atk':fight.actors[1].atk,'seconds':round(elapsed/60,2),'hp':hp,'returns':returns}
},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Childe: all WC01–12 timings, mark, both transitions, legitimate clear and persisted report passed')
