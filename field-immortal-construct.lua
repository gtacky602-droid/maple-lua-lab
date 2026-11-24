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
  if s.draftMoves then return 1 end
  if b.form=='down' then return s.life.downFactor end
  return b.lifeUnits>0 and s.life.damageFactor or 1
 end
 function beast.onHit(cast,b,s,slot,_,damage,party)
  if s.draftMoves then
   local c=slot.cast
   if not c or not c.move.waves or c.breakRequested or c.reposition or c.restart
      or damage<=0 or cast.reaction or cast.persistentTarget or c.bloomHits[cast] then return end
   local actor=party.actors[cast.id]
   if not actor or actor.hp<=0 then return end
   local _,now=C.fieldSlot(party,b.fieldBoss)
   local m=c.move
   local t=math.floor((now-c.startTime)*60+.5)
   if t<m.counterOpen or t>=m.counterClose or
      not C.fieldCastStartedSince(party,b.fieldBoss,cast,c.startTime+m.counterOpen/60) then return end
   c.bloomHits[cast]=true
   c.bloomRemaining=c.bloomRemaining-1
   if c.bloomRemaining==0 then c.breakRequested=t end
   return
  end
  if b.lifeUnits<=0 or b.lifeContacts[cast] or cast.reaction or
     not C.fieldCastStartedSince(party,b.fieldBoss,cast,b.lifeOpenedAt) then return end
  b.lifeContacts[cast]=true
  local before=math.ceil(b.lifeUnits/s.life.unitsPerLayer)
  b.lifeUnits=math.max(0,b.lifeUnits-1)
  if math.ceil(b.lifeUnits/s.life.unitsPerLayer)<before then
   b.shieldBreaks=b.shieldBreaks+1;b.pendingBreaks=b.pendingBreaks+1
  end
 end
 function beast.preempt(b,s,slot,state,target)
  local c=slot.cast
  if s.draftMoves then
   if c and c.restart then
    slot.cast=beast.begin(b,s,c.move,target,state)
    place(b,s,'attack','ready')
    return true
   end
   return false
  end
  if c and c.move.kind=='life' and c.deployed and not c.expired and b.lifeUnits<=0 then
   slot.cast=nil;b.pendingBreaks=0;b.downTicks=s.life.downTicks
  end
  if b.downTicks<=0 then return false end
  place(b,s,'down','down');b.downTicks=b.downTicks-1
  if b.downTicks==0 then place(b,s,'idle','idle');slot.delay=s.restTicks end
  return true
 end
 function beast.begin(b,s,m,_,state)
  local c={move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{}},cancelled={},interruptions=0,healed=0,
           source={id=b.id,owner=b,y=s.floorY,damageElement='pyro'}}
  if m.waves then
   c.startTime,c.bloomRemaining=state.t,m.hitsToBreak
   c.bloomHits=setmetatable({},{__mode='k'})
  end
  return c
 end
 function beast.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
  if c.releaseSeen then C.shareFieldHits({c.releaseSeen},actors) end
 end
 local function forward(c,near,far)
  local x1,x2=c.origin+c.dir*near*U,c.origin+c.dir*far*U
  return math.min(x1,x2),math.max(x1,x2)
 end
 local function lock(s,c,a)
  local m=c.move
  if m.offsets then
   c.centers={}
   for i,u in ipairs(m.offsets) do c.centers[i]=c.origin+c.dir*u*U end
  elseif m.kind=='seeds' then
   local center=clamp(a and a.x or c.origin,s.arenaMin+70,s.arenaMax-70)
   c.centers={center,clamp(center+c.dir*m.spacing*U,s.arenaMin+70,s.arenaMax-70)}
  elseif m.waves then
   c.waves={}
   for i,wave in ipairs(m.waves) do
    local left,right=forward(c,wave.near,wave.far)
    c.waves[i]={left=left,right=right,height=wave.height,damage=wave.damage}
   end
  else
   c.left,c.right=forward(c,m.near,m.far)
  end
 end
 local function bounds(c,i)
  local m=c.move
  if c.waves then
   local w=c.waves[i]
   return w.left,w.right,w.height,w.damage
  end
  if c.centers then return c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2,m.height,m.damage end
  if m.kind=='life' then return c.origin-m.waveRadius*U,c.origin+m.waveRadius*U,m.height,m.damage end
  return c.left,c.right,m.height,m.damage
 end
 local function safeLane(state,c)
  local left,right=math.huge,-math.huge
  for i in ipairs(c.move.active) do
   local from,to=bounds(c,i)
   left,right=math.min(left,from),math.max(right,to)
  end
  return C.fieldGroundRetreat(state,c.dir,left,right,c.move.active[1][1]-c.move.lock)
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
    c.left,c.right,c.centers,c.waves=nil,nil,nil,nil
    place(b,s,'reposition','ready')
    return false
   end
  end
  if m.kind=='life' then return life(state,b,s,c) end
  if c.breakRequested then
   c.broken=c.breakRequested
   place(b,s,'recover','down')
   if t-c.broken<m.total-m.recover then return false end
   c.restOverride=0
   beast.cancel(b,s);return true
  end
  local form,pose='attack',m.kind=='rake' and 'ready' or 'wing'
  if m.waves then
   if t<m.glowAt then form,pose='preparingBloom','ready'
   elseif t<m.chantAt then form,pose='life','bloom'
   elseif t<m.active[3][1] then form,pose='chant','bloom'
   else form,pose='bloom','bloom' end
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right,height,damage=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-height*U,damage)
    if m.kind=='rake' then pose='rake' end
   end
  end
  place(b,s,t>=m.recover and 'recover' or form,t>=m.recover and 'down' or pose)
  if t<m.total then return false end
  if m.waves then c.restOverride=0 end
  beast.cancel(b,s);return true
 end
 function beast.label(b,c,s)
  if s.draftMoves then
   if b.form=='reposition' then return '位置を変えて再予告' end
   if c and c.broken then return '開花を中断・反撃の隙' end
   if b.form=='recover' then return '反撃の隙' end
   if c and c.move.waves then
    local m=c.move
    if c.tick>=m.counterOpen and c.tick<m.counterClose then
     return '灼焔の華・本体にあと'..c.bloomRemaining..'打'
    end
    if c.tick>=m.counterClose then return '灼焔の華・予告範囲の外へ' end
   end
   return c and c.move.title
  end
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
  if s.draftMoves then
   f.draftMoves=true
   f.immortalConstruct={interrupted=c and c.broken~=nil or false}
   if c and c.move.waves then
    local m=c.move
    if not c.broken and not c.reposition and c.tick>=m.counterOpen and c.tick<m.counterClose then
     f.immortalConstruct.hitsLeft=c.bloomRemaining
     f.immortalConstruct.required=m.hitsToBreak
    end
   end
   return
  end
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
  if c and not c.broken and (c.left or s.draftMoves and (c.centers or c.waves)) then
   local m=c.move
   if m.kind=='life' and c.chantStart then
    local elapsed=c.tick-c.chantStart
    if elapsed<m.releaseDelay+m.releaseTicks then lane(f,c.releaseLeft-cam,c.releaseRight-cam,y,m.height*U,elapsed>=m.releaseDelay) end
   else
    for i,w in ipairs(m.active) do
     if not c.cancelled[i] and c.tick<w[2] then
      local left,right,height=bounds(c,i)
      if (m.kind~='life' and not m.waves) or c.tick>=w[1]-54 then
       lane(f,left-cam,right-cam,y,height*U,c.tick>=w[1])
       if m.kind=='seeds' and c.tick>=w[1]-24 then
        local x=(left+right)/2
        if s.draftMoves then
         local q=clamp((c.tick-w[1]+24)/24,0,1)
         x=c.origin+(x-c.origin)*q
        end
        C.drawImmortalConstructFieldArt(f,x-cam,y-48,'seed',mode,profile,c.dir>0)
       end
      end
      break
     end
    end
   end
  end
  C.drawImmortalConstructFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if s.draftMoves and c and c.move.waves and not c.broken and not c.reposition then
   local m=c.move
   if c.tick>=m.glowAt and c.tick<m.active[3][2] then
    local t=c.tick-m.glowAt
    local alpha=.15+.06*math.sin(t*math.pi/24)
    f.draws[#f.draws+1]={kind='effect',x=b.x-cam,y=b.y-106,w=44,h=27,alpha=alpha,color=pink}
   end
   if c.tick>=m.counterOpen and c.tick<m.counterClose then
    local top=b.y-C.immortalConstructFieldArt[b.pose].profiles.legacy.height-14
    for i=1,m.hitsToBreak do rect(f,b.x-cam-22+(i-1)*15,top,10,6,i<=c.bloomRemaining and gold or '#625154') end
   end
  elseif b.lifeUnits>0 then
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
