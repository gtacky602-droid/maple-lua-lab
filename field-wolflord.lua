return function(C)
 local wolf={}
 local U=88
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function place(b,s,lift)
  b.y=s.floorY-lift
  b.hitBottom=b.y-.35*U
  b.hitTop=b.hitBottom-57
 end
 function wolf.spawn(b,s) place(b,s,0) end
 wolf.cancel=wolf.spawn
 local function aim(b,s,c,a)
  if c.move.kind=='tail' then return end
  c.dir=a.x<c.origin and -1 or 1
  b.facing=c.dir
  if c.move.distance then
   local limit=c.move.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+64,s.arenaMax-64)
  end
 end
 function wolf.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,dir=b.facing,seen={},projectiles={},shots={}}
  c.source={id=b.id,x=b.x,y=b.y,owner=b,damageElement='physical'}
  aim(b,s,c,a)
  return c
 end
 function wolf.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end
 function wolf.frame(f,b,s,c)
  f.flying=b.y<s.floorY
  if not c then return end
  if c.dest and c.tick>=c.move.lock and c.tick<c.move.active[1][2] then
   f.destinationX=c.dest
  end
  if c.move.fire then
   f.skulls={}
   for i in ipairs(c.move.fire) do
    local p=c.projectiles[i]
    if p and not c.shots[i] then f.skulls[#f.skulls+1]={index=i,x=p.x,y=p.y} end
   end
  end
 end
 local function tailBand(c)
  local a,b=c.origin-c.dir*2*U,c.origin-c.dir*.4*U
  return math.min(a,b),math.max(a,b)
 end
 local function skull(c,age)
  return c.origin+c.dir*(.37+age*3.5/60)*U
 end
 function wolf.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  local lift=0
  if m.air and t>=m.air[1] and t<m.air[2] then
   local progress=(t-m.air[1])/(m.air[2]-m.air[1])
   lift=4*m.rise*progress*(1-progress)
  end
  local w=m.active[1]
  if w and t>=w[1] and t<w[2] then
   if m.kind=='ram' then
    local prev=b.x
    b.x=c.origin+(c.dest-c.origin)*(t-w[1])/(w[2]-w[1]-1)
    C.hitFieldCapsule(state,c.source,c.seen,prev,b.x,s.floorY-.475*U,.35*U,m.damage,.325*U)
   else
    local l,r=tailBand(c)
    C.hitFieldArea(state,c.source,c.seen,l,r,s.floorY-.65*U,m.damage,s.floorY-.1*U)
   end
  end
  for i,fired in ipairs(m.fire or {}) do
   local age=t-fired
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,skull(c,age),s.floorY-.7*U,.16*U,m.damage,'physical')
   elseif age==m.life then c.projectiles[i]=nil end
  end
  place(b,s,lift)
  return t>=m.total
 end
 function wolf.label(b,c)
  if c and c.tick>=c.move.recover then return '頭を下げる・息継ぎ' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function band(f,l,r,y,on)
  local color=on and '#fff1b0' or '#e8aa63'
  rect(f,l,y-5,r-l,3,'#4b3e53')
  rect(f,l,y-6,r-l,2,color)
  rect(f,l,y-12,2,8,color)
  rect(f,r-2,y-12,2,8,color)
 end
 function wolf.draw(f,state,b,s,c,mode,profile)
  local x,y,pose=b.x-state.camera,s.floorY,'idle'
  if c then
   local m,t=c.move,c.tick
   local w=m.active[1]
   if t>=m.recover then pose='recover'
   elseif m.kind~='ram' or t>=m.lock then pose=m.kind end
   if t>=m.lock and w and t<w[2] then
    local l,r
    if m.kind=='ram' then l,r=math.min(c.origin,c.dest)-.35*U,math.max(c.origin,c.dest)+.35*U
    else l,r=tailBand(c) end
    l,r=l-state.camera,r-state.camera
    local on=t>=w[1]
    band(f,l,r,y,on)
    if on then
     local start=m.kind=='ram' and x-18 or l
     for i=0,3 do rect(f,start+i*13,y-42-i*4,27,3,'#fad389') end
    end
   elseif t>=m.lock and m.fire then
    local h=y-.7*U
    for i,fired in ipairs(m.fire) do
     local age=t-fired
     if age<0 then
      local px=x+c.dir*(25+i*12)
      rect(f,px-3,h-11,7,4,'#e9b77e')
     elseif age<m.life and not c.shots[i] then
      C.drawWolflordFieldArt(f,skull(c,age)-state.camera,h+13,'skull',mode,profile,c.dir)
     end
    end
   end
  end
  C.drawWolflordFieldArt(f,x,b.y,pose,mode,profile,b.facing)
 end
 return wolf
end
