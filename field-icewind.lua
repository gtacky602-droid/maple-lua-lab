return function(C)
 local icewind={}
 local U=88
 local colors={anemo='#b0f5cd',cryo='#addefe'}
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end
 local function advance(x,dest,step) return x+clamp(dest-x,-step,step) end

 local function place(body,s)
  body.y=s.floorY
  body.hitBottom=s.floorY-(body.element=='anemo' and 13 or 5)
  body.hitTop=body.hitBottom-73
 end
 function icewind.spawn(b,s)
  b.element=s.lead
  local element=b.element=='anemo' and 'cryo' or 'anemo'
  local home=s.home+s.partnerOffset
  local p=C.bindFieldPartner(b,{id=-b.id,fieldBoss=b.fieldBoss,element=element,custom=true,boss=true,
   x=home,home=home,maxhp=b.maxhp,warning=0,cd=0,respawn=math.huge,facing=-1,level=b.level})
  place(b,s);place(p,s)
 end
 function icewind.cancel(b,s)
  b.form=nil
  place(b,s);place(b.fieldPartner,s)
 end
 function icewind.walk(b,s,a,speed)
  local p=b.fieldPartner
  local goal=clamp(b.x+s.partnerOffset,s.arenaMin+63,s.arenaMax-63)
  p.x=advance(p.x,goal,speed)
  p.facing=a.x<p.x and -1 or 1
 end
 function icewind.damageFactor(state,cast,b,s)
  return b.form=='guarded' and not cast.reaction and s.guardFactor or 1
 end
 function icewind.onHit(cast,b,s,slot)
  local c=slot and slot.cast
  if not c or b.form~='guarded' or cast.reaction or c.guardCasts[cast] then return end
  c.guardCasts[cast]=true
  c.guardHits=c.guardHits+1
  if c.guardHits>=s.guardCasts then b.form='guard-broken' end
 end

 function icewind.begin(b,s,m,a)
  local p=b.fieldPartner
  local c={move=m,tick=0,origin=b.x,dir=b.facing,bodies={b,p},seen={{},{},{}},
   shots={},projectiles={},guardCasts={},guardHits=0,guardRequired=s.guardCasts,sources={}}
  for i,body in ipairs(c.bodies) do
   c.sources[i]={id=body.id,y=s.floorY,owner=body,damageElement=body.element}
  end
  return c
 end

 function icewind.shareCast(cast,actors)
  C.shareFieldHits(cast.seen,actors)
 end

 local function lock(c,s,a)
  local m=c.move
  local b,p=c.bodies[1],c.bodies[2]
  if m.kind=='duet' then
   local center=clamp(a and a.x or c.origin,s.arenaMin+2.3*U,s.arenaMax-2.3*U)
   local side=b.x<p.x and 1 or -1
   c.starts={b.x,p.x}
   c.ends={center+side*1.06*U,center-side*1.06*U}
  elseif m.kind=='wind' then
   c.center=clamp(c.origin,s.arenaMin+2.4*U,s.arenaMax-2.4*U)
   c.windStart=p.x
   local side=p.x<b.x and -1 or 1
   c.windEnd=clamp(c.center+side*2.2*U,s.arenaMin+63,s.arenaMax-63)
   if (c.windEnd-b.x)*side<1.25*U then
    c.windEnd=clamp(c.center-side*2.2*U,s.arenaMin+63,s.arenaMax-63)
   end
  elseif m.kind=='guard' then
   b.form='guarded'
  end
 end

 local function bounds(c,i)
  local m=c.move
  if m.kind=='lead' then
   local x1,x2=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   return math.min(x1,x2),math.max(x1,x2)
  end
  local center=m.kind=='duet' and c.ends[i] or
   m.kind=='wind' and (c.center+(i-2)*m.spacing*U) or c.origin
  local half=m.width*U/2
  return center-half,center+half
 end
 local function shot(c,age)
  return c.origin+c.dir*(.5+age*c.move.speed/60)*U
 end

 function icewind.tick(state,b,s,c,a)
  local p,m,t=b.fieldPartner,c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
   p.facing=a.x<p.x and -1 or 1
  end
  if t==m.lock then lock(c,s,a) end
  if c.ends and t<=m.travelEnd then
   local u=(t-m.lock)/(m.travelEnd-m.lock)
   for i,body in ipairs(c.bodies) do
    body.x=c.starts[i]+(c.ends[i]-c.starts[i])*u
    body.facing=c.ends[i]<c.starts[i] and -1 or 1
   end
  elseif c.windEnd and t<=m.travelEnd then
   local u=(t-m.lock)/(m.travelEnd-m.lock)
   p.x=c.windStart+(c.windEnd-c.windStart)*u
   p.facing=c.center<p.x and -1 or 1
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c,i)
    local iSource=m.kind=='duet' and i or 1
    C.hitFieldArea(state,c.sources[iSource],c.seen[i],left,right,s.floorY-m.height*U,m.damage,s.floorY-(m.low or 0)*U)
   end
  end
  for i,fire in ipairs(m.fire or {}) do
   local age=t-fire
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,shot(c,age),s.floorY-m.height*U,m.radius*U,m.damage,b.element)
   elseif age==m.life then c.projectiles[i]=nil end
  end
  if t>=m.recover then b.form=nil end
  return t>=m.total
 end
 function icewind.label(b,c)
  if not c then return end
  if b.form=='guarded' then return 'コペリウスの氷装甲 '..c.guardHits..'/'..c.guardRequired end
  if b.form=='guard-broken' then return '氷装甲がほどける' end
  if c.tick>=c.move.recover then return '二体が止まる・反撃' end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function cue(f,i,left,right,top,bottom,color,active)
  if active then
   rect(f,left,top,right-left,bottom-top,color..'44')
   rect(f,left,top,right-left,2,color)
   rect(f,left,top,2,bottom-top,color)
   rect(f,right-2,top,2,bottom-top,color)
  else
   rect(f,left,bottom-5,right-left,2,color)
   for x=left+5,right-6,17 do rect(f,x,bottom-10,6,2,color) end
  end
  f.draws[#f.draws+1]={kind='text',x=(left+right)/2,y=bottom-14,text=tostring(i),size=13,color=color}
 end

 function icewind.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local poses={'idle','idle'}
  if c then
   local m,t=c.move,c.tick
   if t>=m.recover then
    poses={'bow','bow'}
   elseif t>=m.lock then
    poses[1]=(m.kind=='wind' or m.kind=='guard') and 'focus' or 'attack'
    if m.kind=='duet' then poses[2]='attack' end
    if m.kind=='wind' and t>=m.travelEnd then poses[2]='focus' end
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local left,right=bounds(c,i)
      local source=m.kind=='duet' and c.bodies[i] or b
      cue(f,i,left-camera,right-camera,y-m.height*U,y-(m.low or 0)*U,colors[source.element],t>=w[1])
     end
    end
    if m.fire then
     local sy=y-m.height*U
     local x1,x2=shot(c,0)-camera,shot(c,m.life-1)-camera
     if t<m.fire[#m.fire] then
      for x=math.min(x1,x2),math.max(x1,x2)-6,16 do rect(f,x,sy,6,2,colors.cryo) end
     end
     for i,fire in ipairs(m.fire) do
      local age=t-fire
      if age>=0 and age<m.life and not c.shots[i] then
       local x=shot(c,age)-camera
       rect(f,x-7,sy-8,14,16,colors.cryo)
       rect(f,x-10,sy-4,20,8,'#eff9ff')
      end
     end
    end
   end
  end
  for i,body in ipairs({b,b.fieldPartner}) do
   local x=body.x-camera
   C.drawIcewindFieldArt(f,x,y,body.element,poses[i],mode,profile,body.facing<0)
   f.draws[#f.draws+1]={kind='text',x=x,y=y-142,text=body.element=='anemo' and '風' or '氷',size=14,color=colors[body.element]}
   if body.form=='guarded' then
    rect(f,x-31,y-109,62,3,colors.cryo)
    rect(f,x-31,y-109,3,74,colors.cryo)
    rect(f,x+28,y-109,3,74,colors.cryo)
   end
  end
 end
 return icewind
end
