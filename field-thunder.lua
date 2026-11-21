return function(C)
 local thunder={}
 local U=88
 local function place(b,s,lift,height)
  b.y=s.floorY-lift
  b.hitBottom=b.y-.4*U
  b.drawHeight=height
  b.hitTop=b.hitBottom-height
 end
 function thunder.spawn(b,s) place(b,s,0,s.artHeight) end
 thunder.cancel=thunder.spawn
 local function poseFor(c)
  local m,t=c.move,c.tick
  if t>=m.recover then return 'recover' end
  if m.kind=='wing' and t>=m.active[1][1] then return 'feathers' end
  return m.kind
 end
 local function poseHeight(c)
  return C.thunderFieldArt[poseFor(c)].profiles.legacy.height
 end
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  if c.move.distance then
   local limit=c.move.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+63,s.arenaMax-63)
  end
 end
 function thunder.begin(b,s,m,a)
  local c={move=m,origin=b.x,tick=0,seen={},projectiles={},shots={}}
  aim(b,s,c,a)
  place(b,s,0,poseHeight(c))
  return c
 end
 function thunder.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end
 function thunder.frame(f,b,s,c)
  f.flying=b.y<s.floorY
  if c and c.move.kind=='dash' and c.tick>=c.move.lock and c.tick<c.move.active[1][2] then
   f.destinationX=c.dest
  end
 end
 local function feather(c,age)
  return c.origin+c.dir*(.42+age*4/60)*U
 end
 function thunder.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  local w=m.active[1]
  local lift=0
  if m.kind=='wing' then
   if t>=w[1] and t<w[2] then
    C.hitFieldArea(state,b,c.seen,b.x-1.4*U,b.x+1.4*U,s.floorY-.8*U,m.damage,s.floorY)
   end
  elseif m.kind=='feathers' then
   for i,fired in ipairs(m.fire) do
    local age=t-fired
    if age>=0 and age<m.life and not c.shots[i] then
     C.stepFieldBolt(state,b,c,i,feather(c,age),s.floorY-.65*U,.12*U,m.damage,'electro')
    elseif age==m.life then c.projectiles[i]=nil end
   end
  else
   if t>=m.air[1] and t<m.air[2] then
    local p=(t-m.air[1])/(m.air[2]-m.air[1])
    lift=4*m.rise*p*(1-p)
   end
   if t>=w[1] and t<w[2] then
    local previous=b.x
    b.x=c.origin+(c.dest-c.origin)*(t-w[1])/(w[2]-w[1]-1)
    local half=.35*U
    C.hitFieldArea(state,b,c.seen,math.min(previous,b.x)-half,math.max(previous,b.x)+half,
      s.floorY-.8*U,m.damage,s.floorY-.2*U)
   end
  end
  place(b,s,lift,t>=m.total and s.artHeight or poseHeight(c))
  return t>=m.total
 end
 function thunder.label(b,c)
  if c and c.tick>=c.move.recover then return '翼を下ろす・息継ぎ' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function band(f,l,r,y,color)
  rect(f,l,y-4,r-l,3,color)
  rect(f,l,y-13,2,9,color)
  rect(f,r-2,y-13,2,9,color)
 end
 function thunder.draw(f,state,b,s,c,mode,profile)
  local x,y=b.x-state.camera,s.floorY
  if c then
   local m,t=c.move,c.tick
   local w=m.active[1]
   if w and t>=m.lock and t<w[2] then
    local l,r=x-1.4*U,x+1.4*U
    if m.kind=='dash' then
     l=math.min(c.origin,c.dest)-state.camera-.35*U
     r=math.max(c.origin,c.dest)-state.camera+.35*U
    end
    local color=t>=w[1] and '#fbdaff' or '#da98ee'
    band(f,l,r,y,color)
    if t>=w[1] then
     local left=m.kind=='dash' and x-c.dir*45 or l
     for i=0,3 do rect(f,left+i*12,y-50-i*5,27,4,color) end
    end
   elseif m.kind=='feathers' and t>=m.lock then
    local h=y-.65*U
    for i,fired in ipairs(m.fire) do
     local age=t-fired
     if age<0 then
      local marker=x+c.dir*(20+i*13)
      rect(f,marker-4,h-10-i*5,8,4,'#d7b7ff')
     elseif age<m.life and not c.shots[i] then
      local p=feather(c,age)-state.camera
      rect(f,p-10,h-3,20,6,'#ab64e3')
      rect(f,p-6,h-2,12,3,'#f9e1ff')
     end
    end
   end
  end
  C.drawThunderFieldArt(f,x,b.hitBottom,b.drawHeight,mode,profile,c and poseFor(c),c and c.dir)
 end
 return thunder
end
