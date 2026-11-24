return function(C,M)
 local D={}
 local previousAvoid=C.aiAvoidTarget
 local function event(s,b,key,value)
  C.combatEvent(s,'stygian:capitano:'..key,0,b.id,value or 0)
 end
 local function setTargetable(b,open)
  b.invulnerable=not open
  b.noAutoTarget=not open
 end
 local function contact(s,run,spec,b,cast,mult,color,element)
  local personal=s.endgameRun
  if not personal or personal.status~='fighting' or b.hp<=0 or b.invulnerable or run.status~='fighting' then return false end
  local r=C.enemyResistance(cast,b,element)
  if r>=1 then return false end
  local amount,crit=C.enemyHitDamage(s,cast,b,mult,element,r)
  local floor=math.ceil(b.maxhp*(spec.thresholds[run.stage] or 0))
  amount=math.min(amount,b.hp-floor)
  if amount<=0 then return false end
  local ability=cast.key or 'normal'
  personal.skills[ability]=(personal.skills[ability] or 0)+amount
  s.damage=s.damage+amount;s.hits=s.hits+1
  C.combatNumber(s,b,crit and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,b.id,amount)
  local hit=s.events[#s.events]
  hit.element=element;hit.critical=not not crit;hit.reaction=cast.reaction or false
  if run.cast and run.cast.t>=run.cast.data.recovery then C.noteGrowth(s,'stygian-opening') end
  b.lastHurt=run.clock
  if amount==b.hp then
   run.cast=nil
   C.defeatEnemy(s,b,cast.id)
  else
   b.hp=b.hp-amount
   if b.hp==floor then
    run.pendingStage=run.stage+1
    setTargetable(b,false)
   elseif C.afterElementHit then C.afterElementHit(s,cast,b,cast.applicationElement or element,element,amount) end
  end
  return true
 end
 function D.spawn(s,run,spec)
  local board=spec.arena
  C.clearWeeklySceneCasts(s)
  s.camera=0
  for i,a in ipairs(s.actors) do
   a.x,a.y=board.playerX-(i-1)*43,board.floor
   a.vy,a.ground,a.dash,a.buffer=0,true,0,0
  end
  local b={id=spec.entity,x=board.bossX,y=board.floor,dir=-1,boss=true,custom=true,fieldBoss=true,
   hp=run.rules.hp,maxhp=run.rules.hp,level=run.rules.level,hitTop=board.floor-128,hitBottom=board.floor,
   hitHalfWidth=24,rewardMora=0,respawn=math.huge,warning=0,damageElement='cryo'}
  b.onCastContact=function(state,cast,_,mult,color,element) return contact(state,run,spec,b,cast,mult,color,element) end
  run.spec=spec
  run.boss=b;run.phase='enter';run.age=0;run.clock=0;run.remainder=0
  run.stage=1;run.serial=0;run.index=1;run.ordinary=0;run.skills={};run.rest=0
  setTargetable(b,false)
  s.enemies={b}
  event(s,b,'enter')
 end
 local function start(s,run,spec,key)
  local b=run.boss
  run.serial=run.serial+1
  local data=spec.moves[key]
  local target=run.target or s.actors[s.active]
  local c={key=key,data=data,owner=target.id,targetActor=target,targetMember=run.targetMember,target=target.x,t=0,serial=run.serial,
   hit={projectiles={}},sparks={},shots={},damage=math.floor(data.damage*run.rules.attackScale+.5)}
  run.cast=c;run.phase='cast'
  M.plan(s,run,spec,c)
  if key=='CP09' then run.ordinary=0 end
  event(s,b,key,c.serial)
 end
 local function nextMove(s,run,spec)
  local order=run.stage==1 and spec.p1Order or run.stage==2 and run.rules.p2Order or spec.p3Order
  if run.stage==3 and (run.initialFinale or run.ordinary>=spec.timing.normalBetweenFinale) then
   run.initialFinale=false
   start(s,run,spec,'CP09')
   return
  end
  local key=order[run.index];run.index=run.index%#order+1
  start(s,run,spec,key)
 end
 local function stageShift(s,run)
  local b=run.boss
  run.stage=run.pendingStage;run.pendingStage=nil
  run.cast=nil;run.age=0;run.index=1;run.ordinary=0;run.phase='phase'
  run.initialFinale=run.stage==3
  b.aura=nil;b.burning=nil;b.applicationClocks=nil
  event(s,b,'phase',run.stage)
 end
 local function stepTick(s,run,spec)
  run.clock=run.clock+1
  local b=run.boss
  if run.phase=='enter' or run.phase=='phase' then
   local enter=run.phase=='enter'
   run.age=run.age+1
   if enter and run.age==spec.timing.coatOff then event(s,b,'coat-off') end
   if run.age>=(enter and spec.timing.enter or spec.timing.phase) then
    setTargetable(b,true)
    nextMove(s,run,spec)
   end
   return
  end
  local c=run.cast
  if c then
   c.t=c.t+1
   M.tick(s,run,spec,c)
   if run.pendingStage and c.t>=c.data.recovery then stageShift(s,run);return end
   if c.t>=c.data.total then
    if run.stage==3 and c.key~='CP09' then run.ordinary=run.ordinary+1 end
    run.cast=nil;run.rest=run.rules.rest;run.phase='ready'
   end
   return
  end
  if run.pendingStage then stageShift(s,run);return end
  if run.rest>0 then
   run.rest=run.rest-1
   local a=run.target or s.actors[s.active]
   local gap=math.abs(a.x-b.x)
   if gap>22 then b.dir=a.x>b.x and 1 or -1 end
   if gap>1.30*spec.arena.unit then
    b.x=M.clamp(spec,b.x+b.dir*spec.timing.walkSpeed/60,.60*spec.arena.unit)
   end
  else nextMove(s,run,spec) end
 end
 function D.finish(s,run,spec,dt)
  if run.boss.hp<=0 then return end
  run.remainder=run.remainder+math.min(dt,1/30)*60
  while run.remainder>=1-1e-8 do
   run.remainder=run.remainder-1
   stepTick(s,run,spec)
  end
 end
 function D.afterClear(s,run,spec,dt)
  run.defeatAge=math.min(spec.timing.defeat,(run.defeatAge or 0)+math.min(dt,1/30)*60)
 end
 function D.abort(_,run) run.cast=nil end
 function C.aiAvoidTarget(s,a)
  local run=s.endgameRun
  if run and run.match=='capitano' and run.status=='fighting' then
   local b=run.boss
   if run.phase=='enter' or run.phase=='phase' then
    local who=s.actors[s.active]
    return math.abs(a.x-who.x)>70 and who.x-50 or a.x
   end
   local c=run.cast
   if c and c.t<c.data.recovery then
    local z=M.collisionThreat(run.spec,c,a)
    if z then
     local l,r=z.left-21,z.right+21
     if a.x-l<r-a.x then return l>=22 and l or r end
     return r<=938 and r or l
    end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 local function paint(f,s)
  return function(x,y,w,h,color,opacity,translucentFill)
   if w>0 and h>0 then f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=w,h=h,color=color,opacity=opacity,translucentFill=translucentFill} end
  end
 end
 local function line(rect,x0,y0,x1,y1,color,dot,alpha)
  local n=math.max(1,math.ceil(math.max(math.abs(x1-x0),math.abs(y1-y0))/dot))
  for i=0,n do
   local t=i/n
   rect(x0+(x1-x0)*t-dot/2,y0+(y1-y0)*t-dot/2,dot,dot,color,alpha)
  end
 end
 local function currentWindow(c)
  if not c then return end
  for i,w in ipairs(c.data.windows) do
   if c.t>=w[1] and c.t<w[2] then return i,w end
  end
 end
 local function swordPose(c,defeated)
  if defeated then return -34,76 end
  if not c then return 7,80 end
  local i,active=currentWindow(c)
  local d=c.data
  if c.key=='CP08' and c.t>=d.guard[1] and c.t<d.guard[2] then return 71,86 end
  if active and d.projectile and c.t>=active[1]+10 then return -10,80 end
  if active then
   local p=(c.t-active[1])/math.min(active[2]-active[1],10)
   return (d.angles[i] or d.angles[#d.angles])+24-48*p,92
  end
  if c.t>=d.recovery then return -25,82 end
  if c.key=='CP09' then
   if c.t>=294 then return 73,94 end
   if c.t>=222 then return 33,90 end
   if c.t>=150 then return -6,90 end
  end
  return d.angles[1],86
 end
 local stageNames={'氷剣の騎士','深まる凛霜','一振りの誓い'}
 local function hint(run,spec,c)
  if run.phase=='enter' then return '外套を脱いで氷剣を構える',spec.dialogue.enter end
  if run.phase=='phase' then
   return '次の型に移る',run.stage==2 and spec.dialogue.p2 or spec.dialogue.p3
  end
  if not c then return '間合いを取る' end
  if c.t>=c.data.recovery then return string.format('反撃の隙 %.1f秒',(c.data.total-c.t)/60) end
  if run.pendingStage then return '剣技が収まると次の型へ移る' end
  if c.key=='CP05' then return '低い氷の波をジャンプでかわす' end
  if c.key=='CP06' then return '三本の床線から離れる。上段へも退ける' end
  if c.key=='CP07' then return '氷板の前に破片が散る。背後か射線の外へ' end
  if c.key=='CP08' then return c.t<120 and '構え。肩を引いたあとに反撃が来る' or '反撃の範囲から離れる' end
  if c.key=='CP09' then
   return c.t<150 and '一拍目　疾走の終点から離れる' or c.t<294 and
    (c.t<222 and '二拍目　低い氷線は跳ぶ' or '二拍目　高い氷線は地上へ') or '三拍目　締めの扇から離れる'
  end
  if c.key=='CP02' then return '三連。遅れて来る三段目まで見る' end
  if c.key=='CP03' then return '走路の終点に出る一閃をかわす' end
  return '正面の攻撃範囲から離れる'
 end
 function D.observe(f,s,run,spec,mode,profile)
  local b,c=run.boss,run.cast
  local v=f.endgameRun
  local isClear=run.status=='clear'
  local lowered=run.defeatAge or 0
  local coat=run.phase=='enter' and run.age<spec.timing.coatOff
  v.stage,v.stageName=run.stage,stageNames[run.stage]
  v.phase=isClear and 'defeat' or c and c.t>=c.data.recovery and 'recover' or run.phase
  v.tick=isClear and lowered or c and c.t or run.age
  v.coat=coat;v.card=c and c.key or nil
  v.hint,v.dialogue=hint(run,spec,c)
  if isClear then v.hint='演武を終えた';v.dialogue=spec.dialogue.clear end
  f.boss={name=spec.name,hp=b.hp,maxhp=b.maxhp,x=b.x,y=b.y,dir=b.dir,phase=v.phase,label=c and c.data.title or v.stageName}
  if run.status=='failed' then return end
  local rear={draws={}};local rect=paint(rear,s)
  local art=C.stygianCapitanoArt
  local side=b.dir==1 and 'right' or 'left'
  local angle,width=swordPose(c,isClear)
  local dash=c and c.data.dash and c.t>=c.data.dash[1] and c.t<c.data.dash[2]
  if dash then
   for i=2,1,-1 do
    local start=#rear.draws+1
    C.drawFieldDisplayArt(rear,art.strike[side],b.x-s.camera-b.dir*i*18,b.y,152,mode,profile,false,nil,nil,.10+i*.027)
    for j=start,#rear.draws do rear.draws[j].motionOnly=true end
   end
  end
  local _,win=currentWindow(c)
  local swing=win and (not c.data.projectile or c.t<win[1]+10)
  local pose=(dash or swing) and 'strike' or 'battle'
  local body=coat and art.coat[side] or art[pose][side]
  local height=152-(isClear and math.min(21,lowered*.40) or pose=='strike' and 7 or 0)
  C.drawFieldDisplayArt(rear,body,b.x-s.camera,b.y,height,mode,profile,false)
  if not coat and lowered<84 then
   local near=art.hands[pose][side]
   local x=b.x+b.dir*near.x;local y=b.y-height*near.y
   local rad=math.rad(angle)
   C.drawSocketArt(rear,art.sword,x-s.camera,y,width,b.dir,rad,mode,profile,
    isClear and 1-math.min(.94,lowered/84) or 1)
   if win and c.t<win[1]+2 then
    line(rect,x+b.dir*math.cos(rad)*18,y-math.sin(rad)*18,x+b.dir*math.cos(rad)*width*.86,y-math.sin(rad)*width*.86,M.pale,3,.8)
   end
   if c and c.key=='CP08' and c.t>=48 and c.t<120 then
    rect(x+b.dir*17-3,y-66,6,6,M.pale,.63+math.sin(c.t/12)*.12)
   end
  end
  if run.clock-(b.lastHurt or -200)<3 and not isClear then
   rect(b.x-33,b.y-130,4,30,M.pale,.70)
  end
  table.move(f.draws,1,#f.draws,#rear.draws+1,rear.draws);f.draws=rear.draws;f.commands=#f.draws
  if not c or b.hp<=0 then return end
  rect=paint(f,s)
  local cues=M.cue(spec,c)
  v.areas={};v.locked=c.t>=c.data.lock
  v.projectiles=#c.shots
  if c.targetMember then v.targetSlot=c.targetMember.id end
  if cues.road then
   local road=cues.road
   v.road=road
   local x0,x1=math.min(road.from,road.to),math.max(road.from,road.to)
   rect(x0,road.y-8,x1-x0,5,M.edge,.88)
   for x=x0+4,x1-4,17 do rect(x,road.y-14,8,4,M.ice,.8) end
   rect(road.to-15,road.y-18,30,3,M.warning,.94)
  end
  for _,q in ipairs(cues) do
   local z=q.shape
   M.drawShape(rect,z,q.active and M.ice or q.near and M.locked or M.warning,q.active,v.locked)
   v.areas[#v.areas+1]={left=z.left,right=z.right,top=z.top,bottom=z.bottom,active=q.active,index=q.index}
  end
  if cues.rays then
   for _,r in ipairs(cues.rays) do line(rect,r.x,r.y,r.x1,r.y1,M.warning,7,.42) end
  end
  local d=c.data
  if c.key=='CP02' and c.t<d.recovery then
   for i,w in ipairs(d.windows) do
    if c.t<w[1] then rect(b.x-18+i*9,b.y-175,5,5,M.ice,.88) end
   end
  end
  if d.plate and c.t>=d.plate.appear and c.t<d.plate.burst then
   local U=spec.arena.unit;local x=c.boardX;local base=spec.arena.floor
   local w,h=d.plate.width*U,d.plate.height*U
   rect(x-w/2,base-h,w,h,M.ice,.24,true);rect(x-w/2,base-h,2,h,M.pale,.84)
   rect(x+w/2-2,base-h,2,h,M.pale,.84);rect(x-w/2,base-h,w,3,M.ice,.91)
   v.plate={x=x,width=w,height=h}
  end
  for _,p in ipairs(c.shots) do
   local h=p.h or p.radius*2
   rect(p.x-p.radius,p.y-h/2,p.radius*2,h,M.edge,.83)
   rect(p.x-p.radius/2,p.y-h/2+4,p.radius,h-8,M.ice,.86)
   rect(p.x+c.dir*p.radius*.49,p.y-4,5,8,M.pale)
  end
  for _,p in ipairs(c.sparks) do
   local age=c.t-p.t
   if age<18 then
    for i=-1,1 do rect(p.x+i*(7+age),p.y-age*.5+math.abs(i)*6,5,5,M.pale,1-age/18) end
   end
  end
  f.commands=#f.draws
 end
 return D
end
