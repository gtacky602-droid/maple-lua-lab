return function(C)
 local geo={}
 local intercept=C.interceptHit
 local U=88
 local coreHeight,coreClearance=48,.5*U

 local function ramp(t,a,b)
  return math.max(0,math.min(1,(t-a)/(b-a)))
 end

 function geo.spawn(boss)
  boss.hitBottom=boss.y-coreClearance
  boss.hitTop=boss.hitBottom-coreHeight
 end

 function geo.farMove(spec)
  return spec.moves[2]
 end

 function geo.begin(boss,spec,move,target,s)
  local dir=target.x<boss.x and -1 or 1
  boss.facing=dir
  return {move=move,tick=0,stamp=s.t,dir=dir,seen={},shots={},projectiles={},cracks=0}
 end
 function geo.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end

 local function strikePillar(attack,boss,cast,now)
  local pillar=cast.move.pillar
  if cast.exposure or attack.reaction or attack.geoFieldPillar==cast or
     math.abs(attack.x-boss.x)>pillar.closeRange or math.abs(attack.y-boss.y)>pillar.height*U then return end
  -- Core casts resolve before field controllers advance their clock.
  local t=cast.tick+math.floor(math.max(0,now-cast.stamp)*60+.5)
  if t<pillar.open or t>=cast.move.active[1][1] then return end
  attack.geoFieldPillar=cast
  cast.cracks=cast.cracks+1
  if cast.cracks==pillar.hits then
   cast.exposure=0
   cast.brokeAt=now
   cast.skipFirst=true
  end
 end

 function C.interceptHit(s,attack,e,element)
  if e.fieldBoss=='boss-20040301' then
   local slot,now=C.fieldSlot(s,e.fieldBoss)
   local cast=slot and slot.cast
   if cast and slot.enemy==e and cast.move.pillar then strikePillar(attack,e,cast,now) end
  end
  return intercept and intercept(s,attack,e,element)
 end

 local function hammerBounds(boss,cast)
  local move=cast.move
  local a,b=boss.x+cast.dir*move.near*U,boss.x+cast.dir*move.far*U
  return math.min(a,b),math.max(a,b)
 end

 local function boltPosition(boss,cast,age)
  local move=cast.move
  return boss.x+cast.dir*(.53+age*move.shotSpeed/60)*U,boss.y-move.shotHeight*U
 end

 function geo.tick(s,boss,spec,cast,target)
  local move=cast.move
  if cast.exposure then
   if not cast.skipFirst or s.t>cast.brokeAt+1e-8 then cast.exposure=cast.exposure+1 end
   cast.skipFirst=false
   return cast.exposure>=move.pillar.expose+move.pillar.reform
  end
  local t=cast.tick+1
  cast.tick=t;cast.stamp=s.t
  if t<=move.lock and target then
   cast.dir=target.x<boss.x and -1 or 1
   boss.facing=cast.dir
  end
  if move.shotTicks then
   for i,fired in ipairs(move.shotTicks) do
    local age=t-fired
    if age>=0 and age<move.shotLife and not cast.shots[i] then
     local x,y=boltPosition(boss,cast,age)
     C.stepFieldBolt(s,boss,cast,i,x,y,move.shotRadius*U,move.damage)
    end
   end
  else
   local window=move.active[1]
   if t>=window[1] and t<window[2] then
    local left,right
    if move.pillar then left,right=boss.x-move.radius*U,boss.x+move.radius*U
    else left,right=hammerBounds(boss,cast) end
    C.hitFieldArea(s,boss,cast.seen,left,right,boss.y-move.height*U,move.damage)
   end
  end
  return t>=move.total
 end

 function geo.label(boss,cast)
  if not cast or not cast.move.pillar then return end
  local pillar=cast.move.pillar
  if cast.exposure then
   return cast.exposure<pillar.expose and '柱破壊・核が静止' or '殻を組み直す'
  end
  if cast.tick>=pillar.open and cast.tick<cast.move.active[1][1] then
   return '近くで柱に攻撃 '..cast.cracks..'/'..pillar.hits
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function mark(f,left,right,y,active)
  local color=active and '#fff0af' or '#e6a260'
  rect(f,left,y-7,right-left,5,'#4e372a')
  rect(f,left+2,y-5,right-left-4,2,color)
  rect(f,left,y-15,3,10,color)
  rect(f,right-3,y-15,3,10,color)
 end

 local function orbit(cube,x,y,rx,ry,spin,size)
  for i=0,5 do
   local angle=spin+i*math.pi/3
   cube(x+math.cos(angle)*rx,y+math.sin(angle)*ry,size)
  end
 end

 local function drawHammer(f,cube,boss,cast,camera)
  local t,move=cast.tick,cast.move
  local window=move.active[1]
  local x,y=boss.x-camera,boss.y
  local left,right=hammerBounds(boss,cast)
  left,right=left-camera,right-camera
  local center=(left+right)/2
  if t>=move.lock and t<window[2] then mark(f,left,right,y,t>=window[1]) end
  local build=ramp(t,0,move.lock)
  local slam=ramp(t,77,window[1])
  local burst=ramp(t,window[2],move.recover)
  local tx=x+(center-x)*build
  local top=y-83-62*build+119*slam
  for i=-1,1 do
   cube(tx+i*(24+7*build+25*burst),top-burst*(10+math.abs(i)*24),32-10*burst)
  end
  for i=0,2 do
   local tip=x+(tx-x)*(.45+i*.17)
   cube(tip,top+(26+i*19)*(1-slam)-i*3*slam,20-i*2)
  end
  if t>=window[1] and t<window[2]+18 then
   local age=t-window[1]
   local radius=24+age*1.8
   rect(f,center-radius,y-9,2*radius,3,'#dfb786')
   rect(f,center-radius,y-13,7,4,'#d59863')
   rect(f,center+radius-7,y-13,7,4,'#d59863')
  end
 end

 local function drawBolts(f,cube,boss,cast,camera)
  local t,move=cast.tick,cast.move
  local x,y=boss.x-camera,boss.y
  local z=y-move.shotHeight*U
  if t>=move.lock and t<move.shotTicks[#move.shotTicks] then
   local a=boltPosition(boss,cast,0)-camera
   local b=boltPosition(boss,cast,move.shotLife-1)-camera
   for px=math.min(a,b),math.max(a,b)-9,18 do rect(f,px,z-1,9,2,'#b88c5f') end
  end
  local gather=ramp(t,0,move.lock)
  for i,fired in ipairs(move.shotTicks) do
   local age=t-fired
   if age<0 then
    cube(x+cast.dir*(36+i*24)*gather,z-(1-gather)*(20+i*13),22)
   elseif age<move.shotLife and not cast.shots[i] then
    local bx,by=boltPosition(boss,cast,age)
    rect(f,bx-camera-9,by-1,18,3,'#d7a573')
    cube(bx-camera,by,20)
   end
  end
 end

 local function drawPillar(f,cube,boss,cast,camera,mode,profile)
  local x,y=boss.x-camera,boss.y
  local move,t=cast.move,cast.tick
  local p,window=move.pillar,move.active[1]
  if cast.exposure then
   local a=cast.exposure
   if a<p.expose then
    for i=0,3 do
     local spread=29+math.min(12,a*.35)
     if a<24 then cube(x+(i-1.5)*spread,y-8-a*.55,12) end
    end
   else
    local rebuild=ramp(a,p.expose,p.expose+p.reform)
    orbit(cube,x,y-73,39+13*rebuild,7+15*rebuild,a*.05,15+10*rebuild)
   end
   return
  end
  if t>=move.lock and t<window[2] then
   mark(f,x-move.radius*U,x+move.radius*U,y,t>=window[1])
  end
  if t<p.expires then
   local half=p.width*U/2
   local height=math.max(5,p.height*U*ramp(t,0,p.open))
   rect(f,x-half,y-height+3,half*2,height-3,'#4e372a')
   rect(f,x-half+4,y-height,half*2-8,height-4,'#77553a')
   rect(f,x-half,y-7,half*2,7,'#aa7850')
   C.drawGeoPart(f,'pillar',x,y,height,mode,profile)
   if t>=p.open then
    for i=1,p.hits do
     local cx=x-21+(i-1)*17
     local color=i<=cast.cracks and '#f3c67e' or '#574035'
     rect(f,cx,y-20,5,3,color)
     rect(f,cx+3,y-17,4,5,color)
     rect(f,cx+2,y-12,4,3,color)
    end
   end
  end
  orbit(cube,x,y-85,57,20,t*.06,23)
 end

 function geo.draw(f,s,boss,spec,cast,mode,profile)
  local x,y=boss.x-s.camera,boss.y
  local function cube(cx,cy,size)
   C.drawGeoPart(f,'shell',cx,math.min(y,cy+size/2),size,mode,profile)
  end
  if not cast then
   local time=s.coop and s.coop.time or s.t
   orbit(cube,x,y-87,52,24,time*.64,28)
  elseif cast.tick<cast.move.recover or cast.exposure then
   if cast.move.pillar then drawPillar(f,cube,boss,cast,s.camera,mode,profile)
   elseif cast.move.shotTicks then drawBolts(f,cube,boss,cast,s.camera)
   else drawHammer(f,cube,boss,cast,s.camera) end
  end
  C.drawGeoPart(f,'core',x,y-coreClearance,coreHeight,mode,profile)
 end

 return geo
end
