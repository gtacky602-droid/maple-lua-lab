return function(C,canInspect)
 local survey={}
 local cream='#fff1cd'

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function label(draws,x,y,text,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color=color or cream}
 end

 local function art(draws,key,x,y,h,mode,profile)
  C.drawFieldDisplayArt({draws=draws},C.surveyEquipment[key],x,y,h,mode,profile,false)
 end

 local function fits(config,choice)
  return choice.view>=config.minimumView and choice.steady>=config.minimumSteady
 end

 function survey.adjust(s,step,state,command)
  local config=step.surveyRig
  if command=='rotate' then
   state.surveySupport=(state.surveySupport or 1)%#config.options+1
  elseif command=='survey_confirm' then
   local choice=config.options[state.surveySupport or 1]
   if fits(config,choice) then
    state.surveySupport=nil
    return true
   end
   s.storyNotice=choice.reading..'見通しと安定が両方そろう方法を試しましょう。'
  end
  return false
 end

 local function rig(draws,x,y,choice,mode,profile)
  local offset=choice.offset
  local base=y-offset
  rect(draws,x-16,y-4,32,4,'#485972')
  rect(draws,x-12,base,4,offset,'#4b5a6a')
  rect(draws,x+8,base,4,offset,'#576578')
  rect(draws,x-17,base,34,5,'#a27956')
  if choice.brace then art(draws,'clamp',x+24,y,22,mode,profile) end
  art(draws,'lens',x,base,42,mode,profile)
 end

 local function meter(value)
  return tostring(value)..'/3'
 end

 local function rating(sample)
  return '見通し '..meter(sample.view)..' ｜ 安定 '..meter(sample.steady)
 end

 local function readings(q,count)
  local out={}
  for i,step in ipairs(q.itinerary) do
   if count>=i and step.surveySample then
    local sample=step.surveySample
    out[#out+1]=step.name..' '..meter(sample.view)..'・'..meter(sample.steady)
   end
  end
  return out
 end

 function survey.read(s,q,state)
  if not state or state.count<q.goal then return false end
  local a=s.actors[s.active]
  for _,step in ipairs(q.itinerary) do
   if step.node==s.story.node and step.surveyRig and canInspect(a,step) then
    s.storyNotice='固定した観測器の記録。見通し3/3、安定3/3。奥の岩の向こうにも小さな反応があります。'
    return true
   end
  end
  return false
 end

 local function drawSample(draws,x,y,step,sample,measured,mode,profile)
  if step.name=='屋根下' then
   rect(draws,x-73,y-99,149,9,'#555b6e')
   rect(draws,x-73,y-101,149,3,'#dae7f2')
   rect(draws,x-62,y-90,5,90,'#806b6a')
   rect(draws,x+62,y-90,5,90,'#77636a')
  end
  rig(draws,x,y,{offset=16},mode,profile)
  label(draws,x,y-(step.name=='屋根下' and 116 or 84),step.name)
  if measured then label(draws,x,y+26,rating(sample),'#eff9ff') end
 end

 function survey.observe(s,f,draws,scene,q,state,mode,profile)
  local a=s.actors[s.active]
  local count=state and state.count or 0
  local message
  if scene.scout and count>=scene.scout.after and s.companion~='mitya' then
   local scout=scene.scout
   if scout.x-s.camera>=-80 and scout.x-s.camera<=1040 then
    C.drawCompanionArt({draws=draws},s,{x=scout.x,y=scout.y,dir=-1},mode,profile,'mitya')
    label(draws,scout.x-s.camera,scout.y-103,'ミティヤ')
   end
  end
  local log=readings(q,count)
  for i,step in ipairs(q.itinerary) do
   if step.kind=='inspect' and step.node==s.story.node then
    local x,y=step.x-s.camera,step.y
    local near=canInspect(a,step)
    if x>=-125 and x<=1085 then
     local sample=step.surveySample
     if sample then
      drawSample(draws,x,y,step,sample,count>=i,mode,profile)
      if near and count>=i then message=step.name..' ｜ '..sample.reading end
     elseif step.surveyPad then
      rect(draws,x-37,y-7,74,7,'#6f8194')
      rect(draws,x-37,y-7,74,2,'#b4cada')
      label(draws,x,y-26,step.name)
     elseif step.surveyRig and count>=i-1 then
      local conf=step.surveyRig
      local fixed=count>=i
      local choice=conf.options[fixed and #conf.options or state.surveySupport or 1]
      rig(draws,x,y,choice,mode,profile)
      label(draws,x,y-94,fixed and '観測器・固定済み' or '段差の観測器')
      if fixed and near and count>=q.goal and not s.paused then
       f.storyNearbyMilestone={label='固定した観測器の記録を読む'}
      elseif not fixed and near and not s.paused then
       f.storySurveyRig={label=choice.label,ratings=rating(choice),reading=choice.reading,ready=fits(conf,choice)}
      end
     elseif step.surveySeat and count>=i-1 then
      rect(draws,x-39,y-18,78,7,'#7d6977')
      rect(draws,x-35,y-11,7,11,'#574555')
      rect(draws,x+28,y-11,7,11,'#574555')
      art(draws,'blanket',x+2,y-18,24,mode,profile)
      label(draws,x,y-63,'毛布の腰掛け')
     end
    end
   end
  end
  if not message and #log>0 then message='観測記録（見通し・安定） ｜ '..table.concat(log,'　') end
  f.storySurvey={samples=#log,message=message}
 end

 return survey
end
