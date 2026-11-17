return function(C)
 local beast={}
 local U=88
 local gold,pink,ink='#ffce71','#e46a91','#35283a'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY
  b.hitTop,b.hitBottom=s.floorY-s.bodyHeight,s.floorY
 end
 function beast.spawn(b,s)
  b.lifeUnits,b.shieldBreaks,b.pendingBreaks,b.downTicks=0,0,0,0
  b.lifeContacts=setmetatable({},{__mode='k'})
  place(b,s,'idle','idle')
 end
 function beast.cancel(b,s)
  b.lifeUnits,b.pendingBreaks,b.downTicks=0,0,0
  place(b,s,'idle','idle')
 end
 function beast.onDefeat(_,b,s) beast.cancel(b,s) end
 function beast.damageFactor(_,_,b,s)
  if b.form=='down' then return s.life.downFactor end
  return b.lifeUnits>0 and s.life.damageFactor or 1
 end
 function beast.onHit(cast,b,s)
  if b.lifeUnits<=0 or b.lifeContacts[cast] or cast.reaction or
     not cast.startedAt or cast.startedAt<b.lifeOpenedAt then return end
  b.lifeContacts[cast]=true
  local before=math.ceil(b.lifeUnits/s.life.unitsPerLayer)
  b.lifeUnits=math.max(0,b.lifeUnits-1)
  if math.ceil(b.lifeUnits/s.life.unitsPerLayer)<before then
   b.shieldBreaks=b.shieldBreaks+1;b.pendingBreaks=b.pendingBreaks+1
  end
 end
 function beast.preempt(b,s,slot)
  local c=slot.cast
  if c and c.move.kind=='life' and c.deployed and not c.expired and b.lifeUnits<=0 then
   slot.cast=nil;b.pendingBreaks=0;b.downTicks=s.life.downTicks
  end
  if b.downTicks<=0 then return false end
  place(b,s,'down','down');b.downTicks=b.downTicks-1
  if b.downTicks==0 then place(b,s,'idle','idle');slot.delay=s.restTicks end
  return true
 end
 function beast.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{}},cancelled={},interruptions=0,healed=0,
   source={id=b.id,owner=b,y=s.floorY,damageElement='pyro'}}
 end
 local function lock(b,s,c,a)
  local m=c.move
  if m.kind=='seeds' then
   local center=clamp(a and a.x or c.origin,s.arenaMin+70,s.arenaMax-70)
   c.centers={center,clamp(center+c.dir*m.spacing*U,s.arenaMin+70,s.arenaMax-70)}
  else
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
  end
 end
 local function hit(state,b,s,c,seen,left,right,height,damage,heal)
  local hp={}
  for i,a in ipairs(state.actors) do hp[i]=a.hp end
  C.hitFieldArea(state,c.source,seen,left,right,s.floorY-height*U,damage)
  if not heal or b.hp<=0 then return end
  for i,a in ipairs(state.actors) do
   if a.hp<hp[i] then
    local gain=math.min(s.life.healOnHit,s.life.healBudget-c.healed,s.hp-b.hp)
    b.hp=b.hp+gain;c.healed=c.healed+gain
   end
  end
 end
 local function life(state,b,s,c)
  local m,t=c.move,c.tick
  if t==m.deploy then
   c.deployed=true;c.spent=math.min(s.life.cost,b.hp-1);b.hp=b.hp-c.spent
   b.lifeUnits=s.life.layers*s.life.unitsPerLayer;b.lifeOpenedAt=state.t
   b.shieldBreaks,b.pendingBreaks=0,0;b.lifeContacts=setmetatable({},{__mode='k'})
  end
  if b.pendingBreaks>0 then
   c.interruptions=c.interruptions+b.pendingBreaks
   c.staggerUntil=t+s.life.layerStaggerTicks
   -- A broken segment cancels the next outstanding minor wave, not the final bloom.
   if not c.chantStart then
    for _=1,b.pendingBreaks do
     for i,w in ipairs(m.active) do
      if not c.cancelled[i] and t<w[2] then c.cancelled[i]=true;break end
     end
    end
   end
   b.pendingBreaks=0
  end
  if c.deployed and not c.chantStart and (b.lifeUnits<=s.life.chantUnits or t>=m.chantAt) then
   c.chantStart=t;c.releaseLeft,c.releaseRight=c.origin-m.radius*U,c.origin+m.radius*U
   c.releaseSeen={}
  end
  if c.chantStart then
   local elapsed=t-c.chantStart
   local form=elapsed<m.releaseDelay and 'chant' or 'bloom'
   if elapsed>=m.releaseDelay and elapsed<m.releaseDelay+m.releaseTicks then
    hit(state,b,s,c,c.releaseSeen,c.releaseLeft,c.releaseRight,m.height,m.releaseDamage,true)
   end
   if elapsed>=m.releaseDelay+m.releaseTicks then form='recover';b.lifeUnits=0;c.expired=true end
   place(b,s,form,form=='recover' and 'down' or 'bloom')
   if elapsed>=m.releaseDelay+m.releaseTicks+m.recovery then beast.cancel(b,s);return true end
  else
   for i,w in ipairs(m.active) do
    if not c.cancelled[i] and t>=w[1] and t<w[2] then
     hit(state,b,s,c,c.seen[i],c.origin-m.waveRadius*U,c.origin+m.waveRadius*U,m.height,m.damage,true)
    end
   end
   local stagger=t<(c.staggerUntil or 0)
   place(b,s,stagger and 'segment-stagger' or 'life',stagger and 'down' or 'bloom')
  end
  return false
 end
 function beast.tick(state,b,s,c,a)
  c.tick=c.tick+1;local m,t=c.move,c.tick
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(b,s,c,a) end
  if m.kind=='life' then return life(state,b,s,c) end
  local pose=m.kind=='rake' and 'ready' or 'wing'
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=c.left,c.right
    if m.kind=='seeds' then left,right=c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2 end
    hit(state,b,s,c,c.seen[i],left,right,m.height,m.damage,false)
    if m.kind=='rake' then pose='rake' end
   end
  end
  place(b,s,t>=m.recover and 'recover' or 'attack',t>=m.recover and 'down' or pose)
  if t<m.total then return false end
  beast.cancel(b,s);return true
 end
 function beast.label(b,c,s)
  if b.form=='down' then return '蘇生の守りが崩れた・反撃の好機' end
  if c and c.move.kind=='life' then
   if b.form=='recover' then return '焔の花を放った・息継ぎ' end
   if c.chantStart then return '灼焔の華・守りをすべて壊せば中断できる' end
   return b.form=='segment-stagger' and '守り一層を破壊・次の小波を中断' or
    '輝かしき命の姿・蘇生の守り '..math.ceil(b.lifeUnits/s.life.unitsPerLayer)..' / '..s.life.layers
  end
  return c and c.move.title
 end
 function beast.frame(f,b,s,c)
  f.immortalConstruct={units=b.lifeUnits,maxUnits=s.life.layers*s.life.unitsPerLayer,
   layers=math.ceil(b.lifeUnits/s.life.unitsPerLayer),maxLayers=s.life.layers,shieldBreaks=b.shieldBreaks,
   healed=c and c.healed or 0,spent=c and c.spent or 0,chantStart=c and c.chantStart,
   interruptions=c and c.interruptions or 0,downTicks=b.downTicks}
 end
 local function rect(f,x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 local function lane(f,left,right,y,height,active)
  if active then rect(f,left,y-height,right-left,height,pink..'33') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,gold) end
 end
 function beast.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  if c and c.left then
   local m=c.move
   if m.kind=='life' and c.chantStart then
    local elapsed=c.tick-c.chantStart
    if elapsed<m.releaseDelay+m.releaseTicks then lane(f,c.releaseLeft-cam,c.releaseRight-cam,y,m.height*U,elapsed>=m.releaseDelay) end
   else
    for i,w in ipairs(m.active) do
     if not c.cancelled[i] and c.tick<w[2] then
      local left,right=c.left,c.right
      if m.kind=='seeds' then left,right=c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2
      elseif m.kind=='life' then left,right=c.origin-m.waveRadius*U,c.origin+m.waveRadius*U end
      if m.kind~='life' or c.tick>=w[1]-54 then
       lane(f,left-cam,right-cam,y,m.height*U,c.tick>=w[1])
       if m.kind=='seeds' and c.tick>=w[1]-24 then C.drawImmortalConstructFieldArt(f,(left+right)/2-cam,y-48,'seed',mode,profile,c.dir>0) end
      end
      break
     end
    end
   end
  end
  C.drawImmortalConstructFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if b.lifeUnits>0 then
   local top=b.y-C.immortalConstructFieldArt[b.pose].profiles.legacy.height-14
   rect(f,b.x-cam-56,top,112,9,ink)
   for i=1,s.life.layers do
    local units=clamp(b.lifeUnits-(i-1)*s.life.unitsPerLayer,0,s.life.unitsPerLayer)
    rect(f,b.x-cam-54+(i-1)*18,top+2,16,5,'#625154')
    if units>0 then rect(f,b.x-cam-54+(i-1)*18,top+2,16*units/s.life.unitsPerLayer,5,gold) end
   end
  end
 end
 return beast
end
