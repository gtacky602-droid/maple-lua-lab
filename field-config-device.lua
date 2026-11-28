return function(C)
 local device={packRectArt=true}
 local U=88
 local amber,white,ink='#ffb44d','#fff3c9','#16202c'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end

 local function place(b,s,form,lower)
  b.form=form
  b.y=s.floorY-14*(1-lower)
  b.hitTop=b.y-(156-47*lower)
  b.hitBottom=s.floorY-.4*U*(1-lower)
 end
 function device.spawn(b,s) place(b,s,'hover',0) end
 function device.cancel(b,s,state,c)
  C.clearFieldSummon(state,c)
  device.spawn(b,s)
 end
 function device.onDefeat(state,b,s,c) device.cancel(b,s,state,c) end

 function device.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function device.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 function device.frame(f,b,s,c)
  if not c then return end
  local m,t=c.move,c.tick
  if c.brokenAt then
   f.cannonInterrupted=true
   if b.form=='down' then f.recoveryTicks=c.brokenAt+180-t end
  elseif t>=m.recover then
   f.recoveryTicks=m.total-t
  elseif m.kind=='charge' and c.left then
   f.cannonBounds={left=c.left,right=c.right}
  end
 end

 local function collector(state,b,s,c)
  local y=s.floorY-.35*U
  c.collectorX=clamp(c.origin+c.dir*.9*U,s.arenaMin+12,s.arenaMax-12)
  if state.t<(b.rearmAt or 0) then return end
  local counted={}
  local function acceptsCast(cast,party)
   return not cast.reaction and C.fieldCastStartedSince(party,b.fieldBoss,cast,c.openedAt)
  end
  local function contact(party,cast,summon)
   if acceptsCast(cast,party) and not counted[cast] then
    counted[cast]=true
    summon.hp=summon.hp-1
   end
   return false
  end
  c.summon={id=-b.id,x=c.collectorX,y=y,hitTop=y-.2*U,hitBottom=y+.2*U,hp=3,maxhp=3,
   level=s.level,custom=true,noRewards=true,underground=true,acceptsCast=acceptsCast,onCastContact=contact,warning=0,respawn=math.huge}
  state.enemies[#state.enemies+1]=c.summon
 end

 local function lock(state,s,c,a)
  local m=c.move
  if m.kind=='charge' then
   local radius=m.width*U/2
   local delta=(a and a.x or c.origin)-c.origin
   local center=clamp(c.origin+c.dir*clamp(delta*c.dir,0,m.distance*U),s.arenaMin+radius,s.arenaMax-radius)
   c.left,c.right=center-radius,center+radius
   if c.summon then c.openedAt=state.t;c.summon.underground=false end
  else
   local from,to=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(from,to),math.max(from,to)
  end
 end

 function device.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if c.summon and c.summon.hp<=0 then
   c.brokenAt=t
   b.rearmAt=state.t+(204+1200)/60
   C.clearFieldSummon(state,c)
   c.collectorX=nil
  end
  if c.brokenAt then
   local age=t-c.brokenAt
   if age<180 then place(b,s,'down',1)
   elseif age<204 then place(b,s,'stand',1-(age-180)/24)
   else
    device.spawn(b,s)
    return true
   end
   return false
  end
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.spawn then collector(state,b,s,c) end
  if t==m.lock then lock(state,s,c,a) end
  if t==m.close then C.clearFieldSummon(state,c) end
  if t==m.recover then place(b,s,'recover',.4);c.collectorX=nil end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    C.hitFieldArea(state,c.source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage,s.floorY-(m.low or 0)*U)
   end
  end
  if t<m.total then return false end
  device.spawn(b,s)
  return true
 end

 function device.label(b,c)
  if b.form=='down' then return '球雷砲を中断・反撃の好機' end
  if b.form=='stand' then return '機体が浮き上がる' end
  if b.form=='recover' then return '腕を下ろす・反撃の好機' end
  if not c or c.tick<c.move.lock then return end
  local m,t=c.move,c.tick
  if m.kind=='charge' then
   if c.summon then
    local seconds=math.ceil((m.close-t)/6)/10
    return string.format('集積器に別々の攻撃をあと%d回・受付あと%.1f秒',c.summon.hp,seconds)
   end
   if t<m.active[1][1] then return '集積器を攻撃できない・着弾範囲から退避' end
   if t<m.active[1][2] then return '球雷砲・着弾範囲から離れる' end
   return '着弾終了・腕が下りるまで待つ'
  end
  for i,w in ipairs(m.active) do
   if t<w[2] then return m.title..' '..i..'/2・予告の帯から離れる' end
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y,i)
  local m,t=c.move,c.tick
  local left,right=c.left-cam,c.right-cam
  local top,bottom=y-m.height*U,y-(m.low or 0)*U
  local active=t>=m.active[i][1]
  local band=(top+bottom)/2
  if active then
   rect(f,left,top,right-left,bottom-top,amber..'77')
   if m.kind=='charge' then
    rect(f,left,top,4,bottom-top,white)
    rect(f,right-4,top,4,bottom-top,white)
    rect(f,left+8,bottom-9,right-left-16,5,white)
   else rect(f,left,band-2,right-left,4,white) end
  else
   if m.kind=='charge' then
    band=bottom-3
    rect(f,left,top,2,bottom-top,amber)
    rect(f,right-2,top,2,bottom-top,amber)
   end
   for x=left,right-5,12 do rect(f,x,band,6,2,amber) end
  end
 end

 function device.draw(f,state,b,s,c,mode,profile)
  local pose,cam='idle',state.camera
  if c then
   local m,t=c.move,c.tick
   if b.form=='down' or b.form=='stand' or b.form=='recover' then pose='down'
   elseif m.kind=='claw' then pose=t<m.active[1][2] and 'claw-a' or 'claw-b'
   else pose=m.kind end
   if c.left and not c.brokenAt then
    for i,w in ipairs(m.active) do
     if t<w[2] then warning(f,c,cam,s.floorY,i);break end
    end
   end
  end
  C.drawConfigDeviceFieldArt(f,b.x-cam,b.y,pose,mode,profile,b.facing<0)
  if c and c.collectorX then
   local x,y=c.collectorX-cam,s.floorY
   C.drawConfigDeviceFieldArt(f,x,y-7,'collector',mode,profile,false)
   if c.summon and c.openedAt then
    rect(f,x-22,y-108,44,10,ink)
    for i=1,c.summon.maxhp do rect(f,x-19+(i-1)*13,y-105,11,4,i<=c.summon.hp and amber or '#53606a') end
   end
  end
  if c and pose=='charge' and c.tick>=c.move.lock and c.tick<c.move.active[1][1] then
   local pulse=(c.tick-c.move.lock)%88
   if pulse<16 then
    local x,y=b.x-cam,b.y-167
    rect(f,x-18,y,36,3,amber);rect(f,x-10,y+5,20,2,white)
   end
  end
 end

 function device.drawOverlay(f,state,s,c)
  if not c or not c.left or c.brokenAt then return end
  local m=c.move
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    local x,y=(c.left+c.right)/2-state.camera,s.floorY
    local charge=m.kind=='charge'
    local width=charge and 34 or 29
    rect(f,x-width/2,y+6,width,19,ink)
    rect(f,x-width/2,y+6,width,2,amber)
    f.draws[#f.draws+1]={kind='text',x=x,y=y+21,text=charge and '着弾' or i..'/2',size=13,color=white}
    return
   end
  end
 end
 return device
end
