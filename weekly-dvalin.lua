return function(C)
 local dragon={}
 local resolve,avoid=C.resolveCast,C.aiAvoidTarget
 local teal,pale,purple,ink='#51ddda','#e3ffff','#c775f1','#223554'
 local function actorKey(s,a) return s.actorOwners and a or a.id end
 local function clamp(x,a,b) return math.max(a,math.min(b,x)) end
 local function zone(s,x)
  for i,p in ipairs(s.platforms) do if not p.weeklyStep and x>=p.x and x<=p.x+p.w then return i,p end end
  local best,d=nil,math.huge
  for i,p in ipairs(s.platforms) do if not p.weeklyStep and math.abs(x-p.x-p.w/2)<d then best,d=i,math.abs(x-p.x-p.w/2) end end
  return best,s.platforms[best]
 end
 local function active(s)
  local w,spec=C.currentWeeklyBoss(s)
  return w and spec.controller=='dvalin' and w or nil,spec
 end
 local function guarded(w)
  if not w.cast or w.guard<=0 then return false end
  local m,t=w.cast.move,w.cast.tick
  return m.kind=='bite' and t>=120 and t<192 or m.kind=='breath' and t>=72 and t<324
 end
 local function expose(w)
  return w.cast and w.cast.move.kind=='exposure' and w.cast.tick>=42 and w.cast.tick<462
 end
 local function removeParts(s)
  for i=#s.enemies,1,-1 do if s.enemies[i].weeklyPart then table.remove(s.enemies,i) end end
 end
 local function platforms(s,w,spec,padY)
  s.platforms={}
  for _,p in ipairs(spec.platforms) do s.platforms[#s.platforms+1]={x=p.x,y=p.y,w=p.w} end
  if padY then
   local old=w.padY
   if old and padY~=old then
    for _,a in ipairs(s.actors) do
     if a.hp>0 and a.ground and math.abs(a.y-old)<3 and math.abs(a.x-w.crystalX)<spec.stepWidth/2+2 then
      a.y=padY;a.vy=0
     end
    end
   end
   s.platforms[#s.platforms+1]={x=w.crystalX-spec.stepWidth/2,y=padY,w=spec.stepWidth,weeklyStep=true}
  end
  w.padY=padY
 end
 function dragon.spawn(s,w,spec)
  w.visualTime=0
  w.guard,w.cycle,w.index,w.notice=spec.guard,0,1,spec.noticeTicks
  w.stage,w.pose,w.perch,w.crystalX='flight','hover',2,spec.platforms[2].x+spec.platforms[2].w/2+40
  w.projectiles,w.hazard,w.guardHits,w.breaks,w.falls={},nil,0,0,0
  w.crossings=setmetatable({},{__mode='k'})
  w.parts={}
  local receiver={id=spec.entity}
  local function contact(state,cast,part,mult,_,element)
   if not guarded(w) then return false end
   local amount=C.enemyHitDamage(state,cast,part,mult or cast.mult or 1,element or cast.element or 'physical')
   if amount<=0 then return false end
   local hit=w.resolving
   if not hit then return false end
   hit.amount=hit.amount+amount;hit.part=part;hit.cast=cast
   return true
  end
  for i,role in ipairs({'left-claw','right-claw','head'}) do
   local p={id=-spec.entity*10-i,weeklyPart=role,custom=true,noRewards=true,boss=true,
    hp=1,maxhp=1,sharedHealth=receiver,x=spec.center,y=spec.floorY,hitTop=spec.floorY-90,
    hitBottom=spec.floorY,level=spec.level,warning=0,respawn=math.huge,
    onCastContact=contact,acceptsCast=function()return guarded(w) end,underground=true}
   w.parts[i]=p
  end
  local crystal={id=-spec.entity*10-4,weeklyPart='crystal',custom=true,noRewards=true,boss=true,
   maxhp=spec.hp,
   x=w.crystalX,y=spec.crystalY,hitTop=spec.crystalY-spec.crystalHeight,hitBottom=spec.crystalY,
   level=spec.level,warning=0,respawn=math.huge,acceptsCast=function()return expose(w) end,underground=true}
  C.bindFieldPartner(w.primary,crystal);w.parts[4]=crystal
 end
 function dragon.attach(s,w,spec)
  removeParts(s)
  s.grappleNodes={};s.selectedGrapple=1
  for _,a in ipairs(s.actors)do a.grapple=nil end
  for _,p in ipairs(w.parts) do s.enemies[#s.enemies+1]=p end
  platforms(s,w,spec)
 end
 function dragon.cleanup(s,w,spec)
  removeParts(s);w.projectiles={};w.hazard=nil;w.cast=nil
  for _,part in ipairs(w.parts)do part.underground=true end
  w.crossings=setmetatable({},{__mode='k'});w.stage=w.primary.hp<=0 and 'defeated' or 'flight'
  -- Story enter already installed the destination's platforms before calling cleanup.
  if s.story and s.story.node==spec.node then platforms(s,w,spec) end
  w.padY=nil
 end
 function C.resolveCast(s,cast)
  local w=active(s)
  if not w or w.waitUntil then return resolve(s,cast) end
  local previous=w.resolving;local hit={amount=0};w.resolving=hit
  local result=table.pack(resolve(s,cast));w.resolving=previous
  if hit.amount>0 and w.guard>0 and guarded(w) then
   local amount=math.min(w.guard,hit.amount);w.guard=w.guard-amount;w.guardHits=w.guardHits+1
   C.combatNumber(s,hit.part,'体勢 -'..amount,teal)
   C.combatEvent(s,'weekly_guard_hit',cast.id,w.primary.id,amount)
   if s.coop then C.coopContact(s,w.primary,cast.id) end
  end
  return table.unpack(result,1,result.n)
 end
 function dragon.share(w,actors)
  local c=w.cast
  if c then
   C.shareFieldHits(c.seen,actors)
   if c.lastBreath then C.shareFieldHits({c.lastBreath},actors) end
  end
  if w.hazard then C.shareFieldHits({w.hazard.hits},actors) end
 end
 local function nextCast(s,w,spec,id)
  if not id then
   local order=w.cycle==0 and spec.opening or spec.rotation
   id=order[w.index];w.index=w.index%#order+1
  end
  local m=spec.moves[id]
  w.cast={move=m,tick=0,seen={{},{},{}},bolts={},dir=1}
  w.stage=m.kind=='exposure' and 'guard-break' or 'flight'
 end
 local function target(s)
  local a=s.actors[s.active]
  if a.hp>0 then return a end
  for _,a in ipairs(s.actors) do if a.hp>0 then return a end end
 end
 local function lock(s,w,spec,c,a)
  local i,p=zone(s,a and a.x or spec.center)
  c.zone=i;c.left,c.right=p.x,p.x+p.w;c.center=p.x+p.w/2
  c.dir=(a and a.x or spec.center)<spec.center and -1 or 1
  if c.move.kind=='bite' or c.move.kind=='breath' then
   w.perch=i;w.crystalX=clamp(c.center+40,p.x+spec.stepWidth/2+8,p.x+p.w-spec.stepWidth/2-8)
   c.left,c.right=c.center-112,c.center+112
   c.biteLeft,c.biteRight=c.dir<0 and c.left or c.center,c.dir<0 and c.center or c.right
  elseif c.move.kind=='dive' then
   c.left,c.right=p.x+10,p.x+p.w-10
  elseif c.move.kind=='bolts' then
   c.targets={clamp((a and a.x or c.center)-38,p.x+20,p.x+p.w-20),clamp((a and a.x or c.center)+38,p.x+20,p.x+p.w-20)}
  elseif c.move.kind=='rain' then
   c.points={}
   for n,offset in ipairs({-64,0,64}) do c.points[n]=clamp((a and a.x or c.center)+offset,p.x+28,p.x+p.w-28) end
  elseif c.move.kind=='floor' then
   w.hazard=nil -- One hazard at a time, with a fresh warning before replacement.
  end
 end
 local function updateParts(w,spec)
  local p=spec.platforms[w.perch];local center=p.x+p.w/2
  local available=guarded(w)
  for i,part in ipairs(w.parts) do
   if i<4 then
    part.x=center+(i==1 and -65 or i==2 and 65 or 0)
    part.y=i==3 and spec.floorY-32 or spec.floorY
    part.hitTop=part.y-(i==3 and 48 or 90);part.hitBottom=part.y
    part.underground=not available or i==3 and w.cast.move.kind~='bite'
   else
    part.x=w.crystalX;part.y=spec.crystalY
    part.underground=not expose(w)
   end
  end
 end
 function dragon.prepare(s,w,spec,_,dt)
  w.visualTime=w.visualTime+dt
  if w.phase=='available' then w.phase='notice' end
  local n=math.max(1,math.floor(dt*60+.5))
  if w.phase=='notice' then w.notice=w.notice-n;if w.notice<=0 then w.phase='combat' end;return end
  if not w.cast then nextCast(s,w,spec) end
  local c=w.cast;c.tick=c.tick+n;local m,t=c.move,c.tick
  if t==m.lock then lock(s,w,spec,c,target(s)) end
  w.pose=({dive='glide',bite='perch',breath='breath',bolts='hover',floor='roar',giant='roar',rain='hover',exposure='down'})[m.kind]
  if m.kind=='exposure' then
   w.stage=t<42 and 'guard-break' or t<462 and 'exposed' or 'takeoff'
   local y=t<462 and spec.stepY or spec.stepY+(spec.floorY-spec.stepY)*clamp((t-462)/72,0,1)
   platforms(s,w,spec,y)
  else w.stage=guarded(w) and 'perch' or 'flight' end
  updateParts(w,spec)
 end
 local function area(s,w,seen,left,right,top,damage,bottom)
  C.hitFieldArea(s,{id=w.primary.id,owner=w.primary,y=bottom or 480,damageElement='anemo'},seen,left,right,top,damage,bottom)
 end
 local function projectile(s,w,c,index,spawn,impact,x,damage)
  local t=c.tick
  if t<spawn or t>=impact+1 or c.bolts[index] and c.bolts[index].ended then return end
  local p=c.bolts[index]
  if not p then p={x=480+(index%2==0 and 20 or -20),y=210,seen=c.seen[math.ceil(index/2)]};c.bolts[index]=p end
  local q=clamp((t-spawn+1)/(impact-spawn),0,1)
  local nx=(480+(index%2==0 and 20 or -20))*(1-q)+x*q;local ny=210*(1-q)+450*q
  -- One accepted hit per actor per pair; the drawn orb and its swept collision share a path.
  for _,a in ipairs(s.actors) do
   local key=actorKey(s,a)
   if a.hp>0 and not p.seen[key] then
    local dx,dy=nx-p.x,ny-p.y;local length=dx*dx+dy*dy
    local centerY=a.y-25
    local u=length>0 and clamp(((a.x-p.x)*dx+(centerY-p.y)*dy)/length,0,1) or 0
    local px,py=p.x+u*dx,p.y+u*dy
    if math.abs(px-a.x)<20 and py>a.y-62 and py<a.y+12 then
     p.seen[key]=true;C.damageActor(s.actorOwners and s.actorOwners[a] or s,a,damage,{id=w.primary.id,x=px,y=py+30,damageElement='anemo'},true,true)
    end
   end
  end
  p.x,p.y=nx,ny;if t>=impact then p.ended=true end
 end
 local function hazards(s,w,spec)
  local h=w.hazard
  if not h or w.cast and w.cast.move.kind=='exposure' then return end
  if h.warning>0 then h.warning=h.warning-1;return end
  if h.remaining<=0 then w.hazard=nil;return end
  h.remaining=h.remaining-1
  local p=spec.platforms[h.zone]
  for _,a in ipairs(s.actors) do
   local key=actorKey(s,a)
   if a.hp>0 and a.ground and math.abs(a.y-spec.floorY)<4 and a.x>=p.x and a.x<=p.x+p.w
    and s.t+1e-8>=(h.hits[key] or 0) then
    h.hits[key]=s.t+1;C.damageActor(s.actorOwners and s.actorOwners[a] or s,a,spec.floorDamage,{id=w.primary.id,damageElement='anemo'},false,true)
   end
  end
 end
 function dragon.finish(s,w,spec)
  if w.phase~='combat' or not w.cast then return end
  if w.guard<=0 and w.cast.move.kind~='exposure' then
   w.projectiles={};w.breaks=w.breaks+1
   if w.hazard then w.hazard.warning=60 end
   nextCast(s,w,spec,'WD08');updateParts(w,spec);return
  end
  local c=w.cast;local m,t=c.move,c.tick
  if m.kind=='dive' and t>=72 and t<102 then
   local q=(t-72)/30;local x=c.dir<0 and c.right-(c.right-c.left)*q or c.left+(c.right-c.left)*q
   C.hitFieldCapsule(s,{id=w.primary.id,owner=w.primary,damageElement='anemo'},c.seen[1],x-18,x+18,450,28,m.damage)
  elseif m.kind=='bite' and t>=90 and t<102 then area(s,w,c.seen[1],c.biteLeft,c.biteRight,410,m.damage)
  elseif m.kind=='breath' and t>=90 and t<234 then
   local q=(t-90)/144;local x=c.dir<0 and c.right-(c.right-c.left)*q or c.left+(c.right-c.left)*q
   c.beamX=x
   local seen={}
   for _,a in ipairs(s.actors) do
    local key=actorKey(s,a)
    if c.lastBreath and s.t<(c.lastBreath[key] or 0) then seen[key]=true end
   end
   local hp={};for i,a in ipairs(s.actors)do hp[i]=a.hp end
   area(s,w,seen,x-38,x+38,390,m.damage)
   c.lastBreath=c.lastBreath or {}
   for i,a in ipairs(s.actors)do if a.hp<hp[i] then c.lastBreath[actorKey(s,a)]=s.t+.5 end end
  elseif m.kind=='bolts' and c.targets then
   for i=1,4 do projectile(s,w,c,i,i<=2 and 72 or 108,i<=2 and 132 or 168,c.targets[(i-1)%2+1],m.damage) end
  elseif m.kind=='floor' and t==180 then
   w.hazard={zone=c.zone,warning=0,remaining=600,hits={}}
  elseif m.kind=='giant' and t>=180 and t<192 then area(s,w,c.seen[1],c.left,c.right,390,m.damage)
  elseif m.kind=='rain' and c.points then
   for i,time in ipairs({120,150,180}) do if t>=time and t<time+12 then area(s,w,c.seen[i],c.points[i]-25,c.points[i]+25,390,m.damage) end end
  end
  hazards(s,w,spec)
  if t>=m.total then
   if m.kind=='exposure' then
    w.cycle=w.cycle+1;w.guard=spec.guard;w.index=1;platforms(s,w,spec)
    if w.hazard then w.hazard.warning=60 end
   end
   w.cast=nil;w.pose='hover'
  end
 end
 function dragon.afterStep(s,w,spec)
  for _,a in ipairs(s.actors) do
   if a.hp>0 and a.y>560 then
    local _,p=zone(s,a.x);a.x=clamp(a.x,p.x+22,p.x+p.w-22);a.y=p.y;a.vy=0;a.ground=true
    w.falls=w.falls+1
    w.crossings[a]=nil
    if not w.waitUntil then C.damageActor(s,a,spec.fallDamage,{id=w.primary.id,damageElement='anemo'},false,true)end
   end
  end
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=active(s)
  if not w then return avoid and avoid(s,a) end
  local crossing=w.crossings[a]
  if crossing then
   if a.ground and a.x>=crossing.left and a.x<=crossing.right then w.crossings[a]=nil
   else return crossing.x end
  end
  local destination
  if expose(w) then
   if math.abs(a.x-w.crystalX)>22 or a.y>spec.stepY+3 then destination=w.crystalX end
   if a.ground and a.y>spec.stepY+3 and math.abs(a.x-w.crystalX)<120 then a.buffer=.1 end
  elseif w.hazard and w.hazard.warning<55 then
   local i=zone(s,a.x)
   if i==w.hazard.zone then
    local nextZone=i==1 and 2 or i-1;local p=spec.platforms[nextZone];destination=p.x+p.w/2
   end
  end
  if not destination and guarded(w) then
   local p=spec.platforms[w.perch];local c=w.cast
   destination=p.x+p.w/2+(c.move.kind=='breath' and (c.dir or 1)*72 or 65)
   if math.abs(a.x-destination)<22 then destination=nil end
  end
  if not destination and not expose(w) then
   local leader=s.actors[s.active]
   if math.abs(leader.x-a.x)>75 then destination=leader.x end
  end
  if destination then
   local dir=destination>a.x and 1 or -1
   for i,p in ipairs(spec.platforms)do
    if a.ground and a.x>=p.x and a.x<=p.x+p.w then
     local edge=dir>0 and p.x+p.w or p.x
     local nextFloor=spec.platforms[i+dir]
     if nextFloor and math.abs(a.x-edge)<55 and (destination-edge)*dir>25 then
      a.buffer=.1
      w.crossings[a]={x=clamp(destination,nextFloor.x+22,nextFloor.x+nextFloor.w-22),left=nextFloor.x,right=nextFloor.x+nextFloor.w}
     end
    end
   end
   return destination
  end
  return avoid and avoid(s,a)
 end
 local function rect(f,x,y,w,h,color)f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}end
 local function text(f,x,y,label,color,size)f.draws[#f.draws+1]={kind='text',x=x,y=y,text=label,color=color,size=size or 12}end
 local function orb(f,x,y,size,mode,profile)
  C.drawDvalinWeeklyArt(f,x,y,'orb',size,mode,profile,false)
 end
 function dragon.observe(f,s,w,spec,mode,profile)
  local c=w.cast;local p=spec.platforms[w.perch];local center=p.x+p.w/2
  local b=f.weeklyBoss;b.stage=w.stage;b.guard=w.guard;b.maxGuard=spec.guard;b.guardHits=w.guardHits
  b.cycle=w.cycle;b.breaks=w.breaks;b.move=c and c.move.id;b.tick=c and c.tick;b.exposed=not not expose(w)
  b.crystal={x=w.crystalX,y=spec.crystalY,active=b.exposed};b.falls=w.falls
  b.padY=w.padY
  if c and c.zone then b.attack={zone=c.zone,left=c.left,right=c.right,center=c.center,dir=c.dir,
   biteLeft=c.biteLeft,biteRight=c.biteRight,targets=c.targets,points=c.points}end
  b.parts={};for _,part in ipairs(w.parts)do if not part.underground then b.parts[#b.parts+1]={id=part.id,role=part.weeklyPart,x=part.x,y=part.y} end end
  if w.hazard then b.hazard={zone=w.hazard.zone,warning=w.hazard.warning,remaining=w.hazard.remaining,paused=c and c.move.kind=='exposure'}end
  b.label=w.phase=='respawn' and '浄化・再挑戦待ち' or b.exposed and '首の結晶へ・踏み場へ通常ジャンプ' or
   w.stage=='takeoff' and '起き上がる・足元へゆっくり降りる' or guarded(w) and '前脚を攻撃して体勢を崩す' or c and c.move.title or '空を舞っている'
  if w.primary.hp<=0 then return end
  local layer={draws={},rectIndex=f.rectIndex,rectBatches=f.rectBatches}
  local foreground={draws={},rectIndex=f.rectIndex,rectBatches=f.rectBatches}
  local bodyX,bodyY,bodyH,flip=spec.center,spec.floorY-spec.openingPose.hover,spec.artHeight,false
  local pose=w.pose
  if c and (c.move.kind=='bite' or c.move.kind=='breath') then
   flip=(c.dir or -1)>0
   bodyX,bodyY,bodyH=center+(flip and -32 or 32),c.move.kind=='bite' and 506 or 500,231
   pose=c.move.kind=='bite' and 'perch-body' or 'breath-body'
  end
  if c and c.move.kind=='exposure' then bodyX,bodyY,bodyH=w.crystalX,512,125 end
  if c and c.move.kind=='dive' and c.left and c.tick>=72 and c.tick<102 then
   local q=(c.tick-72)/30
   bodyX=c.dir<0 and c.right-(c.right-c.left)*q or c.left+(c.right-c.left)*q
   bodyY,bodyH,flip=490,130,c.dir>0
  end
  if pose=='hover' then bodyY=bodyY+math.floor(3*math.sin(w.visualTime*3)+.5) end
  C.drawDvalinWeeklyArt(layer,bodyX,bodyY,pose,bodyH,mode,profile,flip)
  if c then
   local m,t=c.move,c.tick
   if m.kind=='bite' or m.kind=='breath' then
    for i=1,2 do
     local part=w.parts[i];C.drawDvalinWeeklyArt(layer,part.x,part.y,'claw',100,mode,profile,i==2)
     if not part.underground then rect(layer,part.x-29,part.y-4,58,3,teal)end
    end
    C.drawDvalinWeeklyArt(layer,center+(flip and 25 or -25),430,'head',115,mode,profile,flip)
   end
   if expose(w) then
    C.drawDvalinWeeklyArt(foreground,w.crystalX,spec.crystalY,'crystal',spec.crystalHeight,mode,profile,false)
    text(foreground,w.crystalX,322,'結晶・HP',purple)
    if t>=402 then text(foreground,w.crystalX,304,'起き上がる',pale)end
   end
   if c.left then
    if m.kind=='dive' and t<102 then
     for x=c.left,c.right,18 do rect(layer,x,474,10,3,t>=72 and teal or pale)end
    elseif m.kind=='bite' and t<102 then
     for x=c.biteLeft,c.biteRight,16 do rect(layer,x,473,8,3,t>=90 and teal or pale)end
    elseif m.kind=='breath' and t<234 then
     local x=c.beamX or (c.dir<0 and c.right or c.left)
     rect(layer,x-38,390,76,90,t>=90 and teal..'44' or pale..'22')
     rect(layer,x-38,474,76,3,teal)
    elseif m.kind=='giant' and t>=60 and t<192 then
     rect(layer,c.left,475,c.right-c.left,3,teal)
     if t>=120 then local q=clamp((t-120)/60,0,1);orb(layer,c.center,210+240*q,96,mode,profile)end
    elseif m.kind=='floor' and t>=60 then
     rect(layer,c.left,474,c.right-c.left,4,purple);text(layer,c.center,450,'亀裂・別の足場へ',pale)
     for i,floor in ipairs(spec.platforms)do if i~=c.zone then text(layer,floor.x+floor.w/2,450,'SAFE',teal)end end
    end
   end
   if m.kind=='bolts' and c.targets then
    for i=1,4 do
     local impact=i<=2 and 132 or 168
     if t<impact then
      local x0=480+(i%2==0 and 20 or -20);local x1=c.targets[(i-1)%2+1]
      for n=1,10 do local q=n/10;rect(layer,x0+(x1-x0)*q-1,210+240*q-1,2,2,pale..'66')end
     end
    end
   end
   if m.kind=='rain' and c.points then
    for i,x in ipairs(c.points)do
     local impact=90+i*30
     if t>=30+i*30 and t<impact+12 then
      rect(layer,x-25,474,50,4,pale)
      if t>=impact-36 then local q=clamp((t-impact+36)/36,0,1);orb(layer,x,210+240*q,36,mode,profile)end
     end
    end
   end
   for _,ball in pairs(c.bolts)do if not ball.ended then orb(layer,ball.x,ball.y,28,mode,profile)end end
  end
  if w.hazard and not(c and c.move.kind=='exposure')then
   local floor=spec.platforms[w.hazard.zone]
   for x=floor.x+4,floor.x+floor.w-8,20 do rect(layer,x,476,12,4,purple)end
   text(layer,floor.x+floor.w/2,464,w.hazard.warning>0 and '亀裂・再予告' or '危険な床',purple)
  end
  local draws={};local prefix=#(f.storyPortals or {})*4
  for i=1,prefix do draws[#draws+1]=f.draws[i] end
  for _,draw in ipairs(layer.draws)do draws[#draws+1]=draw end
  for i=prefix+1,#f.draws do draws[#draws+1]=f.draws[i]end
  for _,draw in ipairs(foreground.draws)do draws[#draws+1]=draw end
  f.draws=draws
  rect(f,360,74,240,9,ink);rect(f,362,76,236*w.guard/spec.guard,5,teal)
  text(f,480,68,'体勢 '..w.guard..' / '..spec.guard,pale)
 end
 return dragon
end
