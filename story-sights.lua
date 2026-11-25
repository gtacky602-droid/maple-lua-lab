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

 function sights.drawLandmark(boxes,id,x,y)
  if id=='sakura' then
   rect(boxes,x-5,y-53,10,53,'#6a4955')
   rect(boxes,x-17,y-52,28,7,'#6a4955')
   rect(boxes,x-27,y-62,29,17,'#bd7299')
   rect(boxes,x-11,y-70,34,20,'#dc8eaf')
   rect(boxes,x+10,y-59,24,16,'#cb7da3')
   rect(boxes,x-20,y-60,16,7,'#f4c0cf')
   rect(boxes,x-5,y-67,18,8,'#ffd4d9')
   rect(boxes,x+17,y-56,11,6,'#f4c0cf')
   rect(boxes,x+27,y-29,4,3,'#f4c0cf')
   rect(boxes,x+16,y-4,7,3,'#dc8eaf')
   rect(boxes,x-8,y-5,16,5,'#624452')
   rect(boxes,x-3,y-40,3,32,'#936674')
   rect(boxes,x+4,y-41,7,5,'#6a4955')
   rect(boxes,x+9,y-46,6,6,'#6a4955')
   rect(boxes,x-25,y-51,8,8,'#df90af')
   rect(boxes,x+5,y-57,6,4,'#ffe2df')
   rect(boxes,x-10,y-63,5,3,'#ffe2df')
  elseif id=='slope' then
   rect(boxes,x-42,y-8,85,8,'#688693')
   rect(boxes,x-29,y-12,56,4,'#9ebebe')
   rect(boxes,x-29,y-22,56,6,'#815757')
   rect(boxes,x-23,y-16,44,5,'#543e50')
   rect(boxes,x-3,y-65,4,43,'#664953')
   rect(boxes,x+1,y-60,7,28,'#ecd5ad')
   rect(boxes,x+8,y-53,8,21,'#ecd5ad')
   rect(boxes,x+16,y-44,7,12,'#d6b79c')
   rect(boxes,x-18,y-31,12,9,'#b48963')
   rect(boxes,x-15,y-31,3,9,'#e3bf89')
   rect(boxes,x-36,y-27,9,8,'#815757')
   rect(boxes,x+25,y-25,7,6,'#815757')
   rect(boxes,x-2,y-25,24,3,'#b98969')
   rect(boxes,x+2,y-52,3,18,'#fff0cc')
   rect(boxes,x-11,y-63,10,4,'#c77d73')
   rect(boxes,x+15,y-6,15,2,'#b7d9d4')
  elseif id=='rooftops' then
   rect(boxes,x-22,y-23,44,23,'#ae8172')
   rect(boxes,x-14,y-17,14,17,'#6e5359')
   rect(boxes,x+7,y-17,9,9,'#f0c99c')
   rect(boxes,x-37,y-32,74,9,'#574f6d')
   rect(boxes,x-29,y-39,58,8,'#827b96')
   rect(boxes,x-19,y-46,38,8,'#988fa7')
   rect(boxes,x-16,y-49,32,4,'#b6a6ba')
   rect(boxes,x-39,y-36,9,5,'#776f8b')
   rect(boxes,x+30,y-36,9,5,'#776f8b')
   rect(boxes,x-29,y-30,58,3,'#a19ab2')
   rect(boxes,x-12,y-38,3,5,'#b6a6ba')
   rect(boxes,x+10,y-38,3,5,'#b6a6ba')
   rect(boxes,x+10,y-17,2,9,'#86676b')
   rect(boxes,x+7,y-13,9,2,'#86676b')
   rect(boxes,x-14,y-18,14,3,'#805f61')
  elseif id=='bridge' then
   rect(boxes,x-104,y-34,208,8,'#794953')
   rect(boxes,x-104,y-38,208,4,'#c48e78')
   rect(boxes,x-100,y-12,200,7,'#563d4f')
   rect(boxes,x-104,y-30,208,2,'#925e63')
   rect(boxes,x-100,y-13,200,2,'#b78072')
   for i=-2,2 do
    rect(boxes,x+i*49-3,y-42,6,42,'#743f51')
    rect(boxes,x+i*49-5,y-44,10,5,'#d59c84')
   end
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
    if place.id==chosen then f.storySightNote={id=chosen,name=place.name,quest=q.id,node=q.target};break end
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
    sights.drawLandmark(boxes,place.id,x,place.y)
    local seen=state.sights.seen[place.id]
    if chosen==place.id or (active and (not seen) and (place~=spec.bridge or state.count==q.goal-1)) then
     label(boxes,x,place.y-(place==spec.bridge and 59 or 82),place.name)
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
