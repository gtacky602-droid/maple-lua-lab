return function(C,canInspect)
 local bloom={}

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function caption(draws,x,y,text,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,color=color or '#e9e0fa',size=14}
 end

 local function art(draws,key,x,y,h,mode,profile)
  if x < -148 or x > 1108 then return end
  C.drawFieldDisplayArt({draws=draws},C.bloomArt[key],x,y,h,mode,profile,false)
 end

 local function bench(draws,x,y,width)
  rect(draws,x-width/2,y-10,width,8,'#60556b')
  rect(draws,x-width/2,y-11,width,3,'#ae95a0')
  rect(draws,x-width/2+7,y-3,6,3,'#363650')
  rect(draws,x+width/2-13,y-3,6,3,'#363650')
 end

 local function overhead(draws,x,y,mode,profile)
  rect(draws,x-50,y-119,100,115,'#9990b2')
  rect(draws,x-48,y-117,96,111,'#242345')
  art(draws,'overhead',x,y-27,82,mode,profile)
  caption(draws,x,y-11,'月花の内側','#ffe1ab')
 end

 function bloom.rest(s,q,state)
  local decoration=q.itinerary[q.goal]
  if not state or state.count<q.goal or not canInspect(s.actors[s.active],decoration) then return false end
  for _,actor in ipairs(s.actors) do
   if actor.hp>0 then actor.hp=actor.maxhp end
  end
  s.storyNotice='花飾りのそばでひと休み。月花を上から眺めながら、体力を回復しました。'
  return true
 end

 function bloom.follow(s)
  local leader,companion=s.actors[s.active],s.actors[3-s.active]
  if not leader.ground or not companion.ground or companion.hp<=0 or leader.y>=companion.y then return end
  for _,ledge in ipairs(s.platforms) do
   local rise=companion.y-ledge.y
   if rise>0 and rise<=100 and ledge.y>=leader.y and companion.x>=ledge.x and companion.x<=ledge.x+ledge.w then
    companion.buffer=.1
    return
   end
  end
 end

 function bloom.observe(s,f,draws,q,state,mode,profile)
  local config=q.bloom
  local a=s.actors[s.active]
  local count=state and state.count or 0
  local occupied=config.animals
  local lowX=(occupied[1].x+occupied[#occupied].x)/2-s.camera
  bench(draws,lowX,480,136)
  caption(draws,lowX,418,'前列席・先客あり')
  for _,animal in ipairs(occupied) do
   art(draws,animal.art,animal.x-s.camera,animal.y-10,animal.height,mode,profile)
  end

  local view,decorated,nearSeats=false,false,false
  local message
  for i,step in ipairs(q.itinerary) do
   local prop=step.bloomProp
   local x,y=step.x and step.x-s.camera,step.y
   if prop=='petal' or prop=='berry' then
    if count<i then
     art(draws,prop,x,y,20,mode,profile)
     if count==i-1 then caption(draws,x,y-29,step.name) end
    end
   elseif prop=='seats' and canInspect(a,step) then
    nearSeats=true
    message='先に来た動物たちが休んでいます。手前の岩棚から上へ。'
   elseif prop=='vista' then
    bench(draws,x,y,94)
    caption(draws,x,y-28,'上の見晴らし席')
    view=count>=i
    if view and a.y<324 then overhead(draws,x+117,y-26,mode,profile) end
   elseif prop=='charm' then
    rect(draws,x+31,y-59,5,59,'#696279')
    rect(draws,x+11,y-59,25,4,'#c8aabe')
    if count>=i then
     art(draws,'charm',x+16,y-22,38,mode,profile)
     decorated=true
     if not s.paused and canInspect(a,step) then
      f.storyNearbyMilestone={label='花飾りのそばで休む'}
      message='花飾りのある見晴らし席 ｜ Gで休む'
     end
    elseif count==i-1 then
     caption(draws,x+11,y-73,'花飾りの台')
    end
   end
  end
  local flower=config.flower
  art(draws,view and 'flower' or 'bud',flower.x-s.camera,flower.y,120,mode,profile)
  if view and a.y<324 and not message then
   message='上の見晴らし席 ｜ 月花の金色のしべが見えます'
  end
  f.storyBloom={opened=view,decorated=decorated,nearSeats=nearSeats,message=message}
 end

 return bloom
end
