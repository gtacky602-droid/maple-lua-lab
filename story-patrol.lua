return function(C,canInspect)
 local patrol={}
 local warm='#ffe5a5'

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function caption(draws,x,y,line,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=line,size=14,color=color or warm}
 end

 local function art(layer,id,x,y,h,mode,profile)
  if x < -160 or x > 1120 then return end
  C.drawFieldDisplayArt(layer,C.patrolArt[id],x,y,h,mode,profile,false)
 end

 local function livingShooter(s,config)
  for _,enemy in ipairs(s.enemies) do
   if enemy.spawnId==config.shooter and C.canTargetEnemy(enemy) then return enemy end
  end
 end

 local function nearest(s,e)
  local closest,dist=nil,420
  for _,actor in ipairs(s.actors) do
   local dx,dy=actor.x-e.x,actor.y-e.y
   local d=math.sqrt(dx*dx+dy*dy)
   if actor.hp>0 and d<dist then closest,dist=actor,d end
  end
  return closest
 end

 function patrol.update(s,config)
  if not config or not config.shooter then return end
  local enemy=livingShooter(s,config)
  local shot=s.storyPatrolShot
  if not enemy then s.storyPatrolShot=nil;return end
  if shot then
   if shot.fired then
    if s.t>=shot.readyAt then s.storyPatrolShot=nil end
   elseif s.t>=shot.releaseAt then
    local angle=math.atan(shot.ty-shot.y,shot.tx-shot.x)
    C.spawnEnemyProjectile(s,shot.x,shot.y,shot.target,angle,
      {speed=304,damage=12,life=1.65,homingTime=0,source=enemy.id,color='#ffcf88'})
    shot.fired=true
    shot.readyAt=s.t+2.35
   end
   return
  end
  local target=nearest(s,enemy)
  if target then
   s.storyPatrolShot={x=enemy.x,y=enemy.y-36,tx=target.x,ty=target.y-29,target=target.id,releaseAt=s.t+.82}
  end
 end

 function patrol.rest(s,config,q,state)
  if not config.table or not state or state.count<q.goal or not canInspect(s.actors[s.active],config.table) then return false end
  for _,actor in ipairs(s.actors) do
   if actor.hp>0 then actor.hp=actor.maxhp end
  end
  s.storyNotice='温かいお茶と焼き菓子でひと休み。体力を回復しました。'
  return true
 end

 local function lamps(s,layer,config,mode,profile)
  local draws=layer.draws
  for _,lamp in ipairs(config.lamps or {}) do
   local x,y=lamp.x-s.camera,lamp.y
   if x>=-44 and x<=1004 then
    rect(draws,x-25,y-4,50,4,'#ba9a6669')
    art(layer,'lantern',x,y,53,mode,profile)
   end
  end
 end

 local function tea(s,f,layer,config,q,count,mode,profile)
  local draws=layer.draws
  local table= config.table
  local x,y=table.x-s.camera,table.y
  local ready=count>=q.goal-1
  rect(draws,x-100,y-54,200,10,'#895d54')
  rect(draws,x-100,y-54,200,3,'#dbab7a')
  rect(draws,x-88,y-44,10,44,'#50404c')
  rect(draws,x+78,y-44,10,44,'#50404c')
  if ready then
   art(layer,'tea',x-27,y-54,51,mode,profile)
   art(layer,'biscuits',x+63,y-54,27,mode,profile)
   if x>=-20 and x<=980 then
    local phase=math.floor(s.t*12+1e-6)
    for offset=0,2 do
     local rise=(phase+offset*5)%15
     local drift=math.floor(rise/3)
     local color=rise<9 and '#ffe9cba8' or '#ffe9cb59'
     rect(draws,x-4+drift,y-73-rise*2,4,2,color)
    end
   end
   caption(draws,x,y-126,'温かいお茶と焼き菓子')
  end
  if count>=q.goal and not s.paused and canInspect(s.actors[s.active],table) then
   f.storyNearbyMilestone={label='茶卓でひと休みする'}
  end
  return ready
 end

 local function bend(s,f,draws,config)
  local e=livingShooter(s,config)
  local a=s.actors[s.active]
  local looked=not e and a.ground and a.y<=290
  local ground=0
  for _,foe in ipairs(s.enemies) do
   if foe.y==480 and C.canTargetEnemy(foe) then
    ground=ground+1
    if looked then rect(draws,foe.x-s.camera-14,C.enemyHeadY(foe)-14,28,3,'#fcdb95') end
   end
  end
  local shot=s.storyPatrolShot
  local warning=e and shot and not shot.fired
  if e then
   local x,y=e.x-s.camera,C.enemyHeadY(e)
   rect(draws,x-24,y-4,7,2,'#fff3be')
   rect(draws,x+17,y-4,7,2,'#fff3be')
   caption(draws,x,y-12,warning and '投石の予兆' or '高台の投石役',warning and '#ffb06a' or warm)
  end
  if warning then
   for i=1,12 do
    local t=i/13
    local x=shot.x+(shot.tx-shot.x)*t-s.camera
    local y=shot.y+(shot.ty-shot.y)*t
    rect(draws,x-3,y-2,6,4,'#ffdb98e5')
   end
   local x,y=shot.tx-s.camera,shot.ty
   rect(draws,x-10,y-1,20,2,'#ffaf68')
   rect(draws,x-1,y-10,2,20,'#ffaf68')
  end
  f.storyPatrol={shooterAlive=not not e,ground=ground,lookout=looked and ground>0,
   warning=warning and {x=shot.tx,y=shot.ty,seconds=math.max(0,shot.releaseAt-s.t)} or nil,
   message=warning and '高台からの投石 ｜ 点線で示した位置を狙っています'
    or looked and ground>0 and '高台を確保 ｜ 灯りの先で足場を降り、地上の魔物を退ける（残り'..ground..'体）'
    or e and '二段の岩棚から投石役に近づけます'
    or ground>0 and '地上に魔物が残っています（'..ground..'体）'
    or '曲がり角は安全です。奥の合流標へ。'}
 end

 function patrol.observe(s,f,layer,config,q,state,mode,profile)
  local draws=layer.draws
  local count=state and state.count or 0
  if config.table then
   local ready=tea(s,f,layer,config,q,count,mode,profile)
   if ready then f.storyPatrol={tea=true,message=count>=q.goal and '灯台守の暖房小屋 ｜ 茶卓で休めます' or nil} end
  else
   lamps(s,layer,config,mode,profile)
   if config.shooter then bend(s,f,draws,config) end
  end
 end

 return patrol
end
