return function(C)
 local hydro={}
 local U=88
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function place(b,y)
  b.y=y
  b.hitBottom=y-.4*U
  b.hitTop=b.hitBottom-44
 end
 function hydro.spawn(b,s) place(b,s.floorY) end
 hydro.cancel=hydro.spawn
 local function aim(s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  local m=c.move
  if m.distance then
   local limit=m.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+64,s.arenaMax-64)
  elseif m.kind=='rain' then
   local gap=.92*U
   local center=clamp(a.x,s.arenaMin+gap+.3*U,s.arenaMax-gap-.3*U)
   for i=1,3 do c.points[i]=center+(i-2)*gap*c.dir end
  end
 end
 function hydro.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={{},{},{}},points={}}
  c.source={id=b.id,x=b.x,y=b.y,owner=b,damageElement='hydro'}
  aim(s,c,a)
  return c
 end
 local function band(c,i)
  local a,b
  if c.move.kind=='dolphin' then a,b=c.dest-.7*U,c.dest+.7*U
  elseif c.move.kind=='rain' then a,b=c.points[i]-.3*U,c.points[i]+.3*U
  else a,b=c.origin+c.dir*.3*U,c.origin+c.dir*1.5*U end
  return math.min(a,b),math.max(a,b)
 end
 local function waveX(c,age)
  return c.origin+c.dir*(c.move.waveOffset+age*c.move.waveSpeed/60)*U
 end
 function hydro.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(s,c,a) end
  if m.air and t>=m.air[1] and t<=m.air[2] then
   local p=(t-m.air[1])/(m.air[2]-m.air[1])
   b.x=c.origin+(c.dest-c.origin)*p
   place(b,s.floorY-4*m.rise*p*(1-p))
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local l,r=band(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],l,r,s.floorY-m.height*U,m.damage,s.floorY)
   end
  end
  if m.fire then
   local age=t-m.fire
   if age>=0 and age<m.life then
    local x,prev=waveX(c,age),waveX(c,math.max(0,age-1))
    C.hitFieldCapsule(state,c.source,c.seen[1],prev,x,s.floorY-.3*U,.12*U,m.damage)
   end
  end
  return t>=m.total
 end
 function hydro.label(b,c)
  if c and c.tick>=c.move.recover then return '水が引く・息継ぎ' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function mark(f,left,right,y,on)
  local color=on and '#d5ffff' or '#e7ad7b'
  rect(f,left,y-5,right-left,3,'#426277')
  rect(f,left,y-6,right-left,2,color)
  rect(f,left,y-11,2,7,color)
  rect(f,right-2,y-11,2,7,color)
 end
 function hydro.draw(f,state,b,s,c,mode,profile)
  local x,y,pose=b.x-state.camera,s.floorY,'idle'
  if c then
   local m,t=c.move,c.tick
   pose=t>=m.recover and 'recover' or m.kind
   if t>=m.lock then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local l,r=band(c,i)
      l,r=l-state.camera,r-state.camera
      local on=t>=w[1]
      mark(f,l,r,y,on)
      if m.kind=='rain' and not on then
       f.draws[#f.draws+1]={kind='text',x=(l+r)/2,y=y-13,text=tostring(i),size=11,color='#ffdfac'}
      end
      if on then
       for k=1,4 do
        local wx=l+(r-l)*k/5
        local h=math.max(7,26-(t-w[1])*2)
        rect(f,wx-3,y-h,6,h-3,'#7edfff')
        rect(f,wx-1,y-h,2,math.max(2,h-7),'#ddfcff')
       end
      end
     end
    end
    if m.fire then
     local age=t-m.fire
     if age<0 then
      for offset=0,190,19 do
       local px=waveX(c,0)+c.dir*offset-state.camera
       rect(f,px-4,y-15,8,2,'#85cbdc')
      end
     elseif age<m.life then
      local px=waveX(c,age)-state.camera
      rect(f,px-12,y-30,24,8,'#77d7ff')
      rect(f,px-8,y-35,16,5,'#d9f9ff')
     end
    end
   end
  end
  C.drawHydroHypostasisFieldArt(f,x,b.y,pose,mode,profile,c and c.dir)
 end
 return hydro
end
