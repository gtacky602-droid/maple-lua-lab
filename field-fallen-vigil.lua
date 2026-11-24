return function(C)
 local vigil={}
 local U=88
 local gold,pale,ink='#ffd685','#fff1c4','#332d36'
 local colors={pyro='#ff7847',hydro='#50c6ee',electro='#c586f6',cryo='#b7edff',none='#d4d5dc'}
 local names={pyro='炎',hydro='水',electro='雷',cryo='氷',none='未記録'}
 local starVariants={}
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose,y)
  b.form,b.pose,b.y=form,pose,y or s.floorY-s.hover
  b.hitTop,b.hitBottom=b.y-C.fallenVigilFieldArt[pose].profiles.legacy.height,b.y
 end
 function vigil.spawn(b,s) place(b,s,'idle','idle') end
 local function clear(state,c)
  if not c then return end
  if c.summons then
   for _,unit in ipairs(c.summons) do C.removeFieldSummon(state,unit) end
   c.summons=nil
  end
  c.starDevices=nil
 end
 function vigil.cancel(b,s,state,c) clear(state,c);vigil.spawn(b,s) end
 function vigil.onDefeat(state,b,s,c) vigil.cancel(b,s,state,c) end
 function vigil.damageFactor(_,_,b,s)
  return not s.draftMoves and b.form=='down' and s.stars.downFactor or 1
 end
 function vigil.begin(b,s,m,_,state)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},records={'none','none'},counts={},
   startTime=state.t,
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function vigil.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 local function scan(c,t)
  for i,w in ipairs(c.move.scans) do
   if t>=w[1] and t<w[2] then return i,w[1] end
  end
 end
 local function encounterTime(party,b,c)
  local _,now=C.fieldSlot(party,b.fieldBoss)
  -- Player impacts run before the field controller advances on the same tick.
  return math.floor((now-c.startTime)*60+.5)
 end
 local function direct(party,b,cast,openTime)
  local actor=party.actors[cast.id]
  return actor and actor.hp>0 and not cast.reaction and not cast.persistentTarget and
         C.fieldCastStartedSince(party,b.fieldBoss,cast,openTime)
 end
 function vigil.onHit(cast,b,s,slot,element,damage,party)
  local c=slot.cast
  if not c or damage<=0 or not colors[element] or element=='none' then return end
  if c.move.stars then
   local window,opening=scan(c,encounterTime(party,b,c))
   if window and c.records[window]=='none' and direct(party,b,cast,c.startTime+opening/60) then
    c.records[window]=element
   end
   return
  end
  if not c.monitor or c.recorded or cast.reaction or not C.fieldCastStartedSince(party,b.fieldBoss,cast,c.openedAt) then return end
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
   local function accepts(cast,party)
    return not cast.reaction and C.fieldCastStartedSince(party,b.fieldBoss,cast,c.starsOpenedAt)
   end
   local function contact(party,cast,unit)
    if accepts(cast,party) and not contacts[cast] then
     contacts[cast]=true
     local amount=1
     if element~='none' then
      if cast.element==element then amount=0
      elseif colors[cast.element] and cast.element~='none' then amount=s.stars.opposedLayers end
     end
     unit.hp=math.max(0,unit.hp-amount)
     if unit.hp==0 then
      unit.backlash=C.captureFieldBacklash(party,b,cast.id,
       {atk=s.stars.backlashAttack,key='fallen-vigil:star',element='physical',color=gold})
     end
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
     C.resolveFieldBacklash(state,b,unit.backlash)
     if b.hp<=0 then return end
    end
   else alive=alive+1 end
  end
  if c.summons and alive==0 then c.broken=c.tick;clear(state,c) end
 end
 local function deployStars(c)
  if c.starDevices then return end
  local m,y=c.move,c.source.y
  c.starDevices={}
  for i,entry in ipairs(m.stars) do
   local x=c.origin+c.dir*entry.offset*U
   local near,far=c.origin+c.dir*entry.near*U,c.origin+c.dir*entry.far*U
   c.starDevices[i]={x=x,y=y,hitTop=y-m.starHeight*U,hitBottom=y,hitHalfWidth=m.starHalfWidth*U,
    left=math.min(near,far),right=math.max(near,far),element=c.records[i],layers=m.starLayers,
    contacts=setmetatable({},{__mode='k'})}
  end
 end
 function vigil.onAttackPulse(party,cast,b,c,_,left,right)
  local m=c.move
  if not m.stars or c.broken then return end
  local t=encounterTime(party,b,c)
  if t<m.deploy or t>=m.starClose or not direct(party,b,cast,c.startTime+m.deploy/60) then return end
  deployStars(c)
  for _,device in ipairs(c.starDevices) do
   if device.layers>0 and not device.contacts[cast] and C.castReachesFieldPart(cast,device,left,right) then
    device.contacts[cast]=true
    device.layers=device.layers-1
   end
  end
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
  elseif not m.stars then c.left,c.right=c.origin-m.radius*U,c.origin+m.radius*U end
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
  elseif m.stars then
   if t==m.deploy then deployStars(c) end
   if c.starDevices then
    if c.starDevices[1].layers==0 and c.starDevices[2].layers==0 then
     c.broken=t
     clear(state,c)
    elseif t>=m.starClose then
     clear(state,c)
    end
   end
  end
  if c.broken then
   local age=t-c.broken
   if age<s.stars.downTicks then place(b,s,'down','down',s.floorY);return false end
   if m.standTicks and age<s.stars.downTicks+m.standTicks then
    place(b,s,'standing','ready',s.floorY);return false
   end
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
    if s.draftMoves then y=s.floorY-(1-q)*s.hover end
    y=y-4*q*(1-q)*m.lift*U
    if q<1 then form='airborne' else pose='lunge' end
   end
  else
   pose='monitor'
   local window=m.stars and scan(c,t) or c.monitor
   local recorded=window and c.records[window]~='none'
   form=window and not recorded and 'monitoring' or t<m.deploy and 'recorded' or 'charging'
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local unit=c.summons and c.summons[i]
    local device=c.starDevices and c.starDevices[i]
    if m.stars and device and device.layers>0 then
     c.source.damageElement=device.element=='none' and 'physical' or device.element
     C.hitFieldArea(state,c.source,c.seen[i],device.left,device.right,s.floorY-m.height*U,m.damage)
    elseif not m.stars and (m.kind~='monitor' or unit and unit.hp>0) then
     local source=c.source
     if m.kind=='monitor' then
      source={id=b.id,owner=b,y=s.floorY,damageElement=c.records[i]=='none' and 'physical' or c.records[i]}
     end
     C.hitFieldArea(state,source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage)
    end
   end
  end
  if t==m.recover then clear(state,c) end
  if t>=m.recover then
   form,pose='recover','down'
   if m.stars then y=s.floorY end
  end
  place(b,s,form,pose,y)
  if t<m.total then return false end
  vigil.spawn(b,s);return true
 end
 function vigil.label(b,c,s)
  if b.form=='down' then return '元素星を破壊・反撃の好機' end
  if b.form=='standing' then return '起き上がり' end
  if b.form=='recover' then return '監視を解いた・反撃の好機' end
  if c and c.move.stars then
   local window=scan(c,c.tick)
   if window and c.records[window]=='none' then return '元素を監視 '..window..' / 2' end
   if c.tick<c.move.deploy then return '監視の記録：'..names[c.records[1]]..' / '..names[c.records[2]] end
   if c.starDevices then
    return '二星の落光・星の残り '..c.starDevices[1].layers..' / '..c.starDevices[2].layers..'層'
   end
  end
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
  f.draftMoves=s.draftMoves or nil
  if c and c.move.stars then
   local window=scan(c,c.tick)
   f.vigil={records=c.records,monitor=window,recorded=window and c.records[window]~='none' or false}
   if c.starDevices then
    f.vigil.stars={}
    for i,device in ipairs(c.starDevices) do
     f.vigil.stars[i]={x=device.x,y=device.y,element=device.element,color=colors[device.element],
                      left=device.left,right=device.right,layers=device.layers}
    end
   end
  end
  if not c or c.move.kind~='monitor' then return end
  f.vigil={records=c.records,monitor=c.monitor,counts=c.counts,recorded=c.recorded or false,
   hits=s.monitor.hits,repeatHits=s.monitor.repeatHits}
 end
 local function rect(f,x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 local function lane(f,left,right,y,height,color,active)
  if active then rect(f,left,y-height,right-left,height,color..'44') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,color) end
 end
 local function coloredStar(element,profile)
  local key=element..':'..profile
  if starVariants[key] then return starVariants[key] end
  local original=C.fallenVigilFieldArt.star
  local source=original.profiles[profile] or original.profiles.legacy
  local color=colors[element]
  local red,green,blue=tonumber(color:sub(2,3),16),tonumber(color:sub(4,5),16),tonumber(color:sub(6,7),16)
  local runs,palette={},{}
  for _,run in ipairs(source.runs) do
   local shade=run[5]
   if not palette[shade] then
    local r,g,b=tonumber(shade:sub(2,3),16),tonumber(shade:sub(4,5),16),tonumber(shade:sub(6,7),16)
    local luma=(.22*r+.65*g+.13*b)/255
    palette[shade]=string.format('#%02x%02x%02x',math.floor(luma*red+.5),
                                math.floor(luma*green+.5),math.floor(luma*blue+.5))
   end
   runs[#runs+1]={run[1],run[2],run[3],run[4],palette[shade]}
  end
  local art={box=original.box,anchorX=original.anchorX,
             profiles={[profile]={width=source.width,height=source.height,runs=runs}}}
  starVariants[key]=art
  return art
 end
 local function drawStar(f,state,x,y,element,layers,maxLayers,mode,profile,colored)
  local color=colors[element]
  x=x-state.camera
  if colored then
   -- Stars use the same tinted rectangles across modes so combat colors agree.
   local style=mode=='rect' and (profile or 'legacy') or 'h32c16'
   local height=C.fallenVigilFieldArt.star.profiles.legacy.height
   C.drawFieldDisplayArt(f,coloredStar(element,style),x,y,height,'rect',style,false)
  else
   C.drawFallenVigilFieldArt(f,x,y,'star',mode,profile,false)
  end
  rect(f,x-5,y-40,10,10,color)
  rect(f,x-30,y-82,60,7,ink)
  rect(f,x-28,y-80,56*layers/maxLayers,3,color)
  f.draws[#f.draws+1]={kind='text',x=x,y=y-87,text=names[element],size=12,color=pale}
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
  if c and c.move.spearStart and c.tick>=c.move.spearStart and c.tick<c.move.active[1][2] then
   local start,impact=c.move.spearStart,c.move.active[1][1]
   local q=clamp((c.tick-start)/(impact-start),0,1)
   local x,tip=c.center-cam,y-150*(1-q)
   rect(f,x-1,tip-55,3,49,gold);rect(f,x-4,tip-13,9,8,pale);rect(f,x-1,tip-5,3,5,pale)
  end
  if c and c.starDevices then
   for i,device in ipairs(c.starDevices) do
    local w=c.move.active[i]
    if device.layers>0 and c.tick>=w[1]-60 and c.tick<w[2] then
     local left,right,height=device.left-cam,device.right-cam,c.move.height*U
     local color=colors[device.element]
     rect(f,left,y-height,2,height,color);rect(f,right-2,y-height,2,height,color)
     lane(f,left,right,y,height,color,c.tick>=w[1])
    end
   end
  end
  C.drawFallenVigilFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if c and c.starDevices then
   for _,device in ipairs(c.starDevices) do
    if device.layers>0 then
     drawStar(f,state,device.x,device.y,device.element,device.layers,c.move.starLayers,mode,profile,true)
    end
   end
  end
  if c and c.summons then
   for _,unit in ipairs(c.summons) do
    if unit.hp>0 then
     drawStar(f,state,unit.x,unit.y,unit.element,unit.hp,unit.maxhp,mode,profile)
    end
   end
  end
 end
 return vigil
end
