return function(C)
 local electro={}
 local U=88
 local coreHeight,coreClearance=46,18

 local function clamp(x,lo,hi)
  return math.max(lo,math.min(hi,x))
 end

 local function ramp(t,first,last)
  return clamp((t-first)/(last-first),0,1)
 end

 function electro.spawn(boss)
  boss.hitBottom=boss.y-coreClearance
  boss.hitTop=boss.hitBottom-coreHeight
 end

 function electro.farMove(spec)
  return spec.moves[3]
 end

 local function aim(boss,spec,cast,target)
  cast.dir=target.x<cast.origin and -1 or 1
  boss.facing=cast.dir
  if cast.move.distance then
   cast.dest=clamp(cast.origin+cast.dir*cast.move.distance*U,spec.arenaMin+80,spec.arenaMax-80)
  end
 end

 function electro.begin(boss,spec,move,target)
  local cast={move=move,tick=0,origin=boss.x,seen={{},{},{}}}
  aim(boss,spec,cast,target)
  return cast
 end

 local function strikeIndex(move,t)
  if t>=move.strikes[3].tell then return 3 end
  if t>=move.strikes[2].tell then return 2 end
  return 1
 end

 local function strikeBounds(cast,i)
  local strike=cast.move.strikes[i]
  local x1=cast.origin+cast.dir*strike.near*U
  local x2=cast.origin+cast.dir*strike.far*U
  return math.min(x1,x2),math.max(x1,x2)
 end

 local function capsuleHit(s,boss,cast,x0,x1,y,radius)
  local left,right=math.min(x0,x1),math.max(x0,x1)
  local seen=cast.seen[1]
  for _,a in ipairs(s.actors) do
   if a.hp>0 and not seen[a.id] then
    local dx=math.max(0,left-a.x-10,a.x-10-right)
    local dy=math.max(0,a.y-50-y,y-a.y)
    if dx*dx+dy*dy<radius*radius then
     seen[a.id]=true
     C.damageActor(s,a,cast.move.damage,boss,false,true)
    end
   end
  end
 end

 local function waveX(cast,age)
  return cast.origin+cast.dir*(.35+age*cast.move.speed/60)*U
 end

 function electro.tick(s,boss,spec,cast,target)
  local move=cast.move
  local t=cast.tick+1
  cast.tick=t
  if t<=move.lock and target then aim(boss,spec,cast,target) end
  if move.strikes then
   local i=strikeIndex(move,t)
   local window,strike=move.active[i],move.strikes[i]
   if t>=window[1] and t<window[2] then
    local left,right=strikeBounds(cast,i)
    C.hitFieldArea(s,boss,cast.seen[i],left,right,boss.y-strike.height*U,strike.damage)
   end
  elseif move.distance then
   local window=move.active[1]
   if t>=window[1] and t<window[2] then
    local previous=boss.x
    boss.x=cast.origin+(cast.dest-cast.origin)*ramp(t,window[1],window[2]-1)
    capsuleHit(s,boss,cast,previous,boss.x,boss.y-move.height*U,move.radius*U)
   end
  else
   local half=move.width*U/2
   for i,fired in ipairs(move.shotTicks) do
    local age=t-fired
    if age>=0 and age<move.shotLife then
     local x,previous=waveX(cast,age),waveX(cast,math.max(0,age-1))
     C.hitFieldArea(s,boss,cast.seen[i],math.min(x,previous)-half,math.max(x,previous)+half,boss.y-move.height*U,move.damage)
    end
   end
  end
  return t>=move.total
 end

 function electro.label(boss,cast)
  if not cast then return end
  local move,t=cast.move,cast.tick
  if t>=move.recover then return '息継ぎ・核が見える' end
  if move.strikes then
   local i=strikeIndex(move,t)
   return move.title..'（'..move.strikes[i].title..' '..i..'/3）'
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function marker(f,left,right,y,active)
  local color=active and '#fff0b5' or '#ffab72'
  rect(f,left,y-6,right-left,4,'#573157')
  rect(f,left+2,y-5,right-left-4,2,color)
  rect(f,left,y-13,3,11,color)
  rect(f,right-3,y-13,3,11,color)
 end

 local function orbit(cube,x,y,rx,ry,spin,size)
  for i=0,5 do
   local angle=spin+i*math.pi/3
   cube(x+math.cos(angle)*rx,y+math.sin(angle)*ry,size)
  end
 end

 local function fists(cube,x,y,dir,thrust)
  local center=x+dir*(32+47*thrust)
  for i=0,2 do cube(center+dir*(21+i%2*7),y-23-i*22,30) end
  for i=0,1 do cube(center-dir*10,y-37-i*22,34) end
  cube(center-dir*35,y-39,24)
 end

 local function shears(cube,x,y,dir,spread)
  for _,edge in ipairs({-1,1}) do
   for i=1,3 do
    cube(x+dir*(21+i*32),y-45+edge*(7+i*spread),31-i*4)
   end
  end
 end

 local function palm(cube,center,floor,drop)
  local y=floor-85+61*drop
  for i=-2,2 do cube(center+i*21,y-24+math.abs(i)*7,25) end
  cube(center-17,y,32)
  cube(center+12,y,32)
 end

 local function drawCombo(f,cube,x,y,cast,camera)
  local move,t=cast.move,cast.tick
  local i=strikeIndex(move,t)
  local window,strike=move.active[i],move.strikes[i]
  local left,right=strikeBounds(cast,i)
  left,right=left-camera,right-camera
  if t>=move.lock and t<window[2] then marker(f,left,right,y,t>=window[1]) end
  if i==1 then
   local thrust=ramp(t,move.lock,window[1])*(1-ramp(t,window[2],move.strikes[2].tell))
   fists(cube,x,y,cast.dir,thrust)
  elseif i==2 then
   local close=ramp(t,strike.tell+21,window[1])*(1-ramp(t,window[2],move.strikes[3].tell))
   shears(cube,x,y,cast.dir,13-11*close)
  else
   local drop=ramp(t,strike.tell+22,window[1])
   palm(cube,(left+right)/2,y,drop)
   if t>=window[1] then
    local scatter=(t-window[1])/3
    for j=1,5 do
     local spark=left+18*j+(j-3)*scatter
     rect(f,spark,y-9-j%3*5-scatter,5,5,'#edc5ff')
    end
   end
  end
 end

 local function drawDrill(f,cube,x,y,cast,camera)
  local move,t=cast.move,cast.tick
  local window=move.active[1]
  if t>=move.lock and t<window[2] then
   local travelMin,travelMax=math.min(cast.origin,cast.dest),math.max(cast.origin,cast.dest)
   marker(f,travelMin-camera-move.radius*U,travelMax-camera+move.radius*U,y,t>=window[1])
  end
  local assemble=ramp(t,0,move.lock)
  for i=0,2 do
   local cx=x+cast.dir*(52-i*33)*assemble
   local wobble=(13+i*6)*math.sin(t*.23+i*.5)
   cube(cx,y-36+wobble,18+6*i)
   cube(cx,y-36-wobble,18+6*i)
  end
 end

 local function drawWaves(f,cube,x,y,cast,camera)
  local move,t=cast.move,cast.tick
  orbit(cube,x,y-46,61,21,t*.067,24)
  if t>=move.lock and t<move.shotTicks[#move.shotTicks] then
   local start,last=waveX(cast,0)-camera,waveX(cast,move.shotLife-1)-camera
   rect(f,math.min(start,last),y-5,math.abs(last-start),3,'#b480ce')
  end
  for i,fired in ipairs(move.shotTicks) do
   local age=t-fired
   if age<0 then
    rect(f,x+cast.dir*(37+i*12)-4,y-13-i*9,8,8,'#e0b2ff')
   elseif age<move.shotLife then
    local cx=waveX(cast,age)-camera
    local width,height=move.width*U,move.height*U
    for j=0,4 do
     local dx=(j%2==0 and 1 or -1)*cast.dir*(width/2-3)
     local cy=y-(j+1)*height/5
     rect(f,cx+dx-4,cy,8,9,'#622694')
     rect(f,cx+dx-2,cy+1,4,6,'#f2ceff')
    end
   end
  end
 end

 function electro.draw(f,s,boss,spec,cast,mode,profile)
  local x,y=boss.x-s.camera,boss.y
  local function cube(cx,cy,size)
   C.drawElectroPart(f,'shell',cx,math.min(y,cy+size/2),size,mode,profile)
  end
  if not cast then
   orbit(cube,x,y-87,54,25,s.t*.83,28)
  elseif cast.tick<cast.move.recover then
   if cast.move.strikes then drawCombo(f,cube,x,y,cast,s.camera)
   elseif cast.move.distance then drawDrill(f,cube,x,y,cast,s.camera)
   else drawWaves(f,cube,x,y,cast,s.camera) end
  end
  C.drawElectroPart(f,'core',x,y-coreClearance,coreHeight,mode,profile)
 end

 return electro
end
