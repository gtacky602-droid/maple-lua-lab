return function()
 local reflection={}
 local function current(s,item,progress)
  local state=s.reflection
  if state and state.item==item then return state end
  local angle=item.reflect.rememberAngle and progress.reflectAngle or 0
  return {item=item,angle=angle,lit=true,darkSeen=false}
 end
 local function matches(item,state) return state.angle==item.reflect.align end

 function reflection.interact(s,item,action,progress)
  local config=item.reflect
  local state=current(s,item,progress)
  s.reflection=state
  if action=='rotate' then
   state.angle=state.angle%#config.faces+1
   state.darkSeen=false
   if not config.record and matches(item,state) then return true end
   if config.rememberAngle then progress.reflectAngle=state.angle end
   s.storyNotice=config.faces[state.angle].label..'に向けました。'
  elseif config.record and action=='light' then
   state.lit=not state.lit
   if not state.lit and state.angle>0 then state.darkSeen=true end
  elseif config.record and action=='confirm' then
   if not state.darkSeen or not state.lit then
    s.storyNotice='向きを選び、消灯時の刻線と点灯時の像を見比べてください。'
   elseif matches(item,state) then return true
   else s.storyNotice='照射の記録が合いません。向きを変えて照合してください。' end
  end
  return false
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function reflection.draw(s,f,draws,item,near,progress)
  local config=item.reflect
  local state=current(s,item,progress)
  local face=config.faces[state.angle]
  local x,y=item.x-s.camera,item.y
  if x>=-180 and x<=1140 then
   rect(draws,x-15,y-19,30,19,'#3c4661')
   rect(draws,x-18,y-36,36,21,'#8b799d')
   rect(draws,x-12,y-33,24,15,state.lit and '#bbf5ec' or '#52627c')
   for i,receiver in ipairs(config.faces) do
    local dx,dy=receiver.dx,receiver.dy
    if state.lit and i==state.angle then
     for k=1,11 do rect(draws,x+dx*k/12-4,y-26+dy*k/12,8,3,'#b3f9f3c8') end
    end
    rect(draws,x+dx-7,y-33+dy,14,17,state.lit and i==state.angle and '#fff1ad' or '#6c637e')
    draws[#draws+1]={kind='text',x=x+dx,y=y-40+dy,text=receiver.label,size=13,color='#f1e9cd'}
   end
  end
  if near then
   local orientation=face and face.label or '未調整'
   local image=state.lit and (face and face.image or '像なし') or config.record
   f.storyNearbyMilestone={label=item.action..'（'..orientation..'）'}
   f.storyReflection={orientation=orientation,lit=state.lit,image=image,record=config.record}
  end
 end

 return reflection
end
