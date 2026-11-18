return function(C)
 local action,step,frame,configure=C.action,C.step,C.frame,C.configure
 local lessons={
  SK58={gauge=55,marks={'light-release','light-normal'},slots={{'SK09'},{},{},{},{},{},{},{}}},
  SK59={gauge=55,marks={'light-echo'},slots={{'SK09'},{'SK59'},{},{},{},{},{},{}}},
  SK60={gauge=90,marks={'seven-strike'},slots={{'SK09'},{},{'SK60'},{},{},{},{},{}}},
 }
 local battleControls={normal=true,jump=true,drop=true,dodge=true,pause=true,swap=true,light=true,
  skill1=true,skill2=true,skill3=true,skill4=true,slot1=true,slot2=true,slot3=true,cancel_macro=true}
 local battleFields={'actors','active','gauge','lightForm','ultimate','echoSource','skillNotice','loadout','macro',
  'platforms','draws','camera','commands','visible','total','t','paused','auto'}

 local function practice(s,id,skill)
  local lesson=lessons[skill]
  local training=C.new(12)
  training.growthPracticeMarks={}
  training.companion=s.companion or 'amber'
  training.gauge=lesson.gauge
  training.worldwidth=960
  training.platforms={{x=0,y=480,w=960}}
  training.grappleNodes={}
  training.enemies={}
  for i,x in ipairs({292,365,438}) do
   training.enemies[i]={id=i,x=x,home=x,y=480,hp=600,maxhp=600,respawn=0,cd=math.huge,warning=0,
    kind=1,custom=true,noRewards=true,growthPracticeTarget=true}
  end
  training.loadout={}
  for i,slot in ipairs(lesson.slots) do training.loadout[i]={table.unpack(slot)} end
  s.growthTrial={quest=id,skill=skill,state=training}
 end

 local function settle(s)
  local trial=s.growthTrial
  for _,mark in ipairs(lessons[trial.skill].marks) do
   if trial.state.growthPracticeMarks[mark] then C.noteGrowth(s,mark) end
  end
 end

 function C.action(s,key)
  local trial=s.growthTrial
  if trial then
   if key=='growth_practice_exit' then
    s.growthTrial=nil
   elseif key=='growth_practice_retry' then
    practice(s,trial.quest,trial.skill)
   elseif battleControls[key] then
    action(trial.state,key)
    settle(s)
   end
   return
  end
  local id=key:match('^growth_practice_start:([%w%-]+)$')
  if id then
   local skill=C.canStartGrowthTrial(s,id)
   if lessons[skill] then practice(s,id,skill) end
   return
  end
  action(s,key)
 end

 function C.step(s,dt,input)
  if not s.growthTrial then return step(s,dt,input) end
  step(s.growthTrial.state,dt,input)
  settle(s)
 end

 function C.configure(s,slots)
  if s.growthTrial then return false,'練習を終えてから、冒険の技枠を編集してください。' end
  return configure(s,slots)
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  local trial=s.growthTrial
  if not trial then return f end
  local battle=C.frameGrowthBattle(trial.state,mode,profile)
  for _,target in ipairs(trial.state.enemies) do
   if target.hp>0 then
    C.drawFieldDisplayArt(battle,C.iansanTrainingArt.dummy,target.x-battle.camera,target.y,52,mode,profile)
   end
  end
  battle.commands=#battle.draws
  for _,key in ipairs(battleFields) do f[key]=battle[key] end
  f.location='光界の練習場（試作）'
  f.storyNearbyPortal=nil
  f.storyNearbyMilestone=nil
  f.growthTrial={skill=trial.skill,quest=trial.quest,marks=trial.state.growthPracticeMarks}
  return f
 end
end
