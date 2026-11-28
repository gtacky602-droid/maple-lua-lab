return function(C)
 local drake={}
 local U=88
 local amber,white='#edb059','#fff1ba'
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function place(b,s,lift)
  b.y=s.floorY-lift
  b.hitBottom=b.y-.4*U
  b.hitTop=b.hitBottom-69
  b.flying=lift>0 or nil
 end
 function drake.spawn(b,s)
  b.stagger=0;b.rise=0;b.coreRearm=0
  place(b,s,0)
 end
 function drake.cancel(b,s)
  b.weakpoint=nil
  place(b,s,0)
 end
 function drake.begin(b,s,m,a)
  local dir=a.x<b.x and -1 or 1
  b.facing=dir
  return {move=m,tick=0,dir=dir,origin=b.x,seen={{},{}},shots={},projectiles={}}
 end
 function drake.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 function drake.onHit(cast,b,s,slot)
  if not slot or not slot.cast or not C.hitFieldWeakpoint(cast,b) then return end
  -- The successful body/core hit has already removed HP once.
  drake.cancel(b,s)
  slot.cast=nil;slot.delay=0
  b.stagger=s.core.down
 end
 function drake.preempt(b,s)
  if b.stagger>0 then
   b.stagger=b.stagger-1
   if b.stagger==0 then b.rise=s.core.rise;b.coreRearm=s.core.rearm end
   return true
  end
  if b.coreRearm>0 then b.coreRearm=b.coreRearm-1 end
  if b.rise>0 then b.rise=b.rise-1;return true end
  return false
 end
 local function wingBand(c)
  local left,right=c.origin+c.dir*.25*U,c.origin+c.dir*1.65*U
  return math.min(left,right),math.max(left,right)
 end
 local function shot(c,age)
  return c.origin+c.dir*(.65+age*4/60)*U
 end
 local function lock(b,s,c,a)
  local m=c.move
  if m.kind=='cannon' and b.coreRearm==0 then
   b.weakpoint={x=b.x+c.dir*s.core.offset*U,y=b.y-.6*U,radius=.18*U}
  elseif m.kind=='charge' then
   local limit=2.2*U
   local requested=a and a.x or c.origin+c.dir*limit
   c.dest=clamp(c.origin+clamp(requested-c.origin,-limit,limit),s.arenaMin+64,s.arenaMax-64)
  end
 end
 function drake.tick(s,b,spec,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir
  end
  if t==m.lock then lock(b,spec,c,a) end
  if m.kind=='wings' then
   for i,w in ipairs(m.active) do
    if t>=w[1] and t<w[2] then
     local left,right=wingBand(c)
     C.hitFieldArea(s,b,c.seen[i],left,right,spec.floorY-1.1*U,m.damage,spec.floorY-.2*U)
    end
   end
  elseif m.kind=='cannon' then
   if t==spec.core.close then b.weakpoint=nil end
   for i,fired in ipairs(m.fire) do
    local age=t-fired
    if age>=0 and age<m.life and not c.shots[i] then
     C.stepFieldBolt(s,b,c,i,shot(c,age),spec.floorY-.75*U,.14*U,m.damage,'physical')
    elseif age==m.life then c.projectiles[i]=nil end
   end
  else
   local lift=0
   if t>=m.air[1] and t<m.air[2] then
    local u=(t-m.air[1])/(m.air[2]-m.air[1])
    lift=4*72*u*(1-u)
   end
   local w=m.active[1]
   if t>=w[1] and t<w[2] then
    local prev=b.x
    b.x=c.origin+(c.dest-c.origin)*(t-w[1])/(w[2]-w[1]-1)
    C.hitFieldCapsule(s,b,c.seen[1],prev,b.x,spec.floorY-.5*U,.35*U,m.damage,.3*U)
   end
   place(b,spec,lift)
  end
  return t>=m.total
 end
 function drake.label(b,c)
  if b.stagger>0 then return '胸部コアで中断・ダウン' end
  if b.rise>0 then return '立て直し' end
  if b.weakpoint then return '胸部コア露出' end
  if c and c.tick>=c.move.recover then return '反撃の隙・足を止める' end
 end
 local function coreWindow(b,s,c)
  return b.weakpoint and c and math.max(0,s.core.close-c.tick) or nil
 end
 function drake.frame(f,b,s,c)
  f.flying=not not b.flying
  f.downTicks=b.stagger
  f.riseTicks=b.rise
  f.coreWindowTicks=coreWindow(b,s,c)
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function band(f,left,right,y,active)
  local col=active and white or amber
  rect(f,left,y-8,right-left,2,col)
  rect(f,left,y-13,2,6,col)
  rect(f,right-2,y-13,2,6,col)
 end
 local function coreMarker(f,point,camera)
  local x,y,r=point.x-camera,point.y,point.radius
  for _,dir in ipairs({-1,1}) do
   local left=x+dir*r-(dir==1 and 5 or 0)
   rect(f,left,y-r,5,2,white);rect(f,left,y+r-2,5,2,white)
   rect(f,x+dir*r-(dir==1 and 2 or 0),y-r,2,5,white)
   rect(f,x+dir*r-(dir==1 and 2 or 0),y+r-5,2,5,white)
  end
  rect(f,x-5,y-5,10,10,'#aa5e31')
  rect(f,x-3,y-3,6,6,white)
 end
 function drake.draw(f,state,b,s,c,mode,profile)
  local x,y,camera=b.x-state.camera,s.floorY,state.camera
  local pose=b.stagger>0 and 'down' or b.rise>0 and 'windup' or 'idle'
  if c then
   local m,t=c.move,c.tick
   if t>=m.recover then pose='down'
   elseif m.kind=='wings' then
    pose=t<m.active[1][2] and 'wing_first' or 'wing_second'
    if t>=m.lock and t<m.active[2][2] then
     local left,right=wingBand(c)
     local hit=(t>=96 and t<102) or (t>=156 and t<162)
     band(f,left-camera,right-camera,y,hit)
    end
   elseif m.kind=='cannon' then pose='cannon'
   else
    pose=t<m.air[1] and 'windup' or t<m.active[1][2] and 'dash' or 'down'
    if t>=m.lock and t<m.active[1][2] then
     local left,right=math.min(c.origin,c.dest)-.35*U,math.max(c.origin,c.dest)+.35*U
     band(f,left-camera,right-camera,y,t>=m.active[1][1])
    end
   end
  end
  C.drawAeonblightFieldArt(f,x,b.y,pose,mode,profile,b.facing>0)
  local remaining=coreWindow(b,s,c)
  if remaining then
   local point=b.weakpoint
   coreMarker(f,point,camera)
   C.drawFieldCoreTimer(f,point.x-camera,point.y+point.radius+5,remaining,s.core.close-c.move.lock,white)
  end
  if c and c.move.fire then
   local h=y-.75*U
   for i,fired in ipairs(c.move.fire) do
    local age=c.tick-fired
    if age<0 then
     local px=x+c.dir*(43+i*11)
     rect(f,px-3,h-14,6,4,amber)
    elseif age<c.move.life and not c.shots[i] then
     local px=shot(c,age)-camera
     rect(f,px-11,h-4,22,8,'#845535')
     rect(f,px-9,h-2,18,4,amber)
     rect(f,px+c.dir*4-2,h-4,4,8,white)
    end
   end
  end
 end
 return drake
end
