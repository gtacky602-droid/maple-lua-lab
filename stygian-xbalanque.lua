return function(C,G,M)
 local D={}
 local allyAvoid=C.aiAvoidTarget
 local function event(s,run,suffix,value)
  C.combatEvent(s,'stygian:xbalanque:'..suffix,0,run.boss.id,value or 0)
 end
 local function targetable(b,open)
  b.invulnerable=not open;b.noAutoTarget=not open
 end
 local function contact(s,run,spec,b,cast,mult,color,element)
  local personal=s.endgameRun
  if not personal or personal.status~='fighting' or b.hp<=0 or b.invulnerable or run.status~='fighting' then return false end
  local resist=C.enemyResistance(cast,b,element)
  if resist>=1 then return false end
  local amount,critical=C.enemyHitDamage(s,cast,b,mult,element,resist)
  local boundary=math.ceil(b.maxhp*(spec.thresholds[run.stage] or 0))
  amount=math.min(amount,b.hp-boundary)
  if amount<=0 then return false end
  local ability=cast.key or 'normal'
  personal.skills[ability]=(personal.skills[ability] or 0)+amount
  s.damage=s.damage+amount;s.hits=s.hits+1
  C.combatNumber(s,b,critical and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,b.id,amount)
  local e=s.events[#s.events]
  e.element=element;e.critical=not not critical;e.reaction=cast.reaction or false
  local child=run.cast and run.cast.child
  if child and child.t>=child.data.recovery then C.noteGrowth(s,'stygian-opening') end
  if amount==b.hp then
   run.cast=nil;run.landedFrom=b.y
   C.defeatEnemy(s,b,cast.id)
  else
   b.hp=b.hp-amount
   if b.hp==boundary then
    run.pendingStage=run.stage+1;targetable(b,false)
   elseif C.afterElementHit then C.afterElementHit(s,cast,b,cast.applicationElement or element,element,amount) end
  end
  return true
 end
 function D.spawn(s,run,spec)
  local a=spec.arena
  C.clearWeeklySceneCasts(s);s.camera=0
  for i,owner in ipairs(s.actors) do
   owner.x,owner.y=a.playerX-(i-1)*44,a.floor
   owner.vy,owner.ground,owner.dash,owner.buffer=0,true,0,0
  end
  local b={id=spec.entity,x=a.bossX,y=a.floor,hp=run.rules.hp,maxhp=run.rules.hp,level=run.rules.level,
   hitTop=a.floor-80,hitBottom=a.floor,hitHalfWidth=16,dir=-1,warning=0,
   custom=true,fieldBoss=true,boss=true,damageElement='pyro',respawn=math.huge,rewardMora=0}
  b.onCastContact=function(state,cast,_,mult,color,elem) return contact(state,run,spec,b,cast,mult,color,elem) end
  s.enemies={b};run.boss=b;run.spec=spec;run.stage=1;run.phase='enter'
  run.serial,run.age,run.ordinary,run.rest,run.index,run.remainder=0,0,0,0,1,0
  run.solo={};run.skills={}
  targetable(b,false);event(s,run,'enter')
 end
 local function start(s,run,spec,key,variant)
  run.serial=run.serial+1
  local d=spec.moves[key]
  local c={key=key,data=d,variant=variant,t=0,serial=run.serial}
  if variant then
   c.pattern=d.variants[variant];c.total=c.pattern.total;c.childIndex=1
  else c.total=d.total end
  c.child=M.begin(s,run,spec,c.pattern and c.pattern.children[1].key or key,c)
  run.cast=c;run.phase='cast'
  if key=='XB08' then run.ordinary=0 end
  event(s,run,variant and key..':'..variant or key,c.serial)
 end
 local function nextMove(s,run,spec)
  if run.stage==3 then
   if not run.solo.XB06 then start(s,run,spec,'XB06');return end
   if not run.solo.XB08 or run.ordinary>=spec.timing.ordinaryBeforeFinale then
    start(s,run,spec,'XB08');return
   end
  end
  local order=run.stage==1 and spec.p1Order or run.stage==2 and run.rules.p2Order or run.rules.p3Order
  local slot=order[run.index]
  local key,variant=slot:match('^(XB%d%d):([ABC])$')
  if variant then
   for _,child in ipairs(spec.moves[key].variants[variant].children) do
    if not run.solo[child.key] then start(s,run,spec,child.key);return end
   end
  end
  run.index=run.index%#order+1
  start(s,run,spec,key or slot,variant)
 end
 local function shift(s,run)
  local b=run.boss
  run.stage=run.pendingStage;run.pendingStage=nil;run.cast=nil
  run.age,run.index,run.ordinary,run.phase=0,1,0,'phase'
  b.burning=nil;b.aura=nil;b.applicationClocks=nil
  event(s,run,'phase',run.stage)
 end
 local function tick(s,run,spec)
  local b=run.boss
  if run.phase=='enter' or run.phase=='phase' then
   run.age=run.age+1
   if run.age>=(run.phase=='enter' and spec.timing.enter or spec.timing.phase) then
    targetable(b,true);nextMove(s,run,spec)
   end
   return
  end
  local c=run.cast
  if c then
   c.t=c.t+1
   local second=c.pattern and c.pattern.children[2]
   if second and c.t==second.at then
    c.childIndex=2
    c.child=M.begin(s,run,spec,second.key,c)
    event(s,run,'XB07:child',2)
   else
    c.child.t=c.t-c.child.offset
    M.tick(s,run,spec,c.child)
   end
   if run.pendingStage and c.child.t>=c.child.data.recovery then
    if not c.pattern then run.solo[c.key]=true end
    shift(s,run);return
   end
   if c.t>=c.total then
    if not c.pattern then
     run.solo[c.key]=true
     if run.stage==3 and c.key~='XB08' then run.ordinary=run.ordinary+1 end
    end
    run.cast=nil;run.phase='ready';run.rest=run.rules.rest
   end
   return
  end
  if run.pendingStage then shift(s,run);return end
  if run.rest>0 then
   run.rest=run.rest-1
   local a=run.target or s.actors[s.active]
   if math.abs(a.x-b.x)>12 then b.dir=a.x>b.x and 1 or -1 end
   if math.abs(a.x-b.x)>1.1*spec.arena.unit then
    b.x=G.clamp(spec,b.x+b.dir*spec.timing.walkSpeed/60,1.2*spec.arena.unit)
   end
  else nextMove(s,run,spec) end
 end
 function D.finish(s,run,spec,dt)
  if run.boss.hp<=0 then return end
  run.remainder=run.remainder+math.min(dt,1/30)*60
  while run.remainder>=1-1e-8 do
   run.remainder=run.remainder-1
   tick(s,run,spec)
  end
 end
 function D.afterClear(s,run,spec,dt)
  run.endAge=math.min(spec.timing.defeat,(run.endAge or 0)+math.min(dt,1/30)*60)
  local u=math.min(1,run.endAge/30)
  run.landedFrom=run.landedFrom or run.boss.y
  run.boss.y=run.landedFrom+(spec.arena.floor-run.landedFrom)*u
 end
 function C.aiAvoidTarget(s,a)
  local run=s.endgameRun
  if run and run.match=='xbalanque' and run.status=='fighting' then
   local c=run.cast and run.cast.child
   if run.phase=='enter' or run.phase=='phase' then
    local p=s.actors[s.active]
    return math.abs(a.x-p.x)>68 and p.x-48 or a.x
   end
   if c and c.t<c.data.recovery then
    local z=M.danger(run.spec,c,a)
    if z then
     local l,r=z.left-20,z.right+20
     if a.x-l<r-a.x then return l>=22 and l or r end
     return r<=938 and r or l
    end
    if c.key=='XB08' and c.t>=144 and c.t<312 then return 480 end
   end
  end
  if allyAvoid then return allyAvoid(s,a) end
 end
 function D.abort(_,run) run.cast=nil end
 local function painter(f,s)
  return function(x,y,w,h,color,opacity,optional)
   if w>0 and h>0 then
    f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=w,h=h,color=color,opacity=opacity,translucentFill=optional}
   end
  end
 end
 local function flame(rect,x,y,height,age,stage,alpha)
  local w=height*.48;local offset=(age%18)/18
  local color=stage==1 and '#ffac64' or M.gold
  rect(x-w/2,y-height*.39,w,height*.38,'#a9433a',alpha)
  rect(x-w*.27,y-height*.70,w*.61,height*.55,M.fire,alpha)
  rect(x-w*.11+offset*2,y-height*.96,w*.34,height*.63,color,alpha)
  rect(x-w*.12,y-height*.36,w*.39,height*.23,M.white,alpha)
 end
 local function solarMark(rect,x,y,t)
  local a=t<=420 and .47 or .47*(1-math.min(1,(t-420)/30))
  local r=60
  for i=0,31 do
   local theta=i*math.pi/16
   local size=i%4==0 and 5 or 3
   rect(x+math.cos(theta)*r-size/2,y+math.sin(theta)*r-size/2,size,size,M.gold,a,true)
  end
 end
 local hints={
  XB01='前方の二打。間合いの外へ',XB02='三打目は上へ突く。背後か間合いの外へ',
  XB03='三つの火球の射線を避ける',XB04='横の火帯を跳ぶか、背後へ',
  XB05='着地の印から離れる',XB06='握った拳の正面から離れる'
 }
 local stageNames={'拳闘の聖火','昇りゆく烈日','太陽の激突'}
 local function prompt(run,spec,c,cleared)
  if cleared then return '手合わせを終えた',spec.dialogue.clear end
  if run.phase=='enter' then return '拳を構える',spec.dialogue.enter end
  if run.phase=='phase' then return '聖火が強くなる',run.stage==2 and spec.dialogue.p2 or spec.dialogue.p3 end
  if not c then return '間合いを取る' end
  if c.t>=c.data.recovery then return string.format('反撃の隙 %.1f秒',(c.data.total-c.t)/60) end
  if c.key=='XB08' then
   if c.t<156 then return '一拍目　疾走の終点から離れる' end
   if c.t<312 then return '二拍目　左右の炎。中央の空白へ' end
   return '三拍目　太陽拳の正面から離れる'
  end
  return hints[c.key]
 end
 function D.observe(f,s,run,spec,mode,profile)
  local b,cast=run.boss,run.cast
  local c=cast and cast.child
  local v=f.endgameRun
  local clear=run.status=='clear'
  v.stage,v.stageName=run.stage,stageNames[run.stage]
  v.phase=clear and 'bow' or c and c.t>=c.data.recovery and 'recover' or run.phase
  v.tick=clear and (run.endAge or 0) or cast and cast.t or run.age
  v.card=cast and cast.key or nil
  v.hint,v.dialogue=prompt(run,spec,c,clear)
  if cast and cast.variant then
   v.variant=cast.variant;v.child=c.key;v.childTick=c.t
   v.chain={}
   for i,p in ipairs(cast.pattern.children) do v.chain[i]=spec.moves[p.key].title end
  end
  f.boss={name=spec.name,hp=b.hp,maxhp=b.maxhp,x=b.x,y=b.y,dir=b.dir,
   phase=v.phase,label=cast and cast.data.title or v.stageName}
  if run.status=='failed' then return end
  local back={draws={}};local rect=painter(back,s)
  local clock=(run.shared and run.shared.elapsed or s.t)*60+(run.endAge or 0)
  local fireHeight=25+run.stage*10+(c and c.key=='XB08' and c.t<420 and 8 or 0)
  if c and c.key=='XB08' and c.t>=420 then fireHeight=29 end
  if clear then fireHeight=25-12*math.min(1,(run.endAge or 0)/90) end
  for _,x in ipairs({62,898}) do flame(rect,x,337,fireHeight,clock,run.stage,.83) end
  local art=C.stygianXbalanqueArt
  local side=b.dir>0 and 'right' or 'left'
  local window
  if c then
   if c.data.projectile then
    for _,shot in ipairs(c.data.windows) do
     if c.t>=shot[1] and c.t<shot[1]+7 then window=shot;break end
    end
   else local _;_,window=M.window(c) end
  end
  local advancing=c and c.data.dash and c.t>=c.data.dash[1] and c.t<c.data.dash[2]
  local leaping=c and c.data.jump and c.t>=c.data.jump[1] and c.t<c.data.jump[2]
  local striking=window~=nil
  local kind=clear and 'idle' or (advancing or leaping or striking) and 'punch' or c and c.t<c.data.recovery and 'guard' or 'idle'
  if c and c.key=='XB08' and c.t>=312 and c.t<450 then solarMark(rect,b.x,b.y-106,c.t) end
  if advancing then
   for i=2,1,-1 do
    local begin=#back.draws+1
    C.drawFieldDisplayArt(back,art.punch[side],b.x-b.dir*18*i-s.camera,b.y,84,mode,profile,false,nil,nil,.09+.040*i)
    for j=begin,#back.draws do back.draws[j].motionOnly=true end
   end
  end
  C.drawFieldDisplayArt(back,art[kind][side],b.x-s.camera,b.y,84,mode,profile,false)
  if not clear and run.phase~='enter' then
   local hands=art.hands[kind][side]
   local front=b.x+b.dir*hands.x
   local height=striking and 21 or 13
   flame(rect,front,b.y-hands.y+6,height,clock,run.stage,kind=='punch' and .61 or .48)
   if window and c.t-window[1]<2 then rect(front-3,b.y-hands.y-5,6,7,M.white,.87) end
  end
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws);f.draws=back.draws;f.commands=#f.draws
  if not c then return end
  rect=painter(f,s)
  local cues=M.cues(spec,c)
  local d=c.data
  local lock=(d.finalAim and c.t>=d.finalAim) and d.locks[2] or d.locks[1]
  v.areas={};v.projectiles=#c.shots;v.locked=c.t>=lock;v.ground=spec.arena.floor
  if c.targetMember then v.targetSlot=c.targetMember.id end
  if cues.road then
   local x0,x1=math.min(cues.road.from,cues.road.to),math.max(cues.road.from,cues.road.to)
   v.road=cues.road
   rect(x0,v.ground-10,x1-x0,4,M.fire,.88)
   for x=x0+4,x1-4,17 do rect(x,v.ground-18,8,4,M.warn,.82) end
  end
  if cues.land then
   v.landing=cues.land
   rect(cues.land-13,v.ground-5,26,3,M.white)
  end
  for _,z in ipairs(cues) do
   local g=z.area
   G.drawShape(rect,g,z.active and M.fire or z.high and M.white or M.warn,z.active,v.locked)
   if z.active and c.key=='XB04' then
    for i=1,3 do rect(g.left+5,g.top+6+i*14,g.right-g.left-10,3,M.white,.62) end
   end
   v.areas[#v.areas+1]={left=g.left,right=g.right,top=g.top,bottom=g.bottom,index=z.index,active=z.active}
  end
  if c.key=='XB08' and c.t<420 then
   v.beat=c.t<156 and 1 or c.t<312 and 2 or 3
   for i=1,3 do
    local x=438+i*19
    rect(x,41,12,8,i==v.beat and M.white or M.ash,.88)
   end
   if c.t>=156 and c.t<312 then
    local l,r=spec.arena.left+4.2*spec.arena.unit,spec.arena.left+5.8*spec.arena.unit
    v.safe={left=l,right=r}
    rect(l,477,r-l,3,'#9ae4a8',.93)
    rect(l,466,2,13,'#9ae4a8');rect(r-2,466,2,13,'#9ae4a8')
   end
  end
  for _,p in ipairs(c.shots) do
   local r=p.radius
   rect(p.x-p.dir*r*1.8-4,p.y-3,10,6,M.fire,.57)
   rect(p.x-r,p.y-r*.5,r*2,r,M.ash,.9)
   rect(p.x-r*.54,p.y-r*.55,r*1.08,r*1.1,M.fire,.93)
   rect(p.x-r*.25,p.y-r*.25,r*.5,r*.5,M.white)
  end
  for _,p in ipairs(c.sparks) do
   local age=c.t-p.t
   if age<18 then
    for i=-1,1 do rect(p.x+i*(4+age),p.y-age*.55+math.abs(i)*6,4,4,M.gold,1-age/18) end
   end
  end
  f.commands=#f.draws
 end
 return D
end
