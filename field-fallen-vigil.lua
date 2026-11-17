return function(C)
 local vigil={}
 local U=88
 local gold,pale,ink='#ffd685','#fff1c4','#332d36'
 local colors={pyro='#ff7847',hydro='#50c6ee',electro='#c586f6',cryo='#b7edff',none='#d4d5dc'}
 local names={pyro='炎',hydro='水',electro='雷',cryo='氷',none='未記録'}
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose,y)
  b.form,b.pose,b.y=form,pose,y or s.floorY-s.hover
  b.hitTop,b.hitBottom=b.y-C.fallenVigilFieldArt[pose].profiles.legacy.height,b.y
 end
 function vigil.spawn(b,s) place(b,s,'idle','idle') end
 local function clear(state,c)
  if not c or not c.summons then return end
  for _,unit in ipairs(c.summons) do C.removeFieldSummon(state,unit) end
  c.summons=nil
 end
 function vigil.cancel(b,s,state,c) clear(state,c);vigil.spawn(b,s) end
 function vigil.onDefeat(state,b,s,c) vigil.cancel(b,s,state,c) end
 function vigil.damageFactor(_,_,b,s) return b.form=='down' and s.stars.downFactor or 1 end
 function vigil.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},records={'none','none'},counts={},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function vigil.onHit(cast,b,s,slot,element,damage)
  local c=slot.cast
  if not c or not c.monitor or c.recorded or not colors[element] or element=='none' then return end
  if damage<=0 or cast.reaction or not cast.startedAt or cast.startedAt<c.openedAt then return end
  c.counts[element]=(c.counts[element] or 0)+1
  local needed=c.monitor==2 and c.records[1]==element and s.monitor.repeatHits or s.monitor.hits
  if c.counts[element]>=needed then c.records[c.monitor]=element;c.recorded=true end
 end
 local function summon(state,b,s,c)
  c.starsOpenedAt=state.t
  c.summons={}
  for i,dir in ipairs({-1,1}) do
   local element=c.records[i]
   local layers=element=='none' and s.stars.inertLayers or s.stars.activeLayers
   local x=clamp(c.origin+dir*s.stars.offset*U,s.arenaMin+40,s.arenaMax-40)
   local contacts=setmetatable({},{__mode='k'})
   local function accepts(cast)
    return not cast.reaction and cast.startedAt and cast.startedAt>=c.starsOpenedAt
   end
   local function contact(_,cast,unit)
    if accepts(cast) and not contacts[cast] then
     contacts[cast]=true
     local amount=1
     if element~='none' then
      if cast.element==element then amount=0
      elseif colors[cast.element] and cast.element~='none' then amount=s.stars.opposedLayers end
     end
     unit.hp=math.max(0,unit.hp-amount)
     if amount>0 then unit.lastActor=cast.id end
    end
    return false
   end
   local unit={id=-b.id-i,fieldBoss=b.fieldBoss,elementalStar=true,element=element,
    immune=element~='none' and element or nil,x=x,home=x,y=s.floorY-s.stars.hover,
    hitTop=s.floorY-s.stars.hover-70,hitBottom=s.floorY-s.stars.hover,
    hp=layers,maxhp=layers,custom=true,noRewards=true,level=s.level,warning=0,respawn=math.huge,
    acceptsCast=accepts,onCastContact=contact}
   c.summons[i]=unit
   state.enemies[#state.enemies+1]=unit
  end
 end
 local function stars(state,b,s,c)
  local alive=0
  for _,unit in ipairs(c.summons or {}) do
   if unit.hp<=0 then
    if not unit.resolved then
     unit.resolved=true
     C.removeFieldSummon(state,unit)
     C.resolveCast(state,{id=unit.lastActor or 1,key='fallen-vigil:star',atk=s.stars.backlashAttack,
      x=b.x,y=b.y,dir=1,radial=true,range=1,limit=1,targetId=b.id,mult=1,color=gold,
      element='physical',reaction=true,critRate=0,gain=0})
     if b.hp<=0 then return end
    end
   else alive=alive+1 end
  end
  if c.summons and alive==0 then c.broken=c.tick;clear(state,c) end
 end
 local function lock(s,c,a)
  local m=c.move
  if m.kind=='lunge' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
  elseif m.kind=='descent' then
   local half=m.width*U/2
   c.center=clamp(c.origin+clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U),s.arenaMin+half,s.arenaMax-half)
   c.left,c.right=c.center-half,c.center+half
  else c.left,c.right=c.origin-m.radius*U,c.origin+m.radius*U end
 end
 function vigil.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c,a) end
  if m.kind=='monitor' then
   c.monitor=nil
   for i,w in ipairs(m.scans) do
    if t==w[1] then c.openedAt=state.t;c.counts={};c.recorded=false end
    if t>=w[1] and t<w[2] then c.monitor=i end
   end
   if t==m.deploy then summon(state,b,s,c) end
   stars(state,b,s,c)
   if b.hp<=0 then return true end
  end
  if c.broken then
   if t-c.broken<s.stars.downTicks then place(b,s,'down','down',s.floorY);return false end
   vigil.spawn(b,s);return true
  end
  local form,pose,y='attack','ready',s.floorY-s.hover
  if m.kind=='lunge' then
   for _,w in ipairs(m.active) do
    if t>=w[1] and t<w[2] then pose='lunge' end
   end
  elseif m.kind=='descent' then
   pose='throw'
   if t>=m.air[1] then
    local q=clamp((t-m.air[1])/(m.air[2]-m.air[1]),0,1)
    b.x=c.origin+(c.center-c.origin)*q
    y=y-4*q*(1-q)*m.lift*U
    if q<1 then form='airborne' else pose='lunge' end
   end
  else
   pose='monitor'
   form=c.monitor and not c.recorded and 'monitoring' or t<m.deploy and 'recorded' or 'charging'
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local unit=c.summons and c.summons[i]
    if m.kind~='monitor' or unit and unit.hp>0 then
     local source=c.source
     if m.kind=='monitor' then
      source={id=b.id,owner=b,y=s.floorY,damageElement=c.records[i]=='none' and 'physical' or c.records[i]}
     end
     C.hitFieldArea(state,source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage)
    end
   end
  end
  if t==m.recover then clear(state,c) end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose,y)
  if t<m.total then return false end
  vigil.spawn(b,s);return true
 end
 function vigil.label(b,c,s)
  if b.form=='down' then return '元素星を破壊・反撃の好機' end
  if b.form=='recover' then return '監視を解いた・反撃の好機' end
  if c and c.move.kind=='monitor' then
   if c.monitor and not c.recorded then
    local element,count='none',0
    for key,n in pairs(c.counts) do if n>count then element,count=key,n end end
    local needed=c.monitor==2 and c.records[1]==element and s.monitor.repeatHits or s.monitor.hits
    return '元素を監視 '..c.monitor..' / 2・'..names[element]..' '..count..' / '..needed
   end
   if c.tick<c.move.deploy then return '監視の記録：'..names[c.records[1]]..' / '..names[c.records[2]] end
   return '現象の譫妄・2つの元素星を壊す'
  end
 end
 function vigil.frame(f,_,s,c)
  if not c or c.move.kind~='monitor' then return end
  f.vigil={records=c.records,monitor=c.monitor,counts=c.counts,recorded=c.recorded or false,
   hits=s.monitor.hits,repeatHits=s.monitor.repeatHits}
 end
 local function rect(f,x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 local function lane(f,left,right,y,height,color,active)
  if active then rect(f,left,y-height,right-left,height,color..'44') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,color) end
 end
 function vigil.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  if c and c.left and not c.broken then
   for i,w in ipairs(c.move.active) do
    local unit=c.summons and c.summons[i]
    local show=c.move.kind~='monitor' or unit and unit.hp>0 and c.tick>=w[1]-60
    if show and c.tick<w[2] then
     local color=c.move.kind=='monitor' and colors[c.records[i]] or gold
     lane(f,c.left-cam,c.right-cam,y,c.move.height*U,color,c.tick>=w[1])
     break
    end
   end
  end
  C.drawFallenVigilFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if c and c.summons then
   for _,unit in ipairs(c.summons) do
    if unit.hp>0 then
     local x=unit.x-cam
     local color=colors[unit.element]
     C.drawFallenVigilFieldArt(f,x,unit.y,'star',mode,profile,false)
     rect(f,x-5,unit.y-40,10,10,color)
     rect(f,x-30,unit.y-82,60,7,ink)
     rect(f,x-28,unit.y-80,56*unit.hp/unit.maxhp,3,color)
     f.draws[#f.draws+1]={kind='text',x=x,y=unit.y-87,text=names[unit.element],size=12,color=pale}
    end
   end
  end
 end
 return vigil
end
