return function(C)
 local wenut={}
 local U=88
 local mint,white,sand='#8fffdc','#eaffd8','#e3b572'
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end

 local function place(b,s,scale)
  b.hitBottom=s.floorY-.3*U*scale
  b.hitTop=b.hitBottom-54*scale
 end
 function wenut.spawn(b,s)
  b.underground=nil
  place(b,s,1)
 end
 wenut.cancel=wenut.spawn

 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  b.facing=c.dir
  if c.move.hidden then
   local limit=c.move.distance*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+63,s.arenaMax-63)
  end
 end

 function wenut.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={},shots={},projectiles={}}
  c.source={id=b.id,y=s.floorY,owner=b,damageElement=m.element}
  aim(b,s,c,a)
  return c
 end
 function wenut.shareCast(c,actors)
  C.shareFieldHits({c.seen},actors)
 end
 function wenut.frame(f,b,s,c)
  if c and c.move.hidden and c.tick>=c.move.lock and c.tick<c.move.hidden[2] then f.emergeX=c.dest end
 end

 local function poseAt(c)
  if not c then return 'idle',1 end
  local m,t=c.move,c.tick
  if t>=m.recover then return 'emerge',1 end
  if m.hidden then
   if t<m.lock then return 'idle',1 end
   if t<m.hidden[1] then
    return 'dive',1-.73*(t-m.lock)/(m.hidden[1]-m.lock)
   end
   if t<m.hidden[2] then return nil,0 end
   return 'emerge',.68+.32*math.min(1,(t-m.hidden[2])/18)
  end
  if m.kind=='stream' then
   return 'stream',1
  end
  if t<m.lock then return 'idle',1 end
  return 'sweep',1
 end

 local function band(c,y)
  local m=c.move
  local x1,x2=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
  return math.min(x1,x2),math.max(x1,x2),y-m.height*U,y-m.low*U
 end

 local function orbit(c,age)
  return c.dest+c.dir*(.38+age*c.move.speed/60)*U
 end

 function wenut.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  if m.hidden and t==m.hidden[2] then b.x=c.dest end
  local pose,scale=poseAt(c)
  b.underground=not pose or nil
  if pose then place(b,s,scale)
  else b.hitTop=nil;b.hitBottom=nil end
  for _,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right,top,bottom=band(c,s.floorY)
    C.hitFieldArea(state,c.source,c.seen,left,right,top,m.damage,bottom)
   end
  end
  for i,fire in ipairs(m.fire or {}) do
   local age=t-fire
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,orbit(c,age),s.floorY-m.height*U,m.radius*U,m.damage,m.element)
   elseif age==m.life then c.projectiles[i]=nil end
  end
  return t>=m.total
 end

 function wenut.label(b,c)
  if not c then return end
  if b.underground then return '砂の下・出現印に注意' end
  if c.tick>=c.move.recover then return '頭が下がる・反撃' end
  if c.move.hidden and c.tick>=c.move.hidden[2] and c.tick<c.move.fire[1] then
   return '頭が出る・風弾に注意'
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function dashLine(f,left,right,y,color)
  for x=left,right-7,15 do rect(f,x,y,7,2,color) end
 end

 function wenut.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local pose,scale=poseAt(c)
  if c and c.tick>=c.move.lock and c.tick<c.move.recover then
   local m,t=c.move,c.tick
   if m.hidden then
    local center=c.dest-camera
    if t<m.hidden[2] then
     -- Keep the edges visible when a party member stands on the emergence point.
     rect(f,center-45,y-14,12,4,'#5a3b29')
     rect(f,center+33,y-14,12,4,'#5a3b29')
     rect(f,center-44,y-13,10,2,white)
     rect(f,center+34,y-13,10,2,white)
     rect(f,center-19,y-4,38,3,sand)
     rect(f,center-14,y-7,28,2,sand)
     rect(f,center-3,y-13,6,5,white)
    end
    local yOrb=y-m.height*U
    local x0,x1=orbit(c,0)-camera,orbit(c,m.life-1)-camera
    if t<m.fire[#m.fire] then
     dashLine(f,math.min(x0,x1),math.max(x0,x1),yOrb,mint)
    end
    for i,fire in ipairs(m.fire) do
     local age=t-fire
     if t<m.hidden[2] then
      rect(f,center+c.dir*18-4,y-20-i*8,8,4,mint)
     elseif age>=0 and age<m.life and not c.shots[i] then
      C.drawWenutFieldArt(f,orbit(c,age)-camera,yOrb+m.radius*U,'orb',1,mode,profile,false)
     end
    end
   else
    local w=m.active[1]
    if t<w[2] then
     local left,right,top,bottom=band(c,y)
     left,right=left-camera,right-camera
     if t<w[1] then
      dashLine(f,left,right,m.kind=='stream' and (top+bottom)/2 or bottom,sand)
     else
      rect(f,left,top,right-left,bottom-top,m.kind=='stream' and '#8fffdc55' or '#f2bb7466')
      rect(f,left,top,right-left,2,m.kind=='stream' and mint or sand)
      rect(f,left,bottom-2,right-left,2,m.kind=='stream' and mint or sand)
      if m.kind=='stream' then rect(f,left,(top+bottom)/2-3,right-left,6,white) end
     end
    end
   end
  end
  if pose then C.drawWenutFieldArt(f,b.x-camera,y,pose,scale,mode,profile,b.facing<0) end
 end
 return wenut
end
