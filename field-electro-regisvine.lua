return function(C)
 local U=88
 local purple,white='#c49cff','#fff3b1'
 local radius=.12*U
 local function poseFor(b,c)
  if b.down>0 or b.rise>12 then return 'down' end
  if b.rise>0 then return 'gather' end
  if not c then return 'idle' end
  local m,t=c.move,c.tick
  if t>=m.recover then return 'down' end
  if m.pattern=='slam' then
   if t<m.lock then return 'gather' end
   if t<m.active[1][1] then return 'bowed' end
   return t<132 and 'impact' or 'bowed'
  end
  return m.pattern=='bolts' and 'branches' or 'rain'
 end
 local vine=C.fieldRegisvine(C.electroRegisvineFieldArt,poseFor)
 local spawn=vine.spawn
 function vine.spawn(b,s)
  spawn(b,s)
  b.damageElement='electro'
 end
 function vine.cancel(b,s) vine.updateHeight(b,s,nil) end
 function vine.farMove(s) return s.moves[2] end
 function vine.begin(b,s,m,a)
  local dir=a.x<b.x and -1 or 1
  b.facing=dir
  return {move=m,tick=0,dir=dir,seen={{},{},{}},shots={},projectiles={}}
 end
 local function shot(b,c,age)
  local m=c.move
  return b.x+c.dir*(m.shotOrigin+age*m.shotSpeed/60)*U,b.y-m.shotHeight*U
 end
 local function band(b,c,i)
  if c.move.pattern=='slam' then
   local a,z=b.x+c.dir*.4*U,b.x+c.dir*1.6*U
   return math.min(a,z),math.max(a,z),b.y-.65*U
  end
  return c.landings[i]-.275*U,c.landings[i]+.275*U,b.y-1.3*U
 end
 local function aim(b,s,c,a,t)
  c.dir=a.x<b.x and -1 or 1;b.facing=c.dir
  if c.move.pattern=='rain' and t==c.move.lock then
   local x=math.min(s.arenaMax-1.5*U,math.max(s.arenaMin+1.5*U,a.x))
   c.landings={x-c.dir*.95*U,x,x+c.dir*.95*U}
  end
 end
 function vine.tick(s,b,spec,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and (a or t==m.lock) then aim(b,spec,c,a or {x=b.x+c.dir*U},t) end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right,top=band(b,c,i)
    C.hitFieldArea(s,b,c.seen[i],left,right,top,m.damage)
   end
  end
  for i,fired in ipairs(m.shotTicks or {}) do
   local age=t-fired
   if age>=0 and age<m.shotLife and not c.shots[i] then
    local x,y=shot(b,c,age)
    if m.pattern=='slam' then
     local last=shot(b,c,math.max(0,age-1))
     C.hitFieldCapsule(s,b,c.seen[1],last,x,y,radius,m.shotDamage)
    else C.stepFieldBolt(s,b,c,i,x,y,radius,m.shotDamage,'electro') end
   elseif age==m.shotLife then c.projectiles[i]=nil end
  end
  vine.updateHeight(b,spec,t<m.total and c or nil)
  return t>=m.total
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function mark(f,l,r,y,active)
  local color=active and white or purple
  rect(f,l,y-6,r-l,2,color)
  rect(f,l,y-12,2,6,color)
  rect(f,r-2,y-12,2,6,color)
 end
 local function spark(f,x,y,dir,wave,age)
  local length=math.min(12,4+age)
  rect(f,dir>0 and x-length-5 or x+5,y-2,length,3,'#8459c9')
  rect(f,x-8,y-4,16,8,purple)
  rect(f,x-5,y-8,10,16,purple)
  rect(f,x-3,y-5,6,10,white)
  if wave then
   rect(f,x-9,y+4,6,3,purple);rect(f,x+4,y-7,7,3,purple)
  end
 end
 local function column(f,x,top,y,left,right)
  rect(f,left,top,right-left,y-top,'#b77fff28')
  for i=0,6 do
   local jitter=(i%3-1)*6
   local h=(y-top)/7
   rect(f,x+jitter-3,top+i*h,6,h+1,purple)
   rect(f,x+jitter-1,top+i*h,2,h,white)
   if i>0 then rect(f,x-7,top+i*h,14,2,purple) end
  end
 end
 function vine.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,b.y
  local x=b.x-camera
  C.drawFieldRegisvine(f,C.electroRegisvineFieldArt,x,y,s.artHeight,b.facing>0,poseFor(b,c),mode,profile)
  if c then
   local m,t=c.move,c.tick
   if t<m.lock and m.pattern=='slam' then
    local lift=t/m.lock
    rect(f,x-c.dir*lift*20-3,y-34-lift*114,7,8,white)
   elseif t>=m.lock then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local left,right,top=band(b,c,i)
      left,right=left-camera,right-camera
      mark(f,left,right,y,t>=w[1])
      if m.pattern=='rain' then
       local center=(left+right)/2
       if t>=w[1] then column(f,center,top,y,left,right)
       else
        local inset=math.min((right-left)/3,(w[1]-t)/6)
        rect(f,center-3-inset,y-19,3,9,purple)
        rect(f,center+inset,y-19,3,9,purple)
       end
      end
     end
    end
    if m.shotTicks and t<m.shotTicks[#m.shotTicks] then
     local first,height=shot(b,c,0)
     local last=shot(b,c,m.shotLife-1)
     for j=math.min(first,last),math.max(first,last)-6,20 do rect(f,j-camera,height-1,7,2,'#896bb8') end
    end
   end
   for i,fired in ipairs(m.shotTicks or {}) do
    local age=t-fired
    if m.pattern=='bolts' and age<0 then
     local px=x+c.dir*(20+i*18)
     rect(f,px-4,y-90+i*6,8,8,purple)
     rect(f,px-2,y-88+i*6,4,4,white)
    elseif age>=0 and age<m.shotLife and not c.shots[i] then
     local bx,by=shot(b,c,age)
     spark(f,bx-camera,by,c.dir,m.pattern=='slam',age)
    end
   end
  end
  if b.coreHits>0 then
   local level=y-.35*U
   rect(f,x-8,level-6,16,12,'#714483')
   rect(f,x-4,level-4,8,8,white)
   for i=1,b.coreHits do rect(f,x-13+(i-1)*9,level+10,6,3,purple) end
  end
 end
 return vine
end
