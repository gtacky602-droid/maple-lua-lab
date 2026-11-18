return function(C)
 local survey={}
 local heights={root=46,stone=66,ring=69,lever=62,leverOn=62,sign=91}

 function survey.start(s)
  if s.wandererAssistAt then return end
  s.wandererAssistAt=s.t
  s.storyNotice='地上のレバーを入れました。放浪者が枝の切れ目を越えて、上のキノコンに向かいます。'
 end

 function survey.update(s,q,state)
  if not s.wandererAssistAt or s.t-s.wandererAssistAt<q.surveyAssist.duration then return end
  s.wandererAssistAt=nil
  return q.itinerary[state.count+1]
 end

 local function art(f,s,sprite,x,y,height,mode,profile)
  x=x-s.camera
  local width=height*sprite.box[3]/sprite.box[4]
  if x+width>=0 and x-width<=960 and y>0 then
   C.drawFieldDisplayArt(f,sprite,x,y,height,mode,profile,false)
  end
 end

 local function label(f,s,x,y,text,color)
  x=x-s.camera
  local w=utf8.len(text)*14+16
  if x-w/2>=0 and x+w/2<=960 then
   f.draws[#f.draws+1]={kind='rect',x=x-w/2,y=y-17,w=w,h=23,color='#253f3bee'}
   f.draws[#f.draws+1]={kind='text',x=x,y=y,text=text,size=14,color=color}
  end
 end

 function survey.guide(f,s,mark,mode,profile)
  local sprite=C.companionArt.wanderer
  art(f,s,mark.left and sprite.left or sprite,mark.x,mark.y,sprite.height,mode,profile)
 end

 local function strike(f,s,x,y,age)
  for i=0,5 do
   local dx=i*10+age*45
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera-60+dx,y=y-i*4,w=14,h=3,color='#b6eedd'}
  end
 end

 function survey.observe(f,s,q,state,mode,profile)
  if not state then return end
  local working=s.wandererAssistAt~=nil
  for index,mark in ipairs(q.itinerary) do
   if mark.node==s.story.node and mark.surveyProp and index<=state.count+1 then
    local key=mark.surveyProp
    if key=='lever' and (index<=state.count or working) then key='leverOn' end
    local height=heights[key]
    art(f,s,C.wandererSurveyArt[key],mark.x,mark.y,height,mode,profile)
    label(f,s,mark.x,mark.y-height-23,mark.completedLabel and index<=state.count and mark.completedLabel or mark.name,'#f6edcc')
   end
  end
  if s.story.node~=q.target then return end
  local spec=q.surveyAssist
  local elapsed=working and s.t-s.wandererAssistAt or 0
  local current=q.itinerary[state.count+1]
  local ready=current and current.assistLever
  local solved=state.count>=q.goal-1
  local defeated=0
  if not solved then
   for _,guard in ipairs(spec.guards) do
    local age=elapsed-guard.strikeAt
    if age<0 then
     local bob=math.sin(s.t*4+guard.x)*6
     art(f,s,C.enemyIdleArt['dendro-fungus'],guard.x,guard.y+bob,47,mode,profile)
    else
     defeated=defeated+1
     if age<.28 then strike(f,s,guard.x,guard.y-26,age) end
    end
   end
  end
  if ready or solved then
   local progress=solved and 1 or math.min(1,elapsed/spec.duration)
   local x=spec.startX+(spec.endX-spec.startX)*progress
   local y=spec.startY+(spec.endY-spec.startY)*progress-math.sin(progress*math.pi)*21
   survey.guide(f,s,{x=x,y=y,left=solved},mode,profile)
  end
  local message
  if working then message='旅人は地上のレバー、放浪者は上のキノコンを担当。'
  elseif state.status=='complete' then message='観測標識で、二人が書き足した記録を読み返せます。'
  elseif state.count==q.goal then message='観測記録ができました。右下の門から広場へ戻れます。'
  elseif solved then message='足場が開きました。根の段を二つ登って標識へ。'
  elseif ready then message='地上のレバーを入れると、放浪者が上の道を開きます。' end
  f.storyWandererSurvey={working=working,cleared=solved,defeated=solved and #spec.guards or defeated,message=message}
 end

 return survey
end
