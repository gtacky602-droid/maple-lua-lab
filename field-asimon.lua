return function(C)
 local matrix={}
 local U=88
 local gold,white,dark='#ffd590','#fff5d2','#402d45'
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end

 function matrix.spawn(b,s)
  b.hitBottom=s.floorY-.4*U
  b.hitTop=b.hitBottom-43
 end
 matrix.cancel=matrix.spawn

 local function aim(s,c,a)
  local m=c.move
  c.dir=a.x<c.origin and -1 or 1
  if m.kind=='pillars' then
   local center=clamp(a.x,s.arenaMin+1.4*U,s.arenaMax-1.4*U)
   c.points={center-m.spacing*U,center,center+m.spacing*U}
  elseif m.kind=='cloak' then
   local delta=clamp(a.x-c.origin,-m.distance*U,m.distance*U)
   c.dest=clamp(c.origin+delta,s.arenaMin+63,s.arenaMax-63)
  end
 end

 function matrix.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={{},{},{}}}
  c.source={id=b.id,y=s.floorY,owner=b,damageElement=m.element}
  aim(s,c,a)
  return c
 end
 function matrix.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 local function bounds(c,i,y)
  local m=c.move
  if m.kind=='ray' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   return math.min(near,far),math.max(near,far),y-m.height*U,y-m.low*U
  end
  local center=m.kind=='pillars' and c.points[i] or c.dest
  local half=m.width*U/2
  return center-half,center+half,y-m.height*U,y
 end

 function matrix.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(s,c,a) end
  if m.travel and t>=m.travel[1] and t<=m.travel[2] then
   local u=(t-m.travel[1])/(m.travel[2]-m.travel[1])
   b.x=c.origin+(c.dest-c.origin)*u*u*(3-2*u)
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right,top,bottom=bounds(c,i,s.floorY)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,top,m.damage,bottom)
   end
  end
  return t>=m.total
 end

 local function cloaked(c)
  local travel=c and c.move.travel
  return travel and c.tick>=travel[1] and c.tick<travel[2]
 end
 function matrix.label(b,c)
  if cloaked(c) then return '透影移動・核に攻撃可能' end
  if c and c.tick>=c.move.recover then return '反撃の隙・外装が緩む' end
 end
 function matrix.frame(f,b,s,c)
  f.cloaked=not not cloaked(c)
  if c and c.tick>=c.move.lock then f.destination=c.dest end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function cue(f,left,right,top,bottom,kind,active)
  local middle=(left+right)/2
  if active then
   rect(f,left,top,right-left,bottom-top,'#f8b65555')
   rect(f,left,top,2,bottom-top,gold)
   rect(f,right-2,top,2,bottom-top,gold)
   if kind=='pillars' then
    rect(f,middle-5,top,10,bottom-top,white)
   else
    rect(f,left,top,right-left,2,gold)
    rect(f,left,(top+bottom)/2-3,right-left,6,white)
    rect(f,left,bottom-2,right-left,2,gold)
   end
  elseif kind=='ray' then
   for x=left,right-7,14 do rect(f,x,(top+bottom)/2,7,2,gold) end
  else
   rect(f,left,bottom-4,right-left,2,gold)
   rect(f,left,bottom-9,2,5,gold)
   rect(f,right-2,bottom-9,2,5,gold)
   rect(f,middle-5,bottom-12,10,3,white)
  end
 end

 local function cloakOutline(f,x,y)
  for i=0,4 do
   local dx,dy=6+i*6,-98+i*10
   rect(f,x-dx-3,y+dy,5,3,white)
   rect(f,x+dx-2,y+dy,5,3,white)
  end
  rect(f,x-11,y-69,22,16,dark)
  rect(f,x-8,y-67,16,12,gold)
  rect(f,x-5,y-64,10,6,white)
 end

 function matrix.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local x,pose=b.x-camera,'idle'
  local soft=cloaked(c) and .45 or nil
  rect(f,x-35,y-5,70,5,dark)
  rect(f,x-30,y-6,60,2,'#ab7f60')
  if c then
   local m,t=c.move,c.tick
   pose=t>=m.recover and 'recover' or m.kind
   if m.travel then
    if t>=m.travel[2] and t<m.recover then pose='idle' end
   end
   for i,w in ipairs(m.active) do
    if t<w[2] then
     local active=t>=w[1]
     if t>=m.lock or m.kind=='pillars' then
      local left,right,top,bottom=bounds(c,i,y)
      cue(f,left-camera,right-camera,top,bottom,m.kind,active)
     end
     -- A shared beam band is drawn once even though each emitter has a hit group.
     if m.kind=='ray' then break end
    end
   end
  end
  C.drawAsimonFieldArt(f,x,y,pose,mode,profile,c and c.dir<0,soft)
  if pose=='cloak' then cloakOutline(f,x,y) end
  if c and c.move.kind=='pillars' and c.tick>=c.move.lock then
   for i,window in ipairs(c.move.active) do
    if c.tick<window[2] then
     C.drawFieldImpactNumber(f,c.points[i]-camera,y,i,white)
    end
   end
  end
  if pose=='ray' then
   local t=c.tick
   local side=t<c.move.active[1][2] and -1 or 1
   rect(f,x+side*c.dir*58-3,y-64,6,5,white)
  end
 end
 return matrix
end
