return function(C,canInspect)
 local photo={}

 local function byId(options,id)
  for _,option in ipairs(options) do
   if option.id==id then return option end
  end
 end

 local function current(s,q,state)
  local step=state and state.status=='active' and q.itinerary[state.count+1]
  if step and step.node==s.story.node and canInspect(s.actors[s.active],step) then return step end
 end

 local function pieces(spec,record)
  return byId(spec.seats,record.seat),byId(spec.risers,record.riser)
 end

 local function clear(spec,seat,riser)
  local head1,head2=spec.crew[1].head,spec.crew[2].head
  return math.abs(seat.x-riser.x)>=spec.faceGap.x or math.abs(riser.rise+head2-head1)>=spec.faceGap.y
 end

 function photo.open(s,q,state,panel)
  if panel=='layout' and not state.groupPhoto then
   state.groupPhoto={seat=q.groupPhoto.seats[1].id,riser=q.groupPhoto.risers[1].id}
  end
  s.photoPanel=panel
 end

 function photo.action(s,q,state,command,id)
  if command=='close' then s.photoPanel=nil;return end
  if not s.photoPanel or s.paused then return end
  local step=current(s,q,state)
  if not step or s.photoPanel~=step.photoPanel then return end
  local spec,record=q.groupPhoto,state.groupPhoto
  if step.photoPanel=='layout' then
   if command=='seat' and byId(spec.seats,id) then record.seat=id
   elseif command=='riser' and byId(spec.risers,id) then record.riser=id
   elseif command=='confirm' and clear(spec,pieces(spec,record)) then s.photoPanel=nil;return step end
  elseif command=='publish' and byId(spec.prints,id) then
   record.posted=id;s.photoPanel=nil
   return step
  end
 end

 function photo.start(s,q)
  if s.photoTimer then return end
  if s.active~=1 then
   s.storyNotice='旅人に操作を交代してから、タイマーを巻きましょう。'
   return
  end
  s.photoTimer=s.t+q.groupPhoto.delay
  s.storyNotice='タイマーが動き出しました。旅人も右の目印まで戻りましょう。'
 end

 function photo.step(s,q,state)
  if not s.photoTimer or s.t+1e-8<s.photoTimer then return end
  s.photoTimer=nil
  local spec=q.groupPhoto
  local milestone=state and state.status=='active' and q.itinerary[state.count+1]
  if milestone and milestone.photoTimer then
   if canInspect(s.actors[1],spec.mark) then return milestone end
   s.storyNotice='シャッターまでに旅人が間に合いませんでした。構図はそのまま。カメラに戻ってもう一度撮れます。'
  end
 end

 function photo.read(s,q,state)
  if state and state.groupPhoto and state.count==q.goal and canInspect(s.actors[s.active],q.groupPhoto.board) then
   s.photoPanel='read'
   return true
  end
  return false
 end

 local function card(key,x,y,height,flip)
  local sprite=key=='traveler' and C.travelerIdleArt[flip and 'left' or 'right'] or C.naviaPhotoArt[key]
  return {sprite=sprite,source=sprite.source,box=sprite.box,x=x,y=y,h=height,flip=flip and key~='traveler'}
 end

 local function prop(draws,s,item,mode,profile)
  local half=item.h*item.box[3]/item.box[4]/2
  local x=item.x-s.camera
  if x+half>=0 and x-half<=960 then
   C.drawFieldDisplayArt({draws=draws},item.sprite,x,item.y,item.h,mode,profile,item.flip)
  end
 end

 local function scene(spec,record,candid,hero)
  local seat,riser=pieces(spec,record)
  local faces={}
  local function person(i,x,y,flip)
   local worker=spec.crew[i]
   faces[#faces+1]=card(candid and worker.key..'Smile' or worker.key,x,y,worker.height,flip)
  end
  local props={card('chair',seat.x-26,480,58,false)}
  if candid then
   props[#props+1]=card('snack',spec.snack.x,480,58,false)
   person(1,math.min(seat.x+44,riser.x-40),480,false)
   person(2,riser.x+22,480,true)
   person(3,1513,480,true)
  else
   props[#props+1]=card('crate',riser.x,480,riser.rise+5,false)
   person(2,riser.x,480-riser.rise,false)
   person(3,1553,480,true)
   person(1,seat.x,480,false)
  end
  if hero then
   faces[#faces+1]=card('traveler',spec.mark.x,480,88,candid)
  end
  for _,item in ipairs(faces) do props[#props+1]=item end
  return props
 end

 local function shot(spec,record,id)
  local items=scene(spec,record,id=='candid',true)
  local out={}
  for _,item in ipairs(items) do
   out[#out+1]={source=item.source,box=item.box,x=item.x,y=item.y,h=item.h,flip=item.flip}
  end
  return out
 end

 local function label(draws,s,x,y,text)
  x=x-s.camera
  if x>=-70 and x<=1030 then draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color='#fff0b9'} end
 end

 function photo.observe(f,s,draws,q,state,mode,profile)
  if not state then return end
  local spec,record=q.groupPhoto,state.groupPhoto
  local function art(key,place,h)
   prop(draws,s,card(key,place.x,place.y,h,false),mode,profile)
  end
  for i,worker in ipairs(spec.crew) do
   local finished=(i==1 and 3 or i==2 and 4 or 5)
   if state.count<finished then
    art(worker.key,worker,worker.height)
    label(draws,s,worker.x,worker.y-worker.height-13,worker.name)
   end
  end
  if state.count<2 then art('crate',spec.crate,39)
  elseif state.count==2 then
   local actor=s.actors[s.active]
   art('crate',{x=actor.x+actor.dir*12,y=actor.y-29},34)
  else art('crate',spec.rack,39) end
  art('tickets',spec.tickets,35)
  art('camera',spec.camera,93)
  if state.count>=spec.shootAt then art('board',spec.board,105) end
  if record and state.count>=spec.layoutAt then
   for _,item in ipairs(scene(spec,record,state.status=='complete' and record.posted=='candid',false)) do
    prop(draws,s,item,mode,profile)
   end
   if state.count==spec.layoutAt then
    local x=spec.mark.x-s.camera
    if x>=-25 and x<=985 then
     draws[#draws+1]={kind='rect',x=x-21,y=spec.mark.y-5,w=42,h=4,color='#fff0b9'}
     label(draws,s,spec.mark.x,spec.mark.y-106,'旅人の立ち位置')
    end
   end
  end

  f.storyNaviaPhoto={message=s.storyNotice}
  local view=f.storyNaviaPhoto
  view.paused=s.paused
  if s.photoTimer then
   view.remaining=math.max(0,s.photoTimer-s.t)
   view.message='タイマー '..math.ceil(view.remaining)..' 秒 ｜ 旅人も右の白い目印へ'
   label(draws,s,spec.camera.x,spec.camera.y-105,tostring(math.ceil(view.remaining)))
  end
  if record and state.count==q.goal then
   view.posted=record.posted
   label(draws,s,spec.board.x,spec.board.y-113,state.status=='complete' and '集合写真' or '報告前の写真')
   if not f.storyNearbyMilestone and not s.paused and canInspect(s.actors[s.active],spec.board) then
    f.storyNearbyMilestone={label='掲示した集合写真を見る'}
   end
  end
  if not s.photoPanel or not record then return end
  if s.photoPanel=='layout' then
   local seat,riser=pieces(spec,record)
   view.ready=clear(spec,seat,riser)
   view.panel=s.photoPanel
   view.seats,view.risers=spec.seats,spec.risers
   view.seat,view.riser=record.seat,record.riser
   view.preview={formal=shot(spec,record,'formal')}
  else
   view.panel=s.photoPanel
   view.prints=spec.prints
   view.preview={}
   for _,entry in ipairs(spec.prints) do
    if view.panel=='choose' or record.posted==entry.id then
     view.preview[entry.id]=shot(spec,record,entry.id)
    end
   end
  end
 end

 return photo
end
