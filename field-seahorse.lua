return function(C)
 local seahorse={}
 local U=88
 local blue,pink,white,dark='#b9cdfc','#e1a0ff','#f6edff','#392853'
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end

 local function place(b,s,lift)
  b.y=s.floorY-lift
  b.hitBottom=b.y-.32*U
  b.hitTop=b.hitBottom-67
  b.flying=lift>0 or nil
 end
 function seahorse.spawn(b,s)
  b.form='pearl'
  b.weakpoint=nil
  place(b,s,0)
 end
 seahorse.cancel=seahorse.spawn

 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  b.facing=c.dir
  if c.move.air then
   local limit=c.move.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+63,s.arenaMax-63)
  end
 end

 function seahorse.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={},shots={},projectiles={},pearlCasts={}}
  c.source={id=b.id,y=s.floorY,owner=b,damageElement=m.element}
  aim(b,s,c,a)
  return c
 end
 function seahorse.shareCast(c,actors)
  C.shareFieldHits({c.seen},actors)
 end

 function seahorse.frame(f,b,s,c)
  f.flying=b.flying
  if c and c.dest and not c.interrupted and c.tick>=c.move.lock and c.tick<c.move.recover then
   f.destinationX=c.dest
  end
 end

 function seahorse.onHit(cast,b,s,slot)
  local c=slot and slot.cast
  if not c or not b.weakpoint or cast.reaction or c.pearlCasts[cast] or not C.hitFieldWeakpoint(cast,b) then return end
  c.pearlCasts[cast]=true
  local point=b.weakpoint
  point.hits=point.hits+1
  if point.hits>=point.required then
   seahorse.spawn(b,s)
   b.form='dim'
   c.interrupted=true
   c.tick=c.move.recover
  end
 end

 local function bounds(c)
  local m=c.move
  if m.air then return c.dest-m.width*U/2,c.dest+m.width*U/2 end
  local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
  return math.min(near,far),math.max(near,far)
 end
 local function shotX(c,age)
  return c.origin+c.dir*(.44+age*c.move.speed/60)*U
 end

 function seahorse.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  if m.air then
   if t==m.lock then
    b.form='charging'
    b.weakpoint={x=b.x+c.dir*s.pearl.forward*U,y=s.floorY-s.pearl.height*U,radius=s.pearl.radius*U,hits=0,required=s.pearl.casts}
   end
   if t==m.air[1] then b.weakpoint=nil;b.form='airborne' end
   if t>=m.air[1] and t<=m.air[2] then
    local u=(t-m.air[1])/(m.air[2]-m.air[1])
    b.x=c.origin+(c.dest-c.origin)*u
    place(b,s,4*m.lift*u*(1-u))
   end
   if t>=m.recover then b.form='dim' end
  end
  for _,window in ipairs(m.active) do
   if t>=window[1] and t<window[2] then
    local left,right=bounds(c)
    C.hitFieldArea(state,c.source,c.seen,left,right,s.floorY-m.height*U,m.damage,s.floorY-(m.low or 0)*U)
   end
  end
  for i,fired in ipairs(m.fire or {}) do
   local age=t-fired
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,shotX(c,age),s.floorY-m.height*U,m.radius*U,m.damage,m.element)
   elseif age==m.life then c.projectiles[i]=nil end
  end
  if t<m.total then return false end
  seahorse.spawn(b,s)
  return true
 end

 function seahorse.label(b,c)
  if b.weakpoint then
   return '真珠に攻撃 '..b.weakpoint.hits..'/'..b.weakpoint.required
  end
  if b.form=='dim' then return c.interrupted and '真珠が消灯・反撃' or '着地して真珠が消灯・反撃' end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function pearl(f,x,y,lit)
  local color=lit and blue or '#8b7dbd'
  rect(f,x-7,y-5,14,10,dark)
  rect(f,x-4,y-7,8,14,dark)
  rect(f,x-5,y-4,10,8,color)
  rect(f,x-3,y-5,6,10,color)
  rect(f,x-2,y-3,4,3,lit and white or color)
 end

 function seahorse.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local x,pose=b.x-camera,'idle'
  if c then
   local m,t=c.move,c.tick
   if b.form=='dim' then pose='dim'
   elseif t<m.recover then
    pose=m.air and (t>=m.air[1] and 'dive' or 'charge') or m.kind
   end
   if t>=m.lock then
    if m.fire then
     local first,last=shotX(c,0)-camera,shotX(c,m.life-1)-camera
     local beamY=y-m.height*U
     if t<m.fire[#m.fire] then
      for x1=math.min(first,last),math.max(first,last)-6,15 do rect(f,x1,beamY,6,2,pink) end
     end
     for i,fired in ipairs(m.fire) do
      local age=t-fired
      if age>=0 and age<m.life and not c.shots[i] then
       local px=shotX(c,age)-camera
       rect(f,px-c.dir*10-3,beamY-3,6,6,pink)
       pearl(f,px,beamY,true)
      end
     end
    else
     local w=m.active[1]
     if t<w[2] then
      local left,right=bounds(c)
      left,right=left-camera,right-camera
      rect(f,left,y-7,right-left,2,blue)
      rect(f,left,y-13,2,6,blue)
      rect(f,right-2,y-13,2,6,blue)
      if t>=w[1] then
       local top,bottom=y-m.height*U,y-(m.low or 0)*U
       rect(f,left,top,right-left,bottom-top,'#b9cdfc55')
       rect(f,left,top,right-left,2,white)
       rect(f,left,top,2,bottom-top,blue)
       rect(f,right-2,top,2,bottom-top,blue)
      end
     end
    end
   end
  end
  C.drawSeahorseFieldArt(f,x,b.y,pose,mode,profile,b.facing>0)
  local point=b.weakpoint
  if point then
   local px,py=point.x-camera,point.y
   pearl(f,px,py,true)
   for i=1,point.required do
    rect(f,px+(i-(point.required+1)/2)*8-3,py-13,6,3,i<=point.hits and white or blue)
   end
  end
 end
 return seahorse
end
