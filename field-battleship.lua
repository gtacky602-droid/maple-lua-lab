return function(C)
 local ship={packRectArt=true}
 local U=88
 local frost,white,amber,ink='#8fddff','#f1fcff','#ffa750','#212d3c'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY
  b.hitTop=b.y-C.battleshipFieldArt[pose].profiles.legacy.height
  b.hitBottom=b.y
 end
 function ship.spawn(b,s)
  b.heat,b.iceWard=0,0
  b.heatContacts=setmetatable({},{__mode='k'})
  place(b,s,'idle','idle')
 end
 ship.cancel=ship.spawn
 function ship.onDefeat(_,b,s) ship.spawn(b,s) end

 function ship.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function ship.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 function ship.frame(f,b,s,c)
  f.draftMoves=s.draftMoves
  if s.thermal then
   f.thermal={heat=b.heat,maxHeat=s.thermal.max,ward=b.iceWard,maxWard=s.thermal.wardHp}
  end
  if not c or c.reposition then return end
  local m=c.move
  if m.kind=='plate' and c.left then
   f.coolingLane={left=c.left,right=c.right}
   f.coolingInterrupted=c.broken~=nil
  end
  if c.plate and c.plateLayers>0 then
   local p=c.plate
   f.coolingPlate={left=p.x-p.hitHalfWidth,right=p.x+p.hitHalfWidth,top=p.hitTop,bottom=p.hitBottom,
    layers=c.plateLayers,maxLayers=m.plateLayers,remainingTicks=m.plateClose-c.tick}
  end
  if b.form=='down' then f.recoveryTicks=c.broken+(m.downTicks or s.thermal.downTicks)-c.tick
  elseif b.form=='recover' then f.recoveryTicks=m.total-c.tick end
 end

 function ship.onHit(cast,b,s,slot)
  if not s.thermal then return end
  if (cast.reaction and cast.key~='reaction:burning') or b.heatContacts[cast] then return end
  local c=slot.cast
  local mode=c and c.move.kind
  if mode=='ward' then
   if b.iceWard>0 then
    b.heatContacts[cast]=true
    local cost=cast.element=='pyro' and s.thermal.pyroChip or 1
    b.iceWard=math.max(0,b.iceWard-cost)
   end
  elseif cast.element=='pyro' and b.heat<s.thermal.max then
   b.heatContacts[cast]=true
   b.heat=b.heat+1
   if b.heat==s.thermal.max then
    b.iceWard=s.thermal.wardHp
    slot.cast=ship.begin(b,s,s.coolingMove)
    slot.index=1
    place(b,s,'shield','ward')
   end
  end
 end

 function ship.damageFactor(_,_,b,s)
  if not s.thermal then return 1 end
  if b.iceWard>0 then return s.thermal.wardFactor end
  if b.heat>=s.thermal.hotAt then return s.thermal.hotFactor end
  return 1
 end

 local function lock(state,s,c,a)
  local m=c.move
  if m.kind=='saw' then
   local x0,x1=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(x0,x1),math.max(x0,x1)
  elseif m.kind=='fire' then
   local edge=(m.offsets[#m.offsets]+m.width/2)*U
   if s.thermal and (c.origin+c.dir*edge<s.arenaMin or c.origin+c.dir*edge>s.arenaMax) then c.dir=-c.dir end
   c.centers={}
   for i,offset in ipairs(m.offsets) do c.centers[i]=c.origin+c.dir*offset*U end
  else
   local dx=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
   local radius=m.width*U/2
   local center=c.origin+dx
   if m.kind=='ward' then center=clamp(center,s.arenaMin+radius,s.arenaMax-radius) end
   c.left,c.right=center-radius,center+radius
   if m.kind=='plate' then
    c.plate={x=c.origin+c.dir*(m.plateNear+m.plateFar)*U/2,y=s.floorY,boss=true,
     hitHalfWidth=(m.plateFar-m.plateNear)*U/2,hitTop=s.floorY-m.plateHigh*U,hitBottom=s.floorY-m.plateLow*U}
    c.plateLayers=m.plateLayers
    c.plateContacts={}
    c.openedAt=state.t
   end
  end
 end

 function ship.onAttackPulse(party,cast,b,c,selected,left,right)
  if not c.plate or c.plateLayers<=0 or c.tick>=c.move.plateClose or c.plateContacts[cast]
     or cast.reaction or (cast.targetId and cast.targetId~=b.id) then return end
  local actor=cast.id and party.actors[cast.id]
  if not actor or actor.hp<=0 or not C.fieldCastStartedSince(party,b.fieldBoss,cast,c.openedAt) then return end
  if cast.homing or cast.chain or cast.scatter or cast.sharedProjectiles then
   local directed=false
   for _,target in ipairs(selected) do
    if target==b then directed=true;break end
   end
   if not directed then return end
  end
  if not C.castReachesFieldPart(cast,c.plate,left,right) then return end
  c.plateContacts[cast]=true
  c.plateLayers=math.max(0,c.plateLayers-(cast.element=='pyro' and c.move.pyroChip or 1))
 end

 local function bounds(c,i)
  if c.centers then
   local radius=c.move.width*U/2
   return c.centers[i]-radius,c.centers[i]+radius
  end
  return c.left,c.right
 end

 local function fits(state,s,c)
  for i,w in ipairs(c.move.active) do
   local left,right=bounds(c,i)
   if left<s.arenaMin or right>s.arenaMax or
      not C.fieldGroundRetreat(state,c.dir,left,right,w[1]-c.tick,c.origin) then return false end
  end
  return true
 end

 local function finish(b,s)
  b.heat,b.iceWard=0,0
  place(b,s,'idle','idle')
 end

 function ship.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  if c.reposition then
   b.facing=s.home>b.x and 1 or -1
   b.x=b.x+clamp(s.home-b.x,-s.walkSpeed/60,s.walkSpeed/60)
   if b.x==s.home then c.origin,c.tick,c.reposition=b.x,0,nil end
   return false
  end
  c.tick=t
  if m.kind=='ward' and t<m.recover then
   if b.iceWard<=0 and not c.broken then c.broken=t;b.heat=0 end
   if not c.broken then b.heat=math.max(0,s.thermal.max-math.floor(t/m.coolEvery)) end
  end
  if c.plate and (c.plateLayers==0 or t>=m.plateClose) then
   if c.plateLayers==0 then c.broken=t end
   c.plate,c.plateLayers,c.plateContacts=nil,nil,nil
  end
  if c.broken then
   local age=t-c.broken
   local down=m.downTicks or s.thermal.downTicks
   if age<down then place(b,s,'down','down');return false end
   if m.standTicks and age<down+m.standTicks then place(b,s,'standing','idle');return false end
   finish(b,s)
   return true
  end
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then
   lock(state,s,c,a)
   b.facing=c.dir
   if not s.thermal and not fits(state,s,c) then
    c.left,c.right,c.centers,c.plate,c.plateLayers,c.plateContacts,c.openedAt=nil,nil,nil,nil,nil,nil,nil
    finish(b,s)
    if b.x==s.home then return true end
    c.reposition=true
    return false
   end
  end
  local form,pose='attack',m.pose
  if m.kind=='ward' then form='shield' end
  if m.kind=='plate' then form='cooling' end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='saw' then pose='sweep' end
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage,
                   s.floorY-(m.low or 0)*U)
   end
  end
  if t>=m.recover then
   form,pose='recover','down'
   if m.kind=='ward' then b.heat,b.iceWard=0,0 end
  end
  place(b,s,form,pose)
  if t<m.total then return false end
  place(b,s,'idle',s.thermal and b.heat>=s.thermal.hotAt and 'heated' or 'idle')
  return true
 end

 function ship.label(b,c,s)
  if c and c.reposition then return '整備庫の中央へ移動中' end
  if c and c.move.kind=='plate' then
   if b.form=='down' then return '冷却板を破壊・反撃の隙' end
   if b.form=='standing' then return '起き上がり' end
   if b.form=='recover' then return '反撃の隙' end
   if c.plate and c.plateLayers>0 then
    local seconds=math.ceil((c.move.plateClose-c.tick)/6)/10
    return string.format('冷却板 %d／%d・あと%.1f秒・炎で2層',c.plateLayers,c.move.plateLayers,seconds)
   end
   if b.form=='cooling' and c.tick>=c.move.plateClose then return '冷却放出・床の印から退避' end
  end
  if b.form=='down' then return '氷バリア破壊・反撃の好機' end
  if b.iceWard>0 then return '冷却中・氷バリア '..b.iceWard..'／'..s.thermal.wardHp end
  if b.form=='recover' then return '排熱中・反撃の好機' end
  if b.heat>0 then
   local label=(b.heat>=s.thermal.hotAt and '過熱' or '加熱')..' '..b.heat..'／'..s.thermal.max
   return c and label..'・'..c.move.title or label
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y)
  if c.broken or (not c.left and not c.centers) then return end
  local m=c.move
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    local left,right=bounds(c,i)
    local l,r=left-cam,right-cam
    local top,bottom=y-m.height*U,y-(m.low or 0)*U
    local tint=m.element=='pyro' and amber or frost
    if c.tick>=w[1] then rect(f,l,top,r-l,bottom-top,tint..'55');rect(f,l,top,r-l,3,white) end
    for x=l+1,r-5,13 do rect(f,x,bottom-4,7,3,tint) end
   end
  end
 end
 function ship.draw(f,state,b,s,c,mode,profile)
  local x,y=b.x-state.camera,s.floorY
  if c then warning(f,c,state.camera,y) end
  local hot=s.thermal and b.heat>=s.thermal.hotAt
  local pose=b.pose
  if hot and not c then pose='heated' end
  local nativeLeft=pose=='saw-ready' or pose=='sweep'
  C.drawBattleshipFieldArt(f,x,b.y,pose,mode,profile,(b.facing<0)~=nativeLeft)
  if not s.thermal then
   if c and c.plate then
    local p=c.plate
    local l,r=p.x-p.hitHalfWidth-state.camera,p.x+p.hitHalfWidth-state.camera
    local top,bottom=p.hitTop,p.hitBottom
    rect(f,l,top,r-l,bottom-top,'#17384dcf')
    rect(f,l,top,r-l,3,frost);rect(f,l,bottom-3,r-l,3,frost)
    rect(f,l,top,3,bottom-top,frost);rect(f,r-3,top,3,bottom-top,frost)
    local gap=(r-l-10)/c.move.plateLayers
    for layer=1,c.move.plateLayers do
     local cx=l+7+(layer-1)*gap
     if layer<=c.plateLayers then rect(f,cx,top+7,3,bottom-top-14,white)
     else
      rect(f,cx,top+7,2,6,frost)
      rect(f,cx-2,top+12,3,2,frost)
      rect(f,cx-2,top+13,2,6,frost)
     end
    end
   end
   return
  end
  local bar=y-C.battleshipFieldArt[pose].profiles.legacy.height-12
  local count=s.thermal.max
  local width=count*14
  rect(f,x-width/2-2,bar,width+4,8,ink)
  for i=1,count do
   rect(f,x-width/2+(i-1)*14+1,bar+2,11,4,i<=b.heat and amber or '#545363')
  end
  if b.iceWard>0 then
   rect(f,x-41,bar-9,82,6,ink)
   rect(f,x-39,bar-7,78*b.iceWard/s.thermal.wardHp,2,frost)
  elseif hot and pose~='heated' then
   rect(f,x-22,y-74,6,5,amber);rect(f,x-10,y-77,11,6,amber);rect(f,x+5,y-74,7,5,amber)
  end
 end

 function ship.drawOverlay(f,state,s,c)
  if not c or c.broken or (not c.left and not c.centers) then return end
  local m=c.move
  if m.kind~='fire' and m.kind~='plate' then return end
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    local left,right=bounds(c,i)
    local x,y=(left+right)/2-state.camera,s.floorY
    local width=m.kind=='fire' and 20 or 38
    rect(f,x-width/2,y+6,width,18,ink)
    rect(f,x-width/2,y+6,width,2,frost)
    f.draws[#f.draws+1]={kind='text',x=x,y=y+20,text=m.kind=='fire' and tostring(i) or '放出',size=12,color=white}
   end
  end
 end
 return ship
end
