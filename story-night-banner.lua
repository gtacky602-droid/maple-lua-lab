return function(C,canInspect)
 local banner={}

 local function draw(s,draws,key,x,y,height,mode,profile)
  local art=C.nightBannerArt[key]
  local half=height*art.box[3]/art.box[4]/2
  x=x-s.camera
  if x+half>=0 and x-half<=960 then
   C.drawFieldDisplayArt({draws=draws},art,x,y,height,mode,profile,false)
  end
 end

 local function label(s,draws,x,y,caption)
  x=x-s.camera
  local w=14*utf8.len(caption)+16
  if x>=w/2 and x<=960-w/2 then
   draws[#draws+1]={kind='rect',x=x-w/2,y=y-17,w=w,h=22,color='#191c35ed'}
   draws[#draws+1]={kind='text',x=x,y=y,text=caption,size=14,color='#faf0d2'}
  end
 end

 local function wind(s,draws,x,y)
  x=x-s.camera
  if x<-80 or x>1040 then return end
  for i=0,4 do
   local flow=(s.t*39+i*18)%106
   local width=12+i*3
   draws[#draws+1]={kind='rect',x=x-54+flow,y=y-20-i*6,w=width,h=2,color='#a6d9d9bb'}
  end
 end

 function banner.observe(s,f,draws,node,q,state,mode,profile)
  if not state or state.count==0 then return end
  local step=q.itinerary[state.count+1]
  local pickup,post=q.itinerary[q.goal-1],q.itinerary[q.goal]
  if state.count>=q.goal then
   draw(s,draws,'repaired',post.x,post.y,106,mode,profile)
   label(s,draws,post.x,post.y-142,'修繕した幟')
   if state.status=='complete' and not s.paused and not f.storyNearbyMilestone and canInspect(s.actors[s.active],post) then
    f.storyNearbyMilestone={label='フィッシュルとオズの調査記録を読む'}
   end
  elseif state.count==q.goal-1 then
   wind(s,draws,post.x,post.y)
   label(s,draws,post.x,post.y-101,post.name)
  elseif state.count>=node.spawnAt then
   draw(s,draws,'torn',pickup.x,pickup.y,65,mode,profile)
   label(s,draws,pickup.x,pickup.y-93,step==pickup and pickup.name or '風スライムが絡んでいた幟')
  elseif step.nightClue=='shadow' then
   local x=step.x+math.sin(s.t*1.4)*20
   local y=step.y-86+math.sin(s.t*2)*7
   draw(s,draws,'shadow',x,y,83,mode,profile)
   label(s,draws,step.x,step.y-179,step.name)
  elseif step.nightClue=='wind' then
   wind(s,draws,step.x,step.y)
   label(s,draws,step.x,step.y-104,step.name)
  elseif step.nightClue=='cloth' then
   draw(s,draws,'torn',step.x,step.y,30,mode,profile)
   label(s,draws,step.x,step.y-94,step.name)
  end
 end

 function banner.read(s,node,q,state)
  if state and state.status=='complete' and canInspect(s.actors[s.active],q.itinerary[q.goal]) then
   s.storyNotice=node.nightBanner.note
   return true
  end
 end

 return banner
end
