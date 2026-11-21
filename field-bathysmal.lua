return function(C)
 local herd={}
 local U=88
 local ice,thunder='#83eeff','#dcabff'
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function advance(x,dest,step) return x+clamp(dest-x,-step,step) end
 local function place(body,s,lift)
  body.y=s.floorY-lift
  body.hitBottom=body.y-.25*U
  body.hitTop=body.hitBottom-56
  body.flying=lift>0 or nil
 end
 function herd.spawn(b,s)
  b.element='cryo'
  local spec=s.partner
  local home=s.home+spec.offset
  local pair=C.bindFieldPartner(b,{id=spec.id,element='electro',fieldBoss=b.fieldBoss,boss=true,custom=true,
   x=home,home=home,facing=-1,warning=0,cd=0,respawn=math.huge,maxhp=b.maxhp,
   drawHeight=b.drawHeight,level=b.level,resist=spec.resist})
  place(b,s,0);place(pair,s,0)
 end
 function herd.cancel(b,s)
  place(b,s,0);place(b.fieldPartner,s,0)
 end
 function herd.walk(b,s,a,speed)
  local partner=b.fieldPartner
  local goal=clamp(b.x+s.partner.offset,s.arenaMin+63,s.arenaMax-63)
  partner.x=advance(partner.x,goal,speed)
  partner.facing=a.x<partner.x and -1 or 1
 end
 local function attackSource(owner,s)
  return {id=owner.id,x=owner.x,y=s.floorY,owner=owner,damageElement=owner.element}
 end
 function herd.begin(b,s,m,a)
  local p=b.fieldPartner
  local c={move=m,tick=0,bodies={b,p},seen={{},{}},shots={},projectiles={}}
  if m.kind=='tail' then
   local d1,d2=math.abs(a.x-b.x),math.abs(a.x-p.x)
   local chosen=d1==d2 and (b.lastTail==1 and 2 or 1) or (d1<d2 and 1 or 2)
   b.lastTail=chosen
   local body=c.bodies[chosen]
   body.facing=a.x<body.x and -1 or 1
   c.chosen=chosen;c.spinX=body.x
  elseif m.kind=='volley' then
   local dir=a.x<(b.x+p.x)/2 and -1 or 1
   local min,max=s.arenaMin+42,s.arenaMax-42
   if a.x-dir*225<min or a.x-dir*225>max then dir=-dir end
   local front=clamp(a.x-dir*98,min,max)
   c.dir=dir;c.prepare={front,front-dir*126}
  else
   local center=clamp(a.x,s.arenaMin+2*U,s.arenaMax-2*U)
   c.prepare={center-1.28*U,center+1.28*U}
   c.center=center
  end
  return c
 end
 function herd.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 local function prepare(c)
  local ready=true
  for i,body in ipairs(c.bodies) do
   local x=c.prepare[i]
   if body.x~=x then
    body.facing=x<body.x and -1 or 1
    body.x=advance(body.x,x,4.2)
    ready=false
   end
  end
  if ready then
   for i,body in ipairs(c.bodies) do body.facing=c.dir or (i==1 and 1 or -1) end
   c.prepare=nil
  end
 end
 local function boltPosition(c,i,age)
  return c.starts[i]+c.dir*(22+age*3.5*U/60)
 end
 local function lockRelay(c,s,a)
  local b,p=c.bodies[1],c.bodies[2]
  local half=.65*U
  local reach=1.4*U
  local min=math.max(s.arenaMin+2*U,b.x+half-reach,p.x-half-reach)
  local max=math.min(s.arenaMax-2*U,b.x+half+reach,p.x-half+reach)
  local center=clamp(a and a.x or c.center,min,max)
  c.starts={b.x,p.x}
  c.landings={center-half,center+half}
  for i,body in ipairs(c.bodies) do body.facing=c.landings[i]<body.x and -1 or 1 end
 end
 function herd.tick(state,b,s,c,a)
  if c.prepare then prepare(c);return false end
  local m,t=c.move,c.tick+1
  c.tick=t
  if m.kind=='tail' then
   local window=m.active[1]
   if t>=window[1] and t<window[2] then
    C.hitFieldArea(state,attackSource(c.bodies[c.chosen],s),c.seen[1],c.spinX-1.3*U,c.spinX+1.3*U,s.floorY-.7*U,m.damage)
   end
  elseif m.kind=='volley' then
   if t==m.lock then c.starts={b.x,b.fieldPartner.x} end
   for i,fire in ipairs(m.fire) do
    local age=t-fire
    local body=c.bodies[i]
    if age>=0 and age<m.life and not c.shots[i] then
     C.stepFieldBolt(state,body,c,i,boltPosition(c,i,age),s.floorY-.65*U,.13*U,m.damage,body.element)
    elseif age==m.life then c.projectiles[i]=nil end
   end
  else
   if t==m.lock then lockRelay(c,s,a) end
   for i,window in ipairs(m.active) do
    local air,body=m.air[i],c.bodies[i]
    if t>=air[1] and t<air[2] then
     local u=(t-air[1])/(air[2]-air[1])
     body.x=c.starts[i]+(c.landings[i]-c.starts[i])*u
     place(body,s,4*80*u*(1-u))
    elseif t==air[2] then body.x=c.landings[i];place(body,s,0) end
    if t>=window[1] and t<window[2] then
     C.hitFieldArea(state,attackSource(body,s),c.seen[i],body.x-.55*U,body.x+.55*U,s.floorY-.6*U,m.damage)
    end
   end
  end
  return t>=m.total
 end
 function herd.label(b,c)
  if not c then return end
  if c.prepare then return '二体が位置を取る' end
  if c.tick>=c.move.recover then return '二体が伏せる・反撃' end
 end
 function herd.frame(f,b,s,c)
  if c and c.landings and c.tick<c.move.recover then
   f.relayLandings=c.landings
  end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function cue(f,n,left,right,y,color,active)
  rect(f,left,y-7,right-left,active and 5 or 2,color)
  rect(f,left,y-12,2,6,color)
  rect(f,right-2,y-12,2,6,color)
  f.draws[#f.draws+1]={kind='text',x=(left+right)/2,y=y-14,size=14,text=tostring(n),color=color}
 end
 local function ball(f,x,y,i,color)
  if i==1 then
   rect(f,x-8,y-5,16,10,color);rect(f,x-5,y-8,10,16,color);rect(f,x-3,y-3,6,6,'#eaffff')
  else
   rect(f,x-9,y-6,13,5,color);rect(f,x-3,y-2,12,5,color);rect(f,x+2,y+3,4,6,'#f2dbff')
  end
 end
 function herd.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  for i,body in ipairs({b,b.fieldPartner}) do
   local color=i==1 and ice or thunder
   local pose,lit='idle',false
   if c and not c.prepare and c.tick<c.move.recover then
    local m,t=c.move,c.tick
    if m.kind=='tail' and c.chosen==i then
     pose,lit='tail',t<m.active[1][2]
     if t>=m.lock and lit then cue(f,i,c.spinX-camera-1.3*U,c.spinX-camera+1.3*U,y,color,t>=m.active[1][1]) end
    elseif m.kind=='volley' then
     local age=t-m.fire[i]
     lit=age>=-42 and age<8
     if lit then pose='breath' end
     if age>=0 and age<m.life and not c.shots[i] then ball(f,boltPosition(c,i,age)-camera,y-.65*U,i,color) end
     if t>=m.lock and age<0 then
      local x=boltPosition(c,i,0)-camera
      cue(f,i,math.min(x,x+c.dir*68),math.max(x,x+c.dir*68),y,color,false)
     end
    elseif m.kind=='relay' then
     local air,window=m.air[i],m.active[i]
     lit=t>=air[1]-36 and t<window[2]
     if lit then pose=t>=air[1] and 'leap' or 'tail' end
     if t>=m.lock and t<window[2] then
      local x=c.landings[i]-camera
      cue(f,i,x-.55*U,x+.55*U,y,color,t>=window[1])
     end
    end
   end
   C.drawBathysmalFieldArt(f,body.x-camera,body.y,i,pose,mode,profile,body.facing>0)
   if lit then
    local x=body.x-camera
    rect(f,x-12,body.y-113,24,14,'#173241')
    f.draws[#f.draws+1]={kind='text',x=x,y=body.y-101,size=13,text=tostring(i),color=color}
   end
  end
 end
 return herd
end
