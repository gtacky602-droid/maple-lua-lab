return function(C)
 local suanni={packRectArt=true}
 local U=88
 local colors={physical='#e7e3bc',anemo='#9df4ce',hydro='#91d6ff'}
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end

 local function place(b,y)
  b.y=y
  b.hitBottom=y-.25*U
  b.hitTop=y-99
 end
 function suanni.spawn(b,s)
  b.form=nil
  place(b,s.floorY)
 end
 suanni.cancel=suanni.spawn

 function suanni.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},sources={}}
  for _,element in ipairs({'physical','anemo','hydro'}) do
   c.sources[element]={id=b.id,y=s.floorY,owner=b,damageElement=element}
  end
  return c
 end
 function suanni.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 function suanni.frame(f,b,s,c)
  f.flying=b.form=='airborne' or nil
  if not c then return end
  if c.tick>=c.move.recover then
   f.recoveryTicks=c.move.total-c.tick
  elseif c.dest then
   f.destinationX=c.dest
  end
 end

 local function bounds(c,band)
  local center=band.landing and c.dest or c.origin
  local a,b=center+c.dir*band.near*U,center+c.dir*band.far*U
  return math.min(a,b),math.max(a,b)
 end
 local function shot(c,bolt,age)
  local origin=bolt.landing and c.dest or c.origin
  return origin+c.dir*(bolt.offset+age*bolt.speed/60)*U
 end

 function suanni.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
  end
  if m.air then
   local start,land=m.air[1],m.air[2]
   if t==m.lock then
    local wanted=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
    c.dest=clamp(c.origin+wanted,s.arenaMin+64,s.arenaMax-64)
    b.form='windup'
   elseif t>=start and t<land then
    local u=(t-start)/(land-start)
    b.form='airborne'
    b.x=c.origin+(c.dest-c.origin)*u
    place(b,s.floorY-m.lift*U*4*u*(1-u))
   elseif t==land then
    b.form='landing'
    b.x=c.dest
    place(b,s.floorY)
   end
  end
  for i,band in ipairs(m.bands) do
   if t>=band.start and t<band.finish then
    local left,right=bounds(c,band)
    C.hitFieldArea(state,c.sources[band.element],c.seen[i],left,right,
      s.floorY-band.height*U,band.damage,s.floorY-(band.low or 0)*U)
   end
  end
  for i,bolt in ipairs(m.bolts) do
   local age=t-bolt.fire
   if age>=0 and age<bolt.life then
    C.hitFieldCapsule(state,c.sources.hydro,c.seen[bolt.group or i],shot(c,bolt,math.max(0,age-1)),
      shot(c,bolt,age),s.floorY-bolt.height*U,bolt.radius*U,bolt.damage)
   end
  end
  if t>=m.recover then b.form='resting' end
  if t<m.total then return false end
  suanni.spawn(b,s)
  return true
 end

 function suanni.label(b,c)
  if not c or c.tick<c.move.lock then return end
  local m,t=c.move,c.tick
  if t>=m.recover then return '頭が下がる・反撃' end
  if m.kind=='claw' then
   if t<m.bands[1].finish then return '前爪 1/2・正面から離れる' end
   return '風尾 2/2・背後から離れる'
  end
  if m.kind=='blades' then
   local step=t<m.bolts[2].fire and '1/2' or '2/2'
   return '双水刃 '..step..'・射線から外れるか跳び越す'
  end
  if t<m.bands[1].finish then return '① 風の輪から離れる → ② 水の着地点' end
  if t<m.bolts[1].fire then return '② 水の着地点と波から離れる' end
  return '水波・着地点の前方から離れる'
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function marker(f,x,y,label,color)
  f.draws[#f.draws+1]={kind='text',x=x,y=y,text=tostring(label),size=13,color=color}
 end
 local function drawBand(f,band,c,camera,y)
  local left,right=bounds(c,band)
  left,right=left-camera,right-camera
  local top,bottom=y-band.height*U,y-(band.low or 0)*U
  local color=colors[band.element]
  rect(f,left,bottom-4,right-left,2,color)
  for x=left+5,right-6,16 do rect(f,x,bottom-(band.landing and 12 or 9),6,2,color) end
  if c.tick>=band.start then
   rect(f,left,top,right-left,bottom-top,color..'44')
   rect(f,left,top,right-left,2,color)
   rect(f,left,top,2,bottom-top,color)
   rect(f,right-2,top,2,bottom-top,color)
  end
 end

 local function drawBolt(f,bolt,c,i,camera,y)
  local cy=y-bolt.height*U
  local color=colors.hydro
  local age=c.tick-bolt.fire
  if age<0 then
   local previous=c.move.bolts[i-1]
   if previous and c.tick<previous.fire then return end
   local a,b=shot(c,bolt,0)-camera,shot(c,bolt,bolt.life-1)-camera
   local left,right=math.min(a,b),math.max(a,b)
   for x=left,right-4,16 do rect(f,x,cy,7,2,color) end
   if not bolt.landing then
    local label=i==1 and #c.move.bolts==2 and '1→2' or i
    marker(f,shot(c,bolt,0)-camera,cy-11,label,color)
   end
  elseif age<bolt.life then
   local x=shot(c,bolt,age)-camera
   rect(f,x-12,cy-3,24,6,color)
   rect(f,x-8,cy-6,16,3,'#e3f7ff')
   rect(f,x-3,cy+3,6,3,color)
  end
 end

 function suanni.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local pose='idle'
  if c then
   local m,t=c.move,c.tick
   if t>=m.recover then pose='rest'
   elseif m.kind=='claw' then pose=t<m.bands[1].finish and 'claw' or 'tail'
   elseif m.kind=='blades' then pose='water'
   elseif b.form=='airborne' then pose='leap'
   elseif b.form=='landing' then pose='claw'
   elseif t>=m.bands[1].start and t<m.bands[1].finish then pose='tail'
   else pose='crouch' end
   if t>=m.lock then
    for _,band in ipairs(m.bands) do
     if t<band.finish then drawBand(f,band,c,camera,y) end
    end
    for i,bolt in ipairs(m.bolts) do drawBolt(f,bolt,c,i,camera,y) end
   end
  end
  C.drawSuanniFieldArt(f,b.x-camera,b.y,pose,mode,profile,b.facing>0)
 end

 function suanni.drawOverlay(f,state,s,c)
  if not c or c.tick<c.move.lock then return end
  for i,band in ipairs(c.move.bands) do
   if c.tick<band.finish then
    local left,right=bounds(c,band)
    local x=(left+right)/2-state.camera
    -- Separate rows also keep both numbers readable when the landing locks on the wind ring.
    local y,color=s.floorY+(band.landing and 21 or 0),colors[band.element]
    rect(f,x-10,y+6,20,19,'#162a36')
    rect(f,x-10,y+6,20,2,color)
    marker(f,x,y+21,i,color)
   end
  end
 end
 return suanni
end
