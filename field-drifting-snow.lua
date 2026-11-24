return function(C)
 local guardian={}
 local U=88
 local blue,pale,ink='#60dfff','#e1f8ff','#26344e'
 local effective={pyro=true,electro=true,anemo=true}
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY
  -- The sword and outer coffin are decoration, not an enlarged body hurtbox.
  b.hitTop,b.hitBottom=s.floorY-s.artHeight,s.floorY
 end
 function guardian.spawn(b,s)
  b.coffinUsed,b.coffinLayers,b.downTicks=false,0,0
  b.coffinContacts=setmetatable({},{__mode='k'})
  place(b,s,'idle','idle')
 end
 function guardian.cancel(b,s)
  b.coffinLayers,b.downTicks=0,0
  b.coffinContacts=setmetatable({},{__mode='k'})
  place(b,s,'idle','idle')
 end
 function guardian.onDefeat(_,b,s) guardian.cancel(b,s) end
 function guardian.checkpoint(b) return {coffinUsed=b.coffinUsed} end
 function guardian.restore(b,s,flags)
  if flags and flags.coffinUsed~=nil then b.coffinUsed=flags.coffinUsed
  else b.coffinUsed=b.hp<=math.floor(s.hp*s.coffin.threshold) end
 end
 function guardian.damageFactor(_,_,b,s)
  if s.draftMoves then return 1 end
  if b.form=='down' then return s.coffin.downFactor end
  return b.coffinLayers>0 and s.coffin.damageFactor or 1
 end
 function guardian.onHit(cast,b,s,slot,element,damage,party)
  if s.draftMoves then
   local c=slot.cast
   if not c or not c.move.lanes or c.broken or c.breakRequested or c.reposition or c.restart
      or damage<=0 or cast.reaction or cast.persistentTarget or c.coffinHits[cast] then return end
   local actor=party.actors[cast.id]
   if not actor or actor.hp<=0 then return end
   local _,now=C.fieldSlot(party,b.fieldBoss)
   local m=c.move
   local t=math.floor((now-c.startTime)*60+.5)
   if t<m.deploy or t>=m.deadline or not C.fieldCastStartedSince(party,b.fieldBoss,cast,c.startTime+m.deploy/60) then return end
   c.coffinHits[cast]=true
   c.coffinRemaining=c.coffinRemaining-1
   if c.coffinRemaining==0 then c.breakRequested=t end
   return
  end
  if b.coffinLayers<=0 or b.coffinContacts[cast] or cast.reaction or
     not C.fieldCastStartedSince(party,b.fieldBoss,cast,b.coffinOpenedAt) then return end
  b.coffinContacts[cast]=true
  local amount=element=='cryo' and 0 or effective[element] and s.coffin.effectiveLayers or 1
  b.coffinLayers=math.max(0,b.coffinLayers-amount)
 end
 function guardian.begin(b,s,m,_,state)
  local c={move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{},{}},
           source={id=b.id,owner=b,y=s.floorY,damageElement='cryo'}}
  if m.lanes then
   c.startTime,c.coffinRemaining=state.t,m.hitsToBreak
   c.coffinHits=setmetatable({},{__mode='k'})
  end
  return c
 end
 function guardian.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 local function legacyPreempt(b,s,slot)
  local c=slot.cast
  if c and c.move.kind=='coffin' and c.deployed and not c.failed and b.coffinLayers<=0 then
   slot.cast=nil;b.downTicks=s.coffin.downTicks
  end
  if b.downTicks>0 then
   place(b,s,'down','down');b.downTicks=b.downTicks-1
   if b.downTicks==0 then place(b,s,'idle','idle');slot.delay=s.restTicks end
   return true
  end
  if not b.coffinUsed and b.hp>0 and b.hp<=math.floor(s.hp*s.coffin.threshold) then
   b.coffinUsed=true
   slot.cast=guardian.begin(b,s,s.coffin.move)
   -- Preserve the next basic move index; the HP phase is not a repeating move.
  end
  return false
 end
 local function front(c,near,far)
  local from,to=c.origin+c.dir*near*U,c.origin+c.dir*far*U
  return math.min(from,to),math.max(from,to)
 end
 local function lock(s,c,a)
  local m=c.move
  if m.offsets then
   c.centers={}
   for i,offset in ipairs(m.offsets) do c.centers[i]=c.origin+c.dir*offset*U end
  elseif m.kind=='projectiles' then
   local center=clamp(a and a.x or c.origin,s.arenaMin+70,s.arenaMax-70)
   c.centers={center,clamp(center+c.dir*m.spacing*U,s.arenaMin+70,s.arenaMax-70)}
  elseif m.lanes then
   c.lanes={}
   for i,window in ipairs(m.lanes) do
    local left,right=front(c,window[1],window[2])
    c.lanes[i]={left=left,right=right}
   end
  else
   c.left,c.right=front(c,m.near,m.far)
  end
 end
 local function bounds(c,i)
  local m=c.move
  if c.lanes then return c.lanes[i].left,c.lanes[i].right end
  if c.centers then return c.centers[i]-m.width*U/2,c.centers[i]+m.width*U/2 end
  if m.kind=='coffin' and i<=2 then return c.origin-m.radius*U,c.origin+m.radius*U end
  return c.left,c.right
 end
 local function groundPlan(state,c)
  local m,left,right=c.move,math.huge,-math.huge
  for i in ipairs(m.active) do
   local from,to=bounds(c,i)
   left,right=math.min(left,from),math.max(right,to)
  end
  return C.fieldGroundRetreat(state,c.dir,left,right,m.active[1][1]-m.lock)
 end
 local function retreatPosition(state,origin,dir)
  return clamp(origin-dir*.65*U,32,state.worldwidth-32)
 end
 local function shift(b,s,goal)
  local dx=goal-b.x
  b.x=b.x+clamp(dx,-s.walkSpeed/60,s.walkSpeed/60)
  place(b,s,'reposition','ready')
  return b.x==goal
 end
 function guardian.preempt(b,s,slot,state,target)
  if not s.draftMoves then return legacyPreempt(b,s,slot) end
  local c=slot.cast
  if c and c.restart then
   slot.cast=guardian.begin(b,s,c.move,target,state)
   place(b,s,c.move.lanes and 'preparingCoffin' or 'attack','cast')
   return true
  end
  if b.coffinUsed or b.hp<=0 or b.hp>math.floor(s.hp*s.coffin.threshold)
     or not target or (c and c.tick>=c.move.recover) then return false end
  local move=s.coffin.shortMove
  local plan={move=move,origin=b.x,dir=target.x<b.x and -1 or 1}
  lock(s,plan,target)
  if not groundPlan(state,plan) then
   shift(b,s,retreatPosition(state,b.x,plan.dir))
   return true
  end
  b.coffinUsed=true
  b.facing=plan.dir
  slot.cast=guardian.begin(b,s,move,target,state)
  place(b,s,'preparingCoffin','cast')
  return true
 end
 function guardian.tick(state,b,s,c,a)
  if c.reposition then
   if shift(b,s,c.reposition) then c.restart=true end
   return false
  end
  local m,t=c.move,c.tick+1;c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then
   lock(s,c,a)
   if s.draftMoves and not groundPlan(state,c) then
    c.reposition=retreatPosition(state,c.origin,c.dir)
    c.left,c.right,c.centers,c.lanes=nil,nil,nil,nil
    place(b,s,'reposition','ready')
    return false
   end
  end
  if c.breakRequested then
   c.broken=c.breakRequested
   place(b,s,'recover','down')
   if t-c.broken<m.total-m.recover then return false end
   c.restOverride=0
   guardian.cancel(b,s);return true
  end
  if m.kind=='coffin' then
   if t==m.deploy then
    c.deployed=true;b.coffinLayers=s.coffin.layers;b.coffinOpenedAt=state.t
    b.coffinContacts=setmetatable({},{__mode='k'})
   end
   if t==m.deadline then
    c.failed=true;b.coffinLayers=0
    c.healed=math.min(s.coffin.heal,s.hp-b.hp);b.hp=b.hp+c.healed
   end
  end
  local form,pose='attack',m.kind=='slash' and 'ready' or 'cast'
  if m.kind=='coffin' then form,pose=c.failed and 'release' or 'coffin',c.failed and 'cast' or 'coffin' end
  if m.lanes then
   if t<m.deploy then form='preparingCoffin'
   elseif t<m.deadline then form,pose='coffin','coffin'
   else form='release' end
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage)
    if m.kind=='slash' then pose='slash' end
   end
  end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose)
  if t<m.total then return false end
  if m.lanes then c.restOverride=0 end
  guardian.cancel(b,s);return true
 end
 function guardian.label(b,c,s)
  if s.draftMoves then
   if b.form=='reposition' then return '位置を変えて再予告' end
   if c and c.broken then return '氷の棺を中断・反撃の隙' end
   if b.form=='recover' then return '反撃の隙' end
   if b.form=='coffin' then return '氷の棺・本体にあと'..c.coffinRemaining..'打' end
   if b.form=='release' then return '氷剣・予告範囲の外へ' end
   return c and c.move.title
  end
  if b.form=='down' then return '氷の棺が割れた・反撃の好機' end
  if c and c.move.kind=='coffin' then
   if c.failed then return '氷の棺が残った・一度だけ回復して氷剣で反撃' end
   if c.deployed then return '氷の棺 '..b.coffinLayers..' / '..s.coffin.layers..'・通常でも破壊可、炎雷風が有効' end
   return '氷の棺を展開する・本体にも攻撃できる'
  end
  return b.form=='recover' and '剣を下ろす・反撃の好機' or c and c.move.title
 end
 function guardian.frame(f,b,s,c)
  if s.draftMoves then
   f.draftMoves=true
   f.driftingSnow={coffinUsed=b.coffinUsed,repositioning=b.form=='reposition',
    interrupted=c and c.broken~=nil or false}
   if c and b.form=='coffin' then
    f.driftingSnow.hitsLeft=c.coffinRemaining
    f.driftingSnow.required=c.move.hitsToBreak
   end
   return
  end
  f.driftingSnow={coffinUsed=b.coffinUsed,layers=b.coffinLayers,maxLayers=s.coffin.layers,
   failed=c and c.failed or false,healed=c and c.healed or 0,downTicks=b.downTicks}
 end
 local function rect(f,x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 local function lane(f,left,right,y,h,active)
  if active then rect(f,left,y-h,right-left,h,blue..'33') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,blue) end
 end
 function guardian.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  if c and not c.broken and (c.left or s.draftMoves and (c.centers or c.lanes)) then
   local m=c.move
   for i,w in ipairs(m.active) do
    if c.tick<w[2] then
     local left,right=bounds(c,i)
     if (m.kind~='coffin' and not m.lanes) or c.tick>=w[1]-60 then
      lane(f,left-cam,right-cam,y,m.height*U,c.tick>=w[1])
      if m.kind=='projectiles' or (m.kind=='coffin' or m.lanes) and i>2 then
       if c.tick>=w[1]-28 then
        local x=(left+right)/2
        if s.draftMoves then
         local q=clamp((c.tick-w[1]+28)/28,0,1)
         x=c.origin+(x-c.origin)*q
        end
        C.drawDriftingSnowFieldArt(f,x-cam,y-48,'spear',mode,profile,c.dir>0)
       end
      end
     end
     break
    end
   end
  end
  C.drawDriftingSnowFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if s.draftMoves and b.form=='coffin' then
   local top=b.hitTop-16
   for i=1,c.move.hitsToBreak do
    rect(f,b.x-cam-22+(i-1)*15,top,10,6,i<=c.coffinRemaining and pale or '#525b77')
   end
  elseif b.coffinLayers>0 then
   local top=b.hitTop-18
   rect(f,b.x-cam-47,top,94,8,ink)
   for i=1,s.coffin.layers do rect(f,b.x-cam-45+(i-1)*11.5,top+2,10,4,i<=b.coffinLayers and pale or '#525b77') end
  end
 end
 return guardian
end
