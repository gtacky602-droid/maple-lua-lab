return function(C,canInspect)
 local rumor={}
 local display={
  glint={text='光る石',witness='boatkeeper',height=84},
  little={text='月のような石',witness='courier',height=82},
  stolen={text='月から取った石',witness='painter',height=83},
 }

 local function title(q,state)
  if not state.storyChoice then return end
  for _,option in ipairs(q.itinerary[q.goal].choices) do
   if option.id==state.storyChoice then return option.name end
  end
 end

 local function caption(draws,x,y,text,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,color=color,size=14}
 end

 local function art(draws,key,x,y,height,mode,profile)
  C.drawFieldDisplayArt({draws=draws},C.rumorArt[key],x,y,height,mode,profile,false)
 end

 function rumor.read(s,q,state)
  if not state then return false end
  local a=s.actors[s.active]
  if state.status=='complete' and canInspect(a,q.rumorNotice) then
   s.storyNotice='冒険談『'..title(q,state)..'』。月明かりを返したのは、波止場で拾った小さな石。'
   return true
  end
  for index,step in ipairs(q.itinerary) do
   if index>state.count then break end
   if step.rumorBoard and canInspect(a,step) then
    s.storyNotice=step.notice
    return true
   end
  end
  return false
 end

 function rumor.observe(s,f,draws,q,state,mode,profile)
  if not state then return end
  local a=s.actors[s.active]
  local published=state.status=='complete' and title(q,state) or nil
  local message
  local heard={}
  for index,step in ipairs(q.itinerary) do
   if step.rumorBoard and index<=state.count+1 then
    local x=step.x-s.camera
    local read=index<=state.count
    local board=display[step.rumorBoard]
    if read then heard[#heard+1]=board.text end
    if x>=-116 and x<=1076 then
     art(draws,board.witness,x-52,step.y,board.height,mode,profile)
     art(draws,step.rumorBoard,x+24,step.y,88,mode,profile)
     caption(draws,x-52,step.y-103,step.name,'#ffe5ac')
     if read then caption(draws,x+40,step.y-119,board.text,'#c6f9df') end
    end
    if read and not s.paused and canInspect(a,step) then
     f.storyNearbyMilestone={label=step.name..'の話を聞き直す'}
     message=step.notice
    end
   end
  end
  if published then
   local notice=q.rumorNotice
   local x=notice.x-s.camera
   if x>=-120 and x<=1080 then
    art(draws,'little',x,notice.y,112,mode,profile)
    caption(draws,x,notice.y-135,'冒険談『'..published..'』','#ffdf97')
   end
   if not s.paused and canInspect(a,notice) then
    f.storyNearbyMilestone={label='冒険談『'..published..'』を読む'}
    message='ネフェルの掲示 ｜ '..published
   end
  end
  if not message and #heard>0 then message=table.concat(heard,' → ') end
  f.storyRumor={heard=#heard,published=published,message=message}
 end

 return rumor
end
