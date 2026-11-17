import copy,json
from runtime import ROOT,runtime,native
from experience import LEVELS
from savegame import validate_save

lua,C=runtime();empty=lua.table()
ID='boss-29010101';QUEST='dvalin-weekly-commission';ARENA='dvalin-sky-arena'
spec=json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses'][0]
S=lua.table_from(spec,recursive=True)
def spot(a,x,y=480):a.x,a.y,a.vy,a.ground=x,y,0,True
def ticks(s,n=1,**keys):
 for _ in range(n):C.step(s,1/60,lua.table_from(keys) if keys else empty)
def make():
 s=C.new(12);C.action(s,'story_start');C.grantExp(s,LEVELS[19]['maple_reference_total_exp_to_reach'],'quest')
 C.enterStoryNode(s,'mond-town');C.action(s,'story_accept:'+QUEST);C.enterStoryNode(s,ARENA)
 s.actors[2].hp=0;w=s.weeklySlots[ID];w.phase='combat';spot(s.actors[1],436)
 return s,w,w.primary,s.actors[1]
def move(s,w,id,tick=0):
 w.cast=lua.table_from(dict(move=S.moves[id],tick=tick,seen=lua.table_from([{}, {}, {}],recursive=True),bolts=lua.table(),dir=1))
 w.phase='combat'
def until(s,w,id,tick):
 for _ in range(4000):
  if w.cast and w.cast.move.id==id and w.cast.tick==tick:return w.cast
  ticks(s)
 raise AssertionError((id,tick,s.t,w.primary.hp,s.actors[1].hp))
def cast(s,target,**change):
 return lua.table_from(dict(id=1,atk=4,x=target.x,y=480,dir=1,radial=True,range=150,limit=9,
  mult=1,color='#51ddda',gain=0,element='physical',critRate=0)|change)
def strike(s,p,**change):C.resolveCast(s,cast(s,p,**change))
def expose(s,w):
 move(s,w,'WD02');until(s,w,'WD02',120);strike(s,w.parts[1],atk=1000);ticks(s)
 assert w.cast.move.id=='WD08' and w.breaks==1

# The real scheduler (rather than direct resolveCast only) must reduce shared guard once.
s,w,b,a=make();move(s,w,'WD02');until(s,w,'WD02',120);spot(a,w.parts[2].x-50);a.dir=1
hp=b.hp;C.attack(s,a,'normal');ticks(s,25)
assert w.guard<24 and b.hp==hp and s.kills==s.mora==0
real_guard=w.guard

# An AoE crossing both claws/head shares one receiver per event; later real events count.
s,w,b,a=make();move(s,w,'WD02');until(s,w,'WD02',120)
hit=cast(s,w.parts[1]);hit.x=S.platforms[2].x+132
C.resolveCast(s,hit);assert (w.guard,w.guardHits,b.hp)==(21,1,600)
C.resolveCast(s,hit);assert (w.guard,w.guardHits,b.hp)==(18,2,600)
assert s.kills==s.mora==s.damage==0
# Closed head and claws do not forward HP damage.
move(s,w,'WD02');until(s,w,'WD02',119);strike(s,w.parts[3],atk=1000)
assert b.hp==600 and w.guard==18

# Exposure half-open boundaries, actual vertical reach, and HP-only crystal.
s,w,b,a=make();expose(s,w);cr=w.parts[4]
until(s,w,'WD08',41);strike(s,cr,y=420,atk=24);assert b.hp==600
ticks(s);assert w.cast.tick==42 and not cr.underground
strike(s,cr,y=480,atk=24);assert b.hp==600 # nearest crystal edge is 80px above ground
strike(s,cr,y=420,atk=24);assert b.hp==578
until(s,w,'WD08',461);strike(s,cr,y=420,atk=24);assert b.hp==556
ticks(s);strike(s,cr,y=420,atk=1000);assert b.hp==556 and cr.underground
# The shared pad descends continuously, carrying both actors onto their real platform.
for actor in s.actors.values():actor.hp=140;spot(actor,w.crystalX,420)
previous=420
for _ in range(72):
 ticks(s);assert previous-1e-6<=a.y<=481;previous=a.y
assert a.y==480 and len(s.platforms)==3 and w.cycle==1 and w.guard==24

# An unfinished attempt restarts at full HP/guard on exit and restore; destination floor survives.
save=validate_save(native(C.checkpoint(s)));assert save['weeklyBosses'][ID]['hp']==600
C.enterStoryNode(s,'mond-town');assert len(s.platforms)>0 and max(p.x+p.w for p in s.platforms.values())==1440
C.enterStoryNode(s,ARENA);assert w.primary.hp==600 and w.guard==24 and w.cycle==0
restored=C.restore(lua.table_from(save,recursive=True),12)
assert restored.weeklySlots[ID].primary.hp==600 and restored.weeklySlots[ID].guard==24
for change in ({'hp':300},{'hp':True},{'waitTicks':3601},{'generation':0},{'foreign':1}):
 bad=copy.deepcopy(save);bad['weeklyBosses'][ID].update(change)
 try:validate_save(bad)
 except ValueError:pass
 else:raise AssertionError(change)
