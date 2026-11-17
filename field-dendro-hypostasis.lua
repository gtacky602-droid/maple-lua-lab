return function(C)
 local dendro={}
 local U=88
 local leaf,lime='#a1cb5e','#edffad'
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function place(b,s,lift)
  b.y=s.floorY-lift
  b.hitBottom=b.y-.4*U
  b.hitTop=b.hitBottom-43
  b.flying=lift>0 or nil
 end
 function dendro.spawn(b,s) place(b,s,0) end
 dendro.cancel=dendro.spawn
 local function aim(s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  if c.move.kind=='plunge' then
   local limit=c.move.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+108,s.arenaMax-108)
  end
 end
 function dendro.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={{},{}},shots={},projectiles={}}
  c.source={id=b.id,x=b.x,y=s.floorY,owner=b,damageElement='dendro'}
  aim(s,c,a)
  return c
 end
 local function bounds(c)
  if c.move.kind=='plunge' then return c.dest-.7*U,c.dest+.7*U end
  local left,right=c.origin+c.dir*.25*U,c.origin+c.dir*1.65*U
  return math.min(left,right),math.max(left,right)
 end
 local function seedX(c,age)
  return c.origin+c.dir*(.42+age*3.5/60)*U
 end
 function dendro.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(s,c,a) end
  if m.air and t>=m.air[1] and t<=m.air[2] then
   local u=(t-m.air[1])/(m.air[2]-m.air[1])
   b.x=c.origin+(c.dest-c.origin)*u
   place(b,s,4*72*u*(1-u))
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage,s.floorY-(m.low or 0)*U)
   end
  end
  for i,fire in ipairs(m.fire or {}) do
   local age=t-fire
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,seedX(c,age),s.floorY-.65*U,.13*U,m.damage,'dendro')
   elseif age==m.life then c.projectiles[i]=nil end
  end
  return t>=m.total
 end
 function dendro.label(b,c)
  if c and c.tick>=c.move.recover then return '核が地表に降りる・反撃' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function cue(f,left,right,y,active)
  local color=active and lime or leaf
  rect(f,left,y-7,right-left,2,color)
  rect(f,left,y-13,2,6,color)
  rect(f,right-2,y-13,2,6,color)
  if active then
   for i=1,4 do rect(f,left+(right-left)*i/5-3,y-18-i%2*10,6,10,color) end
  end
 end
 local function drawSeed(f,x,y)
  rect(f,x-8,y-4,16,8,'#568945')
  rect(f,x-5,y-7,10,14,leaf)
  rect(f,x-2,y-5,4,10,lime)
 end
 function dendro.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local x,pose=b.x-camera,'idle'
  if c then
   local m,t=c.move,c.tick
   pose=t>=m.recover and 'core' or m.kind=='plunge' and 'ball' or m.kind=='vine' and 'vine' or 'core'
   if t>=m.lock then
    for _,w in ipairs(m.active) do
     if t<w[2] then
      local left,right=bounds(c)
      cue(f,left-camera,right-camera,y,t>=w[1])
      break
     end
    end
    if m.kind=='seeds' and t<m.fire[#m.fire] then
     local first,last=seedX(c,0),seedX(c,m.life-1)
     for bx=math.min(first,last),math.max(first,last),19 do rect(f,bx-camera,y-.65*U,6,2,'#83a055') end
    end
   end
   if m.kind=='plunge' and t>=m.active[1][1] and t<m.active[1][1]+24 then
    local width=15+(t-m.active[1][1])*3
    rect(f,c.dest-camera-width,y-14,8,3,leaf)
    rect(f,c.dest-camera+width,y-14,8,3,leaf)
   end
  end
  local flip=c and c.dir>0 or false
  C.drawDendroHypostasisFieldArt(f,x,b.y,pose,mode,profile,flip)
  if c and c.move.fire then
   for i,fire in ipairs(c.move.fire) do
    local age=c.tick-fire
    if age<0 then drawSeed(f,x+(i-2)*13,y-89)
    elseif age<c.move.life and not c.shots[i] then drawSeed(f,seedX(c,age)-camera,y-.65*U) end
   end
  end
 end
 return dendro
end
