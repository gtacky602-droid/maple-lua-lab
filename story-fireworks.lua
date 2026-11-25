return function(C,canInspect)
 local fireworks={}
 local cream='#fff0cf'

 local function rect(draws,x,y,w,h,color,opacity)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color,opacity=opacity}
 end

 local function text(draws,x,y,caption,size)
  draws[#draws+1]={kind='text',x=x,y=y,text=caption,size=size or 15,color=cream}
 end

 local function label(draws,x,y,caption)
  local width=14*utf8.len(caption)+18
  if x>=width/2 and x<=960-width/2 then
   rect(draws,x-width/2,y-17,width,22,'#28223be8')
   text(draws,x,y,caption,14)
  end
 end

 local function art(draws,key,x,y,height,mode,profile)
  if x>=-95 and x<=1055 then
   C.drawFieldDisplayArt({draws=draws},C.fireworkArt[key],x,y,height,mode,profile,false)
  end
 end

 local function option(options,id)
  for _,entry in ipairs(options) do if entry.id==id then return entry end end
 end

 local function design(q,state)
  return state.fireworkDesign or {color=q.fireworks.colors[1].id,shape=q.fireworks.shapes[1].id}
 end

 local function ready(s,q,state)
  local actor=s.actors[s.active]
  return state and state.count>=q.goal-1 and not s.paused and not s.fireworkShow
     and actor.ground and canInspect(actor,q.itinerary[q.goal])
 end

 function fireworks.select(s,q,state,field,id)
  if not ready(s,q,state) or state.count~=q.goal-1 then return end
  local options=field=='color' and q.fireworks.colors or field=='shape' and q.fireworks.shapes
  if options and option(options,id) then
   local draft=design(q,state)
   draft[field]=id
   state.fireworkDesign=draft
  end
 end

 function fireworks.start(s,q,state)
  if not ready(s,q,state) then return false end
  state.fireworkDesign=design(q,state)
  s.fireworkShow={start=s.t}
  return true
 end

 function fireworks.finished(s,q)
  if not s.fireworkShow then return false end
  local durations=q.fireworks
  if s.t-s.fireworkShow.start<durations.windowSeconds+durations.riseSeconds+durations.burstSeconds then return false end
  s.fireworkShow=nil
  return true
 end

 local function sightMap(step)
  local spec=step.fireworkSight
  local a,b,block=spec.window,spec.burst,spec.obstacle
  local dx,dy=b.x-a.x,b.y-a.y
  local left,right=(block.x-a.x)/dx,(block.x+block.w-a.x)/dx
  local p,q=(block.y-a.y)/dy,(block.y+block.h-a.y)/dy
  local first=math.max(0,left,math.min(p,q))
  local hit=first<=math.min(1,right,math.max(p,q))
  local status=not hit and 'clear' or block.partial and 'partial' or 'blocked'
  local segments={}
  if hit then
   local impact={a.x+dx*first,a.y+dy*first}
   segments[1]={color='#f3cc9d',points={{a.x,a.y},impact}}
   segments[2]={color='#bd8f9d',points={impact,{b.x,b.y}},dashed=true}
  else segments[1]={color='#7be1cd',points={{a.x,a.y},{b.x,b.y}}} end
  local result=({clear='窓から全体が見える',partial='枝に一部がかかる',blocked='崖で窓から隠れる'})[status]
  return {id='firework-'..step.x,status=status,caption=step.name..' ｜ '..result,
   blocks={{x=block.x,y=block.y,w=block.w,h=block.h,label=block.label}},
   routes=segments,marks={{x=a.x,y=a.y,name='家の窓',below=true},{x=b.x,y=b.y,name='開く位置'}}}
 end

 function fireworks.survey(s,f,draws,q,state,mode,profile)
  if not state then return end
  local reads={}
  for index,step in ipairs(q.itinerary) do
   if step.fireworkSight and index<=state.count+1 then
    local x=step.x-s.camera
    art(draws,'marker',x,step.y,46,mode,profile)
    label(draws,x,step.y-107,step.name)
    if index<=state.count then
     local reading=sightMap(step)
     reads[#reads+1]=reading.caption
     if canInspect(s.actors[s.active],step) then f.storySurveyMap=reading end
    end
   end
  end
  if #reads>0 then f.storyFireworkStatus={message=table.concat(reads,'　／　')} end
 end

 -- Keep the particle centers in draw order. Glow and core share one style.
 local function sparkLayer(draws,paint,packed)
  if not packed then return draws end
  local batch={kind='firework_sparks',glow=paint.glow,bright=paint.bright,styles={},points={}}
  draws[#draws+1]=batch
  return {batch=batch,styleIndex={}}
 end

 local function spark(draws,x,y,size,paint,alpha)
  if draws.batch then
   local batch=draws.batch
   local byAlpha=draws.styleIndex[size]
   if not byAlpha then byAlpha={};draws.styleIndex[size]=byAlpha end
   local style=byAlpha[alpha]
   if not style then
    style=#batch.styles+1
    batch.styles[style]={size,alpha}
    byAlpha[alpha]=style
   end
   local points=batch.points
   local i=#points
   points[i+1],points[i+2],points[i+3]=x,y,style
   return
  end
  rect(draws,x-size,y-size,size*2,size*2,paint.glow,alpha*.55)
  rect(draws,x-size/2,y-size/2,size,size,paint.bright,alpha)
 end

 local function burst(draws,x,y,radius,shape,paint,alpha,packed)
  draws=sparkLayer(draws,paint,packed)
  for i=0,35 do
   local angle=i/36*math.pi*2
   local length=radius
   if shape=='chrysanthemum' then
    length=radius*(.73+.27*math.cos(angle*6))
   elseif shape=='fan' then
    angle=-math.pi+math.pi*i/35
   end
   local px=x+math.cos(angle)*length
   local py=y+math.sin(angle)*length
   if shape=='fan' and i%4==0 then
    for j=1,5 do
     local t=.19+j*.13
     spark(draws,math.floor(x+(px-x)*t),math.floor(y+(py-y)*t),2+j*.45,paint,alpha*(.25+j*.128))
    end
   elseif shape~='fan' and i%2==0 then
    local t=.78+(i%5)*.03
    spark(draws,math.floor(x+(px-x)*t),math.floor(y+(py-y)*t),3,paint,alpha*.64)
   end
   spark(draws,math.floor(px),math.floor(py),i%3==0 and 5.5 or 3.75,paint,alpha)
  end
  if shape=='fan' then spark(draws,x,y,7,paint,alpha*.85) end
 end

 function fireworks.beach(s,f,draws,q,state,mode,profile)
  if not state then return end
  local stage,spec=q.itinerary[q.goal],q.fireworks
  local x,y=stage.x-s.camera,stage.y
  art(draws,'stand',x,y,45,mode,profile)
  local choice=design(q,state)
  local paint=option(spec.colors,choice.color)
  local shape=option(spec.shapes,choice.shape)
  local cue=paint.label..'・'..shape.label
  local show=s.fireworkShow
  if not show then
   label(draws,x,y-99,state.count>=q.goal and cue or stage.name)
   if ready(s,q,state) and not f.storyNearbyMilestone then
    f.storyNearbyMilestone={label=state.count>=q.goal and '記録した花火をもう一度見る' or '選んだ花火を打ち上げる'}
    if state.count<q.goal then
     f.storyFireworkDesign={colors=spec.colors,shapes=spec.shapes,color=choice.color,shape=choice.shape}
     rect(draws,563,39,164,111,'#131c37dd')
     burst(draws,645,105,31,choice.shape,paint,1,s.packFireworks)
     text(draws,645,59,cue,13)
    end
   end
   return
  end
  draws=f.draws
  local time=s.t-show.start
  if time<spec.windowSeconds then
   rect(draws,0,0,960,540,'#101529cc')
   art(draws,'window',480,382,261,mode,profile)
   text(draws,480,416,'窓辺で、家族が空を見上げる。',19)
   f.storyFireworkStatus={phase='window',message='窓辺の家族',design=choice}
  elseif time<spec.windowSeconds+spec.riseSeconds then
   local p=(time-spec.windowSeconds)/spec.riseSeconds
   draws=sparkLayer(draws,paint,s.packFireworks)
   for i=0,7 do
    local t=math.max(0,p-i*.037)
    spark(draws,x+(480-x)*t,y-45+(151-y+45)*t,5-i*.35,paint,1-i/9)
   end
   f.storyFireworkStatus={phase='rise',message='海辺から、光が上がっていく。',design=choice}
  else
   local p=(time-spec.windowSeconds-spec.riseSeconds)/spec.burstSeconds
   fireworks.bloom(draws,p,choice.shape,paint,s.packFireworks)
   f.storyFireworkStatus={phase='burst',message=cue,design=choice,progress=p}
  end
 end

 function fireworks.bloom(draws,p,shape,paint,packed)
  local radius=28+96*(1-(1-p)^2)
  burst(draws,480,169+15*p*p,radius,shape,paint,math.max(.04,(1-p)^.65),packed)
 end

 return fireworks
end
