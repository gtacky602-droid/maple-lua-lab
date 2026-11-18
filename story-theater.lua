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

 function theater.enter(s,stage)
  s.theaterCart,s.theaterShutter=nil,nil
  if not stage or not stage.shutter or stageCount(s,stage.quest)>=stage.shutter.openAt then return end
  s.solids=s.solids or {}
  s.theaterShutter=stage.shutter
  s.solids[#s.solids+1]=stage.shutter
 end

 function theater.start(s,milestone,state)
  if s.theaterCart then return end
  s.theaterCart={spec=milestone.followCart,step=milestone,state=state,
                 x=milestone.followCart.start,delay=milestone.followCart.delay}
  s.storyNotice=milestone.followCart.departure
 end

 function theater.step(s,dt)
  local cart=s.theaterCart
  if not cart or dt<=0 then return end
  if cart.delay>0 then
   cart.delay=math.max(0,cart.delay-dt)
   return
  end
  local a=s.actors[s.active]
  if a.hp<=0 or math.abs(a.x-cart.x)>cart.spec.leash then return end
  cart.x=math.min(cart.spec.stop,cart.x+cart.spec.speed*dt)
  if cart.x<cart.spec.stop then return end
  local wall=s.theaterShutter
  for i,solid in ipairs(s.solids or {}) do
   if solid==wall then table.remove(s.solids,i);break end
  end
  s.theaterCart,s.theaterShutter=nil,nil
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
