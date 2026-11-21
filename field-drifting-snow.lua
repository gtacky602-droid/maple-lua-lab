return function(C)
 local guardian={}
 local U=88
 local blue,pale,ink='#60dfff','#e1f8ff','#26344e'
 local effective={pyro=true,electro=true,anemo=true}
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY
  -- The sword and outer coffin are decoration, not an enlarged body hurtbox.
  b.hitTop,b.hitBottom=s.floorY-s.artHeight,s.floorY
 end
 function guardian.spawn(b,s)
  b.coffinUsed,b.coffinLayers,b.downTicks=false,0,0
  b.coffinContacts=setmetatable({},{__mode='k'})
  place(b,s,'idle','idle')
 end
 function guardian.cancel(b,s)
  b.coffinLayers,b.downTicks=0,0
  b.coffinContacts=setmetatable({},{__mode='k'})
  place(b,s,'idle','idle')
 end
 function guardian.onDefeat(_,b,s) guardian.cancel(b,s) end
 function guardian.checkpoint(b) return {coffinUsed=b.coffinUsed} end
 function guardian.restore(b,s,flags)
  if flags and flags.coffinUsed~=nil then b.coffinUsed=flags.coffinUsed
  else b.coffinUsed=b.hp<=math.floor(s.hp*s.coffin.threshold) end
 end
 function guardian.damageFactor(_,_,b,s)
  if b.form=='down' then return s.coffin.downFactor end
  return b.coffinLayers>0 and s.coffin.damageFactor or 1
 end
 function guardian.onHit(cast,b,s,_,element,_,party)
  if b.coffinLayers<=0 or b.coffinContacts[cast] or cast.reaction or
     not C.fieldCastStartedSince(party,b.fieldBoss,cast,b.coffinOpenedAt) then return end
  b.coffinContacts[cast]=true
  local amount=element=='cryo' and 0 or effective[element] and s.coffin.effectiveLayers or 1
  b.coffinLayers=math.max(0,b.coffinLayers-amount)
 end
 function guardian.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement='cryo'}}
 end
 function guardian.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 function guardian.preempt(b,s,slot)
  local c=slot.cast
  if c and c.move.kind=='coffin' and c.deployed and not c.failed and b.coffinLayers<=0 then
   slot.cast=nil;b.downTicks=s.coffin.downTicks
  end
  if b.downTicks>0 then
   place(b,s,'down','down');b.downTicks=b.downTicks-1
   if b.downTicks==0 then place(b,s,'idle','idle');slot.delay=s.restTicks end
   return true
  end
  if not b.coffinUsed and b.hp>0 and b.hp<=math.floor(s.hp*s.coffin.threshold) then
   b.coffinUsed=true
   slot.cast=guardian.begin(b,s,s.coffin.move)
   -- Preserve the next basic move index; the HP phase is not a repeating move.
  end
  return false
 end
 local function lock(b,s,c,a)
  local m=c.move
  if m.kind=='projectiles' then
   local center=clamp(a and a.x or c.origin,s.arenaMin+70,s.arenaMax-70)
   c.centers={center,clamp(center+c.dir*m.spacing*U,s.arenaMin+70,s.arenaMax-70)}
  else
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
  end
 end
 function guardian.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1;c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(b,s,c,a) end
  if m.kind=='coffin' then
   if t==m.deploy then
    c.deployed=true;b.coffinLayers=s.coffin.layers;b.coffinOpenedAt=state.t
    b.coffinContacts=setmetatable({},{__mode='k'})
   end
   if t==m.deadline then
    c.failed=true;b.coffinLayers=0
    c.healed=math.min(s.coffin.heal,s.hp-b.hp);b.hp=b.hp+c.healed
   end
  end
  local form,pose='attack',m.kind=='slash' and 'ready' or 'cast'
  if m.kind=='coffin' then form,pose=c.failed and 'release' or 'coffin',c.failed and 'cast' or 'coffin' end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=c.left,c.right
    if m.kind=='projectiles' then left,right=c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2
    elseif m.kind=='coffin' and i<=2 then left,right=c.origin-m.radius*U,c.origin+m.radius*U end
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage)
    if m.kind=='slash' then pose='slash' end
   end
  end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose)
  if t<m.total then return false end
  guardian.cancel(b,s);return true
 end
 function guardian.label(b,c,s)
  if b.form=='down' then return '氷の棺が割れた・反撃の好機' end
  if c and c.move.kind=='coffin' then
   if c.failed then return '氷の棺が残った・一度だけ回復して氷剣で反撃' end
   if c.deployed then return '氷の棺 '..b.coffinLayers..' / '..s.coffin.layers..'・通常でも破壊可、炎雷風が有効' end
   return '氷の棺を展開する・本体にも攻撃できる'
  end
  return b.form=='recover' and '剣を下ろす・反撃の好機' or c and c.move.title
 end
 function guardian.frame(f,b,s,c)
  f.driftingSnow={coffinUsed=b.coffinUsed,layers=b.coffinLayers,maxLayers=s.coffin.layers,
   failed=c and c.failed or false,healed=c and c.healed or 0,downTicks=b.downTicks}
 end
 local function rect(f,x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 local function lane(f,left,right,y,h,active)
  if active then rect(f,left,y-h,right-left,h,blue..'33') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,blue) end
 end
 function guardian.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  if c and c.left then
   local m=c.move
   for i,w in ipairs(m.active) do
    if c.tick<w[2] then
     local left,right=c.left,c.right
     if m.kind=='projectiles' then left,right=c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2
     elseif m.kind=='coffin' and i<=2 then left,right=c.origin-m.radius*U,c.origin+m.radius*U end
     if m.kind~='coffin' or c.tick>=w[1]-60 then
      lane(f,left-cam,right-cam,y,m.height*U,c.tick>=w[1])
      if m.kind=='projectiles' or m.kind=='coffin' and i>2 then
       if c.tick>=w[1]-28 then C.drawDriftingSnowFieldArt(f,(left+right)/2-cam,y-48,'spear',mode,profile,c.dir>0) end
      end
     end
     break
    end
   end
  end
  C.drawDriftingSnowFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if b.coffinLayers>0 then
   local top=b.hitTop-18
   rect(f,b.x-cam-47,top,94,8,ink)
   for i=1,s.coffin.layers do rect(f,b.x-cam-45+(i-1)*11.5,top+2,10,4,i<=b.coffinLayers and pale or '#525b77') end
  end
 end
 return guardian
end
