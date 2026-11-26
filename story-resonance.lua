return function(canInspect)
 local resonance={}

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function text(draws,x,y,label,color,size)
  draws[#draws+1]={kind='text',x=x,y=y,text=label,color=color,size=size}
 end

 local function nearStone(s,config)
  for i,stone in ipairs(config.stones) do
   if canInspect(s.actors[s.active],stone) then return i end
  end
 end

 function resonance.record(s,item,emitCue)
  local stone=item.resonanceStone
  if stone.notes then
   emitCue(s,'resonance',stone.notes,stone.pattern)
  else
   s.storyCue=nil
  end
 end

 function resonance.light(s,config,emitCue)
  local index=nearStone(s,config)
  if not index then return false,false end
  local stone=config.stones[index]
  emitCue(s,'resonance',stone.notes,stone.pattern)
  local progress=s.resonanceOrder or 0
  if index~=config.order[progress+1] then
   s.resonanceOrder=0
   s.storyNotice='石の灯りが消えました。壁の印を左から読み、最初の石からやり直せます。'
   return true,false
  end
  s.resonanceOrder=progress+1
  if s.resonanceOrder==#config.order then return true,true end
  s.storyNotice=stone.pattern..'の石が灯りました。次の印を探してください。'
  return true,false
 end

 function resonance.turnPage(s,item,emitCue)
  local index=(s.resonancePage or 0)%#item.resonancePages+1
  local page=item.resonancePages[index]
  s.resonancePage=index
  s.storyNotice=nil
  emitCue(s,'resonance',page.notes,page.pattern)
 end

 function resonance.book(s,f,item)
  local index=s.resonancePage or 0
  local page=item.resonancePages[index]
  f.storyNearbyMilestone={label=index==0 and item.readLabel or '音の絵本の次のページをめくる'}
  f.storyResonance={page=index,total=#item.resonancePages,title=page and page.title or '音の絵本',
                   pattern=page and page.pattern,line=page and page.line}
 end

 function resonance.observe(s,f,draws,config,state,activeItem)
  local ordered=config.order~=nil
  local count=state and state.count or 0
  local lit={}
  if ordered then
   local progress=count>=config.completeAt and #config.order or (s.resonanceOrder or 0)
   for i=1,progress do lit[config.order[i]]=true end
  end
  for i,stone in ipairs(config.stones) do
   local x,y=stone.x-s.camera,stone.y
   if x>=-53 and x<=1013 then
    local reversed=not ordered and i==config.reversed and count<config.completeAt
    local ready=ordered and lit[i] or not ordered and count>=i and not reversed
    rect(draws,x-24,y-6,48,6,'#5c665d')
    rect(draws,x-17,y-46,34,40,'#416572')
    rect(draws,x-13,y-51,26,7,'#86aaa6')
    rect(draws,x-12,y-42,24,28,ready and '#377b78' or '#263e52')
    rect(draws,reversed and x+9 or x-11,y-42,3,24,reversed and '#d4a689' or '#9cd8c1')
    text(draws,x,y-24,stone.pattern,ready and '#e1ffe6' or '#cfdad3',23)
    if reversed then text(draws,x,y-62,'裏向き','#ffe0b0',13) end
   end
  end
  if not ordered then
   if activeItem and activeItem.resonanceStone and not s.paused
       and canInspect(s.actors[s.active],activeItem) then
    local stone=activeItem.resonanceStone
    f.storyResonance={pattern=stone.pattern,line=stone.line}
   end
   return
  end
  local clues={}
  for i,index in ipairs(config.order) do clues[i]=config.stones[index].pattern end
  local panel=config.panel
  local x,y=panel.x-s.camera,panel.y
  if x>=-108 and x<=1068 then
   rect(draws,x-78,y-76,156,65,'#476065')
   rect(draws,x-72,y-71,144,6,'#8aaea2')
   text(draws,x,y-39,table.concat(clues,' → '),'#fff1ca',23)
  end
  if not activeItem or not activeItem.resonanceOrder then return end
  local litCount=s.resonanceOrder or 0
  f.storyResonanceRoute={quest=config.quest,lit=litCount,nextPattern=clues[litCount+1]}
  if s.paused or s.lift then return end
  local i=nearStone(s,config)
  if i or canInspect(s.actors[s.active],panel) then
   local progress=s.resonanceOrder or 0
   f.storyResonance={order=clues,progress=progress,total=#clues,pattern=i and config.stones[i].pattern}
   if i then f.storyNearbyMilestone={label=config.stones[i].pattern..'の石を照らす'} end
  end
 end

 return resonance
end
