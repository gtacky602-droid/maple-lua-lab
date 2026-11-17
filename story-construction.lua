return function(drawCart)
 local H={}

 local function near(s,item)
  local a=s.actors[s.active]
  return a.hp>0 and math.abs(a.x-item.x)<54 and math.abs(a.y-item.y)<34
 end

 local function planById(spec,id)
  for _,plan in ipairs(spec.plans) do if plan.id==id then return plan end end
 end

 local function sites(s,q,state)
  local spec=q.construction
  local found={}
  if state.status~='active' then return found end
  if state.count<3 then
   for _,survey in ipairs(spec.surveys) do
    if survey.node==s.story.node and not state.construction.surveyed[survey.id] then
     found[#found+1]=survey
    end
   end
  elseif state.count==3 and s.story.node==spec.desk.node then
   found[1]=spec.desk
  elseif state.count==4 or state.count==5 then
   local plan=planById(spec,state.construction.plan)
   if plan.site.node==s.story.node then found[1]=plan.site end
  end
  return found
 end

 function H.nearby(s,q,state)
  for _,item in ipairs(sites(s,q,state)) do if near(s,item) then return item end end
 end

 function H.interact(s,q,state,item)
  if state.count<3 then
   state.construction.surveyed[item.id]=true
   state.count=state.count+1
   s.storyNotice=item.result
  elseif state.count==3 then
   s.storyNotice='刻晴「荷車を引く人は屋根を跳べません。地上の道と昇降台を比べて選びましょう。」'
  elseif state.count==4 then
   state.count=5
   s.storyNotice='作業場所を片付けました。預かった資材を職人に渡しましょう。'
  elseif state.count==5 then
   state.count=q.goal
   s.storyNotice='資材を渡しました。職人が工事を終えたので、刻晴に報告しましょう。'
  end
 end

 function H.choose(s,q,state,id)
  local spec=q.construction
  if state.status~='active' or state.count~=3 or s.story.node~=spec.desk.node or not near(s,spec.desk) then return end
  local plan=planById(spec,id)
  if not plan then return end
  state.construction.plan=id
  state.count=4
  s.storyNotice=plan.name..'案に決めました。作業場所を片付けましょう。'
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function liftShaft(draws,x,top,bottom)
  rect(draws,x-29,top,6,bottom-top,'#5e4633')
  rect(draws,x+23,top,6,bottom-top,'#5e4633')
  rect(draws,x-32,top,64,7,'#8c6548')
  rect(draws,x-3,top+6,6,bottom-top-6,'#9c8259')
 end

 local function surveyProp(draws,x,y,item,count)
  if item.id=='roof' then
   rect(draws,x-20,y-12,40,5,'#ab875c')
   rect(draws,x-20,y-7,5,7,'#6c4f3d')
   rect(draws,x+15,y-7,5,7,'#6c4f3d')
   rect(draws,x-2,y-17,4,10,'#f6cd80')
  elseif item.id=='old-lift' then liftShaft(draws,x,y-72,y)
  elseif item.id=='work-plan' then
   rect(draws,x-22,y-27,44,27,'#835c40')
   rect(draws,x-17,y-36,34,9,'#efdbb0')
   rect(draws,x-7,y-32,17,2,'#789789')
  elseif count==5 then
   rect(draws,x-23,y-20,46,20,'#ae835a')
   rect(draws,x-23,y-15,46,5,'#e4bb79')
  else
   rect(draws,x-24,y-20,48,20,'#6b4935')
   rect(draws,x-21,y-17,42,13,'#b88859')
   rect(draws,x-8,y-35,25,15,'#c18a53')
  end
 end

 function H.observe(s,f,draws,q,state)
  local spec=q.construction
  local item=H.nearby(s,q,state)
  for _,site in ipairs(sites(s,q,state)) do surveyProp(draws,site.x-s.camera,site.y,site,state.count) end
  if item and not s.paused and not s.lift then
   local label=state.count==4 and '作業場所を片付ける' or state.count==5 and '資材を職人に渡す' or item.name..'を調べる'
   f.storyNearbyConstruction={label=label}
  end
  if item==spec.desk then
   f.storyConstruction={quest=q.id,plans=spec.plans,paused=s.paused or s.lift~=nil}
  end
  if state.status~='complete' then return end
  local plan=planById(spec,state.construction.plan)
  if s.story.node==q.hub then
   local x=plan.entrance-s.camera
   if plan.id=='lift' then liftShaft(draws,x,400,480)
   else
    rect(draws,x-27,464,54,6,'#bc9463')
    rect(draws,x-35,474,70,5,'#816348')
   end
  elseif s.story.node==plan.route then
   if plan.id=='ground' then
    local x=s.t%9*120-60
    drawCart(draws,x-s.camera,480)
    f.storyHaulCart={x=x,y=480,route=plan.id}
   else
    local shaft=180
    liftShaft(draws,shaft-s.camera,310,480)
    local t=s.t%8
    local x=shaft+math.max(0,3-math.abs(t-4))*41
    local y=350+math.max(0,1-t, t-7)*130
    rect(draws,x-s.camera-38,y,76,5,'#a87750')
    drawCart(draws,x-s.camera,y)
    f.storyHaulCart={x=x,y=y,route=plan.id}
   end
  end
 end

 return H
end
