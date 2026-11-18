return function(C,canInspect)
 local scent={}
 local heights={flower=45,dry=43,wood=35,trial=49,amber=44,pink=45,mint=43,table=100}

 local function visible(s,x,radius)
  local screen=x-s.camera
  return screen+radius>=0 and screen-radius<=960
 end

 local function art(f,s,key,x,y,mode,profile)
  local sprite,height=C.emilieScentArt[key],heights[key]
  if visible(s,x,height*sprite.box[3]/sprite.box[4]/2) then
   C.drawFieldDisplayArt(f,sprite,x-s.camera,y,height,mode,profile,false)
  end
 end

 local function named(f,s,actor,title)
  if visible(s,actor.x,80) then
   f.draws[#f.draws+1]={kind='text',x=actor.x-s.camera,y=actor.y-106,text=title,color='#fff0b9',size=14}
  end
 end

 local function selection(q,state)
  for _,step in ipairs(q.itinerary) do
   if step.kind=='choice' then
    for _,option in ipairs(step.choices) do
     if option.id==state.storyChoice then return option end
    end
   end
  end
 end

 function scent.prop(f,s,item,mode,profile)
  if item.scentProp=='flower' or item.scentProp=='dry' or item.scentProp=='wood' then
   art(f,s,item.scentProp,item.x,item.y,mode,profile)
  end
 end

 function scent.choice(f,s,option,mode,profile)
  art(f,s,option.id,option.x,option.y-8,mode,profile)
 end

 function scent.read(s,q,state)
  if state and state.status=='complete' and s.story.node==q.target
      and canInspect(s.actors[s.active],q.scent.bottle) then
   local bottle=selection(q,state)
   s.storyNotice='記念小瓶「'..bottle.name..'」。'..bottle.scentMemo
   return true
  end
  return false
 end

 function scent.observe(f,s,q,state,mode,profile)
  if not state then return end
  f.storyEmilieScent={message=s.storyNotice}
  if s.story.node~=q.target then return end

  local scene=q.scent
  art(f,s,'table',scene.table.x,scene.table.y,mode,profile)
  if s.companion~='emilie' and visible(s,scene.emilie.x,62) then
   C.drawCompanionArt(f,s,{x=scene.emilie.x,y=scene.emilie.y,dir=1},mode,profile,'emilie')
   named(f,s,scene.emilie,'エミリエ')
  end
  if state.count>=5 then
   local guest=scene.guest
   if visible(s,guest.x,62) then
    C.drawFieldDisplayArt(f,C.colleiGuideArt.guest,guest.x-s.camera,guest.y,90,mode,profile,true)
    named(f,s,guest,'依頼主')
   end
  end
  if state.count==5 or state.count==6 then
   art(f,s,'trial',scene.table.x+42,scene.table.y-48,mode,profile)
  elseif state.storyChoice then
   local gift=scene.bottle
   art(f,s,state.storyChoice,gift.x,gift.y,mode,profile)
   if state.status=='complete' then
    if not s.paused and not f.storyNearbyMilestone and canInspect(s.actors[s.active],gift) then
     f.storyNearbyMilestone={label='記念小瓶を読む'}
    end
    f.storyEmilieScent.bottle=selection(q,state).name
   end
  else
   local step=q.itinerary[state.count+1]
   if step and step.kind=='choice' then
    for _,option in ipairs(step.choices) do
     if canInspect(s.actors[s.active],option) then
      f.storyEmilieScent.message=option.scentMemo
      break
     end
    end
   end
  end
 end

 return scent
end
