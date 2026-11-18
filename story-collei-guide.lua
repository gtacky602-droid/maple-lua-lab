return function(C,canInspect)
 local guide={}
 local heights={root=72,stones=43,shelter=112,bench=51,barrier=43,letter=36,guest=85}

 function guide.rest(s,q)
  local actor=s.actors[s.active]
  local hp=actor.hp
  C.healActor(s,actor,q.guideRestHp)
  local gained=math.floor(actor.hp-hp)
  return gained>0 and '休憩してHPが'..gained..'回復しました。' or '屋根の下でひと休みしました。'
 end

 local function restAt(s,q,state)
  if not state then return end
  for index=1,state.count do
   local step=q.itinerary[index]
   if step.kind=='guideChoice' and step.node==s.story.node then
    for _,option in ipairs(step.choices) do
     if option.restStop and canInspect(s.actors[s.active],option) then return option end
    end
   end
  end
 end

 function guide.revisit(s,q,state)
  if not restAt(s,q,state) then return false end
  s.storyNotice=guide.rest(s,q)
  return true
 end

 local function letterAt(s,q,state)
  if not state or state.status~='complete' then return end
  local spec=q.guideLetter
  if s.story.node==spec.sender.node and not state.colleiLetter then return spec.sender,'pickup' end
  if s.story.node==spec.recipient.node and state.colleiLetter then return spec.recipient,'delivery' end
 end

 function guide.letter(s,q,state)
  local place,action=letterAt(s,q,state)
  if not place or not canInspect(s.actors[s.active],place) then return false end
  if action=='pickup' then
   state.colleiLetter='held'
   s.storyNotice=q.guideLetter.pickup
  elseif state.colleiLetter=='delivered' then
   s.storyNotice=q.guideLetter.reply
  else
   state.colleiLetter='delivered'
   s.storyNotice=q.guideLetter.delivery
  end
  s.colleiLetterNotice=s.storyNotice
  return true
 end

 local function art(f,s,key,x,y,mode,profile,flip)
  local h=heights[key]
  local sprite=C.colleiGuideArt[key]
  local w=h*sprite.box[3]/sprite.box[4]
  x=x-s.camera
  if x+w/2>=0 and x-w/2<=960 then C.drawFieldDisplayArt(f,sprite,x,y,h,mode,profile,flip) end
 end

 local function label(f,s,x,y,title,muted)
  local w=utf8.len(title)*14+16
  x=x-s.camera
  if x-w/2>=0 and x+w/2<=960 then
   f.draws[#f.draws+1]={kind='rect',x=x-w/2,y=y-17,w=w,h=22,color='#253f3bee'}
   f.draws[#f.draws+1]={kind='text',x=x,y=y,text=title,size=14,color=muted and '#ccd9b9' or '#fff0cb'}
  end
 end

 function guide.observeLetter(f,s,q,state,mode,profile)
  if s.colleiLetterNotice and s.storyNotice==s.colleiLetterNotice then
   f.storyColleiGuide={message=s.colleiLetterNotice}
  end
  local place,action=letterAt(s,q,state)
  if not place then return end
  local delivered=state.colleiLetter=='delivered'
  if not delivered then art(f,s,'letter',place.x,place.y-12,mode,profile) end
  local name=action=='pickup' and 'コレイからの手紙' or 'アンバーへの手紙'
  label(f,s,place.x,place.y-100,name,false)
  if not s.paused and canInspect(s.actors[s.active],place) and not f.storyNearbyMilestone then
   f.storyNearbyMilestone={label=action=='pickup' and 'アンバーへの手紙を預かる'
      or delivered and 'アンバーの返事を聞き返す' or 'アンバーに手紙を渡す'}
  end
 end

 function guide.observe(f,s,scene,q,state,mode,profile)
  if not state then return end
  local raining=scene.rain==true and state.status~='complete'
  local index=state.count+1
  local current=q.itinerary[index]
  local message=current and current.node==s.story.node and current.objective
  for i,step in ipairs(q.itinerary) do
   if step.kind=='guideChoice' and step.node==s.story.node then
    for _,option in ipairs(step.choices) do
     if not option.rainOnly or raining then
      art(f,s,option.art,option.x,option.y,mode,profile)
      if i<=index then
       label(f,s,option.x,option.y-math.max(108,heights[option.art]+21),option.name,i~=index)
      end
     end
    end
   end
  end
  local guestX
  if scene.guest then
   local guest=scene.guest
   local elapsed=s.colleiWelcomeAt and s.t-s.colleiWelcomeAt
   local travel=elapsed and math.min(1,elapsed/guest.seconds) or state.count==q.goal and 1 or 0
   local bob=travel>0 and travel<1 and math.abs(math.sin(elapsed*13))*3 or 0
   guestX=guest.x+(guest.stopX-guest.x)*travel
   art(f,s,'guest',guestX,guest.y-bob,mode,profile,travel>0)
   label(f,s,guestX+26,guest.y-117,'初めて来た旅人',false)
  end
  local atRest=restAt(s,q,state)~=nil
  if not s.paused and atRest and not f.storyNearbyMilestone then
   f.storyNearbyMilestone={label='屋根の下でひと休みする'}
  end
  if raining and not message then message='川沿いは増水中。根の下の迂回路を通れます。'
  elseif scene.rain and not raining then message='雨が上がり、川沿いの近道が通れます。' end
  f.storyColleiGuide={rain=raining,rest=atRest,guestX=guestX,message=s.storyNotice or message}
 end

 return guide
end
