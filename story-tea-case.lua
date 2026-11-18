return function(C,canInspect)
 local tea={}

 local function board(s,q,state)
  local step=state and state.status=='active' and q.itinerary[state.count+1]
  return step and step.kind=='teaEvidence' and step.node==s.story.node and not s.paused
     and canInspect(s.actors[s.active],step)
 end

 local function evidence(q,state)
  local cards={}
  for i=1,state.count do
   local card=q.itinerary[i].teaClue
   if card then cards[#cards+1]=card end
  end
  return cards
 end

 local function selected(s)
  local count=0
  for _ in pairs(s.teaEvidence) do count=count+1 end
  return count
 end

 function tea.enter(s)
  s.teaEvidence={}
  s.teaFeedback,s.teaArrival=nil,nil
 end

 function tea.select(s,q,state,id)
  if not board(s,q,state) then return end
  for _,card in ipairs(evidence(q,state)) do
   if id==card.id then
    if s.teaEvidence[id] then s.teaEvidence[id]=nil
    elseif selected(s)<2 then s.teaEvidence[id]=true
    else s.teaFeedback='絵札は二枚までです。選んだ札をもう一度押すと外せます。';return end
    s.teaFeedback=nil
    return
   end
  end
 end

 function tea.confirm(s,q,state)
  if not board(s,q,state) then return end
  local spec=q.teaCase
  if selected(s)~=2 then s.teaFeedback='屋台が移動したと分かる絵札を二枚選びます。';return end
  if not s.teaEvidence[spec.trackClue] then
   s.teaFeedback='平蔵「品物や時刻が分かったね。屋台そのものが動いた痕跡もなかったかな？」'
   return
  end
  if not s.teaEvidence[spec.arrivalClue] then
   s.teaFeedback='平蔵「車輪で運べそうだね。船着き場では、夕方に何を見たと話していた？」'
   return
  end
  s.teaArrival=s.t
  s.teaEvidence={}
  s.teaFeedback=nil
  return q.itinerary[state.count+1]
 end

 function tea.step(s,q)
  if s.teaArrival and s.t>=s.teaArrival+q.teaCase.seconds then
   s.teaArrival=nil
   s.storyNotice='店主「お待たせ。お昼は木陰、夕方は船を待つ人の多いここで、お茶を淹れてるんだ。」'
  end
 end

 function tea.allowed(s,q,state)
  return state and state.count>=q.goal-1 and not s.paused and not s.teaArrival
     and s.story.node==q.target and canInspect(s.actors[s.active],q.itinerary[q.goal])
 end

 local function serve(s,q)
  local actor=s.actors[s.active]
  local hp=actor.hp
  C.healActor(s,actor,q.teaCase.heal)
  return math.floor(actor.hp-hp)
 end

 function tea.firstCup(s,q)
  serve(s,q)
  s.storyNotice='平蔵「人の集まるところへ店を動かしていたんだね。証拠を結んで確かめたのは君だよ。」城下の広場で報告できます。'
 end

 function tea.read(s,q,state)
  if not state then return false end
  if state.status=='complete' and tea.allowed(s,q,state) then
   local healed=serve(s,q)
   s.storyNotice=healed>0 and 'お茶でひと休みして、HPが'..healed..'回復しました。' or '温かいお茶でひと休みしました。'
   return true
  end
  if board(s,q,state) then
   s.teaFeedback='屋台が移動したと分かる絵札を二枚選んでください。札を押すと選び直せます。'
   return true
  end
  local a=s.actors[s.active]
  for i=1,state.count do
   local step=q.itinerary[i]
   if step.teaClue and step.node==s.story.node and canInspect(a,step) then
    s.storyNotice=step.notice
    return true
   end
  end
  return false
 end

 local function art(draws,key,x,y,h,mode,profile)
  local sprite=C.teaCaseArt[key]
  local w=h*sprite.box[3]/sprite.box[4]
  if x+w/2>=0 and x-w/2<=960 then
   C.drawFieldDisplayArt({draws=draws},sprite,x,y,h,mode,profile,false)
  end
 end

 local function label(draws,x,y,text)
  local w=utf8.len(text)*14+16
  if x>=w/2 and x<=960-w/2 then
   draws[#draws+1]={kind='rect',x=x-w/2,y=y-18,w=w,h=23,color='#2a273bed'}
   draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color='#fff0d4'}
  end
 end

 function tea.observe(s,f,draws,q,state,mode,profile)
  if not state then return end
  local current=q.itinerary[state.count+1]
  for index,step in ipairs(q.itinerary) do
   if step.teaClue and step.node==s.story.node and index<=state.count+1 then
    local x=step.x-s.camera
    art(draws,step.teaClue.art,x,step.y,step.teaClue.height,mode,profile)
    label(draws,x,step.y-step.teaClue.height-27,step.name)
    if index<=state.count and not s.paused and canInspect(s.actors[s.active],step) then
     f.storyNearbyMilestone={label='絵札「'..step.teaClue.label..'」を読み直す'}
    end
   end
  end
  local message
  if current and current.kind=='teaEvidence' and current.node==s.story.node then
   local x=current.x-s.camera
   art(draws,'day',x-14,current.y,61,mode,profile)
   art(draws,'dusk',x+19,current.y,55,mode,profile)
   label(draws,x,current.y-123,current.name)
   if board(s,q,state) then
    local cards={}
    for _,card in ipairs(evidence(q,state)) do
     local sprite=C.teaCaseArt[card.art]
     cards[#cards+1]={id=card.id,label=card.label,detail=card.detail,
       selected=s.teaEvidence[card.id]==true,source=sprite.source,box=sprite.box}
    end
    f.storyTeaBoard={cards=cards,ready=selected(s)==2,
      feedback=s.teaFeedback or '屋台が移動したと分かる絵札を二枚選びます。'}
   end
   message='集めた絵札を見比べ、茶屋が移動した証拠を選びます。'
  end
  local parked,cartX
  if s.story.node==q.target and state.count>=q.goal-1 then
   local spec=q.teaCase
   local progress=s.teaArrival and math.min(1,(s.t-s.teaArrival)/spec.seconds) or 1
   local x=spec.stopX+(spec.startX-spec.stopX)*(1-progress)^1.4
   cartX=x
   parked=not s.teaArrival
   art(draws,'keeper',x+86-s.camera,spec.y-(parked and 0 or math.abs(math.sin(s.t*15))*4),83,mode,profile)
   art(draws,'cart',x-s.camera,spec.y,109,mode,profile)
   if parked then
    local seat=q.itinerary[q.goal]
    art(draws,'cup',seat.x-s.camera,seat.y,43,mode,profile)
    label(draws,x-s.camera,spec.y-133,'船着き場の茶屋')
    if state.status=='complete' and tea.allowed(s,q,state) and not f.storyNearbyMilestone then
     f.storyNearbyMilestone={label='お茶を飲んで休む'}
    end
    message='船着き場の茶屋 ｜ お茶で操作中のキャラクターが回復'
   else
    label(draws,x-s.camera,spec.y-132,'茶屋が到着します')
    message='店主が屋台を押して、船着き場へやってきます。'
   end
  end
  f.storyTeaCase={message=message,cartX=cartX,parked=parked,clues=#evidence(q,state)}
 end

 return tea
end
