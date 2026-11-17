return function(C)
 local F={}
 local slots={485,855}
 local hint={id='hint',x=245,y=480}

 function F.canLoop(state)
  return state and state.status=='active' and state.count==0 and state.forest and not state.forest.looped
 end

 local function roomAt(s,q)
  for index,room in ipairs(q.forest.rooms) do
   if room.node==s.story.node then return room,index end
  end
 end

 local function closeTo(s,x,y)
  local a=s.actors[s.active]
  return a.hp>0 and math.abs(a.x-x)<55 and math.abs(a.y-y)<34
 end

 function F.nearby(s,q,state)
  if state.status~='active' then return end
  local room,index=roomAt(s,q)
  if room and state.forest.looped and state.count==index-1 then
   if closeTo(s,hint.x,hint.y) then return hint end
   for choice,x in ipairs(slots) do
    if closeTo(s,x,480) then return {choice=choice,room=room,x=x} end
   end
  elseif s.story.node==q.target and state.count==4 then
   local guest=q.forest.guest
   if closeTo(s,guest.x,guest.y) then return guest end
  end
 end

 function F.inspect(s,q,state,item)
  if item==hint then
   local room=roomAt(s,q)
   s.storyNotice='綾華「'..room.hint..'」'
  elseif item==q.forest.guest then
   state.count=q.goal
   s.storyNotice='化け狸が大灯籠と勝負の絵を見せて、海へ抜ける門を開けてくれました。'
  elseif item.choice~=item.room.answer then
   s.storyNotice='葉の印はありません。もう一方と見比べられます。'
  else
   state.count=state.count+1
   s.storyNotice='化け狸と葉の印を見つけました。右の鳥居から進めます。'
  end
  s.forestFeedback=s.storyNotice
 end

 function F.defeat(s,q,state,e)
  if state.status~='active' or state.count~=3 then return end
  for _,id in ipairs(q.forest.guards) do
   if id==e.spawnId then state.forest.defeated[id]=true;e.respawn=math.huge;break end
  end
  for _,id in ipairs(q.forest.guards) do if not state.forest.defeated[id] then return end end
  state.count=4
  s.storyNotice='綾華が退路を見ている間に魔物を退けました。奥で化け狸が待っています。'
 end

 local function rect(boxes,x,y,w,h,color)
  boxes[#boxes+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function lamp(boxes,x)
  rect(boxes,x-10,443,20,37,'#565269')
  rect(boxes,x-15,430,30,7,'#565269')
  rect(boxes,x-10,436,20,13,'#f0c481')
  rect(boxes,x-6,438,12,9,'#ffe3a4')
 end

 local function clue(boxes,x,kind,marked,t)
  if kind=='prints' then
   rect(boxes,x-18,473,36,6,'#975e49')
   rect(boxes,x-10,468,7,6,'#d49f61')
   rect(boxes,x+2,467,7,6,'#c88d55')
   if marked then
    for i=0,2 do
     rect(boxes,x+24+i*12,472-i%2*4,6,5,'#d2bd9b')
     rect(boxes,x+27+i*12,469-i%2*4,3,3,'#d2bd9b')
    end
   end
  elseif kind=='statue' then
   local lift=marked and (1+math.sin(t*3.4))*6 or 0
   rect(boxes,x-17,476,34,4,'#302c41')
   rect(boxes,x-14,453-lift,28,22,'#858a9a')
   rect(boxes,x-10,441-lift,20,15,'#a7a9ad')
   rect(boxes,x-12,439-lift,7,7,'#9095a7')
   rect(boxes,x+5,439-lift,7,7,'#9095a7')
  else
   rect(boxes,x-29,464,58,16,'#477c8e')
   rect(boxes,x-23,468,46,2,'#879da9')
   rect(boxes,x-21,476,37,2,'#9cc9cc')
   if marked then
    rect(boxes,x-10,469,20,9,'#33364b')
    rect(boxes,x-10,467,5,5,'#33364b')
    rect(boxes,x+5,467,5,5,'#33364b')
    rect(boxes,x-2,465,8,4,'#bbdd85')
   end
  end
 end

 function F.observe(s,f,boxes,q,state,mode,profile)
  local room,index=roomAt(s,q)
  local c=s.camera
  if room then
   lamp(boxes,315-c)
   if state.forest.looped or index>1 then lamp(boxes,1040-c) end
   local ready=index>1 or state.forest.looped
   local solved=state.count>=index
   if ready then
    for i,x in ipairs(slots) do clue(boxes,x-c,room.kind,not solved and i==room.answer,s.t) end
    if solved then
     local x=slots[room.answer]-c
     rect(boxes,x-9,442,18,6,'#9bc76f')
     C.drawDanukiArt({draws=boxes},x+78,480,mode,profile)
    else
     boxes[#boxes+1]={kind='text',x=hint.x-c,y=439,text='綾華のヒント',size=14,color='#ffe7a2'}
    end
   end
   f.storyForest={room=room.kind,looped=state.forest.looped,solved=solved,
    message=s.forestFeedback or (not ready and '右の鳥居へ進む' or solved and '葉の印を見つけた。右の鳥居から進める。'
     or '同じ広場に見える。左右の目印を見比べよう。')}
  elseif s.story.node==q.target then
   if state.count==3 and s.companion~='ayaka' then
    C.drawCompanionArt({draws=boxes},s,{x=225,y=480,dir=1},mode,profile,'ayaka')
   elseif state.count>=4 then
    local guest=q.forest.guest
    C.drawDanukiArt({draws=boxes},guest.x-c,guest.y,mode,profile)
   end
  end
  local item=not s.paused and F.nearby(s,q,state)
  if item then
   local label
   if item==hint then label='綾華にヒントを聞く'
   elseif item==q.forest.guest then label='化け狸と話す'
   else label=(item.choice==1 and '左の' or '右の')..item.room.name..'を調べる' end
   f.storyNearbyForest={label=label}
  end
  if state.count==q.goal then f.storyLanternNote={smile=true,challenge=true} end
 end

 return F
end
