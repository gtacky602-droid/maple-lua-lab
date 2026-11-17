import json
from runtime import ROOT,runtime,native
from experience import LEVELS
from savegame import validate_save

lua,C=runtime();empty=lua.table();ID='boss-29020101';QUEST='andrius-weekly-commission';ARENA='andrius-wolf-ring'
spec=next(s for s in json.loads((ROOT/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses'] if s['id']==ID)
S=lua.table_from(spec,recursive=True)
def spot(a,x,y=480):a.x,a.y,a.vy,a.ground=x,y,0,True
def ticks(s,n=1,**keys):
 for _ in range(n):C.step(s,1/60,lua.table_from(keys) if keys else empty)
def make():
 s=C.new(12);C.action(s,'story_start');C.grantExp(s,LEVELS[23]['maple_reference_total_exp_to_reach'],'quest')
 C.enterStoryNode(s,'mond-town');C.action(s,'story_accept:'+QUEST);C.enterStoryNode(s,ARENA)
 w=s.weeklySlots[ID];w.phase='combat';s.actors[2].hp=0;spot(s.actors[1],400);s.actors[1].inv=0
 return s,w,w.primary,s.actors[1]
def move(s,w,id,variant='melee'):
 m=S.moves[id];e=w.primary
 w.cast=lua.table_from(dict(move=m,tick=0,origin=e.x,originY=e.y,dir=e.dir,variant=variant,
  total=m.rangedTotal if variant=='ranged' else m.total,seen=lua.table_from([{}, {}, {}],recursive=True),counts=lua.table(),bolts=lua.table()))
 w.phase='combat'
 if id=='WA06':
  w.transitioned=True;w.transitions=1;w.stage='INTERLUDE'
  w.cast.entry1,w.cast.end1,w.cast.entry2,w.cast.end2=160,800,800,160
def until(s,w,id,tick):
 for _ in range(5000):
  if w.cast and w.cast.move.id==id and w.cast.tick==tick:return w.cast
  ticks(s)
 raise AssertionError((id,tick,s.t,w.primary.hp,s.actors[1].hp))
def cast(s,e,element='physical',**change):
 return lua.table_from(dict(id=1,atk=24,x=e.x,y=e.y,dir=1,radial=True,range=150,limit=1,
  mult=1,color='#74ddff',gain=0,element=element,critRate=0)|change)
def strike(s,e,element='physical',**change):
 hp=e.hp;C.resolveCast(s,cast(s,e,element,**change));return hp-e.hp

# Provisional original resistances; mixed components retain their valid share.
s,w,b,a=make();assert strike(s,b)==20
for element in ['anemo','cryo']:assert strike(s,b,element)==0
assert strike(s,b,'hydro')==20
assert strike(s,b,'fusion',damageElements=lua.table_from(['anemo','hydro']))==10
assert strike(s,b,'fusion',damageElements=lua.table_from(['anemo','cryo']))==0

# Locked active half-open boundaries, including the rear-facing tail.
windows={}
for id,lock,first,end in [('WA01',36,60,72),('WA02',48,72,84),('WA03',48,108,120),('WA04',42,84,108),('WA05',54,84,108)]:
 s,w,b,a=make();move(s,w,id);c=until(s,w,id,lock)
 fixed=c.left,c.right,c.dir;spot(a,900);until(s,w,id,first-1);hp=a.hp
 ticks(s,end-first+1);assert a.hp==hp and (c.left,c.right,c.dir)==fixed
 s,w,b,a=make();move(s,w,id);c=until(s,w,id,lock)
 spot(a,(c.left+c.right)/2);until(s,w,id,first-1);hp=a.hp;until(s,w,id,end)
 assert hp-a.hp==S.moves[id].damage,(id,hp,a.hp)
 windows[id]=hp-a.hp
 if id=='WA02':assert b.dir==-1 and c.left>c.origin

s,w,b,a=make();move(s,w,'WA03');c=until(s,w,'WA03',48);landing=c.center
spot(a,850);until(s,w,'WA03',90);assert abs(b.y-(480-158.4))<1e-6 and b.x!=c.origin
until(s,w,'WA03',120);assert b.x==landing and b.y==480

s,w,b,a=make();move(s,w,'WA02','ranged');c=until(s,w,'WA02',48);assert c.total==204
spot(a,c.targets[2]);until(s,w,'WA02',145)
assert len(c.bolts)==3 and all(p.ended for p in c.bolts.values()) and (c.counts[a.id] or 0)<=2

# HP50% completes the current cast before one protected interlude and its counter window.
s,w,b,a=make();move(s,w,'WA01');until(s,w,'WA01',50);b.hp=450;ticks(s)
assert w.transitionPending and w.transitions==0 and w.cast.move.id=='WA01'
until(s,w,'WA06',1);assert w.transitions==1 and b.underground
hp=b.hp;assert strike(s,b)==0 and b.hp==hp
until(s,w,'WA06',149);spot(a,480);hp=a.hp;ticks(s);assert b.dir==1
until(s,w,'WA06',174);assert hp-a.hp==20
until(s,w,'WA06',317);spot(a,480);a.inv=0;hp=a.hp;ticks(s);assert b.dir==-1
until(s,w,'WA06',342);assert hp-a.hp==20
until(s,w,'WA06',455);spot(a,480);a.inv=0;hp=a.hp;until(s,w,'WA06',468)
assert hp-a.hp==24 and w.awakened and b.underground
until(s,w,'WA06',503);assert strike(s,b)==0
ticks(s);assert not b.underground and strike(s,b)==20
until(s,w,'WA06',623);ticks(s);assert w.stage=='P2' and w.transitions==1
for _ in range(2):b.hp=400;ticks(s)
assert w.transitions==1 and w.cast.move.id=='WA07'

# Ordinary-jump upper platform is an actual safe floor during roar.
s,w,b,a=make();spot(a,128);C.action(s,'jump');ticks(s,65,jump=True)
assert a.ground and abs(a.y-356.8)<1e-6,(a.y,a.vy)
move(s,w,'WA10');c=until(s,w,'WA10',72);hp=a.hp;until(s,w,'WA10',180);assert a.hp==hp

# Low wave does not hit actors standing on a different floor height.
for y in [480,356.8]:
 s,w,b,a=make();b.dir=1;spot(a,800,y);move(s,w,'WA07');until(s,w,'WA07',168)
 assert (a.hp==120 if y==480 else a.hp==140),(y,a.hp)

# QA.md overrides the old 12-tick cadence: low/high/low at96/186/276, gone by342.
s,w,b,a=make();b.dir=1;move(s,w,'WA08');c=until(s,w,'WA08',60);assert c.total==408
for count,tick in [(1,96),(2,186),(3,276)]:
 until(s,w,'WA08',tick);assert len(c.bolts)==count
assert [c.bolts[i].y for i in [1,2,3]]==[452,355,452]
until(s,w,'WA08',342);assert all(p.ended for p in c.bolts.values())

# Even a victim deliberately overlapping all three heights can take at most two blade hits.
s,w,b,a=make();b.dir=1;move(s,w,'WA08');spot(a,800)
until(s,w,'WA08',170);spot(a,800,356.8)
until(s,w,'WA08',260);spot(a,800)
until(s,w,'WA08',342);assert a.hp==104 and c is not None
assert w.cast.counts[a.id]==2

# Low/high/low is avoidable with ordinary jumps and an intervening landing, at a fixed real range.
s,w,b,a=make();b.dir=1;spot(a,700);move(s,w,'WA08');jump_landings=0;was_air=False
for _ in range(407):
 c=w.cast
 for p in c.bolts.values():
  if not p.ended and p.y>420 and 0<a.x-p.x<115 and a.ground:C.action(s,'jump')
 ticks(s,jump=True)
 if was_air and a.ground:jump_landings+=1
 was_air=not a.ground
assert a.hp==140 and jump_landings>=2,(a.hp,jump_landings)

# The companion reaches a raised safe floor in the real interlude, without a position warp.
s,w,b,a=make();amber=s.actors[2];amber.hp=140;amber.inv=0;spot(amber,350);move(s,w,'WA06')
max_ai_step=0;upper_landed=False
for _ in range(500):
 x=amber.x;ticks(s);max_ai_step=max(max_ai_step,abs(amber.x-x))
 upper_landed|=amber.ground and abs(amber.y-356.8)<1e-6
assert upper_landed and max_ai_step<5 and amber.hp>0,(upper_landed,max_ai_step,amber.hp)

# Locked ice points, finite outer strips, central safe path and floor hit spacing.
s,w,b,a=make();move(s,w,'WA09');c=until(s,w,'WA09',72);points=native(c.points);spot(a,700)
until(s,w,'WA09',132);assert len(w.hazards)==2 and all(h.remaining==359 for h in w.hazards.values())
hp=a.hp;until(s,w,'WA09',240);assert a.hp==hp and native(c.points)==points
assert w.hazards[1].right+105.6<w.hazards[2].left
ticks(s,251);assert all(h.remaining==0 for h in w.hazards.values())
ticks(s);assert len(w.hazards)==0
s,w,b,a=make();move(s,w,'WA09');until(s,w,'WA09',132);spot(a,60);hp=a.hp;ticks(s)
assert a.hp==hp-8
ticks(s,59);assert a.hp==hp-8
ticks(s);assert a.hp==hp-16
spot(a,60,356.8);hp=a.hp;ticks(s,60);assert a.hp==hp

# Ordinary36-tick hurt immunity remains active between roar's30-tick pulses.
s,w,b,a=make();move(s,w,'WA10');c=until(s,w,'WA10',72);spot(a,c.origin);hp=a.hp
until(s,w,'WA10',180);assert hp-a.hp==24

# One phantom attack body, no add/HP/reward object; victory cancels the cast.
s,w,b,a=make();move(s,w,'WA11');c=until(s,w,'WA11',36);spot(a,480);hp=a.hp
until(s,w,'WA11',120);assert hp-a.hp==18 and len(s.enemies)==1
assert s.kills==s.mora==0
b.hp=1;assert strike(s,b)==1;ticks(s)
assert w.cast is None and w.phase=='respawn' and len(w.hazards)==0 and s.kills==1 and s.mora==330
ticks(s,60);assert a.hp==hp-18

# Lethal damage wins without introducing an HP stop at the transition threshold.
s,w,b,a=make();move(s,w,'WA01');b.hp=451;strike(s,b,atk=10000);ticks(s)
assert b.hp==0 and w.transitions==0 and w.phase=='respawn'

# Save/exit/wipe resets; one report and fixed-HP generation respawn.
s,w,b,a=make();b.hp=400;w.awakened=True;w.stage='P2';w.transitioned=True
save=validate_save(native(C.checkpoint(s)));assert save['weeklyBosses'][ID]['hp']==900
C.enterStoryNode(s,'mond-town');assert w.primary.hp==900 and not w.awakened and w.stage=='P1'
restored=C.restore(lua.table_from(save,recursive=True),12);assert restored.weeklySlots[ID].primary.hp==900
C.enterStoryNode(s,ARENA);s.actors[1].hp=s.actors[2].hp=0;ticks(s);assert s.returns==1 and s.story.node=='mond-town'
C.enterStoryNode(s,ARENA);b=w.primary;b.hp=1;strike(s,b);ticks(s)
save=validate_save(native(C.checkpoint(s)));restored=C.restore(lua.table_from(save,recursive=True),12)
xp,mora=restored.progression.questXp,restored.mora
for _ in range(2):C.action(restored,'story_report:'+QUEST)
assert (restored.progression.questXp-xp,restored.mora-mora)==(1600,390)
ticks(restored,save['weeklyBosses'][ID]['waitTicks'])
assert restored.weeklySlots[ID].generation==2 and restored.weeklySlots[ID].primary.hp==900

s,w,b,a=make();w.awakened=True;w.stage='P2';move(s,w,'WA10');until(s,w,'WA10',100)
frames=[C.frame(s,m,p) for m,p in [('sprite','legacy'),('rect','legacy'),('rect','h32c16')]]
assert len({f.t for f in frames})==1 and frames[2].commands<frames[1].commands
for id in ['WA01','WA02']:
 s,w,b,a=make();w.awakened=True;w.transitioned=True;w.stage='P2';move(s,w,id);ticks(s,50)
 f=C.frame(s,'sprite','legacy')
 assert any(d.source=='andrius-weekly-awake-actions-source-v1.png' for d in f.draws.values())
 assert not any(d.source=='andrius-weekly-normal-source-v1.png' for d in f.draws.values())

def solo():
 s,w,b,a=make();moves=set()
 for i in range(420*60):
  if b.hp<=0:
   result=dict(seconds=round(s.t,2),hp=a.hp,transitions=w.transitions,falls=w.falls,moves=sorted(moves))
   assert moves==set(spec['moves']) and w.transitions==1 and w.falls==0
   return result
  if s.returns:raise AssertionError(('wipe',s.t,b.hp))
  c=w.cast;dest=b.x-70;jump=not a.ground;attack=not b.underground
  if c:
   moves.add(c.move.id);m,t=c.move.kind,c.tick
   if m=='swipe' and t<84:dest=c.origin-c.dir*75
   elif m=='tail' and t<96:dest=c.origin+c.dir*75
   elif m=='leap' and c.center and t<138:
    dest=c.center+125 if a.x>=c.center else c.center-125
   elif m=='dash' and c.left and t<120:
    dest=c.left-30 if abs(a.x-c.left)<abs(a.x-c.right) else c.right+30
   elif m=='spin' and t<120:dest=c.origin-c.dir*150
   elif m=='interlude' and t<504:
    p=spec['platforms'][1 if a.x<480 else 2];dest=p['x']+p['w']/2
    if a.ground and a.y>p['y']+3 and abs(a.x-dest)<110:C.action(s,'jump');jump=True
    attack=False
   elif m in ['wave','blades']:dest=c.origin-c.dir*75
   elif m=='rain' and c.points and t<240:
    choices=[x for x in range(100,861,10) if min(abs(x-p) for p in c.points.values())>=45]
    dest=min(choices,key=lambda x:abs(x-b.x))
   elif m=='roar' and t<180:
    left,right=c.origin-275,c.origin+275
    dest=left if abs(a.x-left)<abs(a.x-right) else right
   elif m=='phantom' and c.entry:
    arrival=72+abs(a.x-c.entry)/640*48
    if arrival-20<=t<arrival+4 and a.ground:C.action(s,'jump');jump=True
  dest=max(90,min(870,dest));dx=dest-a.x;direction=1 if dx>8 else -1 if dx<-8 else 0
  aim=b.x-a.x
  if direction==0 and abs(aim)>5 and aim*a.dir<0:direction=1 if aim>0 else -1
  attack=attack and abs(aim)<114
  before=a.hp;ticks(s,left=direction<0,right=direction>0,jump=jump,attack=attack)
 else:raise AssertionError(('timeout',s.t,b.hp,a.hp))

result=dict(normalAttackWithoutHealing=solo(),ordinaryWindBladeJumpsAndLandings=jump_landings,aiUpperLanding=True,aiMaxHorizontalStep=max_ai_step,provisionalOriginalResistancesAndMixedComponents=True,closeAttackWindows=windows,
 actualLeapAndLockedLanding=True,tailFacingAndThreePieceCap=True,oneSafeHP50Transition=True,
 transitionTwoDashesLandingAnd504Counter=True,upperFloorOrdinaryJumpAndRoarSafe=True,
 lowWaveMatchesFloorHeight=True,windBladesSpawns=[96,186,276],threeLockedRainPointsAndTwoFiniteEdges=True,
 edgeFloorOneSecondCooldown=True,roarRespectsExistingHurtImmunity=True,onePhantomNoAddRewards=True,
 lethalDamagePrecedesTransition=True,unfinishedSaveExitWipeAndVictoryReportRespawn=True,
 sameSceneCommands=dict(zip(['png','standard','light'],[f.commands for f in frames])))
(ROOT/'evidence/andrius-weekly-lua.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(result)
