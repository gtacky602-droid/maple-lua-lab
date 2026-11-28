return function(C)
 local qucusaur={packRectArt=true}
 local U=88
 local gold,cream,ink='#ffb456','#ffebbc','#483040'
 local function clamp(x,a,b) return math.max(a,math.min(x,b)) end

 local function place(b,y)
  b.y=y
  b.hitTop=y-96
  b.hitBottom=y-9
 end
 function qucusaur.spawn(b,s)
  b.form='red'
  place(b,s.floorY)
 end
 function qucusaur.cancel(b,s,state,c)
  C.clearFieldSummon(state,c)
  qucusaur.spawn(b,s)
 end
 qucusaur.onDefeat=function(state,b,s,c) qucusaur.cancel(b,s,state,c) end
 function qucusaur.damageFactor(state,cast,b,s)
  return b.form=='gold' and not cast.reaction and s.wardFactor or 1
 end

 function qucusaur.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},shots={},projectiles={},
   source={id=b.id,y=s.floorY,owner=b,damageElement=m.element}}
 end
 function qucusaur.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 function qucusaur.frame(f,b,s,c)
  if not c then return end
  local m,t=c.move,c.tick
  if c.breakAt then
   f.flightInterrupted=true
   if b.form=='recover' then f.recoveryTicks=c.breakAt+m.feather.fall+m.feather.rest-t end
  elseif t>=m.recover then
   f.recoveryTicks=m.total-t
  elseif c.first then
   f.divePoints={c.first,c.second}
  end
 end

 local function lock(c,s,a)
  if not c.move.feather then return end
  local left,right=s.arenaMin+74,s.arenaMax-74
  local desired=a and a.x or c.origin+c.dir*1.6*U
  c.first=clamp(desired,left,right)
  c.second=clamp(c.first+c.dir*2.18*U,left,right)
  if math.abs(c.second-c.first)<1.85*U then c.second=clamp(c.first-c.dir*2.18*U,left,right) end
 end

 local function updateFeather(state,b,s,c,t)
  local m,r=c.move,c.move.feather
  local y=s.floorY
  if t<r.rise then return false end
  if t==r.spawn then
   c.summon={id=-b.id,x=c.first,y=y,hitTop=y-53,hitBottom=y,hp=r.hp,maxhp=r.hp,
    level=s.level,custom=true,noRewards=true,warning=0,respawn=math.huge}
   state.enemies[#state.enemies+1]=c.summon
  end
  if c.summon and c.summon.hp<=0 then
   c.breakAt,c.breakY=t,b.y
   C.clearFieldSummon(state,c)
  end
  if c.breakAt then
   local age=t-c.breakAt
   local u=clamp(age/r.fall,0,1)
   b.form=age<r.fall and 'falling' or 'recover'
   place(b,c.breakY+(y-c.breakY)*u)
   return age>=r.fall+r.rest
  end

  local peak=y-r.lift*U
  b.form=t<m.recover and 'gold' or 'recover'
  if t<r.spawn then
   local u=(t-r.rise)/(r.spawn-r.rise)
   place(b,y+(peak-y)*u)
  elseif t<r.commit then
   place(b,peak)
  elseif t<r.land then
   if t==r.commit then
    C.clearFieldSummon(state,c)
    b.facing=c.first<c.origin and -1 or 1
   end
   local u=(t-r.commit)/(r.land-r.commit)
   b.x=c.origin+(c.first-c.origin)*u
   place(b,peak+(y-peak)*u*u)
  elseif t<r.again then
   b.x=c.first
   local u=clamp((t-m.active[1][2])/(r.rebound-m.active[1][2]),0,1)
   place(b,y+(peak-y)*u)
   if t==r.rebound then b.facing=c.second<c.first and -1 or 1 end
  else
   local u=clamp((t-r.again)/(r.landAgain-r.again),0,1)
   b.x=c.first+(c.second-c.first)*u
   place(b,peak+(y-peak)*u*u)
  end
  return false
 end

 local function bounds(c,i)
  local m=c.move
  if m.feather then
   local center=i==1 and c.first or c.second
   local half=m.width*U/2
   return center-half,center+half
  end
  local a,b=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
  return math.min(a,b),math.max(a,b)
 end
 local function shot(c,age)
  return c.origin+c.dir*(.47+age*c.move.speed/60)*U
 end

 function qucusaur.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
  end
  if t==m.lock then lock(c,s,a) end
  if m.feather and updateFeather(state,b,s,c,t) then
   qucusaur.spawn(b,s)
   return true
  end
  if c.breakAt then return false end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage,s.floorY-(m.low or 0)*U)
   end
  end
  for i,fire in ipairs(m.fire or {}) do
   local age=t-fire
   if age>=0 and age<m.life and not c.shots[i] then
    C.stepFieldBolt(state,b,c,i,shot(c,age),s.floorY-m.height*U,m.radius*U,m.damage,m.element)
   elseif age==m.life then c.projectiles[i]=nil end
  end
  if t>=m.recover then b.form='recover' end
  if t<m.total then return false end
  qucusaur.spawn(b,s)
  return true
 end

 function qucusaur.label(b,c)
  if b.form=='falling' then return '羽根が砕ける・落下' end
  if b.form=='recover' then return '地上で翼を休める・反撃' end
  if not c or c.tick<c.move.lock then return end
  local m,t=c.move,c.tick
  if c.summon then
   local seconds=math.ceil((m.feather.commit-t)/6)/10
   return string.format('羽根を壊すと飛行が止まる・羽根が消えるまであと%.1f秒',seconds)
  end
  if m.kind=='wing' then return '翼爪の横薙ぎ・前方の帯から離れる' end
  if m.kind=='quills' then
   local step=t<m.fire[2] and '1/2' or '2/2'
   return '炎羽 '..step..'・射線から離れる'
  end
  if t<m.feather.spawn then return '金焔形態・着地点の番号を確認' end
  if t<m.active[1][2] then return '降下 1/2・番号の位置から離れる' end
  if t<m.active[2][2] then return '降下 2/2・番号の位置から離れる' end
  return '降下終了・翼が止まるまで待つ'
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function cue(f,c,i,left,right,y)
  local m,t=c.move,c.tick
  local bottom=y-(m.low or 0)*U
  rect(f,left,bottom-4,right-left,2,gold)
  for px=left+5,right-6,17 do rect(f,px,bottom-9,6,2,cream) end
  if t>=m.active[i][1] then
   local top=y-m.height*U
   rect(f,left,top,right-left,bottom-top,'#ffab5944')
   rect(f,left,top,right-left,2,gold)
  end
 end

 function qucusaur.draw(f,state,b,s,c,mode,profile)
  local camera,y=state.camera,s.floorY
  local pose='idle'
  if c then
   local m,t=c.move,c.tick
   if b.form=='falling' then pose='gold-dive'
   elseif b.form=='recover' then pose='rest'
   elseif b.form=='gold' then
    local r=m.feather
    local diving=(t>=r.commit and t<r.land) or (t>=r.again and t<r.landAgain)
    pose=diving and 'gold-dive' or 'gold-hover'
   elseif m.kind=='wing' then pose=t<m.lock and 'ready' or 'wing'
   else pose='ready' end
   if t>=m.lock and not c.breakAt then
    for i,w in ipairs(m.active) do
     if t<w[2] then
      local left,right=bounds(c,i)
      cue(f,c,i,left-camera,right-camera,y)
     end
    end
    if m.fire then
     local sy=y-m.height*U
     local a,b=shot(c,0)-camera,shot(c,m.life-1)-camera
     if t<m.fire[#m.fire] then
      for px=math.min(a,b),math.max(a,b)-6,16 do rect(f,px,sy,7,2,cream) end
     end
     for i,fire in ipairs(m.fire) do
      local age=t-fire
      if age>=0 and age<m.life and not c.shots[i] then
       local x=shot(c,age)-camera
       rect(f,x-13,sy-3,26,6,gold)
       rect(f,x-7,sy-5,14,9,cream)
      end
     end
    end
   end
  end
  C.drawQucusaurFieldArt(f,b.x-camera,b.y,pose,mode,profile,b.facing<0)
  local feather=c and c.summon
  if feather then
   local x=feather.x-camera
   C.drawQucusaurFieldArt(f,x,y,'feather',mode,profile,false)
   rect(f,x-17,y-66,34,5,ink)
   rect(f,x-17,y-66,34*feather.hp/feather.maxhp,5,gold)
  end
 end

 function qucusaur.drawOverlay(f,state,s,c)
  if not c or not c.first or c.breakAt then return end
  for i,w in ipairs(c.move.active) do
   if c.tick<w[2] then
    local x=(i==1 and c.first or c.second)-state.camera
    local y=s.floorY
    rect(f,x-10,y+6,20,19,ink)
    rect(f,x-10,y+6,20,2,gold)
    f.draws[#f.draws+1]={kind='text',x=x,y=y+21,text=tostring(i),size=13,color=cream}
   end
  end
 end
 return qucusaur
end
