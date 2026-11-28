return function(C)
 local controller={}
 local priorDebt,priorBuild=C.applyHealingDebt,C.onCastBuilt
 local U=88
 local red,cream,dark='#ff6575','#ffe5dc','#671e39'
 local cancelInput={dodge=true,jump=true,drop=true,normal=true,skill1=true,skill2=true,skill3=true,skill4=true}
 local function clamp(x,lo,hi) return math.max(lo,math.min(x,hi)) end
 local function ownLog(s,w,key,owner,value) C.combatEvent(s,'knave:'..key,owner or 0,w.primary.id,value or 0) end
 local function log(s,w,key,owner,value)
  local room=s.coopWorld or (s.coop and s.coop.weeklySlot==w and s.coop)
  if not room then ownLog(s,w,key,owner,value);return end
  for _,member in ipairs(room.members) do
   if C.sharesCoopField(member.state) then ownLog(member.state,w,key,owner,value) end
  end
 end
 local function actor(s) return s.actors[s.active] end
 local function actorParty(s,a) return s.actorOwners and s.actorOwners[a] or s end
 local function target(s,e)
  if not s.parties then return actor(s) end
  local best,distance=e,math.huge
  for _,party in ipairs(s.parties) do
   local a=actor(party)
   if a.hp<=0 then a=party.actors[3-party.active] end
   local dx=math.abs(a.x-e.x)
   if a.hp>0 and dx<distance then best,distance=a,dx end
  end
  return best
 end
 local function current(s)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='knave' and not w.waitUntil then return w,spec end
 end
 local function ledger(w,a)
  local record=w.actors[a]
  if not record then record={debt=0,lastPay=-math.huge};w.actors[a]=record end
  return record
 end
 local function controls(w,s)
  local record=w.players[s]
  if not record then record={};w.players[s]=record end
  return record
 end
 local function contract(s,w,spec,a)
  if a.hp<=0 then return false end
  local d=ledger(w,a)
  local before=d.debt
  d.debt=math.min(a.maxhp*spec.debt.cap,before+a.maxhp*spec.debt.apply)
  if d.debt<=before then return false end
  if before==0 then d.nextDrain=w.debtClock+spec.debt.drainEvery end
  ownLog(s,w,'WK08:debt',a.id,d.debt-before)
  return true
 end
 local function repay(s,w,a,amount,method)
  local d=ledger(w,a)
  if d.debt<=0 or amount<=0 then return 0 end
  local paid=math.min(amount,d.debt)
  d.debt=math.max(0,d.debt-paid)
  ownLog(s,w,'WK08:'..method,a.id,paid)
  if d.debt<1e-7 then
   d.debt=0;d.nextDrain=nil
   if not d.feather then
    d.feather={};ownLog(s,w,'WK08:feather',a.id,1)
   end
  end
  return paid
 end
 function C.applyHealingDebt(s,a,amount)
  if priorDebt then amount=priorDebt(s,a,amount) end
  local w=current(s)
  if w and w.actors then return amount-repay(s,w,a,amount,'heal') end
  return amount
 end
 function C.onCastBuilt(s,a,cast,delay,lock,definition)
  if priorBuild then priorBuild(s,a,cast,delay,lock,definition) end
  local w=current(s)
  local localState=w and w.players and w.players[s]
  local order=localState and localState.order
  if order and order.actor==a and cast.isNormal and cast.playerInputAt and not cast.growthAI and not order.cast then
   order.cast=cast;cast.knaveOrder=order
  end
 end
 local function shielded(e,yes)
  e.invulnerable=yes;e.noAutoTarget=yes
 end
 local function locate(e,x,y)
  e.x,e.y=x,y;e.hitTop=y-90;e.hitBottom=y
 end
 local function start(s,w,spec,key)
  local e=w.primary;local a=target(s,e)
  local move=spec.moves[key]
  local c={key=key,move=move,t=0,groups={},shots={},charged={},origin=e.x,target=clamp(a.x,168,792),dir=a.x>=e.x and 1 or -1}
  c.dash=clamp(e.x+c.dir*math.min(4*U,math.abs(a.x-e.x)+45),120,840)
  if key=='WK10' then c.variant=w.glyph;w.glyph=w.glyph=='circle' and 'cross' or 'circle' end
  if move.contract or key=='WK07' then
   local cap=w.form==1 and spec.hp-spec.secondHp or spec.secondHp
   local bottom=w.form==1 and spec.secondHp or 0
   c.spent=math.min(cap*.005,math.max(0,e.hp-bottom-1));e.hp=e.hp-c.spent
  end
  if key=='WK07' then w.lastDeclaration=w.clock;w.declared=true end
  w.cast=c;e.dir=c.dir
  w.phase=key=='WK11' and 'transform' or key=='WK17' and 'interrupted' or 'warning'
  log(s,w,key)
  return c
 end
 local function hit(s,w,spec,cast,mult,color,element)
  local e,c=w.primary,w.cast
  if e.hp<=0 or e.invulnerable then return false end
  local resistance=C.enemyResistance(cast,e,element)
  if resistance>=1 then return false end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,resistance)
  n=math.min(n,e.hp-(w.form==1 and spec.secondHp or 0))
  if n<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+n
  C.combatNumber(s,e,critical and (n..'!') or n,color)
  C.combatEvent(s,'hit',cast.id,e.id,n)
  local event=s.events[#s.events];event.element=element;event.critical=not not critical;event.reaction=cast.reaction or false
  if s.coop then C.coopContact(s,e,cast.id) end
  if w.form==2 and n==e.hp then C.defeatEnemy(s,e,cast.id);return true end
  e.hp=e.hp-n
  if w.form==1 and e.hp==spec.secondHp then
   shielded(e,true)
   for _,record in pairs(w.players) do record.hold=nil end
   start(s,w,spec,'WK11');return true
  end
  local order=cast.knaveOrder
  local window=c and c.move.interrupt
  local a=actor(s)
  if order and not order.resolved and order.cast==cast and order.enemyCast==c and a==order.actor and a.hp>0 then
   order.resolved=true
   local d=ledger(w,a)
   if d.feather==order.feather and window and c.t>=window[1] and c.t<window[2] then
    d.feather=nil;ownLog(s,w,'WK09',a.id,1)
    start(s,w,spec,'WK17').interruptedBy=a
   end
  end
  if C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  return true
 end
 function controller.spawn(s,w,spec)
  w.clock,w.debtClock,w.remainder=0,0,0
  w.form,w.index,w.rest=1,1,spec.noticeTicks
  w.declared,w.lastDeclaration,w.glyph=false,-math.huge,'circle'
  w.actors=setmetatable({},{__mode='k'});w.players=setmetatable({},{__mode='k'})
  local e=w.primary
  locate(e,spec.center,spec.floorY);e.dir=-1
  e.onCastContact=function(state,cast,_,mult,color,element) return hit(state,w,spec,cast,mult,color,element) end
 end
 function controller.attach(s,w,spec)
  s.enemies[#s.enemies+1]=w.primary
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil;ledger(w,a) end
 end
 function controller.cleanup(s,w)
  w.cast,w.actors,w.players=nil,nil,nil
  for i=#s.enemies,1,-1 do if s.enemies[i]==w.primary then table.remove(s.enemies,i) end end
 end
 function controller.leaveCoop(s,w)
  if not w.actors then return end
  for _,a in ipairs(s.actors) do w.actors[a]=nil end
  w.players[s]=nil
 end
 function controller.beforeAction(s,w,key)
  if cancelInput[key] then
   local state=controls(w,s);state.hold=nil;state.cancelHold=true
  end
 end
 local function lampAt(spec,a)
  if not a.ground or math.abs(a.y-spec.floorY)>4 then return end
  for i,x in ipairs(spec.lamps.x) do if math.abs(a.x-x)<=spec.lamps.radius then return i end end
 end
 local function prepareParty(s,w,input)
  local state=controls(w,s)
  state.held=input and input.interact and not (input.jump or input.attack or state.cancelHold or s.auto)
  state.cancelHold=false
  if not state.held then state.hold=nil end
 end
 function controller.prepare(s,w,spec,input)
  if not s.coopWorld then prepareParty(s,w,input);return end
  for _,member in ipairs(s.coopWorld.members) do
   if C.sharesCoopField(member.state) then prepareParty(member.state,w,member.online and member.input) end
  end
 end
 function controller.interact(s,w,spec,key)
  local a=actor(s)
  if key~='encounter_interact' or s.auto or a.hp<=0 or w.primary.invulnerable then return end
  local d=ledger(w,a)
  if not d.feather then return end
  local state=controls(w,s);state.hold=nil;state.cancelHold=true
  local order={actor=a,enemyCast=w.cast,feather=d.feather}
  local first=#s.pending+1
  state.order=order
  if C.attack(s,a,'normal') and not order.cast then
   for i=first,#s.pending do
    local cast=s.pending[i]
    if cast.id==a.id and cast.isNormal and cast.playerInputAt and not cast.growthAI then
     order.cast=cast;cast.knaveOrder=order;break
    end
   end
  end
  state.order=nil
 end
 local function updateLamp(s,w,spec,frozen)
  local state=controls(w,s);local a=actor(s)
  local d=ledger(w,a)
  local lamp=state.held and a.hp>0 and a.lock<=0 and not a.channel and d.debt>0 and lampAt(spec,a)
  if not lamp or frozen then state.hold=nil;return end
  local hold=state.hold
  if not hold or hold.actor~=a or hold.lamp~=lamp then
   hold={actor=a,lamp=lamp,next=math.max(w.clock+spec.lamps.start,d.lastPay+spec.lamps.interval)}
   state.hold=hold
  end
  if w.clock>=hold.next then
   d.lastPay=w.clock;hold.next=w.clock+spec.lamps.interval
   repay(s,w,a,a.maxhp*spec.lamps.ratio,'lamp')
   if d.debt==0 then state.hold=nil end
  end
 end
 local function updateLedger(s,w,spec,frozen)
  if not frozen then w.debtClock=w.debtClock+1 end
  for _,a in ipairs(s.actors) do
   local d=ledger(w,a)
   if a.hp<=0 then d.debt=0;d.feather=nil;d.nextDrain=nil end
   d.debt=math.min(d.debt,a.maxhp*spec.debt.cap)
   if d.debt>0 and not frozen and w.debtClock>=d.nextDrain then
    d.nextDrain=w.debtClock+spec.debt.drainEvery
    C.damageActor(actorParty(s,a),a,math.max(1,a.maxhp*spec.debt.drain),w.primary,false,false)
    if a.hp<=0 then d.debt=0;d.feather=nil;d.nextDrain=nil end
   end
  end
  for _,party in ipairs(s.parties or {s}) do updateLamp(party,w,spec,frozen) end
 end
 local function lock(s,w,spec,c)
  local e=w.primary;local a=target(s,e)
  if c.key=='WK18' and c.t==270 then return end -- The descent committed on the first lock.
  c.origin=e.x;c.dir=a.x>=e.x and 1 or -1;e.dir=c.dir
  c.target=clamp(a.x,168,792)
  c.dash=clamp(c.origin+c.dir*math.min(4*U,math.abs(a.x-c.origin)+45),120,840)
 end
 local function band(x1,x2,y,height)
  return {lo=math.min(x1,x2),hi=math.max(x1,x2),y=y,height=height}
 end
 local function around(x,r,y,h) return band(x-r,x+r,y,h) end
 local function forward(c,x,length,y,h,dir) return band(x+(dir or c.dir)*18,x+(dir or c.dir)*length,y,h) end
 local function shapes(spec,c,i)
  local key,y,x=c.key,spec.floorY,c.origin
  if key=='WK02' then
   if i==1 then return {forward(c,x,2.4*U,y-62,44)} end
   x=x+c.dir*.8*U
  elseif key=='WK04' then x=c.dash or x
  elseif key=='WK05' then
   x=c.target
   if i==1 then return {around(x,1.3*U,y,1.3*U)} end
   return {forward(c,x,1.8*U,y,1.45*U,-c.dir)}
  elseif key=='WK06' then x=clamp(x-c.dir*.8*U,120,840)
  elseif key=='WK10' then
   if c.variant=='circle' then
    if i==2 then return {band(120,296,y,105),band(664,840,y,105)} end
    return {around(spec.center,(i==1 and 1.5 or 2.1)*U,y,112)}
   end
   if i==3 then return {around(spec.center,1.5*U,y,112)} end
   local slope=i==1 and 1 or -1
   local boxes={}
   for j=-2,2 do boxes[#boxes+1]=around(spec.center+j*55,29,y-45-j*slope*30,44) end
   return boxes
  elseif key=='WK13' then x=clamp(x+c.dir*1.25*U,120,840)
  elseif key=='WK14' then
   if i==2 then return {band(0,251,y,1.3*U),band(709,960,y,1.3*U)} end
   return {around(spec.center,(i==1 and 1.4 or 2)*U,y,1.3*U)}
  elseif key=='WK15' then return {forward(c,x,4*U,y,1.2*U)}
  elseif key=='WK16' then return {band(80,880,y-15-(i-1)*55,46)}
  elseif key=='WK18' then
   local target=c.target
   if i==1 or i==2 then return {around(clamp(target+(i==1 and -122 or 122),90,870),70,y,115)} end
   if i==4 then return {around(target,176,y,95)} end
   local boxes={around(target,116,y,130)}
   for _,dx in ipairs({-162,-108,-54,54,108,162}) do boxes[#boxes+1]=around(target+dx,21,y-34,122) end
   return boxes
  end
  return {forward(c,x,(key=='WK12' and (i==6 and 2.2 or 1.8) or 1.7)*U,y,1.5*U)}
 end
 local function inside(a,b)
  return a.hp>0 and a.x>=b.lo and a.x<=b.hi and a.y-38>=b.y-b.height and a.y-38<=b.y+5
 end
 local function damage(s,w,spec,c,a)
  local party=actorParty(s,a)
  local actual=C.damageActor(party,a,spec.damage[c.key] or spec.baseDamage,w.primary,true,true)
  if actual<=0 then return end
  local state=controls(w,party)
  if state.hold and state.hold.actor==a then state.hold=nil;state.held=false end
  if c.move.contract and not c.charged[a] then
   c.charged[a]=true
   if contract(party,w,spec,a) and not c.refunded then
    c.refunded=true;w.primary.hp=w.primary.hp+c.spent
   end
  end
  ownLog(party,w,c.key..':hit',a.id,actual)
 end
 local function strike(s,w,spec,c,boxes,seen)
  for _,a in ipairs(s.actors) do
   if not seen[a] then
    for _,box in ipairs(boxes) do
     if inside(a,box) then seen[a]=true;damage(s,w,spec,c,a);break end
    end
   end
  end
 end
 local function motion(w,spec,c)
  local e,t=w.primary,c.t
  local function approach(from,to,lo,hi) return from+(to-from)*clamp((t-lo)/(hi-lo),0,1) end
  local k,x,y=c.key,c.origin,spec.floorY
  if k=='WK02' and t>=108 then x=x+c.dir*approach(0,.8*U,108,138)
  elseif k=='WK04' and t>=72 then x=approach(x,c.dash,72,96)
  elseif k=='WK05' and t>=72 then
   x=approach(x,c.target,72,138);y=y-1.8*U*math.sin(math.pi*clamp((t-72)/66,0,1))
  elseif k=='WK06' and t>=42 then x=approach(x,clamp(x-c.dir*.8*U,120,840),42,72)
  elseif k=='WK07' then x=approach(x,spec.center,0,60)
  elseif k=='WK13' and t>=264 then x=approach(x,clamp(x+c.dir*1.25*U,120,840),264,330)
  elseif k=='WK18' then
   x=approach(x,c.target,270,330)
   if t<=330 then y=y-200*clamp(t/90,0,1) end
   if t>=300 and t<=330 then y=y+200*(t-300)/30 end
  end
  if k~='WK17' then locate(e,clamp(x,82,878),y) end
 end
 local function tickCast(s,w,spec,c)
  local move=c.move
  c.t=c.t+1
  if c.t>=move.total then
   w.cast=nil;w.rest=spec.restTicks;w.phase='available';shielded(w.primary,false);return
  end
  for _,tick in ipairs(move.locks) do if c.t==tick then lock(s,w,spec,c) end end
  motion(w,spec,c)
  if c.key=='WK07' and c.t==120 then
   for _,party in ipairs(s.parties or {s}) do contract(party,w,spec,actor(party)) end
  end
  if c.key=='WK11' then
   if c.t==144 then w.form=2;w.index=1 end
   return
  end
  if c.key=='WK17' then w.phase=c.t>=36 and (c.t<252 and 'exposure' or 'recover') or 'interrupted';return end
  if move.unattackable then shielded(w.primary,c.t>=move.unattackable[1] and c.t<move.unattackable[2]) end
  w.phase=c.t>=move.recovery and 'recover' or 'warning'
  for i,win in ipairs(move.windows) do
   if c.t>=win[1] and c.t<win[2] then
    c.groups[i]=c.groups[i] or {};strike(s,w,spec,c,shapes(spec,c,i),c.groups[i]);w.phase='active'
   end
  end
  for _,definition in ipairs(move.projectiles) do
   for _,spawn in ipairs(definition.spawn_ticks) do
    if c.t==spawn then
     c.shots[#c.shots+1]={x=c.origin,y=spec.floorY-.85*U,expires=spawn+definition.ttl_ticks,
      dx=c.dir*U*(c.key=='WK03' and 6 or 5)/60,seen={}}
    end
   end
  end
  for i=#c.shots,1,-1 do
   local p=c.shots[i]
   if c.t>=p.expires or p.x<-28 or p.x>988 then table.remove(c.shots,i)
   else
    strike(s,w,spec,c,{around(p.x,.22*U,p.y+22,44)},p.seen);p.x=p.x+p.dx
   end
  end
 end
 local function update(s,w,spec)
  w.clock=w.clock+1
  local c=w.cast
  updateLedger(s,w,spec,c and c.key=='WK11')
  if c then tickCast(s,w,spec,c);return end
  if w.rest>0 then w.rest=w.rest-1;return end
  local late=w.form==2 and w.clock>w.lastDeclaration+spec.debt.declareGap
  if (w.form==1 and not w.declared and w.primary.hp<=spec.secondHp+(spec.hp-spec.secondHp)*.70) or late then
   start(s,w,spec,'WK07');return
  end
  local order=w.form==1 and spec.first or spec.second
  local e=w.primary;local a=target(s,e)
  local nextKey=order[w.index]
  if spec.closeMoves[nextKey] and math.abs(a.x-e.x)>130 then
   locate(e,e.x+clamp(a.x-e.x,-2.6,2.6),spec.floorY);e.dir=a.x>=e.x and 1 or -1;w.phase='approach';return
  end
  w.index=w.index%#order+1
  start(s,w,spec,nextKey)
 end
 function controller.finish(s,w,spec,dt)
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;update(s,w,spec) end
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  w.cast=nil;w.rechallenge=true;shielded(w.primary,true)
 end
 local function warnings(spec,c)
  local out={}
  if not c then return out end
  for i,win in ipairs(c.move.windows) do
   local lead=i==1 and 0 or win[1]-65
   if c.key=='WK10' or c.key=='WK14' or c.key=='WK16' then lead=0
   elseif c.key=='WK18' and i==3 then lead=240 end
   if c.t>=lead and c.t<win[2] then
    for _,b in ipairs(shapes(spec,c,i)) do
     b.at=win[1];out[#out+1]=b
    end
   end
  end
  return out
 end
 local labels={available='構え直し',approach='接近中',warning='予兆',active='攻撃中',recover='後隙',
  transform='凶月の羽化',interrupted='赤宴を中断',exposure='反撃の好機'}
 function controller.observe(f,s,w,spec,mode,profile)
  local v,e,c=f.weeklyBoss,w.primary,w.cast
  v.label=labels[w.phase];v.phaseHp={{name='片鎌',hp=math.max(0,e.hp-spec.secondHp),max=spec.hp-spec.secondHp},
   {name='凶月・双鎌',hp=math.min(e.hp,spec.secondHp),max=spec.secondHp}}
  if not w.actors or e.hp<=0 then return end
  local a=actor(s)
  local hold=controls(w,s).hold
  local window=c and c.move.interrupt
  local rows={}
  for _,owner in ipairs(s.actors) do
   local d=ledger(w,owner)
   rows[#rows+1]={id=owner.id,debt=math.ceil(d.debt-1e-7),cap=math.ceil(owner.maxhp*spec.debt.cap),feather=d.feather~=nil}
  end
  local title=c and c.move.title
  if c and c.variant then title=title..(c.variant=='circle' and '・円' or '・斜線') end
  local b={form=w.form,card=c and c.key,title=title,tick=c and c.t,actors=rows,active=a.id,x=e.x,nearLamp=lampAt(spec,a),
   hold=hold and math.max(0,hold.next-w.clock),window=window and c.t>=window[1] and c.t<window[2],
   exposure=w.phase=='exposure' and 252-c.t,airborne=c and c.key=='WK18' and e.invulnerable}
  local debt=ledger(w,a).debt
  if debt>0 then
   local lamps=spec.lamps
   local index=math.abs(a.x-lamps.x[1])<=math.abs(a.x-lamps.x[2]) and 1 or 2
   b.lampCue={index=index,needsGround=not b.nearLamp and math.abs(a.x-lamps.x[index])<=lamps.radius,
    payments=math.ceil(debt/(a.maxhp*lamps.ratio)-1e-7)}
  end
  if b.window then b.interruptTicks=window[2]-c.t end
  if c and c.key=='WK11' then b.transformTicks=c.move.total-c.t end
  if c and c.interruptedBy then
   local owner=c.interruptedBy
   b.feastResult={kind='interrupted',actor=s.actors[owner.id]==owner and owner.id or nil}
  elseif c and c.key=='WK15' and c.t>=c.move.windows[#c.move.windows][2] then
   b.feastResult={kind='ended'}
  end
  v.knave=b
  local back={draws={}}
  local double=w.form==2 or c and c.key=='WK11' and c.t>=96
  local height=double and 136 or spec.artHeight
  if w.phase=='exposure' then height=height-13 end
  if c and c.key=='WK18' and c.t<420 then
   local radius=math.min(61,8+c.t*.59)
   for dy=-60,60,6 do
    if math.abs(dy)<radius then
     local width=2*math.sqrt(radius*radius-dy*dy)
     back.draws[#back.draws+1]={kind='rect',x=c.target-s.camera-width/2,y=222+dy,w=width,h=6,color='#752642',opacity=.78}
    end
   end
  end
  C.drawTallerHumanArt(back,C.knaveWeeklyArt[double and 'double' or 'single'],e.x-s.camera,e.y,height,mode,profile,e.dir<0,nil,w.clock/60)
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws);f.draws=back.draws
  local function rect(x,y,width,height,color,opacity)
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity}
  end
  for i,x in ipairs(spec.lamps.x) do
   rect(x-8,spec.floorY-20,16,20,dark);rect(x-11,spec.floorY-28,22,10,cream)
   if b.nearLamp==i and rows[a.id].debt>0 then rect(x-17,spec.floorY-36,34,4,red) end
  end
  b.warnings=warnings(spec,c)
  for _,z in ipairs(b.warnings) do
   local opacity=c.t>=z.at and 1 or .62
   rect(z.lo,z.y-2,z.hi-z.lo,3,red,opacity)
   rect(z.lo,z.y-z.height,2,z.height,red,opacity);rect(z.hi-2,z.y-z.height,2,z.height,red,opacity)
   if c.t>=z.at then rect(z.lo,z.y-z.height,z.hi-z.lo,3,cream) end
  end
  if c then
   if c.key=='WK04' and c.t<96 then
    rect(math.min(c.origin,c.dash),spec.floorY-14,math.max(1,math.abs(c.origin-c.dash)),2,cream,.75)
   end
   for _,definition in ipairs(c.move.projectiles) do
    for _,at in ipairs(definition.spawn_ticks) do
     if c.t>=at-48 and c.t<at then
      local edge=c.dir==1 and 940 or 20
      rect(math.min(c.origin,edge),spec.floorY-.85*U,math.max(1,math.abs(edge-c.origin)),2,cream,.72)
     end
    end
   end
   if c.key=='WK15' and c.t>=180 and c.t<300 then
    local b=shapes(spec,c,1)[1]
    rect(b.lo,b.y-b.height*.54,b.hi-b.lo,7,red,.56)
   end
   for _,p in ipairs(c.shots) do
    rect(p.x-17,p.y-7,34,14,dark);rect(p.x-11,p.y-10,22,20,red);rect(p.x-4,p.y-4,8,8,cream)
   end
   if b.window then rect(e.x-11,e.y-height-13,22,5,cream);rect(e.x-5,e.y-height-18,10,5,red) end
   if c.key=='WK17' and c.t<36 then
    for i=1,7 do rect(e.x+(i-4)*(c.t+8),e.y-54-math.abs(i-4)*7,5,5,cream) end
   end
  end
 end
 return controller
end
