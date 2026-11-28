return function(C)
 local pyro={}
 local U=88
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function place(b,y)
  b.y=y
  b.hitBottom=y-.45*U
  b.hitTop=b.hitBottom-41
 end
 function pyro.spawn(b,s) place(b,s.floorY) end
 pyro.cancel=pyro.spawn

 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  if c.move.distance then
   local limit=c.move.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+64,s.arenaMax-64)
  end
 end
 function pyro.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={},projectiles={},shots={}}
  c.source={id=b.id,x=b.x,y=b.y,owner=b,damageElement='pyro'}
  aim(b,s,c,a)
  return c
 end
 function pyro.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end
 function pyro.frame(f,b,s,c)
  f.flying=b.y<s.floorY
  if not c then return end
  if c.tick>=c.move.recover then f.recovering=true end
  if c.dest and c.tick>=c.move.lock and c.tick<c.move.active[1][2] then
   f.destinationX=c.dest
  end
 end
 local function progress(t,first,last) return (t-first)/(last-first) end
 local function ball(c,age)
  return c.origin+c.dir*(.48+age*4/60)*U
 end
 function pyro.tick(state,b,s,c,a)
  local t,m=c.tick+1,c.move
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  if m.air and t>=m.air[1] and t<=m.air[2] then
   local p=progress(t,m.air[1],m.air[2])
   b.x=c.origin+(c.dest-c.origin)*p
   place(b,s.floorY-4*m.rise*p*(1-p))
  end
  local w=m.active[1]
  if w and t>=w[1] and t<w[2] then
   if m.kind=='boar' then
    local prev=b.x
    b.x=c.origin+(c.dest-c.origin)*progress(t,w[1],w[2]-1)
    C.hitFieldCapsule(state,c.source,c.seen,prev,b.x,s.floorY-.375*U,.3*U,m.damage,.275*U)
   else
    C.hitFieldArea(state,c.source,c.seen,b.x-.75*U,b.x+.75*U,s.floorY-.65*U,m.damage,s.floorY)
   end
  end
  for i,fired in ipairs(m.fire or {}) do
   local age=t-fired
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,ball(c,age),s.floorY-.7*U,.13*U,m.damage,'pyro')
   elseif age==m.life then c.projectiles[i]=nil end
  end
  return t>=m.total
 end
 function pyro.label(b,c)
  if c and c.tick>=c.move.recover then return '反撃の隙・炎がほどける' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function marker(f,left,right,y,active)
  local color=active and '#ffedba' or '#ee9557'
  rect(f,left,y-7,right-left,3,'#553943')
  rect(f,left,y-6,right-left,2,color)
  rect(f,left,y-13,2,8,color)
  rect(f,right-2,y-13,2,8,color)
 end
 function pyro.draw(f,state,b,s,c,mode,profile)
  local x,pose=b.x-state.camera,'idle'
  if c then
   local t,m=c.tick,c.move
   local w=m.active[1]
   pose=t>=m.recover and 'recover' or m.kind
   if w and t>=m.lock and t<w[2] then
    local destination,origin=c.dest-state.camera,c.origin-state.camera
    local lo,hi=destination-.75*U,destination+.75*U
    if m.kind=='boar' then
     lo,hi=math.min(origin,destination)-.3*U,math.max(origin,destination)+.3*U
    end
    marker(f,lo,hi,s.floorY,t>=w[1])
    if t>=w[1] then
     for i=-2,2 do
      local h=15-math.abs(i)*4
      rect(f,x+i*12,s.floorY-h-5,7,h,'#ed6c3e')
      rect(f,x+i*12+1,s.floorY-h-3,3,h-3,'#ffd17f')
     end
    end
   elseif m.fire and t>=m.lock then
    local height=s.floorY-.7*U
    for i,fired in ipairs(m.fire) do
     local age=t-fired
     if age<0 then
      local px=x+c.dir*(35+i*10)
      rect(f,px-3,height-14,6,6,'#ffb270')
     elseif age<m.life and not c.shots[i] then
      local px=ball(c,age)-state.camera
      rect(f,px-c.dir*14-6,height-3,12,5,'#d7694a')
      rect(f,px-9,height-8,18,16,'#ffac61')
      rect(f,px-5,height-5,10,10,'#ffe5a7')
     end
    end
   end
  end
  C.drawPyroHypostasisFieldArt(f,x,b.y,pose,mode,profile,c and c.dir)
 end
 return pyro
end
