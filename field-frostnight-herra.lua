return function(C)
 local herra={packRectArt=true}
 local U=88
 local ice,light,gloom='#b6edff','#f4f9ff','#c6aaff'
 local names={pyro='炎',hydro='水',electro='雷',cryo='氷',anemo='風',geo='岩',dendro='草'}

 local function clamp(x,low,high)
  return math.max(low,math.min(high,x))
 end
 local function place(b,s,form,pose,y)
  b.form,b.pose,b.y=form,pose,y or s.floorY
  b.hitTop,b.hitBottom=b.y-C.frostnightHerraFieldArt[pose].profiles.legacy.height,b.y
 end
 function herra.spawn(b,s)
  b.gloomCharges,b.adaptedElement,b.adaptUntil=0,nil,nil
  place(b,s,'idle','idle')
 end
 herra.cancel=herra.spawn
 function herra.onDefeat(_,b,s) herra.spawn(b,s) end

 function herra.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function herra.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 local function adaptationRemaining(state,b)
  if not b.adaptUntil then return 0 end
  -- Adaptation is awarded on the encounter clock, including in shared rooms.
  local _,now=C.fieldSlot(state,b.fieldBoss)
  return math.max(0,b.adaptUntil-now)
 end

 local function lock(c,s,a)
  local m=c.move
  if m.kind=='wing' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
   return
  end
  local radius=m.width*U/2
  local dx=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
  c.center=c.origin+dx
  if s.gloom then
   c.center=clamp(c.center,s.arenaMin+radius,s.arenaMax-radius)
  end
  c.left,c.right=c.center-radius,c.center+radius
 end

 function herra.onHit(cast,b,s,slot,element,damage)
  local c=slot.cast
  if not s.gloom or b.form~='gloom' or not c or c.broken then return end
  if names[element] then
   local sum=(c.damageByElement[element] or 0)+damage
   c.damageByElement[element]=sum
   if sum>c.dominantDamage then
    c.dominant,c.dominantDamage=element,sum
   end
  end
  if (element~='cryo' and element~='lunar') or cast.reaction or c.contacts[cast] then return end
  c.contacts[cast]=true
  b.gloomCharges=b.gloomCharges+1
  if b.gloomCharges<s.gloom.charges then return end
  c.broken=c.tick
  b.gloomCharges,b.adaptedElement,b.adaptUntil=0,nil,nil
  place(b,s,'down','down')
 end

 function herra.damageFactor(state,_,b,s,element)
  if not s.gloom then return 1 end
  if b.form=='gloom' then return s.gloom.factor end
  if b.adaptedElement==element and adaptationRemaining(state,b)>1e-8 then return s.gloom.adaptFactor end
  return 1
 end

 function herra.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  if c.reposition then
   b.facing=s.home>b.x and 1 or -1
   b.x=b.x+clamp(s.home-b.x,-s.walkSpeed/60,s.walkSpeed/60)
   if b.x==s.home then c.origin,c.tick,c.reposition=b.x,0,nil end
   return false
  end
  c.tick=t
  if c.broken then
   if t-c.broken<s.gloom.downTicks then return false end
   place(b,s,'idle','idle')
   return true
  end
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
  end
  if t==m.lock then
   lock(c,s,a)
   if not s.gloom and (c.left<s.arenaMin or c.right>s.arenaMax or
      not C.fieldGroundRetreat(state,c.dir,c.left,c.right,m.active[1][1]-t,c.origin)) then
    c.left,c.right,c.center=nil,nil,nil
    place(b,s,'idle','idle')
    if b.x==s.home then return true end
    c.reposition=true
    return false
   end
  end

  local form,pose,y='attack','ready',s.floorY
  if m.kind=='dive' and t>=m.air[1] then
   local q=clamp((t-m.air[1])/(m.air[2]-m.air[1]),0,1)
   b.x=c.origin+(c.center-c.origin)*q
   if t<m.air[2] then
    form,pose,y='airborne','leap',s.floorY-4*q*(1-q)*m.lift*U
   else
    pose='land'
   end
  elseif m.kind=='gloom' and t>=m.lock and t<m.recover then
   if s.gloom then
    if t==m.lock then c.damageByElement,c.dominantDamage,c.contacts={},0,{} end
    form,pose='gloom','gloom'
   else
    form,pose='shadow','gloom'
   end
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='wing' then pose='sweep' end
    C.hitFieldArea(state,c.source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage)
   end
  end
  if s.gloom and t==m.recover and m.kind=='gloom' then
   b.gloomCharges=0
   if c.dominant then
    b.adaptedElement,b.adaptUntil=c.dominant,state.t+s.gloom.adaptTicks/60
   end
  end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose,y)
  if t<m.total then return false end
  place(b,s,'idle','idle')
  return true
 end

 function herra.label(b,c,s,state)
  if not s.gloom then
   if c and c.reposition then return '石壇の中央へ移動中' end
   if b.form=='recover' then return '反撃の隙' end
   if b.form=='airborne' then return '飛翔からの着地・床の印から離れる' end
   if b.form=='shadow' then
    if c.tick<c.move.active[1][2] then return '薄闇の二連波・一波目' end
    if c.tick<c.move.active[2][2] then return '薄闇の二連波・二波目' end
    return '翼を戻す'
   end
   return
  end
  if b.form=='gloom' then return '薄闇・氷／月 '..b.gloomCharges..'／'..s.gloom.charges end
  if b.form=='down' then return '薄闇解除・反撃の好機' end
  if b.adaptedElement and adaptationRemaining(state,b)>1e-8 then
   local adaptation='元素適応・'..names[b.adaptedElement]
   return c and adaptation..' ／ '..c.move.title or adaptation
  end
  if b.form=='recover' then return '硬直中・反撃の好機' end
 end
 function herra.frame(f,b,s,c,state)
  f.draftMoves=s.draftMoves
  if s.gloom then
   local ticks=math.max(0,math.ceil(adaptationRemaining(state,b)*60-1e-7))
   f.gloom={charges=b.gloomCharges,maxCharges=s.gloom.charges,
    adaptedElement=ticks>0 and b.adaptedElement or nil,remainingTicks=ticks}
  end
  if not c or c.reposition then return end
  local m=c.move
  if b.form=='down' then f.recoveryTicks=c.broken+s.gloom.downTicks-c.tick
  elseif b.form=='recover' then f.recoveryTicks=m.total-c.tick end
  if not c.left then return end
  if m.kind=='dive' then
   f.lockedDive={origin=c.origin,center=c.center,left=c.left,right=c.right}
  elseif m.kind=='gloom' then
   f.lockedWave={left=c.left,right=c.right}
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y,shortWave)
  if c.broken or not c.left then return end
  local m=c.move
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    local l,r=c.left-cam,c.right-cam
    local top=y-m.height*U
    local tint=m.kind=='gloom' and gloom or ice
    if c.tick>=w[1] then rect(f,l,top,r-l,y-top,tint..'55');rect(f,l,top,r-l,3,light) end
    if shortWave then
     rect(f,l,y-8,r-l,7,'#392957')
     rect(f,l,y-7,r-l,3,tint)
     rect(f,l,y-23,3,21,light)
     rect(f,r-3,y-23,3,21,light)
    else
     for x=l+2,r-5,13 do rect(f,x,y-5,8,3,tint) end
    end
    return
   end
  end
 end
 function herra.draw(f,state,b,s,c,mode,profile)
  local x=b.x-state.camera
  local shortWave=not s.gloom and c and c.move.kind=='gloom'
  if c and not shortWave then warning(f,c,state.camera,s.floorY) end
  local nativeLeft=b.pose=='idle'
  C.drawFrostnightHerraFieldArt(f,x,b.y,b.pose,mode,profile,(b.facing<0)~=nativeLeft)
  if shortWave then warning(f,c,state.camera,s.floorY,true) end
  if b.form~='gloom' then return end
  local count=s.gloom.charges
  local y=b.hitTop-14
  rect(f,x-count*7-2,y,count*14+4,8,'#242033')
  for i=1,count do
   rect(f,x-count*7+(i-1)*14+1,y+2,11,4,i<=b.gloomCharges and ice or '#594a70')
  end
 end

 function herra.drawOverlay(f,state,s,c)
  if not c or c.broken or not c.left then return end
  local m=c.move
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    local x,y=(c.left+c.right)/2-state.camera,s.floorY
    local width=m.kind=='dive' and 38 or 20
    rect(f,x-width/2,y+6,width,18,'#242033')
    rect(f,x-width/2,y+6,width,2,m.kind=='gloom' and gloom or ice)
    f.draws[#f.draws+1]={kind='text',x=x,y=y+20,text=m.kind=='dive' and '着地' or tostring(i),size=12,color=light}
    return
   end
  end
 end
 return herra
end
