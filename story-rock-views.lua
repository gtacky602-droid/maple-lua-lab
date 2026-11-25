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

 -- All three rubbings share the same silhouette. Only the frost-line ink changes.
 local outcrop={{-23,-30,46,30,1},{-17,-39,34,27,2}}
 for stripe=-1,1 do
  for step=0,3 do outcrop[#outcrop+1]={stripe*9+step,-30-step*2,4,2,3} end
 end
 local ink={faint='#8199af',partial='#536e91',clear='#24456c'}
 function views.drawOutcrop(draws,x,y,angle)
  local palette={'#68869b','#b9d8e3',ink[angle]}
  for _,r in ipairs(outcrop) do
   draws[#draws+1]={kind='rect',x=x+r[1],y=y+r[2],w=r[3],h=r[4],color=palette[r[5]]}
  end
 end

 function views.shelter(C,s,f,layer,first,ridge,mode,profile)
  local desk=ridge.itinerary[3]
  local x,y=desk.x-s.camera,desk.y
  if x < -145 or x > 1105 then return end
  local drawings=layer.draws
  local function rect(left,top,w,h,color)
   drawings[#drawings+1]={kind='rect',x=x+left,y=y+top,w=w,h=h,color=color}
  end
  rect(-80,-111,160,68,'#44383b')
  rect(-76,-107,152,60,'#856751')
  for _,dx in ipairs({-69,61}) do rect(dx,-45,8,45,'#513f3b') end
  local entries={}
  local function mount(q,index)
   local state=s.story.quests[q.id]
   if not state or state.count<index then return end
   local point=q.itinerary[index]
   local color=ink[point.outcrop]
   local px=-69+#entries*35
   rect(px,-100,31,43,'#dfd4b9')
   rect(px+2,-97,27,31,'#adc0be')
   for stripe=0,2 do
    rect(px+4+stripe*8,-79,4,3,color)
    rect(px+7+stripe*8,-82,4,3,color)
   end
   rect(px+13,-103,5,7,'#6a5443')
   entries[#entries+1]={title=point.name,node=point.node,x=point.x,y=point.y,ink=color,caption=point.notice}
  end
  for i=2,4 do mount(first,i) end
  local final=s.story.quests[ridge.id]
  if final and final.count>=3 then mount(ridge,2) end
  for _,dx in ipairs({-94,94}) do
   C.drawFieldDisplayArt(layer,C.patrolArt.lantern,x+dx,y-46,43,mode,profile,false)
  end
  if #entries>0 and canInspect(s.actors[s.active],desk) then
   f.storyFrostPrints={entries=entries,shape=outcrop,stone='#68869b',snow='#b9d8e3'}
  end
 end

 return views
end
