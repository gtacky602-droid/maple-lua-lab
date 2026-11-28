return function(C)
 local oceanid={packRectArt=true}
 local U=88
 local water='#7cdefa'
 local danger='#ffca93'

 local function clamp(value,lo,hi)
  return math.max(lo,math.min(hi,value))
 end

 local function lerp(first,last,t)
  return first+(last-first)*t
 end

 local function place(boss,y,height,clearance)
  boss.y,boss.drawHeight=y,height
  boss.hitTop=y-height
  boss.hitBottom=y-clearance*U
 end

 local function formAt(boss,spec,cast)
  local to=cast.move.form
  local last=spec.forms[to]
  if cast.from==to or cast.tick>=spec.transformTicks then
   boss.form=to
   return last.height,last.clearance
  end
  local first=spec.forms[cast.from]
  local t=cast.tick/spec.transformTicks
  boss.form=t<.5 and cast.from or to
  local height=lerp(first.height,last.height,t)
  return height*(1-.22*(1-math.abs(2*t-1))),lerp(first.clearance,last.clearance,t)
 end

 function oceanid.spawn(boss,spec)
  boss.form=spec.moves[1].form
  boss.formLabel=spec.forms[boss.form].name
  local form=spec.forms[boss.form]
  place(boss,spec.floorY,form.height,form.clearance)
 end

 function oceanid.cancel(boss,spec)
  local form=spec.forms[boss.form]
  place(boss,spec.floorY,form.height,form.clearance)
 end

 local function aim(boss,spec,cast,target)
  local origin=cast.origin
  cast.dir=target.x<origin and -1 or 1
  boss.facing=cast.dir
  local distance=cast.move.distance
  if distance then
   local dx=clamp(target.x-origin,-distance*U,distance*U)
   cast.dest=clamp(origin+dx,spec.arenaMin+63,spec.arenaMax-63)
  end
 end

 function oceanid.begin(boss,spec,move,target)
  local cast={move=move,tick=0,origin=boss.x,from=boss.form,seen={},projectiles={},shots={}}
  cast.source={id=boss.id,x=boss.x,y=spec.floorY,owner=boss,damageElement='hydro'}
  aim(boss,spec,cast,target)
  return cast
 end

 function oceanid.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end

 function oceanid.frame(f,boss,spec,cast)
  f.flying=boss.y<spec.floorY
  if cast and cast.move.airborne and cast.tick>=cast.move.lock and cast.tick<cast.move.active[1][2] then
   f.landingX=cast.dest
  end
 end

 local function waveX(cast,age)
  local move=cast.move
  return cast.origin+cast.dir*(move.shotOffset+move.shotSpeed*age/60)*U
 end

 function oceanid.tick(s,boss,spec,cast,target)
  local move,t=cast.move,cast.tick+1
  cast.tick=t
  if t<=move.lock and target then aim(boss,spec,cast,target) end
  local y=spec.floorY
  if move.airborne then
   local jumpStart,landing=move.airborne[1],move.airborne[2]
   if t>=jumpStart and t<=landing then
    local p=(t-jumpStart)/(landing-jumpStart)
    boss.x=lerp(cast.origin,cast.dest,p)
    y=y-4*move.rise*p*(1-p)
   end
  end
  local height,clearance=formAt(boss,spec,cast)
  place(boss,y,height,clearance)
  boss.formLabel=spec.forms[boss.form].name
  local window=move.active[1]
  if window and t>=window[1] and t<window[2] then
   local previous=boss.x
   if move.form=='boar' then
    boss.x=lerp(cast.origin,cast.dest,(t-window[1])/(window[2]-window[1]-1))
   end
   local half=move.halfWidth*U
   local left,right=math.min(previous,boss.x)-half,math.max(previous,boss.x)+half
   C.hitFieldArea(s,cast.source,cast.seen,left,right,spec.floorY-move.height*U,move.damage,spec.floorY)
  end
  for i,fired in ipairs(move.shotTicks or {}) do
   local age=t-fired
   if age>=0 and age<move.shotLife and not cast.shots[i] then
    C.stepFieldBolt(s,boss,cast,i,waveX(cast,age),spec.floorY-move.shotHeight*U,move.shotRadius*U,move.damage,'hydro')
   elseif age==move.shotLife then
    cast.projectiles[i]=nil
   end
  end
  return t>=move.total
 end

 function oceanid.label(boss,cast,spec)
  if not cast then return boss.formLabel end
  local move,t=cast.move,cast.tick
  if cast.from~=move.form and t<spec.transformTicks then
   return spec.forms[cast.from].name..'から'..spec.forms[move.form].name..'に変化'
  end
  if t>=move.recover then
   return string.format('%sを攻撃（あと%.1f秒）',boss.formLabel,math.ceil((move.total-t)/6)/10)
  end
  if move.airborne then
   local landing=move.airborne[2]
   if t<move.lock then return move.title..'・着地に備える' end
   if t<landing then
    return string.format('着地まで%.1f秒・床の予告から離れる',math.ceil((landing-t)/6)/10)
   end
   if t<move.active[1][2] then return '水蛙が着地・飛沫の範囲から離れる' end
   return '水蛙が着地・地上から攻撃'
  end
  if move.shotTicks then
   if t<move.shotTicks[1] then return move.title..'・1発目に備える' end
   if t<move.shotTicks[2] then return move.title..'・次の波に備える' end
   if t<move.shotTicks[2]+move.shotLife then return move.title..'・2発目を避ける' end
   return '水波が消えた・水鶴を攻撃'
  end
  return move.title..'・走路から離れるかジャンプ'
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function mark(f,left,right,y,active)
  local color=active and '#efffff' or danger
  rect(f,left,y-4,right-left,4,'#315561')
  rect(f,left,y-5,right-left,2,color)
  rect(f,left,y-10,2,7,color)
  rect(f,right-2,y-10,2,7,color)
 end

 local function attackArt(f,s,spec,cast)
  local move,t=cast.move,cast.tick
  local y,origin=spec.floorY,cast.origin-s.camera
  if t>=move.lock then
   local window=move.active[1]
   if t<move.recover and window and t<window[2] then
    local dest=cast.dest-s.camera
    local first=move.form=='boar' and origin or dest
    local half=move.halfWidth*U
    mark(f,math.min(first,dest)-half,math.max(first,dest)+half,y,t>=window[1])
    if move.airborne and t<window[1] then
     local w=10+math.floor(30*(t-move.lock)/(window[1]-move.lock))
     rect(f,dest-w/2,y-11,w,3,danger)
    end
    if t>=window[1] and move.airborne then
     local age=t-window[1]
     for i=-2,2 do
      local h=math.max(4,22-5*math.abs(i)-age)
      rect(f,dest+i*(9+age*2)-3,y-h,6,h-3,water)
     end
    end
   elseif move.shotTicks then
    local height=y-move.shotHeight*U
    if t<move.shotTicks[#move.shotTicks] then
     for offset=30,128,20 do rect(f,origin+cast.dir*offset,height+6,7,2,danger) end
    end
    for i,fired in ipairs(move.shotTicks) do
     local age=t-fired
     if age<0 then
      local x=origin+cast.dir*(22+i*12)
      rect(f,x-4,height-13-i*8,8,6,water)
      rect(f,x-2,height-13-i*8,4,3,'#dffaff')
     elseif age<move.shotLife and not cast.shots[i] then
      local x=waveX(cast,age)-s.camera
      rect(f,x-14,height-6,28,14,'#3987ae')
      rect(f,x-11,height-7,22,4,water)
      rect(f,x+cast.dir*8-3,height-10,7,7,'#e2fbfd')
     end
    end
   end
  end
 end

 function oceanid.draw(f,s,boss,spec,cast,mode,profile)
  local x=boss.x-s.camera
  local hostX=spec.home-s.camera
  local hostY=spec.floorY-223
  C.drawOceanidPart(f,'host',hostX,hostY,130,mode,profile)
  local tipY=boss.y-boss.drawHeight*.78
  for i=1,12 do
   local t=i/13
   rect(f,lerp(hostX,x,t)-1,lerp(hostY-6,tipY,t),3,4,'#5caabd')
  end
  if cast then attackArt(f,s,spec,cast) end
  if cast and cast.from~=cast.move.form and cast.tick<spec.transformTicks then
   local width=26+cast.tick*2
   rect(f,x-width/2,boss.y-6,width,4,water)
  end
  C.drawOceanidPart(f,boss.form,x,boss.y,boss.drawHeight,mode,profile,boss.facing>0)
 end

 return oceanid
end
