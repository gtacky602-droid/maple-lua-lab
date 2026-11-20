return function(C)
 local baptist={}
 local U=88
 local white,dark='#f7edff','#2a1736'
 local palette={pyro='#ffab72',cryo='#aae8ff',hydro='#64baff',electro='#d3a4ff'}
 local glyphs={
  pyro={{2,0,2,1},{2,1,3,1},{1,2,4,1},{0,3,5,1},{1,4,3,1}},
  cryo={{2,0,1,5},{0,2,5,1},{1,1,1,1},{3,1,1,1},{1,3,1,1},{3,3,1,1}},
  hydro={{2,0,1,1},{1,1,3,1},{0,2,5,2},{1,4,3,1}},
  electro={{3,0,2,1},{2,1,2,1},{1,2,3,1},{2,3,1,1},{1,4,1,1}},
 }
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end

 function baptist.spawn(b,s,generation)
  b.hitBottom=s.floorY-.25*U
  b.hitTop=b.hitBottom-108
  if s.elementVariants then
   b.elementSlots=s.elementVariants[(generation-1)%#s.elementVariants+1]
  else
   b.elementSlots=s.elementFallback
  end
 end
 function baptist.cancel(b) b.facing=-1 end

 local function aim(b,s,c,a)
  local m=c.move
  c.dir=a.x<c.origin and -1 or 1
  if m.kind=='fall' then
   local near=.5*U
   local span=2*m.spacing*U
   local half=m.width*U/2
   local room=c.dir==1 and s.arenaMax-c.origin or c.origin-s.arenaMin
   if room<near+span+half then
    c.dir=-c.dir
    room=c.dir==1 and s.arenaMax-c.origin or c.origin-s.arenaMin
   end
   near=clamp((a.x-c.origin)*c.dir-m.spacing*U,near,room-span-half)
   c.center=c.origin+c.dir*(near+m.spacing*U)
  elseif m.kind=='rings' then
   local margin=(m.spacing+m.width/2+.5)*U
   c.center=clamp(a.x,s.arenaMin+margin,s.arenaMax-margin)
  end
  b.facing=c.dir
 end

 function baptist.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={{},{},{}},sources={},slots=b.elementSlots,shots={},projectiles={}}
  for i,element in ipairs(c.slots) do
   c.sources[i]={id=b.id,y=s.floorY,owner=b,damageElement=element}
  end
  aim(b,s,c,a)
  return c
 end

 function baptist.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 local function slot(c,i)
  return c.move.slot or i
 end
 local function point(c,i)
  local dir=c.move.kind=='fall' and c.dir or 1
  return c.center+(i-2)*c.move.spacing*U*dir
 end
 local function shotX(c,age)
  return c.origin+c.dir*(.43+age*c.move.speed/60)*U
 end

 function baptist.frame(f,b,s,c)
  if not c or c.tick<c.move.lock or c.move.kind=='bolt' then return end
  local m=c.move
  f.warnings={}
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    local x,half=point(c,i),m.width*U/2
    f.warnings[#f.warnings+1]={left=x-half,right=x+half,order=i,element=c.slots[slot(c,i)],
     first=w[1],after=w[2],active=c.tick>=w[1]}
   end
  end
 end

 function baptist.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local x,half=point(c,i),m.width*U/2
    C.hitFieldArea(state,c.sources[slot(c,i)],c.seen[i],x-half,x+half,s.floorY-m.height*U,m.damage)
   end
  end
  for i,fire in ipairs(m.fire or {}) do
   local age=t-fire
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,shotX(c,age),s.floorY-m.height*U,m.radius*U,m.damage,c.slots[m.slot])
   elseif age==m.life then c.projectiles[i]=nil end
  end
  return t>=m.total
 end

 function baptist.label(b,c)
  if c and c.tick>=c.move.recover then return '詠唱終了・反撃' end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function glyph(f,element,x,y,size)
  local q=size/5
  for _,r in ipairs(glyphs[element]) do
   rect(f,x+(r[1]-2.5)*q,y+(r[2]-2.5)*q,r[3]*q,r[4]*q,palette[element])
  end
 end
 local function mark(f,element,x,y,half)
  local color=palette[element]
  rect(f,x-half+7,y-9,2*half-14,2,color)
  rect(f,x-half+7,y-2,2*half-14,2,color)
  rect(f,x-half,y-7,7,4,color)
  rect(f,x+half-7,y-7,7,4,color)
 end

 function baptist.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local x,pose=b.x-camera,'idle'
  if c then
   local m,t=c.move,c.tick
   pose=t>=m.recover and 'recover' or m.kind
   if t>=m.lock and t<m.recover then
    if m.fire then
     local lineY=y-m.height*U
     local e=c.slots[m.slot]
     if t<m.fire[#m.fire] then
      local first,last=shotX(c,0),shotX(c,m.life-1)
      for bx=math.min(first,last),math.max(first,last)-7,18 do
       rect(f,bx-camera,lineY-1,7,2,palette[e])
      end
     end
     for i,fire in ipairs(m.fire) do
      local age=t-fire
      if age>=0 and age<m.life and not c.shots[i] then
       glyph(f,e,shotX(c,age)-camera,lineY,2*m.radius*U)
      end
     end
    end
    for i,w in ipairs(m.active) do
     local element=c.slots[slot(c,i)]
     local cx,half=point(c,i)-camera,m.width*U/2
     if t<w[2] then
      mark(f,element,cx,y,half)
      if m.kind=='rings' then
       local left=cx-6*i
       rect(f,left-3,y-29,12*i+6,11,dark)
       for n=1,i do rect(f,left+12*(n-1)+3,y-26,6,5,white) end
       glyph(f,element,cx,y-12,14)
      elseif t<w[1] then
       local flight=clamp(1-(w[1]-t)/24,0,1)
       glyph(f,element,cx,y-14-(1-flight)*(m.height*U+10+(3-i)*12),19)
      end
      if t>=w[1] then
       local top=y-m.height*U
       rect(f,cx-half,top,2*half,y-top,palette[element]..'55')
       rect(f,cx-half,top,2,y-top,palette[element])
       rect(f,cx+half-2,top,2,y-top,palette[element])
       rect(f,cx-half,top,2*half,2,palette[element])
       glyph(f,element,cx,top+13,18)
      end
     end
    end
   end
  end
  C.drawBaptistFieldArt(f,x,y,pose,mode,profile,b.facing<0)
  for i,element in ipairs(b.elementSlots) do
   local gx=x+(i-2)*23
   rect(f,gx-9,y-183,18,18,dark)
   glyph(f,element,gx,y-174,12)
  end
 end
 return baptist
end
