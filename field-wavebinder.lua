return function(C)
 local sailor={}
 local U=88
 local cyan,navy,gold='#37d8ff','#20344e','#ffc46d'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY
  b.hitTop,b.hitBottom=s.floorY-s.bodyHeight,s.floorY
 end
 local function resetContacts(b,time)
  b.courageOpenedAt=time or 0;b.courageContacts=setmetatable({},{__mode='k'})
 end
 function sailor.spawn(b,s)
  b.courage,b.valiant,b.rageAge,b.downTicks,b.drinkInterrupts=0,false,0,0,0
  b.downReason=nil;resetContacts(b);place(b,s,'idle','idle')
 end
 function sailor.cancel(b,s)
  b.courage,b.valiant,b.rageAge,b.downTicks=0,false,0,0
  b.downReason=nil;resetContacts(b);place(b,s,'idle','idle')
 end
 function sailor.onDefeat(_,b,s) sailor.cancel(b,s) end
 function sailor.damageFactor(_,_,b,s)
  if s.draftMoves then return 1 end
  if b.form=='down' then return s.courage.downFactor end
  return b.valiant and s.courage.damageFactor or 1
 end
 function sailor.onHit(cast,b,s,slot,element,damage,party)
  if cast.reaction or not cast.startedAt then return end
  if s.draftMoves then
   local c=slot.cast
   if not c or c.move.kind~='drinkSweep' or c.breakRequested or c.reposition or c.restart or
      damage<=0 or cast.persistentTarget or c.contacts[cast] then return end
   local actor=party.actors[cast.id]
   if not actor or actor.hp<=0 then return end
   local _,now=C.fieldSlot(party,b.fieldBoss)
   local m=c.move
   local t=math.floor((now-c.startTime)*60+.5)
   if t<m.open or t>=m.close or not C.fieldCastStartedSince(party,b.fieldBoss,cast,c.startTime+m.open/60) then return end
   c.contacts[cast]=true
   c.hits=math.min(s.courage.drinkHits,c.hits+(element=='electro' and s.courage.electroDrinkHits or 1))
   if c.hits==s.courage.drinkHits then c.breakRequested=t end
   return
  end
  if element=='electro' and not b.courageContacts[cast] and
     C.fieldCastStartedSince(party,b.fieldBoss,cast,b.courageOpenedAt) then
   b.courageContacts[cast]=true;b.courage=math.max(0,b.courage-s.courage.electroDrain)
  end
  local c=slot.cast
  if not c or not c.drinkOpen or c.drinkClosed or c.contacts[cast] or
     not C.fieldCastStartedSince(party,b.fieldBoss,cast,c.openedAt) then return end
  c.contacts[cast]=true;c.hits=c.hits+(element=='electro' and s.courage.electroDrinkHits or 1)
 end
 function sailor.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 function sailor.preempt(b,s,slot,state,target)
  if s.draftMoves then
   local c=slot.cast
   if c and c.restart then
    slot.cast=sailor.begin(b,s,c.move,target,state)
    place(b,s,'attack','ready')
    return true
   end
   return false
  end
  if b.valiant then
   b.rageAge=b.rageAge+1
   if b.rageAge%s.courage.drainTicks==0 then b.courage=math.max(0,b.courage-1) end
   if b.courage<=0 then
    b.valiant=false;b.rageAge=0;slot.cast=nil;b.downTicks=s.courage.downTicks;b.downReason='valiant'
   end
  end
  local c=slot.cast
  if c and c.drinkOpen and not c.drinkClosed and c.hits>=s.courage.drinkHits then
   slot.cast=nil;b.downTicks=s.courage.drinkDownTicks;b.downReason='drink'
   b.drinkInterrupts=b.drinkInterrupts+1
  end
  if b.downTicks<=0 then return false end
  place(b,s,'down','down');b.downTicks=b.downTicks-1
  if b.downTicks==0 then b.downReason=nil;place(b,s,'idle','idle');slot.delay=s.restTicks end
  return true
 end
 function sailor.selectMove(b,m) return b.valiant and m.valiant or m end
 function sailor.begin(b,s,m,_,state)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{}},hits=0,
   startTime=state and state.t,
   contacts=setmetatable({},{__mode='k'}),source={id=b.id,owner=b,y=s.floorY,damageElement=m.element or 'physical'}}
 end
 local function lock(s,c,a)
  local m=c.move
  if m.kind=='throw' then
   local half=m.width*U/2
   local target=c.origin+clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
   c.center=m.chainMargin and target or clamp(target,s.arenaMin+half,s.arenaMax-half)
   c.left,c.right=c.center-half,c.center+half
   local padding=m.chainMargin and m.chainMargin*U or 12
   c.pullLeft,c.pullRight=math.min(c.origin,c.center)-padding,math.max(c.origin,c.center)+padding
  elseif m.kind=='sweep' or m.kind=='drinkSweep' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
  end
 end
 local function bounds(c,i)
  if c.move.kind=='throw' and i==2 then return c.pullLeft,c.pullRight end
  return c.left,c.right
 end
 local function safeLane(state,c)
  for i,w in ipairs(c.move.active) do
   local left,right=bounds(c,i)
   if not C.fieldGroundRetreat(state,c.dir,left,right,w[1]-c.move.lock,c.origin) then return false end
  end
  return true
 end
 local function anchorPosition(c,floor)
  local m,t=c.move,c.tick
  if not c.center or t<m.flight or t>=m.returnEnd then return end
  if t<m.land then
   local q=(t-m.flight)/(m.land-m.flight)
   return c.origin+(c.center-c.origin)*q,floor-4*q*(1-q)*.80*U
  end
  local q=math.max(0,(t-m.returnStart)/(m.returnEnd-m.returnStart))
  return c.center+(c.origin-c.center)*q,floor
 end
 local function drink(state,b,s,c)
  local m,t=c.move,c.tick
  if t==m.open then
   c.drinkOpen=true;c.openedAt=state.t;resetContacts(b,state.t)
  end
  for _,time in ipairs(m.gains) do
   if not c.drinkClosed and t==time then
    b.courage=math.min(s.courage.max,b.courage+s.courage.gain)
    if b.courage==s.courage.max then
     b.valiant=true;b.rageAge=0;c.drinkClosed=true;resetContacts(b,state.t)
    end
   end
  end
  if t>=m.close then c.drinkClosed=true end
  place(b,s,t>=m.recover and 'recover' or 'drinking',t>=m.recover and 'ready' or 'drink')
  if t<m.total then return false end
  place(b,s,'idle','idle');return true
 end
 function sailor.tick(state,b,s,c,a)
  if c.reposition then
   local dx=c.reposition-b.x
   b.x=b.x+clamp(dx,-s.walkSpeed/60,s.walkSpeed/60)
   place(b,s,'reposition','ready')
   if b.x==c.reposition then c.restart=true end
   return false
  end
  c.tick=c.tick+1;local m,t=c.move,c.tick
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then
   lock(s,c,a)
   if s.draftMoves and not safeLane(state,c) then
    c.reposition=clamp(c.origin-c.dir*.65*U,32,state.worldwidth-32)
    c.left,c.right,c.center,c.pullLeft,c.pullRight=nil,nil,nil,nil,nil
    place(b,s,'reposition','ready')
    return false
   end
  end
  if m.kind=='drink' then return drink(state,b,s,c) end
  if m.kind=='rest' then
   place(b,s,'recover','ready')
   if t<m.total then return false end
   place(b,s,'idle','idle');return true
  end
  if c.breakRequested then
   if not c.broken then b.drinkInterrupts=b.drinkInterrupts+1;c.broken=c.breakRequested end
   place(b,s,'recover','down')
   if t-c.broken<m.total-m.recover then return false end
   c.restOverride=0
   place(b,s,'idle','idle');return true
  end
  local form,pose='attack',m.kind=='sweep' and 'ready' or 'throw'
  if m.kind=='drinkSweep' then
   if t<m.open then form,pose='preparingDrink','ready'
   elseif t<m.close then form,pose='drinking','drink'
   else form,pose='valiant','ready' end
  elseif m.returnEnd and t>=m.returnEnd then pose='ready' end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage)
    if m.kind=='sweep' or m.kind=='drinkSweep' then pose='sweep' end
   end
  end
  place(b,s,t>=m.recover and 'recover' or form,t>=m.recover and 'down' or pose)
  if t<m.total then return false end
  if m.kind=='drinkSweep' then c.restOverride=0 end
  place(b,s,'idle','idle');return true
 end
 function sailor.label(b,c,s)
  if s.draftMoves then
   if b.form=='reposition' then return '位置を変えて再予告' end
   if c and c.broken then return '飲み物を中断・反撃の隙' end
   if b.form=='recover' then return '反撃の隙' end
   if b.form=='drinking' then return '熱い飲み物・中断 '..c.hits..' / '..s.courage.drinkHits..'・雷で2' end
   if b.form=='valiant' then return '勇躍・三連錨の予告範囲から退避' end
   return c and c.move.title
  end
  if b.form=='down' then return b.downReason=='drink' and '飲み物を落とした・反撃の好機' or '勇躍が切れた・反撃の好機' end
  if b.valiant then return '勇躍・豪胆値 '..b.courage..' / '..s.courage.max..'・雷で減らせる、時間でも消費' end
  if c and c.move.kind=='drink' then return '熱い飲み物・新しい直接攻撃 '..c.hits..' / '..s.courage.drinkHits..'で中断可' end
  return c and c.move.title
 end
 function sailor.frame(f,b,s,c)
  if s.draftMoves then
   f.draftMoves=true
   local view={valiant=b.form=='valiant',drinkOpen=b.form=='drinking',
    drinkHits=c and c.hits or 0,drinkRequired=s.courage.drinkHits,drinkInterrupts=b.drinkInterrupts,
    interrupted=c and c.broken~=nil or false}
   f.wavebinder=view
   if c and c.move.returnEnd then
    local x,y=anchorPosition(c,s.floorY)
    if x then view.anchor={x=x,y=y,returning=c.tick>=c.move.returnStart} end
   end
   return
  end
  f.wavebinder={courage=b.courage,maxCourage=s.courage.max,valiant=b.valiant,rageAge=b.rageAge,
   drinkOpen=c and c.drinkOpen and not c.drinkClosed or false,
   drinkHits=c and c.hits or 0,drinkRequired=s.courage.drinkHits,drinkInterrupts=b.drinkInterrupts,
   downReason=b.downReason,downTicks=b.downTicks}
 end
 local function rect(f,x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 local function lane(f,left,right,y,height,active,color)
  if active then rect(f,left,y-height,right-left,height,color..'33') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,color) end
 end
 function sailor.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  local color=(b.valiant or b.form=='valiant') and gold or cyan
  if c and c.left and not c.broken then
   local m=c.move
   for i,w in ipairs(m.active) do
    if c.tick<w[2] and (m.kind~='drinkSweep' or c.tick>=m.close) then
     local left,right=bounds(c,i)
     lane(f,left-cam,right-cam,y,m.height*U,c.tick>=w[1],color);break
    end
   end
   if m.returnEnd then
    local x,anchorY=anchorPosition(c,y)
    if x then
     local from,to=math.min(c.origin,x),math.max(c.origin,x)
     for link=from,to,12 do
      local q=x==c.origin and 0 or (link-c.origin)/(x-c.origin)
      rect(f,link-cam,y-66+(anchorY-y+18)*q,8,3,'#8296ae')
     end
     C.drawWavebinderFieldArt(f,x-cam,anchorY,'anchor',mode,profile,c.dir>0)
    end
   elseif m.kind=='throw' and c.tick>=m.flight and c.tick<m.recover then
    local q=clamp((c.tick-m.flight)/(m.land-m.flight),0,1)
    local x=c.origin+(c.center-c.origin)*q
    local from,to=math.min(c.origin,x),math.max(c.origin,x)
    for link=from,to,12 do rect(f,link-cam,y-66,8,3,'#8296ae') end
    C.drawWavebinderFieldArt(f,x-cam,y,'anchor',mode,profile,c.dir>0)
   end
  end
  C.drawWavebinderFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if s.draftMoves and b.form=='drinking' then
   local top=b.y-C.wavebinderFieldArt[b.pose].profiles.legacy.height-14
   rect(f,b.x-cam-30,top-2,56,9,navy)
   for i=1,s.courage.drinkHits do
    rect(f,b.x-cam-28+(i-1)*14,top,10,5,i<=c.hits and gold or '#8bd4ef')
   end
  elseif b.courage>0 or c and c.move.kind=='drink' then
   local top=b.y-C.wavebinderFieldArt[b.pose].profiles.legacy.height-14
   rect(f,b.x-cam-50,top,100,8,navy)
   rect(f,b.x-cam-48,top+2,96*b.courage/s.courage.max,4,color)
  end
 end
 return sailor
end
