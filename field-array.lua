return function(C)
 local array={}
 local U=88
 local function place(b,s,y)
  b.y=y
  b.hitTop=y-109
  b.hitBottom=y-.45*U
 end
 function array.spawn(b,s) place(b,s,s.floorY) end
 array.cancel=array.spawn
 local function clamp(v,lo,hi) return math.max(lo,math.min(hi,v)) end
 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  b.facing=c.dir
  local distance=c.move.distance
  if distance then
   local delta=clamp(a.x-c.origin,-distance*U,distance*U)
   c.dest=clamp(c.origin+delta,s.arenaMin+63,s.arenaMax-63)
  end
 end
 function array.begin(b,s,m,a)
  local c={move=m,origin=b.x,tick=0,seen={}}
  aim(b,s,c,a)
  return c
 end
 function array.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end
 local function poseFor(cast)
  return cast and cast.tick<cast.move.recover and cast.move.art or 'core'
 end
 function array.frame(f,b,s,c)
  f.form=poseFor(c)
  f.flying=b.y<s.floorY
  if c and c.dest and c.tick>=c.move.lock and c.tick<c.move.active[1][2] then
   f.destinationX=c.dest
  end
 end
 local function path(c,t,start,finish)
  local p=clamp((t-start)/(finish-start),0,1)
  return c.origin+(c.dest-c.origin)*p,p
 end
 function array.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if a and t<=m.lock then aim(b,s,c,a) end
  if m.air and t>=m.air[1] and t<=m.air[2] then
   local x,p=path(c,t,m.air[1],m.air[2])
   b.x=x
   place(b,s,s.floorY-4*m.rise*p*(1-p))
  end
  local w=m.active[1]
  if t>=w[1] and t<w[2] then
   if m.roll then
    local previous=b.x
    b.x=path(c,t,w[1],w[2]-1)
    C.hitFieldCapsule(state,b,c.seen,previous,b.x,b.y-.55*U,.55*U,m.damage)
   else
    local a1=m.air and b.x-.75*U or b.x+c.dir*.3*U
    local a2=m.air and b.x+.75*U or b.x+c.dir*2*U
    C.hitFieldArea(state,b,c.seen,math.min(a1,a2),math.max(a1,a2),b.y-(m.air and .65 or 1.15)*U,m.damage,b.y-(m.air and 0 or .2)*U)
   end
  end
  return t>=m.total
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 function array.draw(f,state,b,s,c,mode,profile)
  local x,y=b.x-state.camera,b.y
  local style=poseFor(c)
  if style~='core' then
   local m,t=c.move,c.tick
   local w=m.active[1]
   local color=t>=w[1] and '#fff1b2' or '#f0ae68'
   if t>=m.lock and t<w[2] then
    local p=c.origin-state.camera
    local a1,a2
    if m.air then a1,a2=c.dest-state.camera-.75*U,c.dest-state.camera+.75*U
    elseif m.roll then
     local dest=c.dest-state.camera
     a1,a2=math.min(p,dest)-.55*U,math.max(p,dest)+.55*U
    else a1,a2=p+c.dir*.3*U,p+c.dir*2*U end
    rect(f,math.min(a1,a2)-1,s.floorY-6,math.abs(a2-a1)+2,3,color)
   end
   if style=='blade' then
    for i=0,5 do rect(f,x+c.dir*(12+i*17)-10,y-67-i*3,20,7,color) end
   elseif style=='wheel' then
    for i=1,8 do
     local angle=i*math.pi/4+c.tick*.14
     rect(f,x+math.cos(angle)*45-7,y-49+math.sin(angle)*40-5,14,10,color)
    end
   elseif y<s.floorY then
    rect(f,x-7,y-39,14,18,'#ffbb64')
   end
  end
  local bottom=y-(style=='wheel' and 5 or .45*U)
  C.drawArrayFieldArt(f,x,bottom,style,mode,profile,b.facing)
 end
 return array
end
