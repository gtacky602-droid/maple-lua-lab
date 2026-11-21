return function(C)
 local D={}
 local basic={melee=true,ranged=true}
 local cards={melee='WP07',ranged='WP07_RANGED',eater='WP09',barrier='WP11',burst='WP12'}
 local names={melee='基本',ranged='小弾',warden='護衛',breeder='飼育',eater='捕食',barrier='障壁',burst='自爆'}
 local bodyColor={warden='#c6e5a3',breeder='#cbd07a',eater='#89aa54',barrier='#a8c38d',burst='#e0bb56'}
 local function ownLog(s,w,name,actor,value) C.combatEvent(s,'apep:'..name,actor or 0,w.primary.id,value or 0) end
 local function log(s,w,name,actor,value)
  for _,party in ipairs(s.parties or {s}) do ownLog(party,w,name,actor,value) end
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function near(x,other,r) return math.abs(x-other)<=r end
 local function live(e) return e and e.hp>0 end
 local function player(s) return s.actors[s.active] end
 local function owner(s,a) return s.actorOwners and s.actorOwners[a] or s end
 local function present(s,a) return live(a) and (not s.actorOwners or s.actorOwners[a]) end
 local function target(s,x,minY)
  if not s.parties then return player(s) end
  local best,distance
  for _,a in ipairs(s.actors) do
   local dx=math.abs(a.x-x)
   if a.hp>0 and a.y>=minY and (not distance or dx<distance) then best,distance=a,dx end
  end
  return best
 end
 local function contribution(s,w,id)
  if s.coop then C.coopContact(s,w.primary,id) end
 end
 local function reserve(s,w,d,roles,due)
  d.queue[#d.queue+1]={roles=roles,due=due,index=1}
  log(s,w,'WP06:queue',0,#roles)
 end
 function D.start(s,w,spec)
  local rule=spec.defense
  local d={t=0,progress=rule.start,delta=0,units={},walls={},spores={},queue={},waves={},serial=0,
    wallOrders=setmetatable({},{__mode='k'}),
    lastWave=rule.first,lastBurst=rule.burstStart-rule.burstInterval,kills=0}
  w.defense=d
  reserve(s,w,d,{'melee','ranged','ranged','melee'},rule.first)
 end
 function D.clear(s,w)
  local d=w.defense
  if not d then return end
  for _,list in ipairs({d.units,d.walls}) do for _,e in ipairs(list) do remove(s,e) end end
  w.defense=nil
 end
 local function clearWall(s,d,e)
  e.hp=0;remove(s,e)
  for party,order in pairs(d.wallOrders) do if order.wall==e then d.wallOrders[party]=nil end end
 end
 local function gone(s,w,spec,e,reason,owner)
  local d=w.defense
  if e.hp<=0 or not d then return end
  e.hp=0;remove(s,e)
  if live(e.breeder) then e.breeder.shell=math.max(0,e.breeder.shell-1) end
  if reason=='hit' then
   local points=basic[e.role] and spec.defense.kill or spec.defense.specialKill
   d.delta=d.delta+points;d.kills=d.kills+1
   log(s,w,'WP06:defeated',owner,e.id)
  else log(s,w,'WP06:'..reason,0,e.id) end
  for _,wall in ipairs(d.walls) do
   if wall.source==e then clearWall(s,d,wall) end
  end
 end
 local function hit(s,w,spec,cast,e,mult,color,element)
  if not live(e) or not w.defense then return false end
  if live(e.guard) then C.combatNumber(s,e,'保護','#c1efd0');return false end
  local resist=C.enemyResistance(cast,e,element)
  if resist>=1 then return false end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,resist)
  if e.role=='breeder' and e.shell>0 then n=math.max(1,math.floor(n*.33)) end
  n=math.min(n,e.hp)
  C.combatNumber(s,e,critical and (n..'!') or n,color)
  s.hits=s.hits+1;s.damage=s.damage+n
  contribution(s,w,cast.id)
  if n==e.hp then gone(s,w,spec,e,'hit',cast.id)
  else
   e.hp=e.hp-n
   if C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  end
  return true
 end
 local function spawn(s,w,spec,d,role)
  d.serial=d.serial+1
  local right=d.serial%2==0
  local hp=spec.defense.health[role]
  local offset=math.floor((d.serial-1)/2)%2*32
  local x=right and 866-offset or 94+offset
  local e={id=spec.entity+100+d.serial,role=role,hp=hp,maxhp=hp,x=x,y=spec.floorY,dir=right and -1 or 1,
    hitTop=spec.floorY-55,hitBottom=spec.floorY,born=d.t,next=d.t+25,shell=0,custom=true,noRewards=true,weeklyPart=true,
    warning=0,respawn=math.huge}
  e.onCastContact=function(state,cast,part,mult,color,element) return hit(state,w,spec,cast,part,mult,color,element) end
  d.units[#d.units+1]=e;s.enemies[#s.enemies+1]=e
  log(s,w,'WP06:spawn:'..role,0,e.id)
  return e
 end
 local function prune(list)
  for i=#list,1,-1 do if list[i].hp<=0 then table.remove(list,i) end end
 end
 local function wall(s,w,spec,d,source,x,slot)
  d.serial=d.serial+1
  local rule=spec.defense
  local e={id=spec.entity+2000+d.serial,x=x,y=spec.floorY,hitTop=spec.floorY-rule.wallHeight,hitBottom=spec.floorY,
    hp=rule.wallHp,maxhp=rule.wallHp,custom=true,boss=true,noRewards=true,weeklyPart=true,warning=0,respawn=math.huge,
    expires=d.t+rule.wallLife,opened=s.t,source=source,slot=slot,spent=setmetatable({},{__mode='k'})}
  e.onCastContact=function(state,cast,obj)
   local now=state.coop and state.coop.weeklySlot==w and state.coop.time or state.t
   local manual=cast.playerInputAt and not cast.growthAI and state.t-cast.playerInputAt<=now-obj.opened+1e-8
   local order=d.wallOrders[state]
   local ally=order and order.wall==obj and not state.auto and cast.id~=state.active and (cast.growthAI or state.growthAIActor==cast.id)
      and cast.startedAt and cast.startedAt>=order.at
   if w.defense~=d or (not manual and not ally) or cast.reaction or obj.spent[cast] then return false end
   obj.spent[cast]=true;obj.hp=obj.hp-1
   contribution(state,w,cast.id)
   if obj.hp==0 then clearWall(state,d,obj);log(state,w,'WP11:broken',cast.id,obj.id) end
   return true
  end
  e.acceptsAutoTarget=function(state,a)
   local order=d.wallOrders[state]
   return order and order.wall==e and a.id~=state.active and not state.auto
  end
  d.walls[#d.walls+1]=e;s.enemies[#s.enemies+1]=e
  log(s,w,'WP11:wall',0,e.id)
 end
 function D.interact(s,w,action)
  local d=w.defense
  local index=tonumber(action:match('^encounter_target:wall(%d)$') or '')
  if not d or not index or s.auto or player(s).hp<=0 then return end
  local e=nil
  for _,candidate in ipairs(d.walls) do if candidate.slot==index and live(candidate) then e=candidate;break end end
  if not e then return end
  local order=d.wallOrders[s]
  d.wallOrders[s]=(not order or order.wall~=e) and {wall=e,at=s.t} or nil
 end
 local function refreshLinks(d)
  for _,e in ipairs(d.units) do e.guard=nil;e.noAutoTarget=false end
  for _,source in ipairs(d.units) do
   if source.role=='warden' then
    local count=0
    for _,e in ipairs(d.units) do
     if count<3 and basic[e.role] and not e.guard and not live(e.breeder) and near(e.x,source.x,176) then
      e.guard=source;e.noAutoTarget=true;count=count+1
     end
    end
   elseif source.role=='breeder' then
    if not source.claimed and d.t>=source.born+35 then
     source.claimed=true;source.links={}
     for _,e in ipairs(d.units) do
      if #source.links<3 and basic[e.role] and not e.guard and not live(e.breeder) and near(e.x,source.x,230) then
       e.breeder=source;source.links[#source.links+1]=e
      end
     end
    end
    source.shell=0
    for _,e in ipairs(source.links or {}) do if live(e) then source.shell=source.shell+1 end end
   end
  end
 end
 local function heartHit(s,w,spec,d,e,loss)
  d.delta=d.delta-loss
  log(s,w,'WP06:heart',0,e.id)
 end
 local function strike(s,w,spec,e,a,n)
  if present(s,a) and near(a.x,e.x,76) and a.y>=spec.floorY-76 then
   C.damageActor(owner(s,a),a,n,{id=e.id,x=e.x,y=e.y,damageElement='dendro'},true,true)
  end
 end
 local function startCast(s,w,spec,d,e,a)
  local key=cards[e.role]
  if not key then return end
  local c={t=0,key=key,move=spec.moves[key],done={}}
  if basic[e.role] then
   c.actor=a and near(a.x,e.x,e.role=='melee' and 48 or 75) and a.y>=spec.floorY-76 and a or nil
  elseif e.role=='eater' then
   c.actor=a
   for _,p in ipairs(d.units) do
    if basic[p.role] and not live(p.guard) and not live(p.breeder) and near(p.x,e.x,135) then c.prey=p;break end
   end
  end
  e.cast=c
  log(s,w,key,0,e.id)
 end
 local function walk(e,target,speed)
  local d=target-e.x
  if math.abs(d)>1 then e.dir=d>=0 and 1 or -1;e.x=e.x+e.dir*math.min(math.abs(d),speed) end
 end
 local function scheduled(d,e,spec)
  if e.role=='ranged' then return near(e.x,spec.center,165)
  elseif e.role=='melee' then return near(e.x,spec.center,37)
  elseif e.role=='burst' then return near(e.x,spec.center,132)
  elseif e.role=='barrier' then return #d.walls==0 and near(e.x,spec.center,300)
  end
  return false
 end
 local function runCast(s,w,spec,d,e,c)
  c.t=c.t+1
  local t,key=c.t,c.key
  if t==c.move.locks[1] then
   if not present(s,c.actor) then c.actor=nil end
   c.target=c.actor and c.actor.x or (key=='WP09' and e.x or spec.center)
   c.targetY=c.actor and c.actor.y-36 or spec.floorY-25
   log(s,w,key..':lock',0,e.id)
  end
  if key=='WP07_RANGED' and t==c.move.launches[1] then
   local x,y=e.x,e.y-27
   local tx,ty=c.target,c.targetY
   local dist=math.max(1,math.sqrt((tx-x)^2+(ty-y)^2))
   d.spores[#d.spores+1]={x=x,y=y,dx=(tx-x)/dist*4.4,dy=(ty-y)/dist*4.4,e=e,actor=c.actor,
    expires=d.t+c.move.ttl,damage=c.move.damage}
  elseif key=='WP09' then
   if t==60 and live(c.prey) and not live(c.prey.guard) and not live(c.prey.breeder) then
    gone(s,w,spec,c.prey,'consumed');e.fed=true
   end
   if t>=43 and t<90 then walk(e,c.target,3.8) end
  elseif key=='WP11' and t==90 and #d.walls==0 then
   wall(s,w,spec,d,e,265,1);wall(s,w,spec,d,e,695,2)
  elseif key=='WP12' and t>=48 and t<126 then walk(e,spec.center,2) end
  for i,win in ipairs(c.move.windows) do
   if t>=win[1] and t<win[2] and not c.done[i] then
    c.done[i]=true
    if key=='WP07' then
     if c.actor then strike(s,w,spec,e,c.actor,c.move.damage+(live(e.breeder) and 3 or 0))
     elseif near(e.x,spec.center,65) then heartHit(s,w,spec,d,e,spec.defense.heartHit) end
    elseif key=='WP09' then
     strike(s,w,spec,e,c.actor,c.move.damage+(e.fed and 4 or 0))
    elseif key=='WP12' then
     heartHit(s,w,spec,d,e,spec.defense.burstLoss)
     for _,a in ipairs(s.actors) do strike(s,w,spec,e,a,c.move.damage) end
     gone(s,w,spec,e,'burst');return
    end
   end
  end
  if t>=c.move.total then e.cast=nil;e.next=d.t+math.max(1,spec.defense.heartDelay-c.move.total) end
 end
 local function waveClock(s,w,spec,d)
  local rule=spec.defense
  for i,wave in ipairs({
   {40,{'warden','melee','ranged','melee'}},
   {60,{'breeder','ranged','melee','ranged'}},
   {80,{'eater','barrier'}},
  }) do
   if d.progress>=wave[1] and not d.waves[i] then
    d.waves[i]=true
    d.lastWave=math.max(d.t+rule.gateLead,d.lastWave+rule.waveDelay)
    reserve(s,w,d,wave[2],d.lastWave)
   end
  end
  if #d.queue==0 and #d.units<=2 and d.t>=d.lastWave+rule.refill then
   d.lastWave=d.t+rule.gateLead
   reserve(s,w,d,{'melee','ranged','melee'},d.lastWave)
  end
  if #d.queue==0 and d.t>=rule.burstStart and d.t>=d.lastBurst+rule.burstInterval then
   local exists=false
   for _,e in ipairs(d.units) do if e.role=='burst' then exists=true;break end end
   if not exists and #d.units<rule.limit then
    d.lastBurst=d.t+60
    reserve(s,w,d,{'burst'},d.lastBurst)
   end
  end
  local q=d.queue[1]
  if q and q.due<=d.t then
   while #d.units<rule.limit and q.index<=#q.roles do
    spawn(s,w,spec,d,q.roles[q.index]);q.index=q.index+1
   end
   if q.index>#q.roles then table.remove(d.queue,1);d.lastWave=math.max(d.lastWave,d.t) end
  end
 end
 local function sporeTouches(p,a)
  return live(a) and near(p.x,a.x,15) and a.y>=p.y-14 and a.y-72<=p.y+14
 end
 local function sporeTarget(s,p)
  if not s.actorOwners then return sporeTouches(p,p.actor) and p.actor or nil end
  for _,a in ipairs(s.actors) do if sporeTouches(p,a) then return a end end
 end
 function D.step(s,w,spec)
  local d=w.defense
  d.t=d.t+1
  if d.t%spec.defense.passive==0 then d.delta=d.delta+1 end
  prune(d.units)
  for _,e in ipairs(d.walls) do if e.hp>0 and d.t>=e.expires then clearWall(s,d,e) end end
  prune(d.walls)
  refreshLinks(d)
  for _,e in ipairs(d.units) do
   if live(e) then
    if e.cast then runCast(s,w,spec,d,e,e.cast)
    else
     local ready=scheduled(d,e,spec)
     local a=(ready or e.role=='eater') and target(s,e.x,spec.floorY-76) or nil
     if d.t>=e.next and (ready or e.role=='eater' and a and near(e.x,a.x,165)) then startCast(s,w,spec,d,e,a)
     elseif not ready then
      local goal=e.role=='eater' and a and a.x or spec.center
      local support=e.role=='warden' or e.role=='breeder'
      if not support or not near(e.x,spec.center,128) then
       walk(e,goal,(basic[e.role] and 1.38 or e.role=='burst' and 2.6 or 1.95)*C.enemyRate(e))
      end
     end
    end
   end
  end
  for i=#d.spores,1,-1 do
   local p=d.spores[i]
   p.x,p.y=p.x+p.dx,p.y+p.dy
   local done=d.t>=p.expires
   local a=not done and sporeTarget(s,p)
   if a then
    C.damageActor(owner(s,a),a,p.damage,{id=p.e.id,x=p.x,y=p.y,damageElement='dendro'},true,true);done=true
   elseif not done and not p.actor and near(p.x,spec.center,16) and near(p.y,spec.floorY-25,20) then
    heartHit(s,w,spec,d,p.e,spec.defense.heartHit);done=true
   end
   if done then table.remove(d.spores,i) end
  end
  local defending=false
  for _,a in ipairs(s.actors) do if a.hp>0 then defending=true;break end end
  if not defending then return end
  if d.delta~=0 then
   local n=d.delta;d.delta=0
   d.progress=math.max(0,math.min(spec.defense.max,d.progress+n))
   log(s,w,'WP06:progress',0,n)
  end
  if d.progress==spec.defense.max then return 'rebirth' end
  if d.progress==0 then return 'failed' end
  prune(d.units);waveClock(s,w,spec,d)
 end
 function D.collide(s,w,spec,prior)
  local d=w.defense
  if not d or not prior then return end
  for _,a in ipairs(s.actors) do
   local before=prior[a]
   if before and a.hp>0 then
    for _,e in ipairs(d.walls) do
     if live(e) and a.y>spec.floorY-spec.defense.wallHeight then
      local l,r=e.x-24,e.x+24
      if before<=l and a.x>l then a.x=l elseif before>=r and a.x<r then a.x=r end
     end
    end
   end
  end
 end
 function D.ai(s,w,a)
  local d=w.defense
  if not d or not a.ground then return end
  local order=d.wallOrders[s]
  for _,e in ipairs(d.walls) do
   if live(e) and (not order or order.wall~=e) and near(a.x,e.x,42) then a.buffer=.11;return end
  end
 end
 function D.draw(s,w,spec,view,mode,profile,rect,label,line,f)
  local d=w.defense
  if not d then return end
  local order=d.wallOrders[s]
  local y=spec.floorY
  view.progress=d.progress;view.dead=d.kills;view.units={};view.walls={}
  view.incoming=#d.queue>0
  for _,q in ipairs(d.queue) do if q.due-d.t<=60 then
   for _,x in ipairs({94,866}) do rect(x-17,y-21,34,4,'#e7cb98') end
  end end
  for _,e in ipairs(d.units) do
   if e.hp>0 then
    local x=e.x;local c=e.cast;local color=bodyColor[e.role] or '#8fb865'
    view.units[#view.units+1]={x=x,id=e.id,role=e.role,hp=e.hp,guarded=live(e.guard),shell=e.shell}
    if live(e.guard) then line(x,y-35,e.guard.x,y-50,'#9febad',4)
    elseif live(e.breeder) then line(x,y-30,e.breeder.x,y-56,'#d2db8b',4) end
    if basic[e.role] then
     C.drawFieldDisplayArt(f,C.apepWeeklyArt.seed,x-s.camera,y,44,mode,profile,e.dir<0)
     if e.role=='ranged' then rect(x-6,y-44,12,6,'#edcd80') end
    else
     local h=(e.role=='barrier' and 64 or 48)+(e.role=='burst' and c and math.floor(c.t/12) or 0)
     rect(x-22,y-h+8,44,h-8,'#445a3d')
     rect(x-16,y-h,32,h-9,color)
     if e.role=='warden' then rect(x-32,y-h,64,12,color);rect(x-25,y-h-6,50,7,'#a8d48a')
     elseif e.role=='breeder' then
      for j=1,e.shell do rect(x-24+j*11,y-h-7,8,8,'#edd686') end
     elseif e.role=='eater' then rect(x+(e.dir>0 and 2 or -24),y-35,22,12,'#334b3d');if e.fed then rect(x-7,y-23,14,7,'#e2d27d') end
     elseif e.role=='barrier' then rect(x-12,y-h-9,24,20,'#adc49a')
     else rect(x-9,y-h+13,18,14,c and c.t>=126 and '#fff3ac' or '#da9d56') end
     label(x,y-h-17,names[e.role],color)
    end
    if c and c.t<c.move.recovery then
     rect(x-15,y-3,30,4,c.t<c.move.locks[1] and '#d1e8a8' or '#f0c879')
    end
   end
  end
  for _,e in ipairs(d.walls) do if live(e) then
   local top=spec.floorY-spec.defense.wallHeight
   local selected=order~=nil and order.wall==e
   rect(e.x-12,top,24,spec.defense.wallHeight,'#526f59')
   rect(e.x-9,top+3,18,spec.defense.wallHeight-7,selected and '#d2e691' or '#a5bb8b')
   label(e.x,top-9,'壁'..e.slot,'#d1ecb3')
   view.walls[#view.walls+1]={index=e.slot,hp=e.hp,x=e.x,selected=selected}
  end end
  for _,p in ipairs(d.spores) do rect(p.x-6,p.y-6,12,12,'#dded8d') end
 end
 return D
end
