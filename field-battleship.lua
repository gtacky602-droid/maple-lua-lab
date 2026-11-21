return function(C)
 local ship={}
 local U=88
 local frost,white,amber,ink='#8fddff','#f1fcff','#ffa750','#212d3c'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY
  b.hitTop=b.y-C.battleshipFieldArt[pose].profiles.legacy.height
  b.hitBottom=b.y
 end
 function ship.spawn(b,s)
  b.heat,b.iceWard=0,0
  b.heatContacts=setmetatable({},{__mode='k'})
  place(b,s,'idle','idle')
 end
 ship.cancel=ship.spawn
 function ship.onDefeat(_,b,s) ship.spawn(b,s) end

 function ship.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function ship.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 function ship.frame(f,b,s)
  f.thermal={heat=b.heat,maxHeat=s.thermal.max,ward=b.iceWard,maxWard=s.thermal.wardHp}
 end

 function ship.onHit(cast,b,s,slot)
  if (cast.reaction and cast.key~='reaction:burning') or b.heatContacts[cast] then return end
  local c=slot.cast
  local mode=c and c.move.kind
  if mode=='ward' then
   if b.iceWard>0 then
    b.heatContacts[cast]=true
    local cost=cast.element=='pyro' and s.thermal.pyroChip or 1
    b.iceWard=math.max(0,b.iceWard-cost)
   end
  elseif cast.element=='pyro' and b.heat<s.thermal.max then
   b.heatContacts[cast]=true
   b.heat=b.heat+1
   if b.heat==s.thermal.max then
    b.iceWard=s.thermal.wardHp
    slot.cast=ship.begin(b,s,s.coolingMove)
    slot.index=1
    place(b,s,'shield','ward')
   end
  end
 end

 function ship.damageFactor(_,_,b,s)
  if b.iceWard>0 then return s.thermal.wardFactor end
  if b.heat>=s.thermal.hotAt then return s.thermal.hotFactor end
  return 1
 end

 local function lock(s,c,a)
  local m=c.move
  if m.kind=='saw' then
   local x0,x1=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(x0,x1),math.max(x0,x1)
  elseif m.kind=='fire' then
   local edge=(m.offsets[#m.offsets]+m.width/2)*U
   if c.origin+c.dir*edge<s.arenaMin or c.origin+c.dir*edge>s.arenaMax then c.dir=-c.dir end
   c.centers={}
   for i,offset in ipairs(m.offsets) do c.centers[i]=c.origin+c.dir*offset*U end
  else
   local dx=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
   local radius=m.width*U/2
   local center=clamp(c.origin+dx,s.arenaMin+radius,s.arenaMax-radius)
   c.left,c.right=center-radius,center+radius
  end
 end

 local function bounds(c,i)
  if c.centers then
   local radius=c.move.width*U/2
   return c.centers[i]-radius,c.centers[i]+radius
  end
  return c.left,c.right
 end

 local function finish(b,s)
  b.heat,b.iceWard=0,0
  place(b,s,'idle','idle')
 end

 function ship.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if m.kind=='ward' and t<m.recover then
   if b.iceWard<=0 and not c.broken then c.broken=t;b.heat=0 end
   if not c.broken then b.heat=math.max(0,s.thermal.max-math.floor(t/m.coolEvery)) end
  end
  if c.broken then
   if t-c.broken<s.thermal.downTicks then place(b,s,'down','down');return false end
   finish(b,s)
   return true
  end
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c,a);b.facing=c.dir end
  local form,pose='attack',m.pose
  if m.kind=='ward' then form='shield' end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='saw' then pose='sweep' end
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage,
                   s.floorY-(m.low or 0)*U)
   end
  end
  if t>=m.recover then
   form,pose='recover','down'
   if m.kind=='ward' then b.heat,b.iceWard=0,0 end
  end
  place(b,s,form,pose)
  if t<m.total then return false end
  place(b,s,'idle',b.heat>=s.thermal.hotAt and 'heated' or 'idle')
  return true
 end

 function ship.label(b,c,s)
  if b.form=='down' then return '氷バリア破壊・反撃の好機' end
  if b.iceWard>0 then return '冷却中・氷バリア '..b.iceWard..'／'..s.thermal.wardHp end
  if b.form=='recover' then return '排熱中・反撃の好機' end
  if b.heat>0 then
   local label=(b.heat>=s.thermal.hotAt and '過熱' or '加熱')..' '..b.heat..'／'..s.thermal.max
   return c and label..'・'..c.move.title or label
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y)
  if c.broken or (not c.left and not c.centers) then return end
  local m=c.move
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    local left,right=bounds(c,i)
    local l,r=left-cam,right-cam
    local top,bottom=y-m.height*U,y-(m.low or 0)*U
    local tint=m.element=='pyro' and amber or frost
    if c.tick>=w[1] then rect(f,l,top,r-l,bottom-top,tint..'55');rect(f,l,top,r-l,3,white) end
    for x=l+1,r-5,13 do rect(f,x,bottom-4,7,3,tint) end
    if #m.active>1 then f.draws[#f.draws+1]={kind='text',x=(l+r)/2,y=top-7,text=i..' / 2',size=13,color=white} end
    break
   end
  end
 end
 function ship.draw(f,state,b,s,c,mode,profile)
  local x,y=b.x-state.camera,s.floorY
  if c then warning(f,c,state.camera,y) end
  local hot=b.heat>=s.thermal.hotAt
  local pose=b.pose
  if hot and not c then pose='heated' end
  local nativeLeft=pose=='saw-ready' or pose=='sweep'
  C.drawBattleshipFieldArt(f,x,b.y,pose,mode,profile,(b.facing<0)~=nativeLeft)
  local bar=y-C.battleshipFieldArt[pose].profiles.legacy.height-12
  local count=s.thermal.max
  local width=count*14
  rect(f,x-width/2-2,bar,width+4,8,ink)
  for i=1,count do
   rect(f,x-width/2+(i-1)*14+1,bar+2,11,4,i<=b.heat and amber or '#545363')
  end
  if b.iceWard>0 then
   rect(f,x-41,bar-9,82,6,ink)
   rect(f,x-39,bar-7,78*b.iceWard/s.thermal.wardHp,2,frost)
  elseif hot and pose~='heated' then
   rect(f,x-22,y-74,6,5,amber);rect(f,x-10,y-77,11,6,amber);rect(f,x+5,y-74,7,5,amber)
  end
 end
 return ship
end
