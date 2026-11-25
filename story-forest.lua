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

 -- Each motif is stored once. All placements use the ground as their baseline.
 F.motifs={
  lamp={
   {-11,-5,22,5,'#554b60'},{-5,-31,10,28,'#706779'},{-13,-33,26,5,'#554b60'},
   {-10,-47,20,15,'#d49c63'},{-7,-44,14,9,'#ffe3a4'},{-1,-45,2,11,'#98705b'},
   {-16,-50,32,5,'#565269'},{-11,-54,22,4,'#827b8a'},{-3,-58,6,4,'#908795'}
  },
  nuts={
   {-35,-13,26,12,'#626174'},{-31,-21,18,10,'#868394'},{-27,-24,12,4,'#9a95a0'},
   {-31,-21,11,3,'#879678'},{-20,-5,39,4,'#78564b'},{-15,-11,11,9,'#b98050'},{-18,-13,14,4,'#724c47'},
   {-11,-10,4,5,'#e5ac71'},{1,-13,10,11,'#c99559'},{0,-15,12,4,'#7a5047'},
   {6,-18,3,4,'#7a5047'},{13,-6,8,4,'#d9ae79'}
  },
  paw={
   {0,-5,7,5,'#cfb08b'},{-2,-8,3,3,'#efd1a4'},{2,-10,3,4,'#efd1a4'},{6,-9,3,3,'#efd1a4'}
  },
  base={{-20,-5,40,5,'#454253'},{-16,-8,32,4,'#797484'}},
  statue={
   {-10,-12,20,4,'#666779'},{-12,-30,24,18,'#8d909e'},{-9,-43,18,15,'#a4a7ad'},
   {-11,-49,6,10,'#9597a4'},{5,-49,6,10,'#9597a4'},{-5,-37,3,2,'#595d70'},
   {4,-37,3,2,'#595d70'},{-4,-32,9,5,'#c1c0bf'},{-7,-27,14,4,'#ae777c'},
   {5,-26,4,9,'#ae777c'},{-9,-19,4,7,'#b3b3b6'},{13,-22,5,9,'#878896'}
  },
  pool={
   {-36,-9,72,7,'#447482'},{-28,-16,54,14,'#518997'},{-19,-19,36,4,'#6ba1a9'},
   {-32,-9,13,2,'#9ac6c4'},{15,-12,12,2,'#9ac6c4'},{-13,-4,27,2,'#91bdba'},
   {-33,-17,2,7,'#789170'},{-36,-20,2,6,'#9fa982'}
  },
  reflection={
   {-10,-13,20,7,'#40475c'},{-9,-7,5,4,'#40475c'},{4,-7,5,4,'#40475c'},
   {7,-16,10,4,'#495268'},{14,-18,6,3,'#495268'},{-5,-14,6,2,'#bdd48a'},
   {-14,-10,9,1,'#89b9be'},{4,-7,10,1,'#89b9be'}
  }
 }
 function F.revealX(room) return slots[room.answer] end
 F.beats=60
 function F.beat(t) return math.floor((t*3.4/(2*math.pi)%1)*F.beats) end
 function F.offset(beat) return -math.floor(6*(1+math.sin(2*math.pi*beat/F.beats))+.5) end

 local arrangements={}
 function F.arrangement(room,ready,solved)
  local key=room.node..(not ready and ':entry' or solved and ':solved' or ':search')
  if arrangements[key] then return arrangements[key] end
  local props={{'lamp',315,480}}
  local function place(id,x,y,moves) props[#props+1]={id,x,y,moves} end
  if ready then
   place('lamp',1040,480)
   for i,x in ipairs(slots) do
    local marked=not solved and i==room.answer
    if room.kind=='prints' then
     place('nuts',x,480)
     if marked then
      for j=0,2 do place('paw',x+23+j*13,476-(j%2)*5) end
     end
    elseif room.kind=='statue' then
     place('base',x,480)
     place('statue',x,480,marked or nil)
    else
     place('pool',x,480)
     if marked then place('reflection',x,480) end
    end
   end
  end
  arrangements[key]=props
  return props
 end

 function F.observe(s,f,boxes,q,state,mode,profile)
  local room,index=roomAt(s,q)
  local c=s.camera
  if room then
   local ready=index>1 or state.forest.looped
   local solved=state.count>=index
   local beat=F.beat(s.t)
   for _,p in ipairs(F.arrangement(room,ready,solved)) do
    local x,y=p[2]-c,p[3]+(p[4] and F.offset(beat) or 0)
    if x>=-48 and x<=1008 then
     for _,r in ipairs(F.motifs[p[1]]) do rect(boxes,x+r[1],y+r[2],r[3],r[4],r[5]) end
    end
   end
   if ready then
    if solved then
     local x=F.revealX(room)-c
     rect(boxes,x-9,442,18,6,'#9bc76f')
     C.drawDanukiArt({draws=boxes},x+78,480,mode,profile)
    else
     boxes[#boxes+1]={kind='text',x=hint.x-c,y=439,text='綾華のヒント',size=14,color='#ffe7a2'}
    end
   end
   f.storyForest={room=room.kind,looped=state.forest.looped,solved=solved,beat=room.kind=='statue' and beat or nil,
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
