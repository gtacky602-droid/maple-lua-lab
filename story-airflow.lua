return function()
 local airflow={}

 local function current(s,item)
  local trial=s.airflowTrial
  if trial and trial.item==item then return trial end
  return {item=item,index=0}
 end

 local function removePreview(s,trial)
  if not trial.deck then return end
  for i,p in ipairs(s.platforms) do
   if p==trial.deck then table.remove(s.platforms,i);break end
  end
  trial.deck=nil
 end

 function airflow.interact(s,item,command,emitCue)
  local config=item.airflow
  local trial=current(s,item)
  s.airflowTrial=trial
  if command=='rotate' then
   removePreview(s,trial)
   trial.index=trial.index%#config.choices+1
   local choice=config.choices[trial.index]
   if choice.notes then emitCue(s,'airflow',choice.notes,choice.pattern) end
   if trial.index==config.correct and not config.confirm then s.airflowTrial=nil;return true end
   trial.deck=choice.deck
   if trial.deck then s.platforms[#s.platforms+1]=trial.deck end
   s.storyNotice=choice.label..'　'..choice.result
  elseif command=='airflow_commit' and config.confirm then
   local choice=config.choices[trial.index]
   if trial.index==config.correct or (config.stagePlan and choice and choice.id) then
    removePreview(s,trial);s.airflowTrial=nil
    return true,config.stagePlan and choice.id or nil
   end
   s.storyNotice=config.confirmationHint or '行きと帰りの両方で昇降台へ通れる位置を試してください。'
  end
  return false
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function airflow.observe(s,f,draws,item,near)
  local config=item.airflow
  local trial=current(s,item)
  local choice=config.choices[trial.index]
  local x,y=item.x-s.camera,item.y
  if x>=-75 and x<=1035 then
   rect(draws,x-23,y-31,46,31,'#684e66')
   rect(draws,x-17,y-27,34,20,choice and '#75b5a1' or '#485567')
   for dx=-12,12,8 do rect(draws,x+dx,y-24,4,14,'#344957') end
   draws[#draws+1]={kind='text',x=x,y=y-41,text=item.name,size=14,color='#fff2c1'}
  end
  if near then
   f.storyNearbyMilestone={label=item.action}
   f.storyAirflow={selection=choice and choice.label or '未調整',pattern=choice and choice.pattern,
    target=config.target,sound=config.choices[1].notes~=nil,confirm=config.confirm,
    confirmLabel=config.confirmLabel,result=choice and choice.result or config.hint}
  end
 end

 return airflow
end
