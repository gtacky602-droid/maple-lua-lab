return function(C,canInspect)
 local training={}
 local canAttack=C.canAttack
 function C.canAttack(s)
  return (not s.iansanVenue or not not s.iansanRound) and (not canAttack or canAttack(s))
 end

 local function near(s,point)
  local actor=s.actors[s.active]
  return actor.ground and canInspect(actor,point)
 end

 local function place(s,point)
  local partner=3-s.active
  for i,a in ipairs(s.actors) do
   a.x,a.y,a.vy,a.ground,a.dir=point.x-(i==partner and 38 or 0),point.y,0,true,1
   a.buffer,a.walk,a.dash,a.leap,a.drop,a.glide=0,0,0,0,0,0
  end
  s.camera=math.max(0,math.min(point.x-400,s.worldwidth-960))
 end

 local function discard(s)
  local r=s.iansanRound
  if not r then return end
  s.iansanRound=nil
  s.pending,s.macro,s.enemies={},nil,{}
  s.gauge,s.auto,s.hits,s.damage=r.gauge,r.auto,r.gameHits,r.gameDamage
  for i,a in ipairs(s.actors) do a.hp=r.hp[i];a.channel=nil end
 end

 function training.enter(s,venue)
  discard(s)
  s.iansanVenue=venue
  s.iansanPanel,s.iansanLatest=nil,nil
 end

 local function start(s,spec,state)
  if state.count==2 then return false end
  local r={started=s.t,stopped={0,0,0},hits=0,marker=false,waterUsed=false,gauge=s.gauge,
           auto=s.auto,hp={s.actors[1].hp,s.actors[2].hp},gameHits=s.hits,gameDamage=s.damage}
  s.iansanRound,s.iansanPanel=r,nil
  s.auto=false
  s.pending,s.macro={},nil
  place(s,spec.start)
  for _,a in ipairs(s.actors) do
   a.hp=a.maxhp
   a.inv=0
   a.channel=nil
  end
  local actor=s.actors[s.active]
  r.lastX,r.lastActor=actor.x,actor.id
  s.iansanTargetSeries=(s.iansanTargetSeries or 0)+1
  s.enemies={}
  for i,spot in ipairs(spec.targets) do
   s.enemies[i]={id=-684000-s.iansanTargetSeries*10-i,x=spot.x,home=spot.x,y=spot.y,
                 kind=1,hp=spot.hp,maxhp=spot.hp,custom=true,noRewards=true,noAutoTarget=true,respawn=math.huge,
                 drawHeight=70,hitTop=spot.y-70,hitBottom=spot.y,warning=0}
  end
  s.storyNotice='上段の印に触れ、訓練的を三つ壊して、予告床の先の旗まで進みます。'
  return true
 end

 function training.interact(s,q,state)
  if not s.iansanVenue or not state or state.count<1 then return false end
  local spec,r=q.iansanTraining,s.iansanRound
  if r then
   if near(s,spec.recovery) then
    if not r.waterUsed then
     local a=s.actors[s.active]
     C.healActor(s,a,spec.recoveryHp)
     r.waterUsed=true
     s.storyNotice='ここで一息つきました。隣の床の合図を見て進みましょう。'
    end
   else
    discard(s)
    place(s,spec.board)
    s.storyNotice='計測を中断し、記録台へ戻りました。'
   end
   return true
  end
  if not near(s,spec.board) then return false end
  if state.count==1 or state.count==3 then return start(s,spec,state) end
  s.iansanPanel=true
  return true
 end

 function training.panelAction(s,q,state,key)
  if key=='story_iansan_close' or key=='story_collect' then s.iansanPanel=nil;return end
  if s.paused or not state or not near(s,q.iansanTraining.board) then return end
  if key=='story_iansan_replay' and state.count>=4 then
   start(s,q.iansanTraining,state)
   return
  end
  local focus=key:match('^story_iansan_focus:(%a+)$')
  if state.count==2 and focus then
   for _,option in ipairs(q.iansanTraining.focus) do
    if option.id==focus then
     state.trainingLog.focus=focus
     s.iansanPanel=nil
     return q.itinerary[3]
    end
   end
  end
 end

 local function padPhase(r,p,t)
  local elapsed=t-r.started
  local turn=(elapsed+p.offset)%p.period
  if turn<p.active then return 'active' end
  if turn>=p.period-p.warning then return 'warning' end
  return 'quiet'
 end

 local function sector(spec,x)
  for i,right in ipairs(spec.boundaries) do if x<right then return i end end
  return #spec.sectors
 end

 local function remaining(s)
  local count=0
  for _,target in ipairs(s.enemies) do if target.hp>0 then count=count+1 end end
  return count
 end

 local function finish(s,q,state,r)
  local spec=q.iansanTraining
  local ticks=math.max(1,math.floor(math.min(360000,(s.t-r.started)*60)+.0001))
  local result={ticks=ticks,hits=r.hits,stopped={}}
  local budget=ticks
  for i,n in ipairs(r.stopped) do
   result.stopped[i]=math.min(budget,math.floor(n+.0001))
   budget=budget-result.stopped[i]
  end
  result.hits=math.min(result.hits,result.ticks)
  discard(s)
  place(s,spec.board)
  s.iansanPanel=true
  if state.count==1 then
   state.trainingLog={baseline=result}
   return q.itinerary[2]
  elseif state.count==3 then
   state.trainingLog.retest=result
   return q.itinerary[4]
  end
  s.iansanLatest=result
  s.storyNotice='今回の一周を最初の記録と見比べられます。'
 end

 function training.step(s,q,state,dt)
  local spec,r=q.iansanTraining,s.iansanRound
  if not r then return end
  local a=s.actors[s.active]
  local placeIndex=sector(spec,a.x)
  if a.id==r.lastActor and a.ground and math.abs(a.x-r.lastX)<.65 then
   r.stopped[placeIndex]=r.stopped[placeIndex]+dt*60
  end
  r.lastX,r.lastActor=a.x,a.id
  if not r.marker and near(s,spec.marker) then
   r.marker=true
   s.storyNotice='上段の印を通りました。次は地上の訓練的です。'
  end
  for i,pad in ipairs(spec.pads) do
   if padPhase(r,pad,s.t)=='active' and a.x>=pad.left and a.x<=pad.right and a.y>pad.y-44 then
    local damage=C.damageActor(s,a,math.min(pad.damage,a.hp-1),{id=-684000-i,x=(pad.left+pad.right)/2,y=pad.y},true,true)
    if damage>0 then r.hits=r.hits+1 end
   end
  end
  if r.marker and remaining(s)==0 and near(s,spec.finish) then return finish(s,q,state,r) end
  if a.x>=spec.finish.x-35 and not r.marker then
   s.storyNotice='上段の印を通ってから、旗に戻ります。'
  elseif a.x>=spec.finish.x-35 and remaining(s)>0 then
   s.storyNotice='訓練的が残っています。三つ壊してから、旗に戻ります。'
  end
 end

 function training.checkpoint(s,d)
  local r=s.iansanRound
  if r then d.gauge,d.hits,d.damage=r.gauge,r.gameHits,r.gameDamage end
 end

 local function suggestion(spec,record)
  local first=record.baseline
  local index=2
  if first.hits>0 then index=3
  else
   for i,n in ipairs(first.stopped) do if n>first.stopped[index] then index=i end end
  end
  return spec.focus[index]
 end

 function training.observe(f,s,draws,node,q,state,mode,profile)
  if not state then return end
  local spec,props=q.iansanTraining,C.iansanTrainingArt
  local world={draws=draws}
  local function art(id,x,y,h,width)
   local sprite=props[id]
   x=x-s.camera
   local w=h*sprite.box[3]/sprite.box[4]
   if width then h=h*width/w;w=width end
   if x+w/2>=0 and x-w/2<=960 then C.drawFieldDisplayArt(world,sprite,x,y,h,mode,profile) end
  end
  local function text(x,y,label)
   x=x-s.camera
   if x>=-70 and x<=1030 then draws[#draws+1]={kind='text',x=x,y=y,text=label,color='#fff0b4',size=14} end
  end
  if node.id==q.hub then
   if state.count==0 then art('board',q.itinerary[1].x,480,70) end
   return
  end
  local r,record=s.iansanRound,state.trainingLog
  local view={running=not not r,panel=not not s.iansanPanel,paused=s.paused,message=s.storyNotice}
  local function action(label)
   if not s.paused and not f.storyNearbyMilestone then f.storyNearbyMilestone={label=label} end
  end
  art('board',spec.board.x,480,83)
  art('marker',spec.marker.x,spec.marker.y,55)
  art('water',spec.recovery.x,spec.recovery.y,68)
  art('flag',spec.finish.x,spec.finish.y,86)
  text(spec.marker.x,spec.marker.y-66,r and r.marker and '通過済み' or '上段の印')
  text(spec.finish.x,spec.finish.y-97,'折り返しの旗')
  for _,p in ipairs(spec.pads) do
   art('pad',(p.left+p.right)/2,p.y,31,p.right-p.left)
   local phase=r and padPhase(r,p,s.t)
   if phase=='warning' or phase=='active' then
    local x=p.left-s.camera
    if x+p.right-p.left>0 and x<960 then
     draws[#draws+1]={kind='rect',x=x,y=p.y-3,w=p.right-p.left,h=3,color=phase=='active' and '#f38868' or '#ffd789'}
     text((p.left+p.right)/2,p.y-44,phase=='active' and '接触に注意' or 'もうすぐ光る')
    end
   end
  end
  if r then
   for _,target in ipairs(s.enemies) do
    if target.hp>0 then art('dummy',target.x,target.y,70) end
   end
   view.marker,view.remaining,view.hits=r.marker,remaining(s),r.hits
   view.ticks=math.floor(math.min(360000,(s.t-r.started)*60))
   if near(s,spec.recovery) then
    action(r.waterUsed and '水場は利用済み' or '水場で回復する')
   else action('試走を中断する') end
  elseif near(s,spec.board) then
   action(s.iansanPanel and '記録台を閉じる' or state.count==1 and '最初の一周を始める'
    or state.count==3 and 'もう一周する' or '記録台を見る')
  end
  if s.iansanPanel and record then
   local hint=suggestion(spec,record)
   view.baseline,view.retest,view.latest=record.baseline,record.retest,s.iansanLatest
   view.focus,view.suggestion,view.sectors=record.focus,hint,spec.sectors
   view.options,view.replay=state.count==2 and spec.focus or nil,state.count>=4
   if record.focus then
    for _,option in ipairs(spec.focus) do if option.id==record.focus then view.focusLabel=option.label end end
   end
  end
  f.storyIansan=view
 end

 return training
end
