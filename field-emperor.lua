return function(C)
 local emperor={}
 local U=88
 local amber,cream,dark='#ffad66','#fff2c6','#4d2928'
 local orderColor,exposureColor='#fff1b0','#a6eee7'
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end

 function emperor.spawn(b,s)
  b.form='guarded'
  b.hitBottom=b.y-10
  b.hitTop=b.y-76
 end
 emperor.cancel=emperor.spawn

 function emperor.damageFactor(state,cast,b,s)
  if b.form=='guarded' and not cast.reaction and (cast.x-b.x)*b.facing>0 then
   return s.frontDamageFactor
  end
  return 1
 end

 local function aim(b,s,c,a)
  c.dir=a.x<c.origin and -1 or 1
  local m=c.move
  if m.kind=='fire' then
   local offset=m.spacing*U/2
   local margin=offset+m.width*U/2+.5*U
   local center=clamp(a.x,s.arenaMin+margin,s.arenaMax-margin)
   c.points={center-c.dir*offset,center+c.dir*offset}
  end
  b.facing=c.dir
 end

 function emperor.begin(b,s,m,a)
  local c={move=m,tick=0,origin=b.x,seen={{},{}}}
  c.source={id=b.id,x=b.x,y=s.floorY,owner=b,damageElement=m.element}
  aim(b,s,c,a)
  return c
 end
 function emperor.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 local function exposureTicks(b,c)
  if b.form=='exposed' and c and c.tick<c.move.total then return c.move.total-c.tick end
 end

 function emperor.frame(f,b,s,c)
  if c and c.points and c.tick>=c.move.lock and c.tick<c.move.recover then
   f.firePoints=c.points
  end
  f.exposureTicks=exposureTicks(b,c)
 end

 local function bounds(c,i,y)
  local m=c.move
  local top,bottom=y-m.height*U,y-(m.low or 0)*U
  if m.kind=='claw' then
   local x1,x2=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   return math.min(x1,x2),math.max(x1,x2),top,bottom
  end
  local center=c.points and c.points[i] or c.origin
  local half=m.width*U/2
  return center-half,center+half,top,bottom
 end

 function emperor.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then aim(b,s,c,a) end
  b.form=m.kind=='eruption' and t>=m.recover and t<m.total and 'exposed' or 'guarded'
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right,top,bottom=bounds(c,i,s.floorY)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,top,m.damage,bottom)
   end
  end
  return t>=m.total
 end

 function emperor.label(b,c)
  if b.form=='exposed' then return '双角が冷える・正面から反撃' end
  if not c or c.tick>=c.move.recover then return '甲羅を構える・ハサミ側のダメージ減' end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warn(f,left,right,y)
  rect(f,left,y-4,right-left,2,amber)
  rect(f,left,y-11,2,7,amber)
  rect(f,right-2,y-11,2,7,amber)
  for x=left+7,right-7,15 do rect(f,x,y-8,5,2,cream) end
 end

 function emperor.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local x,pose=b.x-camera,'guard'
  if c then
   local m,t=c.move,c.tick
   if b.form=='exposed' then pose='exposed'
   elseif t<m.recover and t>=m.lock then
    pose=m.kind=='claw' and 'claw' or 'fire'
   end
   if t>=m.lock then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local left,right,top,bottom=bounds(c,i,y)
      left,right=left-camera,right-camera
      warn(f,left,right,bottom)
      if t>=w[1] then
       rect(f,left,top,right-left,bottom-top,'#ffad6655')
       rect(f,left,top,right-left,2,cream)
       rect(f,left,top,2,bottom-top,amber)
       rect(f,right-2,top,2,bottom-top,amber)
      elseif m.kind=='fire' and t>=w[1]-32 then
       local u=(t-w[1]+32)/32
       local ballx=x+((left+right)/2-x)*u
       local bally=y-110*(1-u)-60*4*u*(1-u)
       rect(f,ballx-9,bally-6,18,12,dark)
       rect(f,ballx-6,bally-4,12,8,amber)
       rect(f,ballx-3,bally-2,6,4,cream)
      end
     end
    end
   end
  end
  C.drawEmperorFieldArt(f,x,y,pose,mode,profile,b.facing<0)
  local remaining=exposureTicks(b,c)
  if remaining then C.drawFieldTimer(f,x,y-109,remaining,c.move.total-c.move.recover,exposureColor) end
  if c and c.points and c.tick>=c.move.lock then
   for i,w in ipairs(c.move.active) do
    if c.tick<w[1] then C.drawFieldImpactNumber(f,c.points[i]-camera,y,i,orderColor) end
   end
  end
  if b.form=='guarded' then
   local front=x+b.facing*56
   for i=-1,1 do rect(f,front+b.facing*(4-4*math.abs(i))-4,y-44+i*5,8,3,cream) end
  end
 end
 return emperor
end
