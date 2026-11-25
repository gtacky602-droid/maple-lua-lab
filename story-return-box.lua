return function(C,canInspect)
 local delivery={}

 function delivery.step(s,spec,dt)
  local box=s.returnBox or {x=spec.start,hop=0}
  s.returnBox=box
  local player=s.actors[s.active]
  if math.abs(player.x-box.x)>spec.leash then return false end
  box.x=math.min(box.x+spec.speed*dt,spec.finish)
  box.hop=(box.hop+dt*spec.hops)%1
  return box.x>=spec.finish
 end

 local function draw(s,layer,key,x,y,height,mode,profile)
  x=x-s.camera
  if x>=-85 and x<=1045 then
   C.drawFieldDisplayArt(layer,C.returnBoxArt[key],x,y,height,mode,profile,false)
  end
 end

 local function label(s,draws,x,y,caption)
  x=x-s.camera
  local width=14*utf8.len(caption)+14
  if x>=width/2 and x<=960-width/2 then
   draws[#draws+1]={kind='rect',x=x-width/2,y=y-17,w=width,h=22,color='#263635e8'}
   draws[#draws+1]={kind='text',x=x,y=y,text=caption,size=14,color='#fff0b9'}
  end
 end

 function delivery.observe(s,f,layer,spec,q,state,mode,profile)
  local draws=layer.draws
  if not state or state.count==q.goal then return end
  local nextStep=q.itinerary[state.count+1]
  local clue=nextStep.returnClue
  if clue then
   draw(s,layer,clue.art,nextStep.x,nextStep.y,clue.height,mode,profile)
   label(s,draws,nextStep.x,nextStep.y-clue.height-12,nextStep.name)
  end
  if state.count<spec.chaseAt then return end
  local chasing=state.count==spec.chaseAt
  local box=s.returnBox
  local x=chasing and (box and box.x or spec.start) or spec.finish
  local hop=chasing and box and math.sin(box.hop*math.pi) or 0
  local y=spec.y-hop*spec.lift
  if chasing then
   C.drawFieldDisplayArt(layer,C.returnBoxCarrier,x-s.camera,y+9,29,mode,profile,false)
   f.storyReturnBox={x=x,y=y,chasing=true,message='返却箱を追いかける  ›   離れると箱が止まります'}
  else
   f.storyReturnBox={x=x,y=y,chasing=false,message=nextStep.objective}
  end
  local base=chasing and y-13 or y
  draw(s,layer,'crate',x,base,51,mode,profile)
  label(s,draws,x,base-66,chasing and '動く返却箱  ›' or '返却箱')
 end

 function delivery.read(s,spec,state)
  if state and state.status=='complete' and canInspect(s.actors[s.active],spec) then
   s.storyNotice=spec.note
   return true
  end
 end

 function delivery.archive(s,f,layer,spec,state,mode,profile)
  local draws=layer.draws
  if not state or state.status~='complete' then return end
  draw(s,layer,'crate',spec.x,spec.y,51,mode,profile)
  label(s,draws,spec.x,spec.y-66,'魔物観察記録')
  if not s.paused and not f.storyNearbyMilestone and canInspect(s.actors[s.active],spec) then
   f.storyNearbyMilestone={label='魔物観察記録を読む'}
  end
 end

 return delivery
end
