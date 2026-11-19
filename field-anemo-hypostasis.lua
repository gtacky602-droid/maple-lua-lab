return function(C)
 local anemo={}
 local U=88
 local tau=2*math.pi
 local coreHeight,coreClearance=44,18

 local function ramp(t,first,last)
  return math.max(0,math.min(1,(t-first)/(last-first)))
 end

 function anemo.spawn(boss)
  -- Only the low diamond core receives attacks. The moving shell is visual.
  boss.hitBottom=boss.y-coreClearance
  boss.hitTop=boss.hitBottom-coreHeight
 end

 function anemo.farMove(spec)
  return spec.moves[3]
 end

 function anemo.begin(boss,spec,move,target)
  return {move=move,tick=0,center=target.x,dir=target.x<boss.x and -1 or 1,seen={},vortexHits={{},{}}}
 end

 function anemo.shareCast(cast,actors)
  C.shareFieldHits({cast.seen,cast.vortexHits[1],cast.vortexHits[2]},actors)
 end

 local function vortexX(boss,cast,age)
  return boss.x+cast.dir*(.42+age*cast.move.speed/60)*U
 end

 function anemo.tick(s,boss,spec,cast,target)
  local move=cast.move
  local t=cast.tick+1
  cast.tick=t
  if t<=move.lock and target then
   cast.center=target.x
   cast.dir=target.x<boss.x and -1 or 1
  end
  local half=move.width*U/2
  local top=boss.y-move.height*U
  if move.shotTicks then
   for i,fired in ipairs(move.shotTicks) do
    local age=t-fired
    if age>=0 and age<move.shotLife then
     local x=vortexX(boss,cast,age)
     local previous=vortexX(boss,cast,math.max(0,age-1))
     C.hitFieldArea(s,boss,cast.vortexHits[i],math.min(x,previous)-half,math.max(x,previous)+half,top,move.damage)
    end
   end
  else
   local window=move.active[1]
   if t>=window[1] and t<window[2] then
    C.hitFieldArea(s,boss,cast.seen,cast.center-half,cast.center+half,top,move.damage)
   end
  end
  return t>=move.total
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function ring(cube,x,y,rx,ry,spin,size)
  for i=0,5 do
   local angle=spin+i*tau/6
   cube(x+math.cos(angle)*rx,y+math.sin(angle)*ry,size)
  end
 end

 local function drawVortex(f,x,floor,width,height,age,active)
  local color=active and '#a5fff0' or '#80d8c1'
  local outline='#276c62'
  for i=0,3 do
   local w=width*(.42+i*.19)
   local shift=math.sin(age*.26+i*1.45)*(width-w)*.46
   local y=floor-height*(i+1)/4
   rect(f,x+shift-w/2,y,w,6,outline)
   rect(f,x+shift-w/2+3,y+1,w-6,3,color)
  end
 end

 local function alert(f,x,y,half,active)
  local color=active and '#ffd1a0' or '#ff875f'
  rect(f,x-half,y-5,half*2,4,'#603b36')
  rect(f,x-half+2,y-4,half*2-4,2,color)
  rect(f,x-half,y-13,3,10,color)
  rect(f,x+half-3,y-13,3,10,color)
 end

 function anemo.draw(f,s,boss,spec,cast,mode,profile)
  local x,y=boss.x-s.camera,boss.y
  local function cube(cx,cy,size)
   C.drawAnemoPart(f,'shell',cx,cy+size*.5,size,mode,profile)
  end
  if not cast then
   local time=s.coop and s.coop.time or s.t
   ring(cube,x,y-89,55,27,time*.8,28)
  else
   local move,t=cast.move,cast.tick
   if t<move.recover then
    local center=cast.center-s.camera
    local window=move.active[1]
    if window and t>=move.lock and t<window[2] then
     alert(f,center,y,move.width*U/2,t>=window[1])
    end
    if move.pattern=='clap' then
     local assemble=ramp(t,0,move.lock)
     local close=ramp(t,move.lock,window[1])
     local release=ramp(t,window[2],move.recover)
     for _,side in ipairs({-1,1}) do
      for i=0,2 do
       local spread=77+(i==2 and -9 or 0)-63*close+40*release
       local cx=x+side*46+(center-x+side*(spread-46))*assemble
       cube(cx,y-30-i*26-release*36,27)
      end
     end
     if t>=window[1] then
      local ripple=18+ramp(t,window[1],move.recover)*58
      rect(f,center-ripple,y-8,ripple*2,2,'#d5ffee')
     end
    elseif move.pattern=='drop' then
     local assemble=ramp(t,0,move.lock)
     local descend=ramp(t,72,window[1])
     local release=ramp(t,window[2],move.recover)
     local cx=x+(center-x)*assemble
     ring(cube,cx,y-89+68*descend-25*release,56-13*descend+32*release,13-8*descend,t*.075,27)
    else
     local wind=t/60
     ring(cube,x,y-84,42+12*math.sin(wind*4),18,wind*5,24)
     local width,height=move.width*U,move.height*U
     if t>=move.lock and t<move.shotTicks[1] then
      local start=vortexX(boss,cast,0)-s.camera
      local last=vortexX(boss,cast,move.shotLife-1)-s.camera
      rect(f,math.min(start,last),y-4,math.abs(last-start),3,'#86d5bf')
     end
     for i,fired in ipairs(move.shotTicks) do
      local age=t-fired
      if age<0 then
       local charge=x+cast.dir*(32+i*20)
       drawVortex(f,charge,y-20-i*24,20,22,t+i*5,false)
      elseif age<move.shotLife then
       drawVortex(f,vortexX(boss,cast,age)-s.camera,y,width,height,age,true)
      end
     end
    end
   end
  end
  C.drawAnemoPart(f,'core',x,boss.y-coreClearance,coreHeight,mode,profile)
 end

 return anemo
end
