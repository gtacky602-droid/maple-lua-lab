return function(C,canInspect)
 local hunt={}

 local function find(sites,id)
  for _,site in ipairs(sites) do
   if site.id==id then return site end
  end
 end

 local still={range=0,speed=0,leash=0}

 local function depart(current)
  current.phase='retreat'
  current.enemy.home=current.enemy.x
  current.enemy.pursuit=still
 end

 function hunt.enter(s,q,state)
  s.kinichHunt=nil
  if not q or not state or state.count~=1 then return end
  local spec=q.kinichHunt
  for _,enemy in ipairs(s.enemies) do
   if enemy.spawnId==spec.enemy then
    enemy.storyDrawn=true
    enemy.boss,enemy.expRole,enemy.rewardMora=true,'elite',35
    enemy.drawHeight=112
    enemy.hitBottom,enemy.hitTop=enemy.y,enemy.y-enemy.drawHeight
    local current={enemy=enemy,phase='scouting',pursuit=enemy.pursuit,dir=-1}
    s.kinichHunt=current
    if state.huntNotes and state.huntNotes.tracks and state.huntNotes.branch then depart(current) end
    return
   end
  end
 end

 local function both(notes) return notes and notes.tracks and notes.branch end

 function hunt.interact(s,q,state)
  local current=s.kinichHunt
  if not current or not state or state.count~=1 then return false end
  local spec,actor=q.kinichHunt,s.actors[s.active]
  for _,clue in ipairs(spec.clues) do
   if canInspect(actor,clue) then
    state.huntNotes=state.huntNotes or {}
    local notes=state.huntNotes
    notes[clue.id]=true
    s.storyNotice=clue.notice
    if both(notes) and current.phase=='scouting' then
     depart(current)
     s.storyNotice=s.storyNotice..' アハウ「逃げたぞ！」'
    end
    return true
   end
  end
  local notes=state.huntNotes
  if both(notes) and (not current.engaged or current.engaged=='direct') then
   for _,site in ipairs(spec.sites) do
    if canInspect(actor,site) then
     notes.site=site.id
     if current.phase=='scouting' then depart(current) end
     if current.engaged=='direct' then
      current.phase,current.engaged='return',nil
      local e=current.enemy
      e.patrolMin,e.patrolMax,e.pursuit=nil,nil,still
     end
     s.storyNotice='キィニチ「'..site.advice..'」'
     return true
    end
   end
  end
  return false
 end

 local function pace(current,x,maxDelta)
  local e=current.enemy
  local delta=x-e.x
  if math.abs(delta)<=maxDelta then e.x=x;return true end
  current.dir=delta<0 and -1 or 1
  e.x=e.x+current.dir*maxDelta
  return false
 end

 function hunt.step(s,dt,q,state)
  local current=s.kinichHunt
  if not current or current.enemy.hp<=0 or state.count~=1 then return end
  local e,spec=current.enemy,q.kinichHunt
  if current.phase=='scouting' then
   if e.hp<=e.maxhp*.76 then
    depart(current)
    s.storyNotice='アハウ「逃げたぞ、追え！」 キィニチ「先の岩で折り返す。ここでも前に回ってもいい。」'
   else
    local player=s.actors[s.active]
    current.dir=player.x<e.x and -1 or 1
   end
   return
  end
  local notes=state.huntNotes
  local site=notes and find(spec.sites,notes.site)
  local pacePerTick=spec.patrolSpeed*dt*C.enemyRate(e)
  if current.phase=='retreat' and pace(current,spec.turn,pacePerTick) then
   current.phase,current.turnedAt='turn',s.t
   s.storyNotice='牙獣が東の岩で折り返します。追いつかなくても戻ってきます。'
  elseif current.phase=='turn' and s.t-current.turnedAt>=(site and spec.delay or spec.wait) then
   current.phase='return'
  elseif current.phase=='return' and pace(current,site and site.home or spec.spawn,pacePerTick) then
   current.phase,current.engaged='engaged',site and site.id or 'direct'
   local span=site and site.span or current.pursuit.leash
   e.home,e.patrolMin,e.patrolMax=e.x,e.x-span,e.x+span
   e.pursuit={range=current.pursuit.range,speed=current.pursuit.speed,leash=span}
   s.storyNotice=site and 'キィニチ「戻ってきた。下を通るところで合わせよう。」'
                        or '牙獣が通り道に戻りました。'
  elseif current.phase=='engaged' then
   current.dir=s.actors[s.active].x<e.x and -1 or 1
  end
 end

 function hunt.defeat(s,q,state)
  local current=s.kinichHunt
  state.huntNotes=state.huntNotes or {}
  state.huntNotes.outcome=(current and current.engaged) or 'direct'
  if current then current.phase='cleared' end
  s.storyNotice=q.kinichHunt.reports[state.huntNotes.outcome]
 end

 function hunt.report(q,state)
  local notes=state.huntNotes
  return q.kinichHunt.reports[notes and notes.outcome or 'direct']..' '..q.closing
 end

 function hunt.observe(f,s,target,node,q,state,mode,profile)
  if not state then return end
  local spec,notes=q.kinichHunt,state.huntNotes
  local props=C.kinichHuntArt
  local draws=target.draws
  local function art(sprite,x,y,h,flip)
   local half=h*sprite.box[3]/sprite.box[4]/2
   local localX=x-s.camera
   if localX+half>=0 and localX-half<=960 then C.drawFieldDisplayArt(target,sprite,localX,y,h,mode,profile,flip) end
  end
  local function label(x,y,text,color)
   x=x-s.camera
   if x>=-65 and x<=1025 then draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color=color or '#fff0ba'} end
  end
  if node.id==q.hub then
   if state.count==0 then
    local meeting=q.itinerary[1]
    art(props.marker,meeting.x,meeting.y,54)
    label(meeting.x,meeting.y-66,meeting.name)
   end
   return
  end
  local current=s.kinichHunt
  local actor=s.actors[s.active]
  local function showAction(p,message)
   if current and not s.paused and not f.storyNearbyMilestone and canInspect(actor,p) then
    f.storyNearbyMilestone={label=message}
   end
  end
  art(props.cover,515,480,69)
  art(props.cover,790,480,82)
  for _,clue in ipairs(spec.clues) do
   local h=clue.id=='tracks' and 23 or 34
   art(props[clue.id],clue.x,clue.y,h)
   if state.count==1 then label(clue.x,clue.y-h-10,clue.label) end
   if state.count==1 then showAction(clue,clue.action) end
  end
  if both(notes) and state.count==1 then
   for _,site in ipairs(spec.sites) do
    local selected=site.id==notes.site
    art(props.marker,site.x,site.y,selected and 62 or 48)
    label(site.x,site.y-(selected and 74 or 58),selected and site.label..'（待ち伏せ先）' or site.label,
          selected and '#ffdf83' or nil)
    if current and (not current.engaged or current.engaged=='direct') then showAction(site,site.label..'で待ち伏せする') end
   end
  end
  local view={message=s.storyNotice,phase=current and current.phase or 'cleared',
              tracks=notes and notes.tracks or false,branch=notes and notes.branch or false,
              site=notes and notes.site,outcome=notes and notes.outcome}
  if current and current.enemy.hp>0 then
   local e=current.enemy
   art(C.enemyIdleArt[e.art],e.x,e.y,e.drawHeight,current.dir>0)
   label(e.x,e.y-e.drawHeight-18,e.storyName)
   view.beast={x=e.x,hp=e.hp,maxhp=e.maxhp}
  end
  f.storyKinichHunt=view
 end

 return hunt
end
