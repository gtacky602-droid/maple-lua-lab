return function(canInspect)
 local views={}

 local function nearby(s,survey)
  for _,point in ipairs(survey.points) do
   if canInspect(s.actors[s.active],point) then return point end
  end
 end

 local function projection(survey,point)
  local angle=math.rad(point.angle)
  local u,v=math.cos(angle),math.sin(angle)
  local rocks={}
  for _,rock in ipairs(survey.rocks) do
   local x=rock.x*u+rock.depth*v
   rocks[#rocks+1]={left=x-rock.radius,right=x+rock.radius,height=rock.height,color=rock.color,shape=rock.shape}
  end
  table.sort(rocks,function(a,b) return a.left<b.left end)
  local gap,edge=0,rocks[1].right
  for i=2,#rocks do
   gap=math.max(gap,rocks[i].left-edge)
   edge=math.max(edge,rocks[i].right)
  end
  return rocks,gap
 end

 function views.choose(s,survey)
  local point=nearby(s,survey)
  if not point then return false,false end
  local _,gap=projection(survey,point)
  if gap<survey.minimumGap then
   s.storyNotice='ここから見える岩の間は狭く、奥へ続いていません。別の地点から見比べてください。'
   return true,false
  end
  return true,true
 end

 function views.observe(s,f,draws,survey,step)
  for _,point in ipairs(survey.points) do
   local x,y=point.x-s.camera,point.y
   if x>=-65 and x<=1025 then
    draws[#draws+1]={kind='rect',x=x-18,y=y-7,w=36,h=7,color='#6f5b51'}
    draws[#draws+1]={kind='rect',x=x-4,y=y-38,w=8,h=31,color='#805c48'}
    draws[#draws+1]={kind='rect',x=x-13,y=y-43,w=29,h=10,color='#e2ba74'}
    draws[#draws+1]={kind='text',x=x,y=y-51,text=point.name,color='#fff2cf',size=14}
   end
  end
  if s.paused or s.lift then return end
  local point=nearby(s,survey)
  if not point then return end
  local rocks,gap=projection(survey,point)
  local line=point.line or (gap>=survey.minimumGap and '足元まで続く岩の切れ目が見えます。'
             or gap>0 and '細い切れ目の奥は岩で塞がれています。'
             or '三つの岩が重なって、一つの城のように見えます。')
  f.storyRockView={id=point.id,name=point.name,rocks=rocks,gap=gap,minimumGap=survey.minimumGap,line=line}
  if step and step.shadowChoice then f.storyNearbyMilestone={label='ここから見える切れ目を確かめる'} end
 end

 return views
end
