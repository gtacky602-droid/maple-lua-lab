return function(C,M)
 local controller={}
 local function weakKeys() return setmetatable({},{__mode='k'}) end
 local function ownLog(s,w,key,actor,value,member)
  C.combatEvent(s,'heretic:'..key,actor or 0,w.primary.id,value or 0)
  if member then s.events[#s.events].member=member end
 end
 local function log(s,w,key,actor,value)
  local room=s.coopWorld or (s.coop and s.coop.weeklySlot==w and s.coop)
  if not room then ownLog(s,w,key,actor,value);return end
  local source=s.coopMember and s.coopMember.id
  for _,member in ipairs(room.members) do
   if member.online and C.sharesCoopField(member.state) then ownLog(member.state,w,key,actor,value,source) end
  end
 end
 local function contribute(s,w,id)
  if s.coop and s.coop.weeklySlot==w then C.coopContact(s,w.primary,id) end
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function targetable(e,open)
  e.invulnerable=not open;e.underground=not open;e.noAutoTarget=not open
 end
 local function ground(e,spec,x)
  e.x,e.y=x,spec.floorY
  e.hitTop,e.hitBottom=e.y-110,e.y
 end
 local function clearTrial(s,w)
  for _,e in ipairs(w.anchors) do remove(s,e) end
  w.anchors={}
  if w.cast then w.cast.child=nil end
 end
 local function start(s,w,spec,key)
  local e=w.primary
  local a=M.target(s,e.x) or e
  local c={key=key,t=0,move=spec.moves[key],origin=e.x,dir=a.x>=e.x and 1 or -1,seen={},shots={}}
  w.cast=c;w.phase='warning';w.contactTick=nil
  if key=='WH10' or key=='WH13' or key=='WH19' then targetable(e,false)
  else targetable(e,true) end
  if key=='WH10' or key=='WH13' then
   e.aura=nil;e.burning=nil;e.applicationClocks=nil
  end
  if key=='WH10' then
   w.stage='changing';w.phase='changing'
   ground(e,spec,e.x)
  elseif key=='WH13' then
   w.stage='trial';w.phase='anchors'
   w.trialId=w.trialId+1
   c.chant=c.move.chant_count;c.wallIndex=0;c.pushedAt=weakKeys()
   c.nextChild=c.move.spawn_tick
   ground(e,spec,M.x(spec,spec.trial.bodyU));e.dir=-1
  elseif key=='WH19' then
   w.stage='p2';w.phase='stagger'
   ground(e,spec,spec.center)
  else
   w.stage=w.form==1 and 'p1' or 'p2'
   if key=='WH18' then c.failureDamage=weakKeys() end
  end
  log(s,w,key,0,w.trialId)
  return c
 end
 local function ledger()
  return {last=weakKeys(),events=weakKeys()}
 end
 local function credit(s,w,c,e,cast)
  local tick=w.contactTick or c.t
  if not cast.impactEvent or cast.reaction or tick>c.move.total or (e==w.primary and c.brokenAt and tick<=c.brokenAt) then return false end
  local l=e==w.primary and c.ledger or e.ledger
  if (l.events[cast] or 0)>=cast.impactEvent then return false end
  l.events[cast]=cast.impactEvent
  local a=s.actors[cast.id]
  if not a or tick-(l.last[a] or -math.huge)<c.move.hit_interval_ticks then return false end
  l.last[a]=tick;c.resolutionTick=tick
  C.combatNumber(s,e,'−1',M.safe)
  contribute(s,w,cast.id)
  return true
 end
 local function contact(s,w,spec,e,cast,mult,color,element)
  local c=w.cast
  if e.hp<=0 or e.invulnerable then return false end
  if c and c.key=='WH13' then
   if not c.brokenAt or c.chant<=0 or not credit(s,w,c,e,cast) then return false end
   c.chant=c.chant-1
   log(s,w,'WH13:chant',cast.id,c.chant)
   return true
  end
  if c and c.key=='WH19' and (w.contactTick or c.t)>=c.move.exposure[2] then return false end
  local resist=C.enemyResistance(cast,e,element)
  if resist>=1 then return false end
  local amount,crit=C.enemyHitDamage(s,cast,e,mult,element,resist)
  local available=e.hp-(w.form==1 and spec.p2Hp or 0)
  amount=math.min(amount,available)
  if amount<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+amount
  C.combatNumber(s,e,crit and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,e.id,amount)
  local event=s.events[#s.events]
  event.element=element;event.reaction=cast.reaction or false;event.critical=not not crit
  contribute(s,w,cast.id)
  if amount==available and w.form==2 then
   C.defeatEnemy(s,e,cast.id)
  else
   e.hp=e.hp-amount
   if amount==available then
    local transformation=start(s,w,spec,'WH10')
    transformation.startClock=w.clock+(w.forecast or 0)
   elseif C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,amount) end
  end
  return true
 end
 local function anchorContact(s,w,c,e,cast)
  if c.breakReady or e.hp<=0 or not credit(s,w,c,e,cast) then return false end
  e.hp=e.hp-1
  log(s,w,'WH13:anchor',cast.id,e.hp)
  if e.hp==0 then c.breakReady=true;targetable(e,false) end
  return true
 end
 local function addAnchors(s,w,spec,c)
  for i,u in ipairs(spec.trial.pointsU) do
   local hp,y=c.move.anchor_count_hp,spec.floorY
   local e={id=spec.entity+i,kind='anchor',x=M.x(spec,u),y=y,hp=hp,maxhp=hp,
    hitTop=y-.85*spec.board.unit,hitBottom=y-.20*spec.board.unit,
    hitHalfWidth=21,custom=true,boss=true,noRewards=true,weeklyPart=true,respawn=math.huge,warning=0,ledger=ledger()}
   e.onCastContact=function(state,cast) return anchorContact(state,w,c,e,cast) end
   w.anchors[#w.anchors+1]=e;s.enemies[#s.enemies+1]=e
  end
  c.ledger=ledger()
  log(s,w,'WH13:ready',0,c.chant)
 end
 local function sweep(s,w,spec,parent,child)
  local wall=child.wall
  local previous=wall.x
  wall.x=wall.x-wall.speed
  for _,a in ipairs(s.actors) do
   local from=(w.actorBefore and w.actorBefore[a]) or a.x
   local lo,hi=math.min(from-previous,a.x-wall.x),math.max(from-previous,a.x-wall.x)
   local fits=a.y<174 or a.y<=wall.bottom+1 and a.y-78>=wall.top
   if a.hp>0 and lo<=spec.trial.wallHalfWidth+18 and hi>=-spec.trial.wallHalfWidth-18 and not fits and
      not wall.touched[a] and w.clock-(parent.pushedAt[a] or -math.huge)>=child.move.push_interval_ticks then
    wall.touched[a]=true;parent.pushedAt[a]=w.clock
    local x=a.x
    a.x=math.min(x,math.max(spec.board.left+10,x-child.move.max_push_U*spec.board.unit))
    local party=s.actorOwners and s.actorOwners[a] or s
    ownLog(party,w,'WH14:push',a.id,math.floor((x-a.x)*10+.5)/10)
   end
  end
 end
 local function newChild(s,w,spec,c)
  local key=c.brokenAt and c.move.children_after_break[1] or c.move.children_before_break[1]
  local move=spec.moves[key]
  if c.t+move.total>=c.move.total then return end
  local e=w.primary
  local child={key=key,move=move,t=0,origin=e.x,dir=-1,seen={},shots={}}
  if key=='WH14' then
   c.wallIndex=c.wallIndex+1
   local U=spec.board.unit;local upper=c.wallIndex%2==0
   local bottom=spec.floorY-(upper and spec.trial.upperHoleBaseU*U or 0)
   child.gap={bottom=bottom,top=bottom-spec.trial.holeHeightU*U,upper=upper}
  end
  c.child=child;log(s,w,key)
 end
 local function stepTrial(s,w,spec,c)
  if c.breakReady and not c.brokenAt and c.t>=c.resolutionTick then
   clearTrial(s,w)
   c.brokenAt=c.t;c.nextChild=c.t+spec.trial.childGap
   targetable(w.primary,true)
   log(s,w,'WH13:open',0,c.chant)
  end
  if c.chant==0 and c.t>=c.resolutionTick or c.t>=c.move.total then
   clearTrial(s,w)
   w.lastTrial=w.clock;w.ordinary=0
   local next=start(s,w,spec,c.chant==0 and 'WH19' or 'WH18')
   next.trialResult={anchorsBroken=c.brokenAt~=nil,remainingChant=c.chant}
   return
  end
  w.phase=c.brokenAt and 'chant' or 'anchors'
  if c.t==c.move.spawn_tick then addAnchors(s,w,spec,c) end
  local child=c.child
  if not child then
   if c.t>=c.nextChild then newChild(s,w,spec,c) end
   return
  end
  child.t=child.t+1
  if child.key=='WH14' then
   local m=child.move.moving_walls[1]
   if child.t==m.spawn_tick then
    local g=child.gap
    child.wall={x=M.x(spec,9.25),speed=spec.trial.wallSpeedU*spec.board.unit/60,
     top=g.top,bottom=g.bottom,touched=weakKeys()}
   end
   if child.t==m.spawn_tick+m.ttl_ticks then child.wall=nil end
   if child.wall then sweep(s,w,spec,c,child) end
  else
   M.tick(s,w,spec,child);w.phase='chant'
  end
  if child.t>=child.move.total then c.child=nil;c.nextChild=c.t+spec.trial.childGap end
 end
 local function tick(s,w,spec)
  w.clock=w.clock+1
  local c=w.cast
  if not c then
   if w.rest>0 then w.rest=w.rest-1;return end
   if w.firstTrial or w.lastTrial and w.ordinary>=spec.trial.ordinaryCount and w.clock-w.lastTrial>=spec.trial.repeatGap then
    w.firstTrial=false;start(s,w,spec,'WH13');return
   end
   local order=w.form==1 and spec.p1Order or spec.p2Order
   local key=order[w.index];w.index=w.index%#order+1
   local x,U=w.primary.x,spec.board.unit
   if key=='WH05' and math.max(x-spec.board.left,spec.board.right-x)<3.2*U then key='WH04' end
   start(s,w,spec,key)
   return
  end
  if c.startClock and w.clock<=c.startClock then return end
  c.t=c.t+1
  w.phase=c.t>=c.move.recovery and 'recover' or 'warning'
  if c.key=='WH10' then
   w.phase='changing'
   if c.t==180 then w.form=2;w.index=1 end
   if c.t>=c.move.total then start(s,w,spec,'WH11');w.firstTrial=true end
   return
  elseif c.key=='WH13' then
   stepTrial(s,w,spec,c);return
  elseif c.key=='WH19' then
   local opens,closes=table.unpack(c.move.exposure)
   local open=c.t>=opens and c.t<closes
   targetable(w.primary,open)
   w.phase=open and 'exposure' or c.t<opens and 'stagger' or 'recover'
  else M.tick(s,w,spec,c) end
  if c.t>=c.move.total then
   if w.form==2 and c.key~='WH18' and c.key~='WH19' then w.ordinary=w.ordinary+1 end
   w.cast=nil;w.rest=w.firstTrial and 0 or spec.restTicks;w.phase='available';targetable(w.primary,true)
  end
 end
 function controller.spawn(s,w,spec)
  w.clock,w.remainder,w.index,w.rest=0,0,1,spec.noticeTicks
  w.form=1;w.stage='p1';w.anchors={};w.trialId=0;w.ordinary=0
  w.firstTrial=false;w.lastTrial=nil;w.contactTick=nil;w.actorBefore=nil
  local e=w.primary
  ground(e,spec,spec.center);e.dir=-1;e.hitHalfWidth=22
  e.onCastContact=function(state,cast,_,mult,color,element)
   return contact(state,w,spec,e,cast,mult,color,element)
  end
 end
 function controller.attach(s,w)
  s.enemies[#s.enemies+1]=w.primary
  for _,party in ipairs(s.parties or {s}) do party.grappleNodes={};party.selectedGrapple=nil end
 end
 function controller.cleanup(s,w)
  clearTrial(s,w)
  remove(s,w.primary);w.cast=nil;w.contactTick=nil;w.forecast=nil;w.actorBefore=nil
 end
 function controller.prepare(s,w,spec,input,dt)
  local c=w.cast
  w.forecast=math.floor(w.remainder+math.min(dt,1/30)*60+1e-8)
  if c then
   w.contactTick=c.t+w.forecast
   if c.key=='WH19' then
    local opens,closes=table.unpack(c.move.exposure)
    targetable(w.primary,w.contactTick>=opens and w.contactTick<closes)
   end
  end
  w.actorBefore={}
  for _,a in ipairs(s.actors) do w.actorBefore[a]=a.x end
 end
 function controller.finish(s,w,spec,dt)
  w.contactTick=nil;w.forecast=nil
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do
   w.remainder=w.remainder-1;tick(s,w,spec)
  end
  w.actorBefore=nil
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  clearTrial(s,w);w.cast=nil;w.rechallenge=true;targetable(w.primary,false)
 end
 local function painter(f,s)
  return function(x,y,width,height,color,opacity)
   if width>0 and height>0 then
    f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity}
   end
  end
 end
 local function border(rect,x,y,width,height,color,a)
  rect(x,y,width,3,color,a);rect(x,y+height-3,width,3,color,a)
  rect(x,y,3,height,color,a);rect(x+width-3,y,3,height,color,a)
 end
 local function halo(rect,e,c,clock)
  local partial=c and c.key=='WH10' and c.t<120
  local down=c and c.key=='WH19' and c.t>=60 and c.t<780
  local alpha=down and .43 or .85
  local y=e.y-(down and 95 or 121)
  local r=66+math.sin(clock/22)*2
  for _,d in ipairs({-1,1}) do
   for i=0,6 do
    local x=e.x+d*(r+21-i*5)
    rect(x-3,y-44-i*5,6,11,M.ice,alpha)
    rect(x-3,y+1+i*8,6,11,M.lightning,alpha)
   end
   if not partial then
    border(rect,e.x+d*(r+20)-11,y-38,22,25,M.ice,alpha)
    rect(e.x+d*(r+20)-4,y-31,8,10,M.safe,alpha)
   end
  end
  if not partial then
   border(rect,e.x-27,y-81,54,13,M.lightning,alpha)
   rect(e.x-6,y-86,12,12,M.ice,alpha)
  end
 end
 local function hazards(f,s,spec,c)
  local rect=painter(f,s)
  local warnings=M.warnings(spec,c)
  for _,z in ipairs(warnings) do
   local alpha=z.active and .94 or .53
   border(rect,z.lo,z.y-z.h,z.hi-z.lo,z.h,z.color,alpha)
   if z.active then
    rect(z.lo,z.y-z.h,z.hi-z.lo,z.h,z.color,.23)
    for x=z.lo+4,z.hi-6,23 do rect(x,z.y-z.h+4,4,z.h-8,z.color,.59) end
   elseif c.key=='WH05' or c.key=='WH08' or c.key=='WH12' then
    for x=z.lo+6,z.hi-8,22 do rect(x,z.y-z.h+7,3,z.h-14,z.color,.33) end
   end
  end
  for _,p in ipairs(c.shots) do
   rect(p.x-p.w,p.y-p.h,2*p.w,2*p.h,p.color,.82)
   border(rect,p.x-p.w,p.y-p.h,2*p.w,2*p.h,'#eefcff',.78)
   if p.kind=='king' or p.kind=='queen' then
    for i=-1,1 do rect(p.x+i*11-3,p.y-p.h-7-math.abs(i)*2,6,14,p.color) end
   elseif p.kind=='feather' or p.kind=='spark' then
    rect(p.x-p.vx*2-6,p.y+p.h,12,3,p.color,.7)
   else
    rect(p.x-4,p.y-4,8,8,'#fff3da')
   end
  end
  return warnings
 end
 local function drawWall(rect,spec,child)
  local g,wall=child.gap,child.wall
  local x=wall and wall.x or M.x(spec,9.25)
  local width=wall and 2*spec.trial.wallHalfWidth or 1.2*spec.board.unit
  if child.t>=child.move.moving_walls[1].spawn_tick and not wall then return end
  border(rect,x-width/2,g.top,width,g.bottom-g.top,M.safe,.89)
  if wall then
   rect(x-width/2,174,width,g.top-174,'#586c96',.86)
   rect(x-width/2,g.bottom,width,spec.floorY-g.bottom,'#586c96',.86)
   for y=174,spec.floorY-4,24 do
    if y+3<g.top or y>g.bottom then rect(x-width/2,y,width,3,M.ice,.78) end
   end
  elseif g.upper then
   rect(x-36,spec.board.platformY-4,72,4,M.safe,.8)
  end
 end
 function controller.observe(f,s,w,spec,mode,profile)
  local b,e,c=f.weeklyBoss,w.primary,w.cast
  b.label=c and c.move.title or '構え直し'
  b.formName=w.form==1 and '第一形態' or '第二形態'
  b.hp=w.form==1 and math.max(0,e.hp-spec.p2Hp) or e.hp
  b.maxhp=w.form==1 and spec.hp-spec.p2Hp or spec.p2Hp
  b.x,b.y,b.damageable=e.x,e.y,e.hp>0 and not e.invulnerable and w.phase~='chant'
  local v={form=w.form,stage=w.stage,trial=w.trialId,card=c and c.key,tick=c and c.t,anchors={},warnings={}}
  b.heretic=v
  if e.hp<=0 then return end
  local back={draws={},rectIndex=f.rectIndex,rectBatches=f.rectBatches};local rear=painter(back,s)
  if w.form==2 or c and c.key=='WH10' and c.t>=60 then halo(rear,e,c,w.clock) end
  local hover=w.form==2 and w.phase~='exposure' and 12+math.sin(w.clock/22)*3 or 0
  C.drawTallerHumanArt(back,C.hereticWeeklyArt.idle,e.x-s.camera,e.y-hover,spec.artHeight,mode,profile,e.dir>0,nil,w.clock/60)
  for _,a in ipairs(w.anchors) do
   local y=spec.floorY-.6*spec.board.unit
   v.anchors[#v.anchors+1]={x=a.x,hp=a.hp,maxhp=a.maxhp}
   for i=0,4 do
    rear(a.x-14-i*2,y-19+i*7,28+4*i,8,i%2==0 and M.ice or '#447fa5')
   end
   rear(a.x-6,y-17,12,23,'#e9fffc')
   for i=1,a.maxhp do rear(a.x-18+(i-1)*13,y+24,10,4,i<=a.hp and M.safe or '#386065') end
  end
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws);f.draws=back.draws
  if not c then return end
  v.trialResult=c.trialResult
  local rect=painter(f,s)
  if c.key=='WH13' then
   v.deadline=c.move.total;v.chant=c.chant;v.maxChant=c.move.chant_count
   v.open=c.brokenAt~=nil;v.child=c.child and c.child.key
   rect(e.x-66,e.y-204,132,9,'#27343f')
   rect(e.x-66,e.y-204,132*c.chant/v.maxChant,9,v.open and M.safe or M.lightning)
   for i=1,v.maxChant-1 do rect(e.x-66+i*132/v.maxChant,e.y-204,1,9,'#263941') end
   for i=0,3 do border(rect,e.x-20+i*6,e.y-103-i*9,40-i*12,20,M.safe,.55+i*.10) end
   if c.child then
    if c.child.key=='WH14' then
     local g,wall=c.child.gap,c.child.wall
     local config=c.child.move.moving_walls[1]
     v.hole=(c.child.t<config.spawn_tick+config.ttl_ticks) and
      {upper=g.upper,top=g.top,bottom=g.bottom,x=wall and wall.x} or nil
     drawWall(rect,spec,c.child)
    else v.warnings=hazards(f,s,spec,c.child) end
   end
  elseif c.key=='WH19' then
   v.exposure=w.phase=='exposure' and c.move.exposure[2]-c.t or nil
   v.exposureEnded=c.t>=c.move.exposure[2]
  else
   if c.failureDamage then v.failureDamage=c.failureDamage[s.actors[s.active]] end
   v.warnings=hazards(f,s,spec,c)
  end
 end
 return controller
end
