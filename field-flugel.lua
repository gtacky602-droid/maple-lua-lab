return function(C)
 local lion={}
 local U=88
 local mint,purple,pale,ink='#52e3c1','#dc76ff','#ebfff9','#25303d'
 local effective={cryo=true,pyro=true,dendro=true}
 local swirl={pyro=true,hydro=true,electro=true,cryo=true}
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose,y)
  b.form,b.pose,b.y=form,pose,y or s.floorY
  b.hitTop,b.hitBottom=b.y-C.flugelFieldArt[pose].profiles.legacy.height,b.y
 end
 local function arm(b,s,time)
  b.mode,b.ward,b.wardOpenedAt,b.wardBroken='electro',s.ward.layers,time,false
  b.wardContacts=setmetatable({},{__mode='k'})
  b.wardDown,b.downReason=0,nil
 end
 function lion.spawn(b,s) arm(b,s,0);place(b,s,'idle','idle') end
 local function clear(state,c)
  if not c or not c.summons then return end
  for _,unit in ipairs(c.summons) do C.removeFieldSummon(state,unit) end
  c.summons=nil
 end
 function lion.cancel(b,s,state,c) clear(state,c);lion.spawn(b,s) end
 function lion.onDefeat(state,b,s,c) lion.cancel(b,s,state,c) end
 function lion.damageFactor(_,_,b,s)
  if b.form=='down' then return s.ward.downFactor end
  return b.mode=='electro' and b.ward>0 and s.ward.damageFactor or 1
 end
 function lion.onHit(cast,b,s,_,element,_,party)
  if b.mode~='electro' or b.ward<=0 or b.wardContacts[cast] or cast.reaction or
     not C.fieldCastStartedSince(party,b.fieldBoss,cast,b.wardOpenedAt) then return end
  b.wardContacts[cast]=true
  local amount=element=='electro' and 0 or effective[element] and s.ward.effectiveLayers or 1
  b.ward=math.max(0,b.ward-amount)
 end
 function lion.preempt(b,s,slot)
  if b.mode=='electro' and b.ward<=0 and not b.wardBroken then
   b.wardBroken=true;b.wardDown=s.ward.downTicks;b.downReason='ward'
   slot.cast=nil
  end
  if b.wardDown<=0 then return false end
  place(b,s,'down','down')
  b.wardDown=b.wardDown-1
  if b.wardDown==0 then
   b.mode,b.downReason='anemo',nil
   slot.delay=s.restTicks
   place(b,s,'idle','idle')
  end
  return true
 end
 function lion.selectMove(b,m) return m.kind=='ritual' and m[b.mode] or m end
 function lion.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,mode=b.mode,seen={{},{},{}},brokenOrbs=0,
   source={id=b.id,owner=b,y=s.floorY,damageElement=b.mode}}
 end
 function lion.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 local function lock(s,c,a)
  local m=c.move
  if m.kind=='slash' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
  elseif m.kind=='dive' then
   local half=m.width*U/2
   c.center=clamp(c.origin+clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U),s.arenaMin+half,s.arenaMax-half)
   c.left,c.right=c.center-half,c.center+half
  else c.left,c.right=c.origin-m.radius*U,c.origin+m.radius*U end
 end
 local function orbs(state,b,s,c)
  c.openedAt=state.t
  c.summons={}
  for i,offset in ipairs(s.orbs.offsets) do
   local x=clamp(c.origin+offset*U,s.arenaMin+32,s.arenaMax-32)
   local contacts=setmetatable({},{__mode='k'})
   local function accepts(cast,party)
    return not cast.reaction and C.fieldCastStartedSince(party,b.fieldBoss,cast,c.openedAt)
   end
   local function contact(party,cast,unit)
    if accepts(cast,party) and not contacts[cast] then
     contacts[cast]=true
     unit.hp=math.max(0,unit.hp-(swirl[cast.element] and s.orbs.elementalLayers or 1))
    end
    return false
   end
   local unit={id=-b.id-i,fieldBoss=b.fieldBoss,windOrb=true,x=x,home=x,y=s.floorY-s.orbs.hover,
    hitTop=s.floorY-s.orbs.hover-54,hitBottom=s.floorY-s.orbs.hover,hp=s.orbs.layers,maxhp=s.orbs.layers,
    custom=true,noRewards=true,level=s.level,warning=0,respawn=math.huge,
    acceptsCast=accepts,onCastContact=contact}
   c.summons[i]=unit;state.enemies[#state.enemies+1]=unit
  end
 end
 local function gather(state,b,s,c)
  local m,t=c.move,c.tick
  if t==m.deploy then orbs(state,b,s,c) end
  if not c.summons then return end
  local alive=0
  for _,unit in ipairs(c.summons) do
   if unit.hp<=0 then
    if not unit.resolved then unit.resolved=true;c.brokenOrbs=c.brokenOrbs+1;C.removeFieldSummon(state,unit) end
   else
    alive=alive+1
    local q=clamp((t-m.absorbStart)/(m.absorbEnd-m.absorbStart),0,1)
    unit.x=unit.home+(c.origin-unit.home)*q
   end
  end
  if c.brokenOrbs>=s.orbs.required then
   c.broken=t;b.downReason='orbs';clear(state,c)
  elseif t>=m.absorbEnd then c.absorbed=alive;clear(state,c) end
 end
 function lion.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c,a) end
  if m.kind=='gale' then gather(state,b,s,c) end
  if c.broken then
   if t-c.broken<s.orbs.downTicks then place(b,s,'down','down');return false end
   arm(b,s,state.t);place(b,s,'idle','idle');return true
  end
  local form,pose,y='attack','ready',s.floorY
  if m.kind=='dive' and t>=m.air[1] then
   local q=clamp((t-m.air[1])/(m.air[2]-m.air[1]),0,1)
   b.x=c.origin+(c.center-c.origin)*q
   if q<1 then form,pose,y='airborne','dive',s.floorY-4*q*(1-q)*m.lift*U
   else pose='slash' end
  elseif m.kind=='gale' then
   form,pose='gathering','charge'
   if t>=m.deploy then y=y-s.orbs.bodyHover end
  elseif m.kind=='thunder' then form,pose='thundercall','charge' end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='slash' or m.kind=='thunder' then pose='slash' end
    C.hitFieldArea(state,c.source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage)
   end
  end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose,y)
  if t<m.total then return false end
  if m.kind=='thunder' then b.mode,b.ward,b.wardBroken='anemo',0,true
  elseif m.kind=='gale' then clear(state,c);arm(b,s,state.t) end
  place(b,s,'idle','idle');return true
 end
 function lion.label(b,c,s)
  if b.form=='down' then return b.downReason=='ward' and '雷の守りが割れた・使風へ移る' or '風の球を崩した・反撃の好機' end
  if b.form=='recover' then return '翼を休める・反撃の好機' end
  if b.mode=='electro' then return '招雷・雷の守り '..b.ward..' / '..s.ward.layers end
  if c and c.move.kind=='gale' then
   return '使風・風の球 '..c.brokenOrbs..' / '..s.orbs.required..'破壊・通常攻撃でも対処可'
  end
  return '使風・翼と刃の動きに注意'
 end
 function lion.frame(f,b,s,c)
  f.flugel={mode=b.mode,ward=b.ward,maxWard=s.ward.layers,downReason=b.downReason,
   brokenOrbs=c and c.brokenOrbs or 0,requiredOrbs=s.orbs.required,absorbed=c and c.absorbed}
 end
 local function rect(f,x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 local function lane(f,left,right,y,height,color,active)
  if active then rect(f,left,y-height,right-left,height,color..'44') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,color) end
 end
 function lion.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  local color=b.mode=='electro' and purple or mint
  if c and c.left and not c.broken then
   for _,w in ipairs(c.move.active) do
    if c.tick<w[2] then
     if c.move.kind~='gale' or c.tick>=w[1]-60 then
      lane(f,c.left-cam,c.right-cam,y,c.move.height*U,color,c.tick>=w[1])
     end
     break
    end
   end
  end
  C.drawFlugelFieldArt(f,b.x-cam,b.y,b.pose,mode,profile,b.facing>0)
  if b.mode=='electro' and b.ward>0 then
   local top=b.hitTop-14
   rect(f,b.x-cam-47,top,94,8,ink)
   for i=1,s.ward.layers do rect(f,b.x-cam-45+(i-1)*11.5,top+2,10,4,i<=b.ward and purple or '#525066') end
   for _,side in ipairs({-1,1}) do
    rect(f,b.x-cam+side*64-2,b.y-100,4,44,purple)
    rect(f,b.x-cam+side*64-10,b.y-104,20,3,purple)
   end
  end
  if c and c.summons then
   for _,unit in ipairs(c.summons) do
    if unit.hp>0 then
     local x=unit.x-cam
     C.drawFlugelFieldArt(f,x,unit.y,'orb',mode,profile,false)
     rect(f,x-20,unit.hitTop-11,40,6,ink)
     rect(f,x-18,unit.hitTop-9,36*unit.hp/unit.maxhp,2,mint)
    end
   end
  end
 end
 return lion
end
