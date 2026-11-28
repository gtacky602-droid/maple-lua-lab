return function(C)
 local yumka={packRectArt=true}
 local U=88
 local amber,cream,leaf='#ffab62','#fff0c3','#d0ed89'
 local function clamp(value,lo,hi) return math.max(lo,math.min(hi,value)) end

 local function place(b,y)
  b.y=y
  b.hitTop=y-121
  b.hitBottom=y-.2*U
 end
 function yumka.spawn(b,s)
  b.form='ground'
  place(b,s.floorY)
 end
 yumka.cancel=yumka.spawn
 function yumka.onDefeat(state,b,s) yumka.spawn(b,s) end

 function yumka.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function yumka.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 function yumka.frame(f,b,s,c)
  f.flying=b.form=='airborne' or nil
  if not c then return end
  if c.tick>=c.move.recover then
   f.recoveryTicks=c.move.total-c.tick
  else
   f.destinationX=c.dest
   f.firePoints=c.points
  end
 end

 local function lock(b,s,c,a)
  local m=c.move
  if m.air then
   local dx=(a and a.x or c.origin)-c.origin
   c.dest=clamp(c.origin+clamp(dx,-m.distance*U,m.distance*U),s.arenaMin+63,s.arenaMax-63)
  elseif m.fire then
   local margin=(m.second+m.width/2)*U
   if c.origin+c.dir*margin<s.arenaMin or c.origin+c.dir*margin>s.arenaMax then c.dir=-c.dir end
   b.facing=c.dir
   c.points={c.origin+c.dir*m.first*U,c.origin+c.dir*m.second*U}
  end
 end

 local function bounds(c,i)
  local center=c.dest or (c.points and c.points[i]) or c.origin
  local radius=c.move.width*U/2
  return center-radius,center+radius
 end

 local function jump(b,s,c,t)
  local m=c.move
  local start,finish=m.air[1],m.air[2]
  if t>=start and t<finish then
   local u=(t-start)/(finish-start)
   b.form='airborne'
   b.x=c.origin+(c.dest-c.origin)*u
   place(b,s.floorY-m.lift*U*4*u*(1-u))
  elseif t==finish then
   b.form='landed'
   b.x=c.dest
   place(b,s.floorY)
  end
 end

 function yumka.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
  end
  if t==m.lock then lock(b,s,c,a) end
  if m.air then jump(b,s,c,t) end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage,s.floorY-(m.low or 0)*U)
   end
  end
  if t>=m.recover then b.form='resting' end
  if t<m.total then return false end
  yumka.spawn(b,s)
  return true
 end

 function yumka.label(b,c)
  if b.form=='resting' then return '前脚をつく・反撃' end
  if not c or c.tick<c.move.lock then return end
  local m,t=c.move,c.tick
  if m.kind=='tail' then return '重尾の一回し・足元の帯から離れる' end
  if m.kind=='belly' then return '腹落ち・着地点から離れる' end
  for i,w in ipairs(m.active) do
   if t<w[2] then return '炎の実 '..i..'/2・床の番号から離れる' end
  end
  return '着弾終了・前脚をつくまで待つ'
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function mark(f,c,i,left,right,y)
  local m=c.move
  local color=m.kind=='fruit' and amber or leaf
  local bottom=y-(m.low or 0)*U
  rect(f,left,bottom-4,right-left,2,color)
  for px=left+5,right-6,17 do rect(f,px,bottom-9,6,2,color) end
  if c.tick>=m.active[i][1] then
   local top=y-m.height*U
   rect(f,left,top,right-left,bottom-top,color..'55')
   rect(f,left,top,right-left,2,cream)
  end
 end

 function yumka.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local pose='idle'
  if c then
   local m,t=c.move,c.tick
   if b.form=='resting' or b.form=='landed' then pose='land'
   elseif b.form=='airborne' then pose='leap'
   elseif m.kind=='tail' then pose=t<m.lock and 'crouch' or 'tail'
   elseif m.kind=='belly' then pose='crouch'
   elseif t>=m.lock and t<m.fire[2]+12 then pose='fruit'
   else pose='idle' end
   if t>=m.lock then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local left,right=bounds(c,i)
      mark(f,c,i,left-camera,right-camera,y)
     end
    end
    if m.fire then
     for i,fire in ipairs(m.fire) do
      local impact=m.active[i][1]
      if t>=fire and t<impact then
       local u=(t-fire)/(impact-fire)
       local mouth=c.origin+c.dir*.5*U
       local x=mouth+(c.points[i]-mouth)*u
       local fruitY=y-107*(1-u)-53*4*u*(1-u)
       C.drawYumkaFieldArt(f,x-camera,fruitY,'seed',mode,profile,false)
      end
     end
     for i,fire in ipairs(m.fire) do
      if t<fire then rect(f,b.x-camera-14+(i-1)*18,b.y-145,9,7,amber) end
     end
    end
   end
  end
  C.drawYumkaFieldArt(f,b.x-camera,b.y,pose,mode,profile,b.facing<0)
 end

 function yumka.drawOverlay(f,state,s,c)
  if not c or c.tick<c.move.lock or c.move.kind=='tail' then return end
  for i,w in ipairs(c.move.active) do
   if c.tick<w[2] then
    local left,right=bounds(c,i)
    local x,y=(left+right)/2-state.camera,s.floorY
    local belly=c.move.kind=='belly'
    local width=belly and 34 or 20
    rect(f,x-width/2,y+6,width,19,'#302e2b')
    rect(f,x-width/2,y+6,width,2,belly and leaf or amber)
    f.draws[#f.draws+1]={kind='text',x=x,y=y+21,text=belly and '着地' or tostring(i),size=13,color=cream}
   end
  end
 end
 return yumka
end
