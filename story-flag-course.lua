return function(C)
 local course={}

 local function near(s,item)
  local a=s.actors[s.active]
  return item and a.ground and a.hp>0 and math.abs(a.x-item.x)<54 and math.abs(a.y-item.y)<34
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function text(draws,label,x,y)
  draws[#draws+1]={kind='text',text=label,x=x,y=y,color='#fff1bd',size=14}
 end

 local function elapsed(s,run)
  return math.max(1,math.min(10^9,math.floor((s.t-run.started)*60+.5)))
 end

 local function timeLabel(ticks)
  return string.format('%.2f秒',ticks/60)
 end

 function course.enter(s,spec)
  if s.flagTrial and (not spec or s.flagTrial.quest~=spec.quest) then s.flagTrial=nil end
  s.flagLowering=nil
 end

 function course.lower(s,step,state)
  if s.flagLowering then return end
  s.flagLowering={step=step,state=state,started=s.t}
  s.storyNotice='カチーナが岩の切れ目へ回ります。足場が下りるまで待ちましょう。'
 end

 function course.step(s)
  local event=s.flagLowering
  if event and s.t-event.started+1e-8>=event.step.flagLowerSeconds then
   s.flagLowering=nil
   return event.step,event.state
  end
 end

 local function site(s,spec,state)
  if not spec or not state or state.status~='complete' or s.paused then return end
  local run=s.flagTrial
  if not run then
   if near(s,spec.board) then return 'start' end
   return
  end
  for _,mark in ipairs(spec.marks or {}) do
   if mark.order==run.count+1 and near(s,mark) then return 'mark' end
  end
  if near(s,spec.goal) then return 'finish' end
 end

 function course.interact(s,spec)
  local state=spec and s.story.quests[spec.quest]
  local action=site(s,spec,state)
  if not action then return false end
  if action=='start' then
   s.flagTrial={quest=spec.quest,count=0,started=s.t}
   s.storyNotice='計測を始めました。好きな道から二つの中継印を集め、頂上の旗へ。'
  elseif action=='mark' then
   local run=s.flagTrial
   run.count=run.count+1
   s.storyNotice='計測中　中継印 '..run.count..' / 2'
  else
   local run=s.flagTrial
   if run.count<2 then s.storyNotice='記録には中継印が二つ必要です。道へ戻って確かめましょう。';return true end
   local ticks=elapsed(s,run)
   state.flagBestTicks=math.min(state.flagBestTicks or ticks,ticks)
   s.flagTrial=nil
   s.storyNotice='今回 '..timeLabel(ticks)..'　最短 '..timeLabel(state.flagBestTicks)
  end
  return true
 end

 local function drawMarks(s,draws,spec,progress)
  for _,mark in ipairs(spec.marks or {}) do
   local x,y=mark.x-s.camera,mark.y
   if x>=-55 and x<=1015 then
    local color=progress>=mark.order and '#bcdba6' or mark.order==1 and '#f09866' or '#6fd3c2'
    rect(draws,x-12,y-9,24,9,'#6c5148')
    rect(draws,x-3,y-42,6,35,'#704c43')
    rect(draws,x+1,y-39,24,13,color)
    rect(draws,x+1,y-27,15,4,color)
    text(draws,'中継印 '..mark.order,x,y-51)
   end
  end
 end

 local function drawGuide(s,f,layer,spec,mode,profile)
  local draws=layer.draws
  local guide=spec.guide
  if not guide then return end
  local active=s.flagLowering
  local fraction=active and math.min(1,(s.t-active.started)/active.step.flagLowerSeconds) or 0
  local gx=guide.x+(guide.edgeX-guide.x)*fraction
  local x,y=gx-s.camera,guide.y
  if active then
   f.storyFlagLowering={progress=fraction}
   local lift=guide.deckY-(1-fraction)*104
   local dx=guide.deckX-s.camera
   rect(draws,dx,lift,guide.deckWidth,12,'#8e543b')
   rect(draws,dx,lift,guide.deckWidth,5,'#e2a66a')
   for i=0,3 do
    local spark=12+math.abs(math.sin(fraction*26+i))*13
    rect(draws,x-spark+i*12,y-13-i*4,5,4,'#f5bf72')
   end
  end
  if x< -100 or x>1060 then return end
  if s.companion~='kachina' then
   C.drawCompanionArt(layer,s,{x=gx,y=y,dir=1},mode,profile,'kachina')
  end
  if active then
   rect(draws,x-12,y-13,24,12,'#bc754a')
   rect(draws,x-8,y-8,16,8,'#e7ad68')
   text(draws,'ぐるぐるコマちゃん',x,y-88)
  elseif s.companion~='kachina' then text(draws,'カチーナ',x,y-88) end
 end

 function course.observe(s,f,layer,spec,mode,profile)
  local draws=layer.draws
  if not spec then return end
  local state=s.story.quests[spec.quest]
  if not state then return end
  local run=s.flagTrial
  local count=run and run.count or math.max(0,math.min(2,state.count-1))
  drawMarks(s,draws,spec,count)
  drawGuide(s,f,layer,spec,mode,profile)
  if spec.goal then
   local x=spec.goal.x-s.camera
   if x>=-75 and x<=1035 then
    C.drawFieldDisplayArt(layer,C.natlanRaceFlagArt,x,spec.goal.y,121,mode,profile,false)
   end
  end
  local action=site(s,spec,state)
  if action then
   local labels={start='任意のタイム計測を始める',mark='計測用の中継印を押す',finish='この周回の旗を取る'}
   f.storyNearbyMilestone={label=labels[action]}
  end
  if run then f.storyFlagStatus='計測中　中継印 '..run.count..' / 2　'..string.format('%.1f秒',elapsed(s,run)/60)
  elseif state.flagBestTicks then f.storyFlagStatus='旗取りの最短記録　'..timeLabel(state.flagBestTicks)
  elseif state.status=='complete' and spec.board then f.storyFlagStatus='旗取りのタイム計測に挑戦できます。'
  elseif state.status=='active' and state.count>0 then f.storyFlagStatus='中継印 '..count..' / 2' end
 end

 local podium={x=847,y=390}
 local function complete(s,id)
  local q=s.story.quests[id]
  return q and q.status=='complete' and q
 end
 local function optionName(options,id)
  for _,option in ipairs(options) do if option.id==id then return option.label end end
  return '記録なし'
 end
 function course.memorial(s,f,layer,quests,mode,profile)
  if not complete(s,'natlan-sunset-duel') then return end
  local x=podium.x-s.camera
  if x < -130 or x>1090 then return end
  C.drawFieldDisplayArt(layer,C.natlanRaceFlagArt,x-73,390,92,mode,profile,false)
  C.drawFieldDisplayArt(layer,C.iansanTrainingArt.board,x+36,390,78,mode,profile,false)
  text(layer.draws,'祭の記録台',x,282)
  if not near(s,podium) then return end
  local rows={}
  local function entry(name,detail,node)
   rows[#rows+1]={name=name,detail=detail,node=node}
  end
  local flag=complete(s,'natlan-ridge-flag')
  if flag then
   entry('尾根の旗取り',flag.flagBestTicks and '初完走。最短 '..timeLabel(flag.flagBestTicks) or '二つの中継印を押し、山頂の旗に到着。','natlan-flag-summit')
  end
  entry('夕映えの模擬戦','旅人とムアラニの対戦札。練習試合は合図台から。','natlan-sunset-arena')
  local id='natlan-kachina-charms'
  local q=complete(s,id)
  if q and q.stonePair then
   local spec=quests[id].stoneOrnaments
   entry('カチーナと作った石飾り',optionName(spec.colors,q.stonePair.color)..'・'..optionName(spec.patterns,q.stonePair.pattern),'natlan-hub')
  end
  if complete(s,'natlan-mualani-surf') then entry('ムアラニの波札','入り江でボールを打ち返し、記念の波札を受け取った。','natlan-surf-cove') end
  id='natlan-kinich-ambush'
  q=complete(s,id)
  if q and q.huntNotes then entry('キィニチと開いた狩道',quests[id].kinichHunt.reports[q.huntNotes.outcome] or '岩場への近道が開いた。','natlan-kinich-hunt') end
  id='natlan-xilonen-springs'
  q=complete(s,id)
  if q and q.springRecord and q.springRecord.layout then
   local labels,types={},quests[id].springCourse.types
   for _,section in ipairs(quests[id].springCourse.sections) do
    local kind=types[q.springRecord.layout[section.id]]
    labels[#labels+1]=kind and kind.label or '記録なし'
   end
   entry('シロネンの踏み台',table.concat(labels,' → '),'natlan-xilonen-course')
  end
  id='natlan-iansan-self-test'
  q=complete(s,id)
  if q and q.trainingLog and q.trainingLog.baseline and q.trainingLog.retest then
   local log=q.trainingLog
   entry('イアンサの稽古',optionName(quests[id].iansanTraining.focus,log.focus)..'。初回 '..timeLabel(log.baseline.ticks)
    ..'（被弾'..log.baseline.hits..'回） → 二周目 '..timeLabel(log.retest.ticks)..'（被弾'..log.retest.hits..'回）','natlan-iansan-training')
  end
  f.storyFestivalLedger=rows
 end

 return course
end