legacy=copy.deepcopy(save);del legacy['weeklyBosses'];validate_save(legacy)

# Manual ordinary jumps cross both 39.6px gaps in both directions without fallback.
s,w,b,a=make();move(s,w,'WD01');spot(a,230)
for start,finish,right in [(230,340,True),(570,640,True),(640,550,False),(340,235,False)]:
 spot(a,start);C.action(s,'jump')
 for _ in range(70):
  ticks(s,right=right,left=not right,jump=True)
  if (a.x>=finish if right else a.x<=finish):break
 ticks(s,65)
 assert a.hp>0 and a.ground and a.y==480 and w.falls==0,(a.x,a.y,w.falls)

# Hit windows are fixed at lock; the other full platforms always offer >1.2U safe space.
damage={}
for id,lock,at,end in [('WD01',42,72,102),('WD02',36,90,102),('WD06',60,180,192),('WD07',60,120,132)]:
 s,w,b,a=make();move(s,w,id);c=until(s,w,id,lock);fixed=(c.left,c.right)
 spot(a,800);until(s,w,id,at-1);hp=a.hp;assert (c.left,c.right)==fixed
 ticks(s,end-at+1);assert a.hp==hp
 move(s,w,id);spot(a,436);c=until(s,w,id,lock)
 spot(a,(c.biteLeft+c.biteRight)/2 if id=='WD02' else c.points[1] if id=='WD07' else c.center)
 until(s,w,id,at-1);hp=a.hp;until(s,w,id,end)
 assert hp-a.hp==S.moves[id].damage,(id,hp,a.hp)
 damage[id]=hp-a.hp

# Breath repeats at >=30 ticks; bolt pairs accept at most one hit each and use frozen paths.
s,w,b,a=make();move(s,w,'WD03');c=until(s,w,'WD03',48);spot(a,c.center)
last=None;hit_ticks=[]
for _ in range(240):
 hp=a.hp;ticks(s)
 if a.hp<hp:hit_ticks.append(c.tick)
assert hit_ticks and all(b-a>=30 for a,b in zip(hit_ticks,hit_ticks[1:]))
s,w,b,a=make();move(s,w,'WD04');c=until(s,w,'WD04',54);paths=native(c.targets)
spot(a,paths[0]);until(s,w,'WD04',180)
assert len(c.bolts)==4 and all(p.ended for p in c.bolts.values())
assert native(c.targets)==paths and a.hp==140-2*16

# Guard break precedes the breath's next real damage window and discards its cast.
s,w,b,a=make();move(s,w,'WD03');until(s,w,'WD03',89);spot(a,w.cast.left)
old=w.cast;strike(s,w.parts[1],atk=1000);hp=a.hp;ticks(s)
assert w.cast.move.id=='WD08' and w.breaks==1 and a.hp==hp and b.hp==600

# Hazard lasts 600 active ticks, respects airborne/safe actors and pauses/re-warns on down.
s,w,b,a=make();move(s,w,'WD05');until(s,w,'WD05',179);ticks(s)
assert w.hazard.zone==2 and w.hazard.remaining==599
spot(a,800);ticks(s,30);assert a.hp==130 # one creation-tick hit before moving
remaining=w.hazard.remaining;expose(s,w);remaining=w.hazard.remaining
ticks(s,200);assert w.hazard.remaining==remaining and w.hazard.warning==60
until(s,w,'WD08',533);ticks(s);assert w.hazard.warning==60
ticks(s,59);assert w.hazard.remaining==remaining
ticks(s);assert w.hazard is None # next WD05 replaces it only after its own fresh 60-tick warning

# HP zero during exposure wins once; pending boss attacks disappear, quest/report/respawn persist.
s,w,b,a=make();expose(s,w);until(s,w,'WD08',42);b.hp=1;hp=a.hp
strike(s,w.parts[4],y=420,atk=1000);ticks(s)
assert w.phase=='respawn' and b.hp==0 and w.cast is None and a.hp==hp
assert (s.kills,s.mora,s.story.quests[QUEST].count)==(1,300,1)
# Falling after victory still recovers to a real floor without damage or another kill.
spot(a,285,570);a.ground=False;hp=a.hp;ticks(s)
assert a.ground and a.y==480 and a.hp==hp and s.kills==1
save=validate_save(native(C.checkpoint(s)));assert save['weeklyBosses'][ID]['hp']==0
restored=C.restore(lua.table_from(save,recursive=True),12);xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):C.action(restored,'story_report:'+QUEST)
assert (restored.progression.questXp-xp,restored.mora-mora)==(1400,360)
ticks(restored,save['weeklyBosses'][ID]['waitTicks'])
assert restored.weeklySlots[ID].generation==2 and restored.weeklySlots[ID].primary.hp==600

# Wipe returns to the hub and clears the unfinished weekly attempt.
s,w,b,a=make();expose(s,w);b.hp=300
s.actors[1].hp=s.actors[2].hp=0;ticks(s)
assert s.returns==1 and s.story.node=='mond-town' and w.primary.hp==600 and w.guard==24

