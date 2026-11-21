return function(C)
 local generator={}
 local U=88
 local amber,cream,blue='#ecb679','#fff1c4','#a9deeb'

 function generator.spawn(b,s)
  b.hitBottom=s.floorY-.36*U
  b.hitTop=b.hitBottom-71
 end
 generator.cancel=generator.spawn

 function generator.begin(b,s,m,a)
  local dir=a.x<b.x and -1 or 1
  b.facing=dir
  local c={move=m,tick=0,origin=b.x,dir=dir,seen={{},{},{}},shots={},projectiles={}}
  c.source={id=b.id,y=s.floorY,owner=b,damageElement=m.element}
  if m.gravity then
   local g=m.gravity
   local half=g.width*U/2
   local center=math.max(s.arenaMin+half,math.min(s.arenaMax-half,b.x))
   c.field={left=center-half,right=center+half,top=s.floorY-g.height*U,bottom=s.floorY,factor=g.factor}
  end
  return c
 end
 function generator.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 local function bounds(c)
  if c.field then return c.field.left,c.field.right end
  local m=c.move
  local x1,x2=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
  return math.min(x1,x2),math.max(x1,x2)
 end
 local function stoneX(c,age)
  return c.origin+c.dir*(.5+age*c.move.speed/60)*U
 end

 function generator.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
  end
  if m.gravity then
   c.gravity=t>=m.gravity.start and t<m.gravity.finish and c.field or nil
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage,s.floorY-(m.low or 0)*U)
   end
  end
  for i,fired in ipairs(m.fire or {}) do
   local age=t-fired
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,stoneX(c,age),s.floorY-m.height*U,m.radius*U,m.damage,m.element)
   elseif age==m.life then c.projectiles[i]=nil end
  end
  return t>=m.total
 end

 function generator.label(b,c)
  if not c then return end
  if c.gravity then return '低重力場・枠の中で高く跳べる' end
  if c.tick>=c.move.recover then return '外輪が下がる・反撃' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function drawField(f,c,camera)
  local z=c.field
  local left,right=z.left-camera,z.right-camera
  if c.gravity then rect(f,left,z.top,right-left,z.bottom-z.top,'#95d6e71f') end
  for _,side in ipairs({left,right-2}) do
   for y=z.top,z.bottom-10,18 do rect(f,side,y,2,10,blue) end
   rect(f,side-4,z.top,10,3,blue)
  end
  rect(f,left,z.bottom-3,right-left,3,blue)
 end

 function generator.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local x,pose=b.x-camera,'idle'
  if c then
   local m,t=c.move,c.tick
   pose=t>=m.recover and 'recover' or m.kind
   if c.field and t>=m.lock and t<m.gravity.finish then drawField(f,c,camera) end
   if t>=m.lock and t<m.recover then
    if m.fire then
     local lineY=y-m.height*U
     if t<m.fire[#m.fire] then
      local x1,x2=stoneX(c,0)-camera,stoneX(c,m.life-1)-camera
      for spot=math.min(x1,x2),math.max(x1,x2)-6,16 do rect(f,spot,lineY,6,2,amber) end
     end
     for i,fired in ipairs(m.fire) do
      local age=t-fired
      if age>=0 and age<m.life and not c.shots[i] then
       local cx=stoneX(c,age)-camera
       rect(f,cx-10,lineY-6,20,12,'#704c37')
       rect(f,cx-6,lineY-9,12,18,amber)
       rect(f,cx+c.dir*4-2,lineY-3,4,5,cream)
      end
     end
    else
     for _,w in ipairs(m.active) do
      if t<w[2] then
       local left,right=bounds(c)
       local top,bottom=y-m.height*U,y-(m.low or 0)*U
       left,right=left-camera,right-camera
       rect(f,left,bottom-4,right-left,2,amber)
       if t>=w[1] then
        rect(f,left,top,right-left,bottom-top,'#f7ac6455')
        rect(f,left,top,right-left,2,cream)
        rect(f,left,top,2,bottom-top,amber)
        rect(f,right-2,top,2,bottom-top,amber)
       else
        for i=left+3,right-4,18 do rect(f,i,bottom-10,6,3,amber) end
       end
       break
      end
     end
    end
   end
  end
  C.drawGeneratorFieldArt(f,x,y,pose,mode,profile,b.facing<0)
 end
 return generator
end
