return function(C)
 local legatus={}
 local U=88
 local gold,cream,ink='#ffb464','#ffe8ac','#493e4b'
 local timerColor='#ffe392'

 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end

 function legatus.spawn(b,s)
  b.form='marble'
  b.hitTop=s.floorY-115
  b.hitBottom=s.floorY-6
 end

 function legatus.cancel(b,s,state,c)
  C.clearFieldSummon(state,c)
  legatus.spawn(b,s)
 end
 function legatus.onDefeat(state,b,s,c) C.clearFieldSummon(state,c) end

 function legatus.damageFactor(state,cast,b,s)
  return b.form=='resonating' and not cast.reaction and s.armorFactor or 1
 end

 function legatus.begin(b,s,m,a)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={},
   source={id=b.id,y=s.floorY,owner=b,damageElement=m.element}}
 end
 function legatus.shareCast(c,actors)
  C.shareFieldHits({c.seen},actors)
 end

 local function resonatorWindow(c)
  if c and c.summon and c.summon.hp>0 then return c.move.resonator.release-c.tick end
 end

 function legatus.frame(f,b,s,c)
  if not c then return end
  if c.dest and c.tick<c.move.recover then f.destinationX=c.dest end
  f.resonatorTicks=resonatorWindow(c)
  if b.form=='staggered' then
   f.recovering=true
   f.exposureTicks=(c.ends or c.move.total)-c.tick
  end
 end

 local function lock(b,s,c)
  local m=c.move
  if m.kind=='charge' then
   local left,right=s.arenaMin+64,s.arenaMax-64
   c.dest=clamp(c.origin+c.dir*m.distance*U,left,right)
   if math.abs(c.dest-c.origin)<1.4*U then
    c.dir=-c.dir;b.facing=c.dir
    c.dest=clamp(c.origin+c.dir*m.distance*U,left,right)
   end
  elseif m.resonator then
   local function point(dir)
    return clamp(c.origin+dir*m.resonator.distance*U,s.arenaMin+35,s.arenaMax-35)
   end
   c.resonatorX=point(c.dir)
   if math.abs(c.resonatorX-c.origin)<1.5*U then c.resonatorX=point(-c.dir) end
  end
 end

 local function bounds(c)
  local m=c.move
  if m.kind=='sweep' then
   local a,b=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   return math.min(a,b),math.max(a,b)
  end
  if m.kind=='charge' then
   local margin=m.margin*U
   return math.min(c.origin,c.dest)-margin,math.max(c.origin,c.dest)+margin
  end
  local half=m.width*U/2
  return c.resonatorX-half,c.resonatorX+half
 end

 local function updateResonator(state,b,s,c,t)
  local rules=c.move.resonator
  if t==rules.spawn then
   c.summon={id=-b.id,x=c.resonatorX,y=s.floorY,hitTop=s.floorY-54,hitBottom=s.floorY,
    hp=rules.hp,maxhp=rules.hp,level=s.level,custom=true,noRewards=true,warning=0,respawn=math.huge}
   state.enemies[#state.enemies+1]=c.summon
   b.form='resonating'
  end
  if c.summon and c.summon.hp<=0 then
   C.clearFieldSummon(state,c)
   c.interrupted=true
   c.ends=t+rules.stagger
   b.form='staggered'
  elseif t==rules.release then
   C.clearFieldSummon(state,c)
   b.form='marble'
  end
 end

 function legatus.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
  end
  if t==m.lock then lock(b,s,c) end
  if m.resonator then updateResonator(state,b,s,c,t) end
  if c.interrupted then
   if t<c.ends then return false end
   legatus.spawn(b,s)
   return true
  end
  local start,finish=m.active[1],m.active[2]
  if t>=start and t<finish then
   local left,right
   if m.kind=='charge' then
    local prev=b.x
    b.x=c.origin+(c.dest-c.origin)*(t-start+1)/(finish-start)
    local margin=m.margin*U
    left,right=math.min(prev,b.x)-margin,math.max(prev,b.x)+margin
   else
    left,right=bounds(c)
   end
   C.hitFieldArea(state,c.source,c.seen,left,right,s.floorY-m.height*U,m.damage,
    s.floorY-(m.low or 0)*U)
  end
  if t>=m.recover then b.form='staggered' end
  if t<m.total then return false end
  legatus.spawn(b,s)
  return true
 end

 function legatus.label(b,c)
  if b.form=='resonating' then return '装甲展開・共鳴器を壊すと炎を止められる' end
  if b.form=='staggered' then return c.interrupted and '共鳴が止まる・反撃' or '前脚を止める・反撃' end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function drawResonator(f,x,y,device)
  rect(f,x-8,y-8,16,8,ink)
  rect(f,x-3,y-43,6,39,gold)
  rect(f,x-15,y-46,30,13,ink)
  rect(f,x-11,y-50,22,18,gold)
  rect(f,x-7,y-51,14,18,'#f2714d')
  rect(f,x-3,y-53,6,17,cream)
  rect(f,x-17,y-65,34,5,ink)
  rect(f,x-17,y-65,34*device.hp/device.maxhp,5,gold)
 end

 function legatus.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local pose='idle'
  if c then
   local m,t=c.move,c.tick
   local start,finish=m.active[1],m.active[2]
   if b.form=='staggered' then pose='stagger'
   elseif m.kind=='sweep' then pose='sweep'
   elseif m.kind=='charge' then pose=t>=start and 'charge' or 'sweep'
   else pose='conduct' end
   if t>=m.lock and t<finish and not c.interrupted then
    local left,right=bounds(c)
    left,right=left-camera,right-camera
    local top,bottom=y-m.height*U,y-(m.low or 0)*U
    rect(f,left,bottom-4,right-left,2,gold)
    for px=left+4,right-6,17 do rect(f,px,bottom-9,6,2,cream) end
    if t>=start then
     if m.kind=='charge' then
      left,right=b.x-camera-m.margin*U,b.x-camera+m.margin*U
     end
     rect(f,left,top,right-left,bottom-top,'#ff914c55')
     rect(f,left,top,right-left,2,gold)
    end
    if c.summon then
     local x=c.summon.x-camera
     drawResonator(f,x,y,c.summon)
     local remaining=resonatorWindow(c)
     local rules=m.resonator
     if remaining then C.drawFieldTimer(f,x,y-73,remaining,rules.release-rules.spawn,timerColor) end
    end
   end
  end
  C.drawLegatusFieldArt(f,b.x-camera,y,pose,mode,profile,b.facing>0)
 end
 return legatus
end