# AI crosses a real gap while following a nearby leader, including the 75..90px follow band.
s,w,b,a=make();amber=s.actors[2];amber.hp=140;spot(a,340);spot(amber,250);move(s,w,'WD01')
for _ in range(90):ticks(s)
assert amber.x>303.6 and amber.ground and amber.y==480 and w.falls==0,(amber.x,amber.y,w.falls)

# Compare the exact same paused combat frame in PNG/standard/light modes.
s,w,b,a=make();expose(s,w);amber=s.actors[2];amber.hp=amber.maxhp;spot(amber,w.crystalX-130)
landed=False;max_step=0
for _ in range(400):
 oldx,oldy=amber.x,amber.y;ticks(s)
 max_step=max(max_step,abs(amber.x-oldx))
 if amber.ground and abs(amber.y-420)<1:landed=True
assert landed and w.falls==0 and max_step<20,(landed,max_step,w.falls,amber.x,amber.y)
ai_damage=600-b.hp
assert ai_damage>0,(ai_damage,amber.x,amber.y)

s,w,b,a=make();expose(s,w);until(s,w,'WD08',120)
frames=[C.frame(s,m,p) for m,p in [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert len({f.t for f in frames})==1 and frames[2].commands<frames[1].commands

def solo():
 s,w,b,a=make();s.actors[2].hp=0
 moves=set();downs=0;last=None
 for i in range(360*60):
  c=w.cast
  if c:moves.add(c.move.id)
  if b.hp<=0:
   assert moves==set(spec['moves']) and w.falls==0
   return dict(seconds=round(s.t,2),hp=a.hp,breaks=w.breaks,falls=w.falls,moves=sorted(moves))
  if s.returns:raise AssertionError(('wipe',s.t,b.hp,w.guard))
  dest=a.x;jump=not a.ground;attack=False;aim=None
  if c:
   m,t=c.move.id,c.tick
   dodge=(m=='WD01' and 52<=t<103) or (m=='WD04' and (99<=t<135 or 145<=t<172)) or (m=='WD06' and 150<=t<193)
   if dodge:
    jump=True
    if a.ground:C.action(s,'jump')
   if m=='WD08':
    dest=w.crystalX-30
    if a.ground and a.y>423 and abs(dest-a.x)<100:C.action(s,'jump')
    jump=True;attack=42<=t<462;aim=w.crystalX
   elif m in ['WD02','WD03'] and c.center:
    dest=c.center+(65 if m=='WD02' else c.dir*75)
    jump=jump or m=='WD02' and 70<=t<103
    if jump and a.ground:C.action(s,'jump')
    attack=True;aim=c.center+65
    if m=='WD03' and 90<=t<234:
     beam=c.right-(c.right-c.left)*(t-90)/144 if c.dir<0 else c.left+(c.right-c.left)*(t-90)/144
     if abs(beam-a.x)<65 and a.ground:C.action(s,'jump');jump=True
   elif c.zone:
    safe=spec['platforms'][0 if c.zone!=1 else 1];dest=safe['x']+132
    if m=='WD07' and c.points:
     p=spec['platforms'][int(c.zone)-1]
     dest=max([p['x']+20,p['x']+p['w']-20],key=lambda x:min(abs(x-p) for p in c.points.values()))
  if w.hazard and (not c or c.move.id!='WD08'):
   p=spec['platforms'][int(w.hazard.zone)-1]
   if p['x']<=dest<=p['x']+p['w']:
    p=spec['platforms'][0 if w.hazard.zone!=1 else 1];dest=p['x']+132
  dx=dest-a.x;direction=1 if dx>10 else -1 if dx<-10 else 0
  if direction==0 and aim is not None and (aim-a.x)*a.dir<0:direction=1 if aim>a.x else -1
  if direction:
   for p in spec['platforms']:
    edge=p['x']+p['w'] if direction>0 else p['x']
    if a.ground and p['x']<=a.x<=p['x']+p['w'] and abs(a.x-edge)<55 and (dest-edge)*direction>25:C.action(s,'jump');jump=True
  before=a.hp
  ticks(s,right=direction>0,left=direction<0,jump=jump,attack=attack)
 else:raise AssertionError(('timeout',s.t,b.hp,w.guard,a.hp))

result=dict(normalAttackWithoutHealing=solo(),aiActualPadLandingAndDamage=ai_damage,aiMaxHorizontalStep=max_step,realScheduledNormalGuard=real_guard,sharedGuardEventDedup=True,crystalWindow=[42,462],
 actualGroundReachRejected=True,sharedPadLoweringBothActors=True,unfinishedSaveAndExitRestart=True,
 strictSaveValidation=True,bothGapsBothDirections=True,lockedHitWindows=damage,
 breathHitTicks=hit_ticks,fourBoltsTwoPairCap=True,hazardPauseAndRewarning=True,
 oneVictoryReportAndRespawn=True,postVictoryFallRecovery=True,wipeResetsAtHub=True,aiCloseFollowCrossesGap=True,
 sameSceneCommands=dict(zip(['png','standard','light'],[f.commands for f in frames])))
(ROOT/'evidence/dvalin-weekly-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(result)
