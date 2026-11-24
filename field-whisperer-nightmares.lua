return function(C)
 local nightmare={}
 local U=88
 local serial=0
 local violet,pale,ink='#d24bfc','#f5b8ff','#242233'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY
  b.underground=form=='rift'
  b.hitTop,b.hitBottom=b.y-C.whispererNightmaresFieldArt[pose].profiles.legacy.height,b.y
 end
 function nightmare.spawn(b,s)
  b.damageShield=0
  b.onShieldDamage=nil
  b.shieldFactors=not s.draftMoves and {lunar=s.ward.lunarFactor} or nil
  place(b,s,'idle','idle')
 end
 local function clear(state,c)
  if not c or not c.summons then return end
  for _,unit in ipairs(c.summons) do
   unit.onFieldDefeat=nil
   C.removeFieldSummon(state,unit)
  end
  c.summons=nil
 end
 function nightmare.cancel(b,s,state,c)
  clear(state,c)
  nightmare.spawn(b,s)
 end
 function nightmare.onDefeat(state,b,s,c) nightmare.cancel(b,s,state,c) end
 function nightmare.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function nightmare.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
  for _,unit in ipairs(c.summons or {}) do
   if unit.seen then C.shareFieldHits({unit.seen},actors) end
  end
 end
 function nightmare.frame(f,b,s,c)
  if s.draftMoves then
   f.draftMoves=true
   if c and c.left and c.move.kind=='sequence' then
    f.fisherSequence={defeated=c.defeatedFishers or 0,lane={left=c.left,right=c.right}}
   end
   return
  end
  f.darkShield={hp=b.damageShield,maxhp=s.ward.max}
 end
 local function breakShield(state,b,s,c)
  if c.broken or b.damageShield>0 then return end
  c.broken=c.tick
  b.damageShield=0
  b.onShieldDamage=nil
  clear(state,c)
  place(b,s,'down','down')
 end
 local function signedLane(c,near,far)
  local a,b=c.origin+c.dir*near*U,c.origin+c.dir*far*U
  return math.min(a,b),math.max(a,b)
 end
 local function lock(c,s,a)
  local m=c.move
  if m.kind=='lunge' then
   c.left,c.right=signedLane(c,m.near,m.far)
   c.destination=c.origin+c.dir*m.travel*U
   if not s.draftMoves then c.destination=clamp(c.destination,s.arenaMin+90,s.arenaMax-90) end
  elseif m.kind=='rift' then
   local r=m.width*U/2
   local dx=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
   c.destination=c.origin+dx
   if not s.draftMoves then c.destination=clamp(c.destination,s.arenaMin+r,s.arenaMax-r) end
   c.left,c.right=c.destination-r,c.destination+r
  elseif m.kind=='sequence' then
   c.left,c.right=signedLane(c,m.near,m.far)
   c.fisherLanes={}
   for i,fisher in ipairs(m.fishers) do
    local left,right=signedLane(c,fisher.near,fisher.far)
    c.fisherLanes[i]={left=left,right=right,x=c.origin+c.dir*fisher.offset*U}
   end
  else
   c.left,c.right=s.arenaMin,s.arenaMax
  end
 end
 local function summonSequence(state,b,s,c)
  serial=serial+1
  local m=c.move
  c.defeatedFishers=0
  c.summons={}
  for index,lane in ipairs(c.fisherLanes) do
   local unit={id=-(b.id*1000000+serial*2+index),fieldBoss=b.fieldBoss,fisher=true,custom=true,noRewards=true,
    x=lane.x,home=lane.x,y=s.floorY,hitTop=s.floorY-70,hitBottom=s.floorY,
    hp=m.fisherHp,maxhp=m.fisherHp,level=s.level,warning=0,respawn=math.huge}
   unit.source={id=unit.id,owner=unit,y=s.floorY,damageElement=m.element}
   unit.onFieldDefeat=function(party,dead,owner)
    local slot=C.fieldSlot(party,b.fieldBoss)
    if owner and party.actors[owner] and slot and slot.cast==c and b.hp>0 and c.tick<m.expire then
     dead.interruptCredit=true
    end
   end
   c.summons[index]=unit
   state.enemies[#state.enemies+1]=unit
  end
 end
 local function fisherSequence(state,b,s,c)
  local m,t=c.move,c.tick
  if t==m.deploy then summonSequence(state,b,s,c) end
  for _,unit in ipairs(c.summons or {}) do
   if unit.hp<=0 and not unit.resolved then
    unit.resolved=true
    if unit.interruptCredit then c.defeatedFishers=c.defeatedFishers+1 end
    C.removeFieldSummon(state,unit)
   end
  end
  -- Combat resolves before the encounter tick. Deaths from the last accepted tick
  -- count, and cleanup at the deadline never awards credit.
  if c.defeatedFishers==#m.fishers then
   c.broken=t
   clear(state,c)
   place(b,s,'down','down')
   return
  end
  if t==m.expire then clear(state,c) end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local unit=c.summons and c.summons[i]
    if unit and unit.hp>0 then
     local lane=c.fisherLanes[i]
     C.hitFieldArea(state,unit.source,c.seen[i],
      lane.left,lane.right,s.floorY-m.fisherHeight*U,m.fisherDamage)
    elseif i==#m.active then
     C.hitFieldArea(state,c.source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage)
    end
   end
  end
 end
 local function summon(state,b,s,c)
  c.summons={}
  for i,offset in ipairs(s.ward.offsets) do
   local x=clamp(b.x+offset*U,s.arenaMin+36,s.arenaMax-36)
   local unit={id=-b.id-i,fieldBoss=b.fieldBoss,fisher=true,custom=true,noRewards=true,
    x=x,home=x,y=s.floorY,hitTop=s.floorY-70,hitBottom=s.floorY,
    hp=s.ward.unitHp,maxhp=s.ward.unitHp,level=s.level,warning=0,respawn=math.huge}
   c.summons[i]=unit
   state.enemies[#state.enemies+1]=unit
  end
 end
 local function fishers(state,b,s,c)
  for i,unit in ipairs(c.summons or {}) do
   if unit.hp<=0 and not unit.resolved then
    unit.resolved=true
    b.damageShield=math.max(0,b.damageShield-s.ward.max/#s.ward.offsets)
    C.removeFieldSummon(state,unit)
   elseif unit.hp>0 and c.tick>=c.move.deploy then
    local age=c.tick-c.move.deploy
    local delay=s.ward.fisherFirst+(i-1)*s.ward.fisherStagger
    if age>=delay then
     local cycle=(age-delay)%s.ward.fisherPeriod
     if cycle==0 then
      unit.markLeft,unit.markRight=unit.x-s.ward.fisherWidth*U/2,unit.x+s.ward.fisherWidth*U/2
      unit.seen={}
     end
     if cycle>=s.ward.fisherWindup and cycle<s.ward.fisherWindup+12 then
      C.hitFieldArea(state,{id=unit.id,owner=unit,y=s.floorY,damageElement='electro'},unit.seen,
       unit.markLeft,unit.markRight,s.floorY-.58*U,s.ward.fisherDamage)
     end
     unit.warningTick=cycle<s.ward.fisherWindup+12 and cycle or nil
    end
   end
  end
 end
 function nightmare.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if c.broken then
   local age=t-c.broken
   local down=m.downTicks or s.ward.downTicks
   if age<down then return false end
   if m.standTicks and age<down+m.standTicks then
    place(b,s,'standing','ready')
    return false
   end
   nightmare.spawn(b,s)
   return true
  end
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(c,s,a) end
  local form,pose='attack','ready'
  if m.kind=='lunge' and t>=m.advance[1] then
   local q=clamp((t-m.advance[1])/(m.advance[2]-m.advance[1]),0,1)
   b.x=c.origin+(c.destination-c.origin)*q
   pose='lunge'
  elseif m.kind=='rift' and t>=m.hide[1] then
   if t<m.hide[2] then form='rift'
   else b.x=c.destination;pose='emerge' end
  elseif m.kind=='ward' then
   form,pose='shield','shield'
   if t==m.deploy then
    b.damageShield=s.ward.max
    b.onShieldDamage=function(current) breakShield(current,b,s,c) end
    summon(state,b,s,c)
   end
   if t>=m.deploy and t<m.recover then
    fishers(state,b,s,c)
    breakShield(state,b,s,c)
    if c.broken then return false end
   end
  elseif m.kind=='sequence' then
   form,pose='summoning','shield'
   fisherSequence(state,b,s,c)
   if c.broken then return false end
  end
  if m.kind~='sequence' then
   for i,w in ipairs(m.active) do
    if t>=w[1] and t<w[2] then
     C.hitFieldArea(state,c.source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage)
    end
   end
  end
  if t==m.recover then clear(state,c);b.damageShield=0;b.onShieldDamage=nil end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose)
  if t<m.total then return false end
  nightmare.spawn(b,s)
  return true
 end
 function nightmare.label(b,c,s)
  if s.draftMoves then
   if b.form=='down' then return '放出を中断・反撃の隙' end
   if b.form=='standing' then return '起き上がり' end
   if b.form=='recover' then return '反撃の隙' end
   if b.form=='summoning' then
    local m,t=c.move,c.tick
    if t>=m.expire then return '深淵の放出・床の印から退避' end
    if t>=m.deploy then return '闇の漁師 '..c.defeatedFishers..'／'..#m.fishers..'・2体で放出中断' end
   end
   if c and c.move.kind=='rift' and c.tick>=c.move.hide[2] and c.tick<c.move.active[1][1] then
    return '裂け目から出現・一撃に注意'
   end
  end
  if b.form=='down' then return '暗黒のシールド破壊・反撃の好機' end
  if b.damageShield>0 then
   local living=0
   for _,unit in ipairs(c and c.summons or {}) do if unit.hp>0 then living=living+1 end end
   return '暗黒のシールド '..math.ceil(b.damageShield)..'／'..s.ward.max..'・闇の漁師 '..living
  end
  if b.form=='rift' then return '裂け目へ潜行・着地点から退避' end
  if b.form=='recover' then return '硬直中・反撃の好機' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,left,right,y,height,active,cam)
  local l,r=left-cam,right-cam
  if active then rect(f,l,y-height*U,r-l,height*U,violet..'44') end
  for x=l+2,r-7,14 do rect(f,x,y-5,8,3,pale) end
 end
 function nightmare.draw(f,state,b,s,c,mode,profile)
  local cam=state.camera
  if c and c.left and not c.broken and c.move.kind~='sequence' then
   for _,w in ipairs(c.move.active) do
    if c.tick<w[2] then
     warning(f,c.left,c.right,s.floorY,c.move.height,c.tick>=w[1],cam)
     break
    end
   end
  end
  if b.form~='rift' then
   local nativeLeft=b.pose=='idle'
   C.drawWhispererNightmaresFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,(b.facing<0)~=nativeLeft)
  end
  if c and c.left and c.move.kind=='sequence' and not c.broken then
   local m,t=c.move,c.tick
   local burst=m.active[#m.active]
   if t<burst[2] then
    warning(f,c.left,c.right,s.floorY,m.height,t>=burst[1],cam)
    if t>=m.expire then
     rect(f,c.left-cam,s.floorY-23,3,22,pale)
     rect(f,c.right-cam-3,s.floorY-23,3,22,pale)
    end
   end
  end
  if b.damageShield>0 then
   local x,y=b.x-cam,b.hitTop-14
   rect(f,x-61,y,122,8,ink)
   rect(f,x-59,y+2,118*b.damageShield/s.ward.max,4,violet)
  end
  for index,unit in ipairs(c and c.summons or {}) do
   if unit.hp>0 then
    local x=unit.x-cam
    if c.move.kind=='sequence' then
     local lane=c.fisherLanes[index]
     local window=c.move.active[index]
     if c.tick<window[2] then
      warning(f,lane.left,lane.right,s.floorY,c.move.fisherHeight,c.tick>=window[1],cam)
      f.draws[#f.draws+1]={kind='text',x=x,y=s.floorY-87,text=tostring(index),size=15,color=pale}
     end
    elseif unit.warningTick then
     warning(f,unit.markLeft,unit.markRight,s.floorY,.58,unit.warningTick>=s.ward.fisherWindup,cam)
    end
    C.drawWhispererNightmaresFieldArt(f,x,s.floorY,'fisher',mode,profile,unit.x>b.x)
    rect(f,x-22,s.floorY-80,44,5,ink)
    rect(f,x-21,s.floorY-79,42*unit.hp/unit.maxhp,3,pale)
   end
  end
 end
 return nightmare
end
