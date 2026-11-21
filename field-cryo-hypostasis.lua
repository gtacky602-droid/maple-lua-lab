return function(C)
 local cryo={}
 local U=88
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 function cryo.spawn(b,s)
  b.hitBottom=b.y-.45*U
  b.hitTop=b.hitBottom-38
 end
 cryo.cancel=cryo.spawn
 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  if c.move.kind=='wheel' then
   local limit=c.move.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+64,s.arenaMax-64)
  elseif c.move.kind=='fall' then
   local gap=.9*U
   local center=clamp(a.x,s.arenaMin+gap+22,s.arenaMax-gap-22)
   for i=1,3 do c.points[i]=center+(i-2)*gap*c.dir end
  end
 end
 function cryo.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={{},{},{}},points={}}
  c.source={id=b.id,x=b.x,y=b.y,owner=b,damageElement='cryo'}
  aim(b,s,c,a)
  return c
 end
 function cryo.shareCast(cast,actors)
  C.shareFieldHits(cast.seen,actors)
 end
 function cryo.frame(f,b,s,c)
  if not c then return end
  if c.tick>=c.move.recover then f.recovering=true end
  if c.tick>=c.move.lock and c.tick<c.move.active[#c.move.active][2] then
   if c.move.kind=='wheel' then f.destinationX=c.dest end
   if c.move.kind=='fall' then f.fallPoints=c.points end
  end
 end
 local function interval(b,c,i)
  local fall=c.move.kind=='fall'
  local x=fall and c.points[i] or b.x
  local half=(fall and .25 or .6)*U
  return x-half,x+half,b.y-(fall and .6 or 1)*U
 end
 function cryo.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='wheel' then
     local previous=b.x
     b.x=c.origin+(c.dest-c.origin)*(t-w[1])/(w[2]-w[1]-1)
     C.hitFieldCapsule(state,c.source,c.seen[i],previous,b.x,b.y-.5*U,.5*U,m.damage)
    else
     local l,r,top=interval(b,c,i)
     C.hitFieldArea(state,c.source,c.seen[i],l,r,top,m.damage,b.y)
    end
   end
  end
  return t>=m.total
 end
 function cryo.label(b,c)
  if c and c.tick>=c.move.recover then return '殻がほどける' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function mark(f,l,r,y,on)
  local color=on and '#e1fbff' or '#f5a86b'
  rect(f,l,y-6,r-l,3,'#314861')
  rect(f,l+1,y-7,r-l-2,2,color)
  rect(f,l,y-12,2,8,color)
  rect(f,r-2,y-12,2,8,color)
 end
 function cryo.draw(f,state,b,s,c,mode,profile)
  local x,y=b.x-state.camera,b.y
  local pose='idle'
  if c then
   local m,t=c.move,c.tick
   pose=t>=m.recover and 'recover' or m.kind
   if t>=m.lock then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local l,r,top
      if m.kind=='wheel' then
       l,r,top=math.min(c.origin,c.dest)-.5*U,math.max(c.origin,c.dest)+.5*U,y-88
      else l,r,top=interval(b,c,i) end
      l,r=l-state.camera,r-state.camera
      local on=t>=w[1]
      mark(f,l,r,y,on)
      if m.kind=='fall' then
       local cx=(l+r)/2
       if not on then
        f.draws[#f.draws+1]={kind='text',x=cx,y=y-12,size=11,text=tostring(i),color='#ffdfa6'}
       end
       if t>=w[1]-10 then
        local z=on and top or top-(w[1]-t)*9
        rect(f,cx-6,z,12,28,'#78d6f5')
        rect(f,cx-2,z+5,4,27,'#def8ff')
       end
      elseif on and m.kind=='clap' then
       rect(f,x-10,top+8,20,7,'#a2def4')
       rect(f,x-2,top+5,4,54,'#e4fbff')
      elseif on then
       local angle=(t-w[1])*.33
       for j=1,5 do
        local a=angle+j*2*math.pi/5
        rect(f,x+math.cos(a)*39-3,y-44+math.sin(a)*39,6,5,'#baf5ff')
       end
      end
     end
    end
   end
  end
  C.drawCryoHypostasisFieldArt(f,x,y,pose,mode,profile)
 end
 return cryo
end
