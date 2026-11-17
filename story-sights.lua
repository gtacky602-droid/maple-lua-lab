return function(C)
 local sights={}

 local function near(s,place)
  local a=s.actors[s.active]
  return a.hp>0 and math.abs(a.x-place.x)<55 and math.abs(a.y-place.y)<34
 end

 local function visible(s,q,state)
  return state and state.sights and s.story.active and s.story.node==q.target
 end

 local function available(s,q,state)
  return visible(s,q,state) and state.status=='active' and not s.paused
 end

 local function places(spec)
  return {spec.places[1],spec.places[2],spec.places[3],spec.bridge}
 end

 local function atBridge(s,q,state)
  return available(s,q,state) and state.count==q.goal-1 and near(s,q.sights.bridge)
 end

 local function nearby(s,q,state)
  if not available(s,q,state) then return end
  if atBridge(s,q,state) and not s.sightMenu then return q.sights.bridge end
  for _,place in ipairs(q.sights.places) do
   if not state.sights.seen[place.id] and near(s,place) then return place end
  end
 end

 local function feedback(s,message)
  s.sightNotice=message
  s.storyNotice=message
 end

 function sights.inspect(s,q,state)
  local place=nearby(s,q,state)
  if not place then return false end
  if place==q.sights.bridge then
   s.sightMenu=true
   feedback(s,'綾華「高台より、人や船の行き来がよく見えますね。旅人さんは、どの景色を絵図に残したいですか？」')
  else
   state.sights.seen[place.id]=true
   state.count=state.count+1
   feedback(s,place.line)
  end
  return true
 end

 function sights.mark(s,q,state,id)
  if not s.sightMenu or not atBridge(s,q,state) then return end
  for _,place in ipairs(places(q.sights)) do
   if place.id==id then
    state.sights.favorite=id
    state.count=q.goal
    s.sightMenu=nil
    feedback(s,'案内絵図の「'..place.name..'」に印を付けました。離島で綾華に絵図を見せましょう。')
    return
   end
  end
 end

 function sights.report(s,q)
  feedback(s,q.closing..' 同行に選ぶと、綾華の初期刀と入門の花を使えます。')
 end

 local function rect(boxes,x,y,w,h,color)
  boxes[#boxes+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color}
 end

 local function piece(boxes,place,x)
  local y=place.y
  if place.id=='bridge' then
   rect(boxes,x-104,y-34,208,8,'#794953')
   rect(boxes,x-104,y-38,208,4,'#c48e78')
   rect(boxes,x-100,y-12,200,7,'#563d4f')
   for i=-2,2 do
    rect(boxes,x+i*49-3,y-42,6,42,'#743f51')
    rect(boxes,x+i*49-5,y-44,10,5,'#d59c84')
   end
  else
   rect(boxes,x-3,y-33,6,33,'#6b4750')
   rect(boxes,x-17,y-37,34,15,'#554352')
   rect(boxes,x-14,y-34,28,9,({sakura='#e8a4c0',slope='#8db8cc',rooftops='#c7accd'})[place.id])
   rect(boxes,x-9,y-31,18,3,'#6b4750')
  end
 end

 local function label(boxes,x,y,text)
  boxes[#boxes+1]={kind='text',x=x,y=y,text=text,color='#fff1bd',size=14}
 end

 function sights.observe(s,f,boxes,q,state,mode,profile)
  if not state or not state.sights then return end
  local spec=q.sights
  local chosen=state.sights.favorite
  if chosen then
   for _,place in ipairs(places(spec)) do
    if place.id==chosen then f.storySightNote={id=chosen,name=place.name};break end
   end
  end
  if s.sightNotice then f.storySightMessage=s.sightNotice end
  if not visible(s,q,state) then return end
  local item=nearby(s,q,state)
  if item then f.storyNearbySight={label=item==spec.bridge and '橋から港を眺める' or item.name..'を調べる'} end
  if s.sightMenu and atBridge(s,q,state) then f.storySightChoices=places(spec) end
  local active=state.status=='active' and state.count<q.goal
  for _,place in ipairs(places(spec)) do
   local x=place.x-s.camera
   if x>=-108 and x<=1068 then
    piece(boxes,place,x)
    local seen=state.sights.seen[place.id]
    if chosen==place.id or (active and (not seen) and (place~=spec.bridge or state.count==q.goal-1)) then
     label(boxes,x,place.y-(place==spec.bridge and 59 or 52),place.name)
    end
   end
  end
  if active and state.count==q.goal-1 and s.companion~='ayaka' then
   local x=spec.bridge.x-76
   C.drawCompanionArt({draws=boxes},s,{x=x,y=spec.bridge.y,dir=1},mode,profile,'ayaka')
   label(boxes,x-s.camera,spec.bridge.y-96,'綾華')
  end
 end

 return sights
end
