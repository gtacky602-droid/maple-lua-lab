return function(C,canInspect)
 local visitors={}
 local heights={instrument=94,satchel=43,traces=20,sample=51,cabinet=99,cabinetClosed=99}

 function visitors.quiet(s,q)
  return not s.visitorDeparture or s.t-s.visitorDeparture.at>=q.observation.departureSeconds
 end

 function visitors.store(s,q)
  local actor=s.actors[s.active]
  s.visitorDeparture={at=s.t,x=actor.x-actor.dir*q.observation.followDistance}
 end

 function visitors.emit(s,q,emitCue)
  emitCue(s,'airflow',q.observation.notes,q.observation.pattern)
 end

 function visitors.toneAt(s,q,state)
  if not state or s.paused then return end
  for index=math.min(#q.itinerary,state.count+1),1,-1 do
   local mark=q.itinerary[index]
   if mark.observationTone and mark.node==s.story.node and canInspect(s.actors[s.active],mark) then
    if mark.compareAfterStorage and not visitors.quiet(s,q) then return end
    return mark,index<=state.count
   end
  end
 end

 function visitors.reread(s,q,state,emitCue)
  local mark,completed=visitors.toneAt(s,q,state)
  if not completed then return false end
  visitors.emit(s,q,emitCue)
  s.storyNotice=state.status=='complete' and q.observation.revisitNotice or mark.notice
  return true
 end

 local function picture(f,s,sprite,x,y,height,mode,profile)
  x=x-s.camera
  local w=height*sprite.box[3]/sprite.box[4]
  if x+w/2>=0 and x-w/2<=960 then
   C.drawFieldDisplayArt(f,sprite,x,y,height,mode,profile,false)
  end
 end

 local function label(f,s,prop,height)
  local x,y=prop.x-s.camera,prop.y-height-19
  local w=utf8.len(prop.label)*14+16
  if x-w/2>=0 and x+w/2<=960 then
   f.draws[#f.draws+1]={kind='rect',x=x-w/2,y=y-17,w=w,h=22,color='#253f3bee'}
   f.draws[#f.draws+1]={kind='text',x=x,y=y,text=prop.label,size=14,color='#f6edcc'}
  end
 end

 function visitors.observe(f,s,site,q,state,mode,profile)
  if not state then return end
  local spec=q.observation
  local carrying=state.count==spec.pickupCount
  local stored=state.count>=spec.storedCount
  local propArt=C.observationVisitorsArt
  for _,prop in ipairs(site.props) do
   if (not prop.after or state.count>=prop.after) and (prop.key~='sample' or not (carrying or stored)) then
    local key=prop.key=='cabinet' and stored and 'cabinetClosed' or prop.key
    local height=heights[key]
    picture(f,s,propArt[key],prop.x,prop.y,height,mode,profile)
    label(f,s,prop,height)
   end
  end
  local observer=site.observer
  local sample,observerX,quiet
  local message=site.message
  local milestone=q.itinerary[state.count+1]
  if milestone and milestone.node==s.story.node and milestone.kind=='inspect' then message=milestone.objective end
  if site.nextMessage and (not milestone or milestone.node~=s.story.node) then message=site.nextMessage end
  if observer and state.count>=spec.pickupCount-2 then
   quiet=stored and visitors.quiet(s,q)
   observerX=observer.x
   if carrying then
    local a=s.actors[s.active]
    picture(f,s,propArt.sample,a.x+a.dir*29,a.y-16,35,mode,profile)
    observerX=a.x-a.dir*spec.followDistance
   elseif stored then
    local departure=s.visitorDeparture
    local residue=quiet and 0 or 1-(s.t-departure.at)/spec.departureSeconds
    observerX=observer.restX+(departure and (departure.x-observer.restX)*residue or 0)
   end
   local y=observer.y+math.sin(s.t*4)*4
   picture(f,s,C.enemyIdleArt['dendro-fungus'],observerX,y,43,mode,profile)
   sample=stored and 'stored' or carrying and 'carried' or 'stand'
   if stored then
    if not quiet then message='標本棚からキノコンが離れていきます。'
    elseif state.status=='complete' then message='星葉草は棚に保管されています。観測器の音をもう一度聞けます。'
    elseif state.count==q.goal then message='観察結果を持って、右の門から広場へ戻れます。' end
   end
  end
  local tone,previouslyRecorded=visitors.toneAt(s,q,state)
  if previouslyRecorded and not f.storyNearbyMilestone then
   f.storyNearbyMilestone={label='観測器の音をもう一度聞く'}
  end
  f.storyObservationVisitors={toneReady=tone~=nil,sample=sample,observerX=observerX,quiet=quiet,message=message}
 end

 return visitors
end
