return function(C)
 local duck={}
 local U=88
 local serial=0
 local gold,pink,white,ink='#ffd44b','#e77add','#fff2b5','#2b2635'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,y,form,pose)
  b.y,b.form,b.pose=y,form,pose
  b.hitTop=y-C.knuckleDuckFieldArt[pose].profiles.legacy.height
  b.hitBottom=y-(form=='airborne' and .14*U or 0)
 end
 function duck.spawn(b,s)
  b.duckWard=0
  place(b,s,s.floorY,'idle','idle')
 end
 local function clear(state,c)
  if not c or not c.summons then return end
  for _,unit in ipairs(c.summons) do
   unit.onFieldDefeat=nil
   C.removeFieldSummon(state,unit)
  end
  c.summons=nil
 end
 function duck.cancel(b,s,state,c)
  clear(state,c)
  duck.spawn(b,s)
 end
 function duck.onDefeat(state,b,s,c) duck.cancel(b,s,state,c) end
 function duck.damageFactor(_,cast,b,s)
  if s.draftMoves then return 1 end
  if b.repairUnit then return cast.key=='SK54' and s.ward.lunarFactor or 1 end
  return b.duckWard>0 and s.ward.factor or 1
 end
 function duck.onHit(_,b,s)
  if not s.draftMoves and not b.repairUnit and b.duckWard>0 then b.duckWard=math.max(0,b.duckWard-s.ward.chip) end
 end
 function duck.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function duck.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end
 function duck.frame(f,b,s,c)
  if s.draftMoves then
   f.draftMoves=true
   if c and c.move.kind=='discharge' and c.left then
    f.repairSequence={defeated=c.defeatedRepairs or 0,lane={left=c.left,right=c.right}}
   end
   return
  end
  f.repairWard={hp=b.duckWard,maxhp=s.ward.max}
 end

 local function lock(s,c,a)
  local m=c.move
  if m.kind=='punch' then
   local x0,x1=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(x0,x1),math.max(x0,x1)
  else
   local dx=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
   local radius=m.width*U/2
   c.dest=c.origin+dx
   if not s.draftMoves then c.dest=clamp(c.dest,s.arenaMin+radius,s.arenaMax-radius) end
   c.left,c.right=c.dest-radius,c.dest+radius
   if m.kind=='discharge' then
    c.repairStarts={}
    for i,offset in ipairs(m.repairOffsets) do c.repairStarts[i]=c.origin+c.dir*offset*U end
    c.repairDestination=c.origin+c.dir*m.repairDestination*U
   end
  end
 end

 local function summonRepairs(state,b,s,c)
  serial=serial+1
  local m=c.move
  c.defeatedRepairs=0
  c.summons={}
  for i,x in ipairs(c.repairStarts) do
   local unit={id=-(b.id*1000000+serial*2+i),fieldBoss=b.fieldBoss,repairUnit=true,x=x,y=s.floorY,
    hitTop=s.floorY-40,hitBottom=s.floorY,hp=m.repairHp,maxhp=m.repairHp,level=s.level,
    custom=true,noRewards=true,warning=0,respawn=math.huge}
   unit.onFieldDefeat=function(party,dead,owner)
    local slot=C.fieldSlot(party,b.fieldBoss)
    if owner and party.actors[owner] and slot and slot.cast==c and b.hp>0 and c.tick<m.expire then
     dead.interruptCredit=true
    end
   end
   c.summons[i]=unit
   state.enemies[#state.enemies+1]=unit
  end
 end

 local function rollRepairs(state,b,s,c)
  local m,t=c.move,c.tick
  if t==m.deploy then summonRepairs(state,b,s,c) end
  if not c.summons then return end
  local progress=clamp((t-m.roll)/(m.expire-m.roll),0,1)
  for i,unit in ipairs(c.summons) do
   if not unit.resolved then
    if unit.hp<=0 then
     unit.resolved='destroyed'
     if unit.interruptCredit then c.defeatedRepairs=c.defeatedRepairs+1 end
     C.removeFieldSummon(state,unit)
    else
     local start=c.repairStarts[i]
     unit.x=start+(c.repairDestination-start)*progress
     if t==m.expire then unit.resolved='arrived' end
    end
   end
  end
  -- Process the final eligible player attacks before retiring surviving mechas.
  if c.defeatedRepairs==#c.repairStarts then
   c.broken=t
   c.reboundXs={}
   for i,unit in ipairs(c.summons) do c.reboundXs[i]=unit.x end
   clear(state,c)
  elseif t==m.expire then clear(state,c) end
 end
 local function summon(state,b,s,c)
  c.summons={}
  for i,dir in ipairs({-1,1}) do
   local x=clamp(c.origin+dir*s.ward.offset*U,s.arenaMin+24,s.arenaMax-24)
   local unit={id=-b.id-i,fieldBoss=b.fieldBoss,repairUnit=true,x=x,y=s.floorY,hitTop=s.floorY-40,
    hitBottom=s.floorY,hp=s.ward.unitHp,maxhp=s.ward.unitHp,level=s.level,custom=true,noRewards=true,warning=0,
    respawn=math.huge}
   c.summons[i]=unit
   state.enemies[#state.enemies+1]=unit
  end
 end
 local function repairs(state,b,s,c)
  local m,t=c.move,c.tick
  if t==m.guard then b.duckWard=s.ward.max end
  if t==m.deploy then summon(state,b,s,c) end
  local units=c.summons
  if not units then return end
  for _,unit in ipairs(units) do
   if not unit.resolved then
    if unit.hp<=0 then
     unit.resolved='destroyed'
     b.duckWard=math.max(0,b.duckWard-s.ward.damage)
     C.removeFieldSummon(state,unit)
    elseif t>=m.roll then
     local dx=b.x-unit.x
     if math.abs(dx)<=s.ward.arrival then
      unit.resolved='arrived'
      b.duckWard=math.min(s.ward.max,b.duckWard+s.ward.repair)
      C.removeFieldSummon(state,unit)
     else
      unit.x=unit.x+clamp(dx,-s.ward.speed,s.ward.speed)
     end
    end
   end
  end
 end

 function duck.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c,a) end
  if m.kind=='ward' and not c.broken then
   repairs(state,b,s,c)
   if t>=m.guard and t<m.recover and b.duckWard<=0 then
    c.broken=t
    clear(state,c)
   end
  elseif m.kind=='discharge' and not c.broken then
   rollRepairs(state,b,s,c)
  end
  if c.broken then
   local age=t-c.broken
   local down,stand=m.downTicks or s.ward.down,m.standTicks or 24
   if age<down then place(b,s,s.floorY,'down','down')
   elseif age<down+stand then place(b,s,s.floorY,'stand','windup')
   else duck.spawn(b,s);return true end
   return false
  end
  local form,pose,y='attack','windup',s.floorY
  if m.kind=='ward' then form,pose='guard','guard'
  elseif m.kind=='discharge' then form,pose='charging','guard'
  elseif m.kind=='stomp' and t>=m.air[1] then
   local u=clamp((t-m.air[1])/(m.air[2]-m.air[1]),0,1)
   b.x=c.origin+(c.dest-c.origin)*u
   y=y-4*m.lift*U*u*(1-u)
   if u<1 then form='airborne' else pose='stomp' end
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='punch' or m.kind=='ward' or m.kind=='discharge' then pose='punch' end
    C.hitFieldArea(state,c.source,c.seen[i],c.left,c.right,s.floorY-m.height*U,m.damage,
                   s.floorY-(m.low or 0)*U)
   end
  end
  if t==m.recover then clear(state,c);b.duckWard=0 end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,y,form,pose)
  if t<m.total then return false end
  duck.spawn(b,s)
  return true
 end

 function duck.label(b,c,s)
  if s.draftMoves then
   if b.form=='down' then return '放電を中断・反撃の隙' end
   if b.form=='stand' then return '立ち上がり' end
   if b.form=='recover' then return '反撃の隙' end
   if b.form=='charging' then
    if c.tick>=c.move.expire then return '放電・床の印から退避' end
    if c.summons then return '補修メカ '..c.defeatedRepairs..'／'..#c.repairStarts..'・2機で放電中断' end
   end
  end
  if b.form=='down' then return 'バリアが割れた・反撃の好機' end
  if b.form=='stand' then return '立ち上がり' end
  if b.form=='recover' then return '駆動を止める・反撃の好機' end
  if b.duckWard>0 then
   if c and c.summons and (c.summons[1].hp>0 or c.summons[2].hp>0) then return 'メカダックを壊すとバリアが弱まる' end
   return 'バリア稼働中・衝撃範囲から退避'
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y)
  if not c.left or c.broken then return end
  local m,t=c.move,c.tick
  for i,w in ipairs(m.active) do
   if t<w[2] then
    local l,r=c.left-cam,c.right-cam
    local top,bottom=y-m.height*U,y-(m.low or 0)*U
    local color=(m.kind=='ward' or m.kind=='discharge') and pink or gold
    if t>=w[1] then
     rect(f,l,top,r-l,bottom-top,color..'55')
     rect(f,l,top,r-l,3,white)
    end
    if m.kind=='discharge' and t>=m.expire then
     rect(f,l,bottom-6,r-l,4,color)
     rect(f,l,bottom-24,3,23,white);rect(f,r-3,bottom-24,3,23,white)
    else
     for x=l,r-4,13 do rect(f,x,bottom-4,7,3,color) end
    end
    if #m.active>1 then
     f.draws[#f.draws+1]={kind='text',x=(l+r)/2,y=top-6,text=i..' / 2',size=13,color=white}
    end
    break
   end
  end
 end
 function duck.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  local x=b.x-cam
  if c and not s.draftMoves then warning(f,c,cam,y) end
  C.drawKnuckleDuckFieldArt(f,x,b.y,c and b.pose or 'idle',mode,profile,b.facing<0)
  if c and s.draftMoves then
   warning(f,c,cam,y)
   if c.reboundXs and c.tick-c.broken<18 then
    local u=(c.tick-c.broken)/18
    for _,start in ipairs(c.reboundXs) do
     local trail=start+(c.origin-start)*u-cam
     rect(f,trail-5,y-27-28*4*u*(1-u),10,4,gold)
    end
   end
  end
  if b.duckWard>0 then
   local height=C.knuckleDuckFieldArt[b.pose].profiles.legacy.height
   rect(f,x-41,y-height-13,82,8,ink)
   rect(f,x-39,y-height-11,78*b.duckWard/s.ward.max,4,pink)
   rect(f,x-57,y-6,114,3,pink..'88')
  end
  if c and c.summons then
   for _,unit in ipairs(c.summons) do
    if unit.hp>0 then
     local u=unit.x-cam
     C.drawKnuckleDuckFieldArt(f,u,y,'mecha',mode,profile,unit.x>b.x)
     rect(f,u-18,y-49,36,5,ink)
     rect(f,u-17,y-48,34*unit.hp/unit.maxhp,3,gold)
    end
   end
  end
 end
 return duck
end
