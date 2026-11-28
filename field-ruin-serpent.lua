return function(C)
 local serpent={packRectArt=true}
 local U=88
 local function clamp(x,a,b) return math.min(b,math.max(a,x)) end
 local function place(b,s,scale)
  b.y=s.floorY
  b.hitBottom=s.floorY-.3*U*scale
  b.hitTop=b.hitBottom-53*scale
 end
 function serpent.spawn(b,s)
  b.underground=nil
  place(b,s,1)
 end
 serpent.cancel=serpent.spawn

 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  b.facing=c.dir
  if c.move.kind=='burrow' then
   local limit=1.6*U
   local margin=1.4*U
   c.dest=clamp(c.origin+clamp(a.x-c.origin,-limit,limit),s.arenaMin+margin,s.arenaMax-margin)
  elseif c.move.kind=='bombs' then
   local origin=clamp(a.x,s.arenaMin+2*U,s.arenaMax-2*U)
   c.landings={origin-.95*U*c.dir,origin,origin+.95*U*c.dir}
  end
 end
 function serpent.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,dir=b.facing,seen={}}
  for i in ipairs(m.active) do c.seen[i]={} end
  c.source={id=b.id,x=b.x,y=b.y,owner=b,damageElement='physical'}
  aim(b,s,c,a)
  return c
 end
 function serpent.shareCast(cast,actors)
  C.shareFieldHits(cast.seen,actors)
 end
 function serpent.frame(f,b,s,c)
  if not c then return end
  local m,t=c.move,c.tick
  if t>=m.recover then
   f.recoveryTicks=m.total-t
  elseif t>=m.lock and t<m.active[#m.active][2] then
   if m.hidden then f.emergeX=c.dest end
   if m.kind=='bombs' then f.bombPoints=c.landings end
  end
 end

 local function attackBounds(c,i)
  local kind=c.move.kind
  if kind=='roll' then
   local x1,x2=c.origin+c.dir*.3*U,c.origin+c.dir*1.8*U
   return math.min(x1,x2),math.max(x1,x2)
  end
  local width=kind=='burrow' and 1.4 or .55
  local x=kind=='burrow' and c.dest or c.landings[i]
  return x-width*U/2,x+width*U/2
 end

 local function body(c)
  if not c or c.tick>=c.move.recover then return 'idle',1 end
  local m,t=c.move,c.tick
  if m.kind=='roll' then return t>=m.lock and 'roll' or 'idle',1 end
  if m.kind=='bombs' then return 'bombs',1 end
  if t<m.lock then return 'dive',1 end
  if t<m.hidden[1] then
   return 'dive',1-.8*(t-m.lock)/(m.hidden[1]-m.lock)
  end
  if t<m.hidden[2] then return nil,0 end
  if t<m.active[1][1] then
   return 'emerge',.54+.46*(t-m.hidden[2])/(m.active[1][1]-m.hidden[2])
  end
  return t<m.active[1][2] and 'emerge' or 'idle',1
 end

 function serpent.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  if m.hidden and t==m.hidden[2] then b.x=c.dest end
  local pose,scale=body(c)
  b.underground=not pose or nil
  if pose then place(b,s,scale)
  else b.hitBottom=nil;b.hitTop=nil end
  for i,window in ipairs(m.active) do
   if t>=window[1] and t<window[2] then
    local left,right=attackBounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-(m.kind=='bombs' and .6 or .7)*U,m.damage)
   end
  end
  return t>=m.total
 end
 function serpent.label(b,c)
  if not c then return end
  local m,t=c.move,c.tick
  if t>=m.recover then return '地表に停止・頭に攻撃' end
  if t<m.lock then return end
  if b.underground then return '潜行中・地面の印から離れる' end
  if m.hidden then
   if t<m.hidden[2] then return '短潜行・出現の印から離れる' end
   if t<m.active[1][1] then return '掘り上げ予告・印から離れる' end
   if t<m.active[1][2] then return '掘り上げ・印から離れる' end
   return '掘り上げ終了・頭が止まるまで待つ'
  end
  if m.kind=='roll' then return '横転の一薙ぎ・前方の帯から離れる' end
  for i,window in ipairs(m.active) do
   if t<window[2] then return '三点の掘削弾 '..i..'/3・床の番号を避ける' end
  end
  return '着弾終了・頭が止まるまで待つ'
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function mark(f,left,right,y,active)
  local color=active and '#fff0a8' or '#ed9e57'
  rect(f,left,y-7,right-left,3,color)
  rect(f,left,y-13,3,6,color)
  rect(f,right-3,y-13,3,6,color)
  if active then
   local width=right-left
   for i=1,4 do rect(f,left+i*width/5-3,y-17-(i%2)*11,6,9,color) end
  end
 end
 function serpent.draw(f,state,b,s,c,mode,profile)
  local y=s.floorY
  local x=b.x-state.camera
  local pose,scale=body(c)
  if c and c.tick>=c.move.lock and c.tick<c.move.recover then
   local m,t=c.move,c.tick
   for i,window in ipairs(m.active) do
    if t<window[2] then
     local left,right=attackBounds(c,i)
     left,right=left-state.camera,right-state.camera
     mark(f,left,right,y,t>=window[1])
     if m.kind=='bombs' and t>=window[1]-32 and t<window[1] then
      local u=(t-window[1]+32)/32
      local start=x+c.dir*20
      local flightX=start+((left+right)/2-start)*u
      local flightY=y-43*(1-u)-105*4*u*(1-u)
      C.drawRuinSerpentFieldArt(f,flightX,flightY,'drill',1,mode,profile,false)
     end
    end
   end
  end
  if pose then C.drawRuinSerpentFieldArt(f,x,y,pose,scale,mode,profile,b.facing>0) end
 end

 function serpent.drawOverlay(f,state,s,c)
  if not c or c.tick<c.move.lock then return end
  local m,t=c.move,c.tick
  if m.kind=='roll' then return end
  for i,window in ipairs(m.active) do
   if t<window[2] then
    local left,right=attackBounds(c,i)
    local x,y=(left+right)/2-state.camera,s.floorY
    local width=m.hidden and 34 or 20
    rect(f,x-width/2,y+6,width,19,'#2f2625')
    rect(f,x-width/2,y+6,width,2,'#ed9e57')
    f.draws[#f.draws+1]={kind='text',x=x,y=y+21,size=13,text=m.hidden and '出現' or tostring(i),color='#ffd286'}
   end
  end
 end
 return serpent
end
