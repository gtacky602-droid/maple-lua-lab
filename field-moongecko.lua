return function(C)
 local gecko={}
 local U=88
 local gold,pale,ink='#ffc440','#fff1bc','#25283b'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose,y)
  b.form,b.pose,b.y=form,pose,y or s.floorY
  b.hitTop,b.hitBottom=b.y-C.moongeckoFieldArt[pose].profiles.legacy.height,b.y
 end
 function gecko.spawn(b,s)
  b.geoExposedUntil=0
  place(b,s,'idle','idle')
 end
 function gecko.cancel(b,s,state,c)
  C.clearFieldSummon(state,c)
  C.clearEncounterCocoons(state)
  gecko.spawn(b,s)
 end
 function gecko.onDefeat(state,b,s,c) gecko.cancel(b,s,state,c) end
 local function exposureRemaining(state,b)
  local untilTime=b.geoExposedUntil or 0
  if untilTime==0 then return 0 end
  local _,now=C.fieldSlot(state,b.fieldBoss)
  return math.max(0,untilTime-now)
 end
 function gecko.damageFactor(state,_,b,s,element)
  if element=='geo' and exposureRemaining(state,b)>1e-8 then return s.cocoon.geoEscapeFactor end
  return 1
 end
 function gecko.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement='geo'}}
 end
 function gecko.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 function gecko.frame(f,b,_,_,state)
  f.geoExposureTicks=math.max(0,math.ceil(exposureRemaining(state,b)*60-1e-7))
 end
 local function lock(c,s,a)
  local m=c.move
  if m.kind=='tail' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
  elseif m.kind=='leap' then
   local radius=m.width*U/2
   local dx=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
   c.center=clamp(c.origin+dx,s.arenaMin+radius,s.arenaMax-radius)
   c.left,c.right=c.center-radius,c.center+radius
  else
   c.left,c.right=c.origin-m.radius*U,c.origin+m.radius*U
  end
 end
 local function anchor(state,b,s,c)
  local x=clamp(c.origin+c.dir*s.anchor.offset*U,s.arenaMin+36,s.arenaMax-36)
  c.openedAt=state.t
  local contacts=setmetatable({},{__mode='k'})
  local function accepts(cast,party)
   return not cast.reaction and C.fieldCastStartedSince(party,b.fieldBoss,cast,c.openedAt)
  end
  local function contact(party,cast,unit)
   if accepts(cast,party) and not contacts[cast] then
    contacts[cast]=true
    local layers=cast.element=='geo' and s.anchor.geoLayers or 1
    unit.hp=math.max(0,unit.hp-layers)
    if unit.hp==0 then
     c.anchorParty=party
     c.backlash={id=cast.id,key='moongecko:anchor',atk=s.anchor.backlashAttack,
      x=b.x,y=b.y,dir=1,radial=true,range=1,limit=1,targetId=b.id,mult=1,color=gold,
      element='geo',reaction=true,critRate=0,gain=0}
     c.backlashDamage=C.enemyHitDamage(party,c.backlash,b,1,'geo')
    end
   end
   return false
  end
  c.summon={id=-b.id,fieldBoss=b.fieldBoss,moonstoneAnchor=true,x=x,home=x,y=s.floorY,
   hitTop=s.floorY-92,hitBottom=s.floorY,hp=s.anchor.layers,maxhp=s.anchor.layers,
   custom=true,noRewards=true,level=s.level,warning=0,respawn=math.huge,
   acceptsCast=accepts,onCastContact=contact}
  state.enemies[#state.enemies+1]=c.summon
 end
 local function backlash(state,b,c)
  local party=c.anchorParty
  if not state.parties or (party.enemies==state.enemies and C.sharesCoopField(party) and party.coopMember.online) then
   C.resolveCast(party,c.backlash)
  elseif b.hp<=c.backlashDamage then
   -- Settle a lethal backlash using existing contributions when the breaker has left.
   C.defeatEnemy(state.parties[1],b,nil)
  else
   b.hp=b.hp-c.backlashDamage
  end
 end
 function gecko.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if c.summon and c.summon.hp<=0 then
   c.broken=t
   C.clearFieldSummon(state,c)
   backlash(state,b,c)
   if b.hp<=0 then return true end
  end
  if c.broken then
   if t-c.broken<s.anchor.downTicks then place(b,s,'down','down');return false end
   place(b,s,'idle','idle')
   return true
  end
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(c,s,a) end
  local form,pose,y='attack','ready',s.floorY
  if m.kind=='leap' and t>=m.air[1] then
   local q=clamp((t-m.air[1])/(m.air[2]-m.air[1]),0,1)
   b.x=c.origin+(c.center-c.origin)*q
   if q<1 then form,pose,y='airborne','leap',s.floorY-4*q*(1-q)*m.lift*U
   else pose='tail' end
  elseif m.kind=='anchor' then
   form,pose='charging','charge'
   if t==m.bind then
    C.bindRadiantCocoon(state,s,c.source,c.left,c.right,function(current)
     local _,now=C.fieldSlot(current,b.fieldBoss)
     b.geoExposedUntil=now+s.cocoon.escapeTicks/60
    end)
   end
   if t==m.deploy then anchor(state,b,s,c) end
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='tail' then pose='tail' end
    C.hitFieldArea(state,c.source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage)
   end
  end
  if t==m.recover then C.clearFieldSummon(state,c) end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose,y)
  if t<m.total then return false end
  place(b,s,'idle','idle')
  return true
 end
 function gecko.label(b,c,s,state)
  if b.form=='down' then return '月石の錨を破壊・反撃の好機' end
  local mark=C.radiantCocoonEffect(state,state.active)
  if c and c.summon then
   return '月石の錨 '..c.summon.hp..'／'..s.anchor.layers..(mark and mark.bound and '・集光の繭' or '')
  end
  if mark and mark.bound then return '集光の繭・HPを満タンまで回復' end
  if exposureRemaining(state,b)>1e-8 then return '脱出・岩ダメージが通りやすい' end
  if b.form=='charging' then return '月石に集光・予告範囲から退避' end
  if b.form=='recover' then return '集光がほどけた・反撃の好機' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y)
  if not c.left or c.broken then return end
  for i,w in ipairs(c.move.active) do
   if c.tick<w[2] then
    local l,r=c.left-cam,c.right-cam
    if c.tick>=w[1] then rect(f,l,y-c.move.height*U,r-l,c.move.height*U,gold..'44') end
    for x=l+2,r-7,14 do rect(f,x,y-5,8,3,gold) end
    if #c.move.active>1 then
     f.draws[#f.draws+1]={kind='text',x=(l+r)/2,y=y-c.move.height*U-7,
                         text=i..' / '..#c.move.active,size=13,color=pale}
    end
    return
   end
  end
 end
 function gecko.draw(f,state,b,s,c,mode,profile)
  local cam=state.camera
  if c then warning(f,c,cam,s.floorY) end
  local nativeLeft=b.pose=='idle'
  C.drawMoongeckoFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,(b.facing<0)~=nativeLeft)
  if c and c.summon then
   local unit=c.summon
   local x=unit.x-cam
   C.drawMoongeckoFieldArt(f,x,s.floorY,'anchor',mode,profile,false)
   rect(f,x-36,s.floorY-106,72,8,ink)
   for i=1,s.anchor.layers do
    rect(f,x-34+(i-1)*14,s.floorY-104,12,4,i<=unit.hp and gold or '#555164')
   end
  end
 end
 return gecko
end
