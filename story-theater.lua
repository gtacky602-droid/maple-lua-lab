return function(C)
 local theater={}

 local function box(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function label(draws,text,x,y,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,color=color,size=14}
 end

 local function stageCount(s,quest)
  local state=s.story.quests[quest]
  return state and state.count or 0
 end

 local function setSolid(s,previous,nextSolid)
  if previous==nextSolid then return previous end
  for i,solid in ipairs(s.solids or {}) do
   if solid==previous then table.remove(s.solids,i);break end
  end
  if nextSolid then
   s.solids=s.solids or {}
   s.solids[#s.solids+1]=nextSolid
  end
  return nextSolid
 end

 function theater.sync(s,stage,transition)
  if not stage then return end
  local count=stageCount(s,stage.quest)
  local shutter=stage.shutter or stage.curtain
  local blocking=shutter and count<shutter.openAt and shutter or nil
  s.theaterShutter=setSolid(s,s.theaterShutter,blocking)
  local wave=stage.wave
  local cover=wave and count>=wave.raiseAt and wave.cover or nil
  s.theaterWaveWall=setSolid(s,s.theaterWaveWall,cover)
  if transition and stage.flats and count==stage.flats.changeAt then s.theaterFlatsAt=s.t end
  if transition and stage.curtain and count==stage.curtain.openAt then s.theaterCurtainAt=s.t end
 end

 function theater.enter(s,stage)
  s.theaterCart,s.theaterShutter,s.theaterWaveWall=nil,nil,nil
  s.theaterFlatsAt,s.theaterCurtainAt,s.theaterShotAt=nil,nil,nil
  theater.sync(s,stage,false)
 end

 function theater.start(s,milestone,state)
  if s.theaterCart then return end
  s.theaterCart={spec=milestone.followCart,step=milestone,state=state,
                 x=milestone.followCart.start,delay=milestone.followCart.delay}
  s.storyNotice=milestone.followCart.departure
 end

 local function tickEmitter(s,emitter,count)
  if not emitter or count>=emitter.stopAt then return end
  local a=s.actors[s.active]
  if a.hp<=0 or a.x<emitter.senseFrom or a.x>emitter.senseTo then s.theaterShotAt=nil;return end
  if not s.theaterShotAt then s.theaterShotAt=s.t+emitter.period;return end
  if s.t+1e-8<s.theaterShotAt then return end
  C.spawnEnemyProjectile(s,emitter.x,emitter.y,s.active,math.pi,
    {speed=emitter.speed,damage=emitter.damage,turnRate=0,life=emitter.life,color='#ffc17d'})
  s.theaterShotAt=s.t+emitter.period
 end

 function theater.step(s,dt,stage)
  if not stage or dt<=0 then return end
  tickEmitter(s,stage.emitter,stageCount(s,stage.quest))
  local cart=s.theaterCart
  if not cart then return end
  if cart.delay>0 then
   cart.delay=math.max(0,cart.delay-dt)
   return
  end
  local a=s.actors[s.active]
  if a.hp<=0 or math.abs(a.x-cart.x)>cart.spec.leash then return end
  cart.x=math.min(cart.spec.stop,cart.x+cart.spec.speed*dt)
  if cart.x<cart.spec.stop then return end
  s.theaterCart=nil
  return cart.step,cart.state
 end

 local function drawShutter(draws,x,y,w,h)
  box(draws,x-13,y-10,w+26,h+10,'#29434a')
  box(draws,x-7,y-5,w+14,h+5,'#a87b54')
  box(draws,x,y,w,h,'#344d64')
  for dy=8,h-4,12 do box(draws,x+4,y+dy,w-8,3,'#617889') end
  box(draws,x+6,y+h-24,w-12,6,'#d1a66a')
 end

 local function drawMoon(draws,x,y,t)
  local rise=(1-math.cos(t*2.2))*20
  box(draws,x-3,y-123,6,65-rise,'#a98f62')
  y=y-62-rise
  box(draws,x-16,y+1,23,6,'#b78853')
  box(draws,x-24,y+7,23,27,'#d6a96e')
  box(draws,x-18,y+29,26,9,'#d6a96e')
  box(draws,x-13,y+30,30,6,'#f4d68f')
  box(draws,x-21,y+8,5,19,'#f4d68f')
  box(draws,x+13,y+24,9,7,'#f4d68f')
  box(draws,x+20,y+19,5,7,'#f4d68f')
 end

 local function drawCurtain(draws,x,curtain,progress)
  local h=math.floor(curtain.h*(1-progress*.85))
  box(draws,x-6,curtain.y-7,curtain.w+12,8,'#b89763')
  box(draws,x,curtain.y,curtain.w,h,'#71334a')
  for dx=4,curtain.w-4,10 do box(draws,x+dx,curtain.y,3,h,'#975060') end
  box(draws,x,curtain.y+h-6,curtain.w,6,'#d1a169')
 end

 local function drawFlats(s,draws,flats,count,mode,profile)
  local x=flats.x-s.camera
  if x< -226 or x>1160 then return end
  local y=flats.y
  local changed=count>=flats.changeAt
  if changed then
   box(draws,x-143,y-7,283,8,'#99664e')
   for i=0,4 do
    local dx,h=i*52-132,56+(i%3)*17
    box(draws,x+dx,y-h,40,h-6,'#57727d')
    box(draws,x+dx-2,y-h-8,44,11,'#b18c67')
    box(draws,x+dx+6,y-h+14,8,21,'#e8b779')
    box(draws,x+dx+24,y-h+14,8,21,'#e8b779')
   end
  end
  local passed=s.theaterFlatsAt and s.t-s.theaterFlatsAt
  local progress=changed and (passed and math.min(1,passed/.85) or 1) or 0
  if progress<1 then
   for i=-1,1 do C.drawFieldDisplayArt({draws=draws},C.stageWaveArt,x+i*103-340*progress,y,108,mode,profile,false) end
  end
 end

 local function drawWave(s,f,draws,wave,count,mode,profile)
  local up=count>=wave.raiseAt
  f.storyTheaterWave={raised=up,x=wave.x}
  local x=wave.x-s.camera
  if x< -70 or x>1030 then return end
  if up then C.drawFieldDisplayArt({draws=draws},C.stageWaveArt,x,wave.y,wave.height,mode,profile,false)
  else
   box(draws,x-54,wave.y-14,108,14,'#3a575f')
   box(draws,x-50,wave.y-14,100,4,'#66a192')
   box(draws,x-46,wave.y-10,11,10,'#b08c61')
   box(draws,x+35,wave.y-10,11,10,'#b08c61')
  end
 end

 local function drawEmitter(s,draws,emitter,count)
  local x,y=emitter.x-s.camera,emitter.y
  local idle=count>=emitter.stopAt
  local imminent=not idle and s.theaterShotAt and s.theaterShotAt-s.t<=emitter.warning
  if imminent and x>=0 and x<=960 then
   local left=(s.theaterWaveWall and s.theaterWaveWall.x+s.theaterWaveWall.w or emitter.senseFrom)-s.camera
   for dx=math.max(0,left),x-15,20 do box(draws,dx,y-1,9,2,'#f5bd83') end
  end
  if x< -45 or x>1000 then return end
  box(draws,x-12,y-14,36,46,'#505361')
  box(draws,x-23,y-7,23,14,'#b37e56')
  box(draws,x+3,y-22,12,9,idle and '#81a390' or imminent and '#ffd294' or '#b97357')
 end

 function theater.frame(s,f,draws,stage,mode,profile)
  if not stage then return end
  local count=stageCount(s,stage.quest)
  local shutter=stage.shutter
  if shutter and count<shutter.openAt then
   local x=shutter.x-s.camera
   if x>=-shutter.w and x<=960 then drawShutter(draws,x,shutter.y,shutter.w,shutter.h) end
  end
  if stage.moon then
   local moon=stage.moon
   local x=moon.x-s.camera
   if x>=-40 and x<=1000 then drawMoon(draws,x,moon.y,s.t) end
  end
  if stage.flats then drawFlats(s,draws,stage.flats,count,mode,profile) end
  if stage.curtain then
   local curtain=stage.curtain
   local x=curtain.x-s.camera
   local progress=count>=curtain.openAt and
      (s.theaterCurtainAt and math.min(1,(s.t-s.theaterCurtainAt)/.7) or 1) or 0
   if x>=-curtain.w and x<=960 then drawCurtain(draws,x,curtain,progress) end
  end
  if stage.wave then drawWave(s,f,draws,stage.wave,count,mode,profile) end
  if stage.emitter then drawEmitter(s,draws,stage.emitter,count) end
  if stage.lift and s.lift and s.lift.riders then
   local a=s.actors[1]
   box(draws,a.x-s.camera-58,a.y,92,12,'#a57a55')
   box(draws,a.x-s.camera-58,a.y,92,4,'#d5ad72')
  end
  local route=stage.cart
  if not route then return end
  local cart=s.theaterCart
  local phase=count>=route.openAt and 'parked' or 'waiting'
  local x=phase=='parked' and route.stop or route.start
  if cart then
   x=cart.x
   if cart.delay>0 then phase='starting'
   elseif math.abs(s.actors[s.active].x-x)>route.leash then phase='waitingForPlayer'
   else phase='following' end
  end
  f.storyTheaterCart={x=x,phase=phase}
  x=x-s.camera
  if x< -95 or x>1055 then return end
  C.drawFieldDisplayArt({draws=draws},C.parcelMekaArt,x,route.y,route.height,mode,profile,false)
  if phase=='starting' or phase=='waitingForPlayer' then
   label(draws,phase=='starting' and '出発のベル' or 'メカに近づく',x,route.y-route.height-12,'#ffdfa0')
  end
 end

 return theater
end
