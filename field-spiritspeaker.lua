return function(C)
 local spirit={}
 local U=88
 local cyan,pale,ink='#60dbed','#dfe8ff','#25283b'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY-(form=='down' and 0 or s.hover)
  b.underground=form=='reflections' or nil
  b.hitTop,b.hitBottom=b.y-C.spiritspeakerFieldArt[pose].profiles.legacy.height,b.y
 end
 function spirit.spawn(b,s) place(b,s,'idle','idle') end
 local function clear(state,c)
  if not c or not c.summons then return end
  for _,unit in ipairs(c.summons) do C.removeFieldSummon(state,unit) end
  c.summons=nil
 end
 function spirit.cancel(b,s,state,c)
  clear(state,c)
  spirit.spawn(b,s)
 end
 function spirit.onDefeat(state,b,s,c) spirit.cancel(b,s,state,c) end
 function spirit.damageFactor(_,_,b,s)
  return b.form=='down' and s.reflections.downFactor or 1
 end
 function spirit.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},shots={},
   source={id=b.id,owner=b,y=s.floorY,damageElement='cryo'}}
 end
 local function lock(s,c)
  local m=c.move
  if m.kind=='sweep' then
   local a,z=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(a,z),math.max(a,z)
  elseif m.kind=='ice' then
   c.centers={}
   for i,offset in ipairs(m.offsets) do
    c.centers[i]=clamp(c.origin+c.dir*offset*U,s.arenaMin+m.width*U/2,s.arenaMax-m.width*U/2)
   end
  end
 end
 local function summon(state,b,s,c)
  c.openedAt=state.t
  c.summons={}
  for i,offset in ipairs(s.reflections.offsets) do
   local x=clamp(c.origin+offset*U,s.arenaMin+40,s.arenaMax-40)
   local contacts=setmetatable({},{__mode='k'})
   local function accepts(cast)
    return not cast.reaction and cast.startedAt and cast.startedAt>=c.openedAt
   end
   local function contact(_,cast,unit)
    if accepts(cast) and not contacts[cast] then
     contacts[cast]=true
     unit.hp=math.max(0,unit.hp-(cast.element=='pyro' and s.reflections.pyroLayers or 1))
    end
    return false
   end
   local unit={id=-b.id-i,fieldBoss=b.fieldBoss,reflection=true,x=x,home=x,y=s.floorY-s.hover,
    hitTop=s.floorY-s.hover-C.spiritspeakerFieldArt.reflection.profiles.legacy.height,hitBottom=s.floorY-s.hover,
    hp=s.reflections.layers,maxhp=s.reflections.layers,custom=true,noRewards=true,
    level=s.level,warning=0,respawn=math.huge,acceptsCast=accepts,onCastContact=contact}
   c.summons[i]=unit
   state.enemies[#state.enemies+1]=unit
  end
 end
 local function reflections(state,b,s,c,a)
  local t,m=c.tick,c.move
  if t==m.deploy then summon(state,b,s,c) end
  if not c.summons then return end
  local alive=0
  for i,unit in ipairs(c.summons) do
   if unit.hp<=0 then C.removeFieldSummon(state,unit)
   else
    alive=alive+1
    local window=m.active[i]
    if t==window[1]-m.tell then
     local dir=a and a.x<unit.x and -1 or 1
     local far=unit.x+dir*m.reachU*U
     c.shots[i]={left=math.min(unit.x,far),right=math.max(unit.x,far),dir=dir,seen={},
      source={id=unit.id,owner=unit,y=s.floorY,damageElement='cryo'}}
    end
    local shot=c.shots[i]
    if shot and t>=window[1] and t<window[2] then
     C.hitFieldArea(state,shot.source,shot.seen,shot.left,shot.right,s.floorY-m.height*U,m.damage)
    end
   end
  end
  if alive==0 then c.broken=t;clear(state,c) end
 end
 function spirit.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c) end
  if m.kind=='reflections' then reflections(state,b,s,c,a) end
  if c.broken then
   if t-c.broken<s.reflections.downTicks then place(b,s,'down','down');return false end
   spirit.spawn(b,s)
   return true
  end
  local form,pose='attack','ready'
  if m.kind=='reflections' then form,pose=t>=m.deploy and 'reflections' or 'ritual','ritual'
  elseif m.kind=='ice' then pose='cast' end
  if m.kind~='reflections' then
   for i,w in ipairs(m.active) do
    if t>=w[1] and t<w[2] then
     local l,r=c.left,c.right
     if c.centers then l,r=c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2 end
     if m.kind=='sweep' then pose='sweep' end
     C.hitFieldArea(state,c.source,c.seen[i],l,r,s.floorY-m.height*U,m.damage)
    end
   end
  end
  if t==m.recover then clear(state,c) end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose)
  if t<m.total then return false end
  spirit.spawn(b,s)
  return true
 end
 function spirit.label(b,c)
  if b.form=='down' then return '分身の守りが割れた・反撃の好機' end
  if b.form=='reflections' then
   local n=0
   for _,unit in ipairs(c.summons or {}) do if unit.hp>0 then n=n+1 end end
   return '色彩の分身 残り'..n..'・守りは通常攻撃でも壊せる'
  end
  if b.form=='recover' then return '姿を現した・反撃の好機' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function lane(f,left,right,y,height,active)
  if active then rect(f,left,y-height,right-left,height,cyan..'44') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,cyan) end
 end
 function spirit.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  if c and not c.broken then
   local m,t=c.move,c.tick
   if m.kind~='reflections' and (c.left or c.centers) then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local l,r=c.left,c.right
      if c.centers then l,r=c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2 end
      lane(f,l-cam,r-cam,y,m.height*U,t>=w[1])
      f.draws[#f.draws+1]={kind='text',x=(l+r)/2-cam,y=y-m.height*U-7,text=i..' / 2',size=13,color=pale}
      break
     end
    end
   end
  end
  if not b.underground then C.drawSpiritspeakerFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing<0) end
  if c and c.summons then
   for i,unit in ipairs(c.summons) do
    if unit.hp>0 then
     local shot=c.shots[i]
     local w=c.move.active[i]
     if shot and c.tick<w[2] then lane(f,shot.left-cam,shot.right-cam,y,c.move.height*U,c.tick>=w[1]) end
     local x=unit.x-cam
     local flip=unit.x>b.x
     if shot then flip=shot.dir<0 end
     C.drawSpiritspeakerFieldArt(f,x,unit.y,'reflection',mode,profile,flip)
     local top=unit.hitTop-11
     rect(f,x-24,top,48,8,ink)
     for j=1,s.reflections.layers do rect(f,x-22+(j-1)*15,top+2,13,4,j<=unit.hp and cyan or '#555164') end
    end
   end
  end
 end
 return spirit
end
