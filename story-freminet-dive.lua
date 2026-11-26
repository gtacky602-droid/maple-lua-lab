return function(C,canInspect)
 local dive={}

 local function clamp(value,lo,hi)
  return math.max(lo,math.min(hi,value))
 end

 local function camera(s)
  s.camera=clamp(s.actors[1].x-475,0,math.max(0,s.worldwidth-960))
 end

 function dive.enter(s,spec,state,goal)
  if s.toyDive then
   s.active=s.toyDive.previousActive
   s.toyDive=nil
  end
  if not spec then return end

  local actor=s.actors[1]
  s.toyDive={previousActive=s.active,shelter=spec.shelters[1]}
  s.active=1
  actor.x=clamp(actor.x,spec.left,spec.right)
  actor.y=clamp(actor.y,spec.top,spec.bottom)
  actor.ground,actor.walk,actor.vy=false,0,0
  if state and state.storyChoice and state.count<goal then dive.route(s) end
  camera(s)
 end

 function dive.route(s)
  s.toyDive.routedAt=s.t
 end

 function dive.recover(s)
  local session=s.toyDive
  local actor,place=s.actors[1],session.shelter
  actor.x,actor.y=place.x,place.y
  session.pushed=false
  camera(s)
  s.storyNotice='流れから離れ、近くの回収灯へ戻りました。'
 end

 local function inCurrent(spec,x,y)
  local current=spec.flow
  return x>=current.left and x<=current.right and y<=current.bottom
 end

 function dive.motion(actor,dt,input,speed)
  local dx=(input.right and 1 or 0)-(input.left and 1 or 0)
  local dy=(input.down and 1 or 0)-(input.up and 1 or 0)
  if dx~=0 and dy~=0 then speed=speed/math.sqrt(2) end
  return actor.x+dx*speed*dt,actor.y+dy*speed*dt,dx
 end

 function dive.step(s,dt,input,spec,state,goal)
  if s.paused then return end
  dt=clamp(dt,0,1/30)
  s.t=s.t+dt
  input=input or {}

  local actor,session=s.actors[1],s.toyDive
  local x,y,dx=dive.motion(actor,dt,input,spec.speed)
  local strong=state and state.count<goal and (inCurrent(spec,actor.x,actor.y) or inCurrent(spec,x,y))
  if strong then x=x-spec.flow.speed*dt end
  session.pushed=strong==true
  if dx~=0 then actor.dir=dx end
  if x<spec.left or x>spec.right or y<spec.top or y>spec.bottom then
   dive.recover(s)
   return
  end
  actor.x,actor.y=x,y
  if not strong then
   for _,point in ipairs(spec.shelters) do
    if (actor.x-point.x)^2+(actor.y-point.y)^2<62^2 then session.shelter=point end
   end
  end
  camera(s)
 end

 local function toyPosition(s,q,state)
  local route=q.toyRoute
  local marker=state.storyChoice and route.markers[state.storyChoice]
  if not marker then return route.start.x,route.start.y,false end
  if state.count>=q.goal then return route.dock.x,route.dock.y,true end

  local stops={route.start,route.turn,marker,route.dock}
  local remaining=math.max(0,s.t-(s.toyDive.routedAt or s.t))*route.speed
  for i=1,#stops-1 do
   local a,b=stops[i],stops[i+1]
   local dx,dy=b.x-a.x,b.y-a.y
   local distance=math.sqrt(dx*dx+dy*dy)
   if remaining<distance then
    local ratio=remaining/distance
    return a.x+dx*ratio,a.y+dy*ratio,false
   end
   remaining=remaining-distance
  end
  return route.dock.x,route.dock.y,true
 end

 function dive.arrived(s,q,state)
  local _,_,settled=toyPosition(s,q,state)
  return settled
 end

 local function art(layer,s,sprite,x,y,height,mode,profile)
  x=x-s.camera
  local half=height*sprite.box[3]/sprite.box[4]/2
  if x+half>=0 and x-half<=960 then
   C.drawFieldDisplayArt(layer,sprite,x,y,height,mode,profile,false)
  end
 end

 local function dot(draws,s,x,y,w,h,color)
  x=x-s.camera
  if x+w>=0 and x<=960 then
   draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
  end
 end

 local function label(draws,s,x,y,text)
  x=x-s.camera
  if x>=-65 and x<=1025 then
   draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color='#fff1bf'}
  end
 end

 local function bubbles(draws,s,x,y)
  for i=1,7 do
   local offset=(i*17+s.t*19)%76
   local bx=x+math.sin(i+offset*.04)*13
   dot(draws,s,bx,y-offset,3+i%3,3+i%3,'#c2f3e285')
   dot(draws,s,bx+1,y-offset,2,1,'#edfbcfc0')
  end
 end

 function dive.choice(layer,s,option,mode,profile)
  local draws=layer.draws
  local sprite=option.id=='coral' and C.freminetDiveArt.coral or C.freminetDiveArt.marker
  art(layer,s,sprite,option.x,option.y+20,55,mode,profile)
  if option.id=='bubbles' then bubbles(draws,s,option.x,option.y-38) end
 end

 function dive.look(s,n,state)
  if state and state.status=='complete' and canInspect(s.actors[s.active],n.toyDive.lookout) then
   s.storyNotice='浅瀬の見晴らし ｜ 石窓を抜けた光が、岩のあいだにゆっくり揺れています。'
   return true
  end
  return false
 end

 function dive.readDisplay(s,place,state)
  if state and state.status=='complete' and canInspect(s.actors[s.active],place) then
   s.storyNotice='フレミネの潜航玩具。「次は、もう少し遠くまで。」'
   return true
  end
  return false
 end

 function dive.display(f,s,layer,place,state,mode,profile)
  local draws=layer.draws
  if not state or place.exhibit and state.status~='complete' then return end
  if state.count==0 or state.status=='complete' then
   art(layer,s,C.freminetDiveArt.toy,place.x,place.y,72,mode,profile)
  end
  if state.status=='complete' then
   label(draws,s,place.x,place.y-89,'小さな潜航玩具')
   if not s.paused and not f.storyNearbyMilestone and canInspect(s.actors[s.active],place) then
    f.storyNearbyMilestone={label='展示の潜航玩具を見る'}
   end
   if canInspect(s.actors[s.active],place) then f.storyDiveExhibit={message=s.storyNotice} end
  end
 end

 function dive.observe(f,s,layer,node,q,state,mode,profile)
  local draws=layer.draws
  local spec=node.toyDive
  f.platforms=nil
  local guide=spec.shelters[1]
  art(layer,s,C.freminetDiveArt.buoy,guide.x-24,guide.y+26,51,mode,profile)
  label(draws,s,guide.x+8,guide.y-44,'フレミネの合図灯')
  for i=2,#spec.shelters do
   local point=spec.shelters[i]
   art(layer,s,C.freminetDiveArt.buoy,point.x-53,point.y+14,36,mode,profile)
  end
  bubbles(draws,s,291,241)
  local swimmer=s.actors[1]
  bubbles(draws,s,swimmer.x-swimmer.dir*24,swimmer.y-54)
  art(layer,s,C.freminetDiveArt.coral,525,396,91,mode,profile)
  local view={message=s.storyNotice or 'WASD・方向キーで泳ぎ、Gで調べます。',pushed=s.toyDive.pushed}
  f.storyToyDive=view
  if not state then return end

  if state.count<q.goal then
   local flow=spec.flow
   for y=166,flow.bottom-7,39 do
    for i=0,4 do
     local x=flow.left+(i*49-s.t*94+(y%37))%(flow.right-flow.left-22)
     dot(draws,s,x,y,20,3,'#c8f0e782')
     dot(draws,s,x,y-3,6,2,'#bfe5e77c')
     dot(draws,s,x,y+4,6,2,'#bfe5e77c')
    end
   end
   label(draws,s,(flow.left+flow.right)/2,144,'← 強い流れ')
  end
  if view.pushed then view.message='戻る向きの流れです。下の穏やかな側道へ回れます。' end
  if state.count>=2 then
   local tx,ty,settled=toyPosition(s,q,state)
   view.toy={x=tx,y=ty,arrived=settled}
   if state.count<q.goal then art(layer,s,C.freminetDiveArt.toy,tx,ty+29,76,mode,profile) end
   if settled and state.count<q.goal then label(draws,s,tx,ty-66,'帰り着いた玩具') end
  end
  local marker=state.storyChoice and q.toyRoute.markers[state.storyChoice]
  if marker then
   art(layer,s,C.freminetDiveArt.marker,marker.x,marker.y+19,68,mode,profile)
   view.marker=marker.name
   label(draws,s,marker.x,marker.y-63,marker.name)
  end
  if state.status=='complete' then
   local spot=spec.lookout
   label(draws,s,spot.x,spot.y-57,'静かな見晴らし')
   if not s.paused and canInspect(s.actors[s.active],spot) then
    f.storyNearbyMilestone={label='浅瀬を眺める'}
   end
  end
 end

 function C.installToyDiveGuard()
  local original=C.action
  function C.action(s,key)
   if s.toyDive then
    if key=='story_dive_reset' then
     if not s.paused then dive.recover(s) end
     return
    end
    if key~='pause' and key~='story_collect' and key~='story_nearby_portal'
        and not key:match('^story_portal:') then return end
   end
   return original(s,key)
  end
 end

 return dive
end
