return function(C)
 local tulpa={}
 local U=88
 local blue,foam,ink='#8de7ff','#ecfcff','#245582'
 local orderColor,timerColor='#fff1b0','#a6eee7'
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end

 function tulpa.spawn(b,s)
  b.form='water'
  b.hitBottom=s.floorY-.08*U
  b.hitTop=b.hitBottom-89
 end

 function tulpa.cancel(b,s,state,c)
  C.clearFieldSummon(state,c)
  tulpa.spawn(b,s)
 end
 function tulpa.onDefeat(state,b,s,c) C.clearFieldSummon(state,c) end

 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  b.facing=c.dir
  local m=c.move
  if m.kind=='hammer' then
   local spacing=m.spacing*U/2
   local margin=spacing+m.width*U/2+.45*U
   local center=clamp(a.x,s.arenaMin+margin,s.arenaMax-margin)
   c.points={center-c.dir*spacing,center+c.dir*spacing}
  elseif m.summon then
   local function start(dir)
    return clamp(c.origin+dir*m.summon.distance*U,s.arenaMin+63,s.arenaMax-63)
   end
   c.summonStart=start(c.dir)
   if math.abs(c.summonStart-c.origin)<1.8*U then c.summonStart=start(-c.dir) end
  end
 end

 function tulpa.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={{},{}}}
  c.source={id=b.id,y=s.floorY,owner=b,damageElement=m.element}
  aim(b,s,c,a)
  return c
 end

 function tulpa.shareCast(cast,actors)
  C.shareFieldHits(cast.seen,actors)
 end

 local function bounds(c,i)
  local m=c.move
  if m.kind=='spear' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   return math.min(near,far),math.max(near,far)
  end
  local center=c.points and c.points[i] or c.origin
  local half=(c.absorbed and m.absorbedWidth or m.width)*U/2
  return center-half,center+half
 end

 local function updateSummon(state,b,s,c,t)
  local rules=c.move.summon
  if t==rules.spawn then
   c.summon={id=-b.id,fieldBoss=b.fieldBoss,x=c.summonStart,y=s.floorY,hitTop=s.floorY-42,hitBottom=s.floorY,
    hp=rules.hp,maxhp=rules.hp,level=s.level,custom=true,noRewards=true,warning=0,respawn=math.huge,immune=s.immune}
   state.enemies[#state.enemies+1]=c.summon
  end
  local summon=c.summon
  if not summon then return end
  if summon.hp<=0 then
   c.summonStopped=true
   C.clearFieldSummon(state,c)
  elseif t>=rules.merge then
   c.absorbed=true
   b.form='surge'
   C.clearFieldSummon(state,c)
  else
   local u=(t-rules.spawn)/(rules.merge-rules.spawn)
   summon.x=c.summonStart+(c.origin-c.summonStart)*u
  end
 end

 local function mergeWindow(c)
  if c and c.summon and c.summon.hp>0 then return c.move.summon.merge-c.tick end
 end

 function tulpa.frame(f,b,s,c)
  f.summonTicks=mergeWindow(c)
  if b.form=='settled' and c then f.exposureTicks=c.move.total-c.tick end
 end

 function tulpa.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  if m.summon then updateSummon(state,b,s,c,t) end
  if t>=m.recover then b.form='settled' end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c,i)
    local damage=c.absorbed and m.absorbedDamage or m.damage
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,damage,s.floorY-(m.low or 0)*U)
   end
  end
  if t<m.total then return false end
  tulpa.cancel(b,s,state,c)
  return true
 end

 function tulpa.label(b,c)
  if b.form=='settled' then return '水流が収まる・反撃' end
  if b.form=='surge' then return '合流済み・広い奔流から離れる' end
  if c and c.summon and c.summon.hp>0 then return '半身が接近・攻撃で止められる' end
  if c and c.summonStopped then return '合流を阻止・小さな奔流' end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function band(f,left,right,top,bottom,active)
  if active then
   rect(f,left,top,right-left,bottom-top,'#39c8ee66')
   rect(f,left,top,right-left,2,foam)
   rect(f,left,top,2,bottom-top,blue)
   rect(f,right-2,top,2,bottom-top,blue)
  else
   rect(f,left,bottom-6,right-left,2,blue)
   rect(f,left,bottom-11,2,5,blue)
   rect(f,right-2,bottom-11,2,5,blue)
   for i=left+4,right-8,17 do rect(f,i,bottom-10,5,2,foam) end
  end
 end

 function tulpa.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local x,pose=b.x-camera,'idle'
  if c then
   local m,t=c.move,c.tick
   pose=t>=m.recover and 'settled' or c.absorbed and 'surge' or m.kind
   if t>=m.lock then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local left,right=bounds(c,i)
      band(f,left-camera,right-camera,y-m.height*U,y-(m.low or 0)*U,t>=w[1])
     end
    end
   end
  end
  C.drawTulpaFieldArt(f,x,y,pose,mode,profile,b.facing<0)
  if c and c.points and c.tick>=c.move.lock then
   for i,window in ipairs(c.move.active) do
    if c.tick<window[1] then C.drawFieldImpactNumber(f,c.points[i]-camera,y,i,orderColor) end
   end
  end
  local summon=c and c.summon
  if summon and summon.hp>0 then
   local sx=summon.x-camera
   local left,right=math.min(sx,x),math.max(sx,x)
   for px=left,right-6,15 do rect(f,px,y-8,6,2,blue) end
   C.drawTulpaFieldArt(f,sx,y,'half',mode,profile,sx>x)
   rect(f,sx-16,y-59,32,4,ink)
   rect(f,sx-16,y-59,32*summon.hp/summon.maxhp,4,foam)
   local rules=c.move.summon
   C.drawFieldTimer(f,sx,y-68,mergeWindow(c),rules.merge-rules.spawn,timerColor)
  end
 end
 return tulpa
end
