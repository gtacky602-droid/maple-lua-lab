return function(C)
 local lava={packRectArt=true}
 local U=88
 local gold,orange,white,ink='#ffd081','#ff8742','#fff1be','#301b1e'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local idlePose={rock='idle',molten='molten',overburn='overburn'}

 local function body(b,s,pose)
  b.pose=pose or idlePose[b.form]
  b.y=s.floorY
  local height=C.lavaDragonFieldArt[b.pose].profiles.legacy.height
  b.hitTop=b.y-height
  b.hitBottom=b.y-(b.form=='molten' and .18 or 0)*U
 end
 function lava.spawn(b,s)
  b.form,b.lavaHeat,b.overburnTicks,b.lavaFlash='rock',0,0,0
  b.lavaContacts=setmetatable({},{__mode='k'})
  body(b,s)
 end
 function lava.cancel(b,s) body(b,s) end
 function lava.onDefeat(_,b,s) body(b,s) end

 local function change(b,s,slot,form,heat)
  b.form,b.lavaHeat,b.lavaFlash=form,heat,24
  b.overburnTicks=form=='overburn' and s.heat.overburnTicks or 0
  slot.cast,slot.index,slot.delay=nil,1,s.restTicks
  body(b,s)
 end
 function lava.onHit(cast,b,s,slot)
  local element=cast.element
  local cooling=element=='hydro' or element=='cryo'
  if cast.reaction or (element~='pyro' and not cooling) or b.lavaContacts[cast] then return end
  b.lavaContacts[cast]=true
  local limit=s.heat.moltenAt
  if element=='pyro' then
   if b.form=='overburn' then return end
   b.lavaHeat=b.lavaHeat+1
   if b.form=='rock' and b.lavaHeat>=limit then change(b,s,slot,'molten',limit)
   elseif b.form=='molten' and b.lavaHeat>=s.heat.overburnAt then
    change(b,s,slot,'overburn',s.heat.overburnAt)
   end
  elseif b.form=='overburn' then change(b,s,slot,'rock',0)
  elseif b.lavaHeat>0 then
   b.lavaHeat=b.lavaHeat-1
   if b.form=='molten' and b.lavaHeat<limit then change(b,s,slot,'rock',b.lavaHeat) end
  end
 end
 function lava.damageFactor(_,_,b,s)
  return b.form=='overburn' and s.heat.damageFactor or 1
 end
 function lava.preempt(b,s,slot)
  b.lavaFlash=math.max(0,b.lavaFlash-1)
  if b.form~='overburn' then return end
  b.overburnTicks=b.overburnTicks-1
  if b.overburnTicks<=0 then change(b,s,slot,'rock',0) end
  return true
 end
 function lava.selectMove(b,move)
  return b.form=='molten' and move.molten or move
 end
 function lava.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function lava.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 function lava.frame(f,b,s,c)
  f.lavaHeat={level=b.lavaHeat,max=s.heat.overburnAt,overburnTicks=b.overburnTicks}
  if b.form=='overburn' then
   f.recoveryTicks=b.overburnTicks
  elseif c and c.tick>=c.move.recover then
   f.recoveryTicks=c.move.total-c.tick
  end
  if c and c.bounds and c.move.kind=='eruption' and c.tick<c.move.recover then
   f.eruptionPoints={}
   for i,band in ipairs(c.bounds) do f.eruptionPoints[i]=(band[1]+band[2])/2 end
  end
 end

 local function lock(s,c)
  local m=c.move
  if m.kind=='lunge' then
   c.dest=clamp(c.origin+c.dir*m.distance*U,s.arenaMin+63,s.arenaMax-63)
   local radius=m.width*U/2
   c.bounds={{math.min(c.origin,c.dest)-radius,math.max(c.origin,c.dest)+radius}}
  elseif m.kind=='slam' then
   local x,y=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.bounds={{math.min(x,y),math.max(x,y)}}
  else
   c.bounds={}
   local radius=m.width*U/2
   if c.origin+c.dir*(m.second+m.width/2)*U>s.arenaMax or
      c.origin+c.dir*(m.second+m.width/2)*U<s.arenaMin then
    c.dir=-c.dir
   end
   for i,offset in ipairs({m.first,m.second}) do
    local center=clamp(c.origin+c.dir*offset*U,s.arenaMin+radius,s.arenaMax-radius)
    c.bounds[i]={center-radius,center+radius}
   end
  end
 end

 local function window(c,i,b)
  local m=c.move
  if m.kind=='lunge' and c.tick>=m.active[1][1] and c.tick<m.active[1][2] then
   local radius=m.width*U/2
   return b.x-radius,b.x+radius
  end
  return c.bounds[i][1],c.bounds[i][2]
 end

 function lava.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c);b.facing=c.dir end
  local pose=m.pose
  if m.kind=='slam' and t>=m.active[1][1] then pose='slam-strike' end
  if m.kind=='lunge' and t>=m.active[1][1] then
   local w=m.active[1]
   local mix=clamp((t-w[1])/(w[2]-w[1]-1),0,1)
   b.x=c.origin+(c.dest-c.origin)*mix
  end
  if t>=m.recover then pose=idlePose[b.form] end
  body(b,s,pose)
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local left,right=window(c,i,b)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage,s.floorY)
   end
  end
  if t<m.total then return false end
  body(b,s)
  return true
 end

 function lava.label(b,c,s)
  local heat='熱 '..b.lavaHeat..'/'..s.heat.overburnAt
  if b.form=='overburn' then return '過燃焼・'..heat..'・反撃の好機' end
  local form=b.form=='molten' and '熔焰の龍' or 'アースゴーレム'
  local status=form..'・'..heat..'・'
  if not c then return status..'炎で加熱／水・氷で冷却' end
  local m,t=c.move,c.tick
  if t>=m.recover then return status..'反撃の好機' end
  if c.bounds and #m.active>1 then
   for i,w in ipairs(m.active) do
    if t<w[2] then return status..m.title..' '..i..'/2・床の番号から離れる' end
   end
  end
  return status..m.title
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,b,c,cam,y)
  local m,t=c.move,c.tick
  local top=y-m.height*U
  local color=m.element=='pyro' and orange or gold
  for i,w in ipairs(m.active) do
   if t<w[2] then
    local left,right=window(c,i,b)
    left,right=left-cam,right-cam
    if t>=w[1] then
     rect(f,left,top,right-left,y-top,color..'66')
     rect(f,left,top,right-left,3,white)
     if m.kind=='eruption' then
      for x=left+9,right-12,19 do rect(f,x,top+6,4,y-top-12,color) end
     end
    end
    for x=left,right-5,13 do rect(f,x,y-5,7,3,color) end
   end
  end
 end

 function lava.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  local x=b.x-cam
  if c and c.bounds then warning(f,b,c,cam,y) end
  local pose=c and b.pose or idlePose[b.form]
  C.drawLavaDragonFieldArt(f,x,b.y,pose,mode,profile,b.facing<0)
  local heatY=y-C.lavaDragonFieldArt[pose].profiles.legacy.height-12
  local heatWidth=s.heat.overburnAt*13
  rect(f,x-heatWidth/2-1,heatY,heatWidth+2,8,ink)
  for i=1,s.heat.overburnAt do
   rect(f,x-heatWidth/2+2+(i-1)*13,heatY+2,10,4,
        i<=b.lavaHeat and (b.form=='overburn' and white or orange) or '#674746')
  end
  if b.lavaFlash>0 then
   local flare=b.form=='rock' and '#b2defb' or white
   local spread=math.floor((24-b.lavaFlash)*1.3)
   rect(f,x-39-spread,y-8,13,3,flare)
   rect(f,x+26+spread,y-8,13,3,flare)
  end
 end

 function lava.drawOverlay(f,state,s,c)
  if not c or not c.bounds or #c.move.active==1 then return end
  for i,w in ipairs(c.move.active) do
   if c.tick<w[2] then
    local band=c.bounds[i]
    local x,y=(band[1]+band[2])/2-state.camera,s.floorY
    rect(f,x-10,y+6,20,19,ink)
    rect(f,x-10,y+6,20,2,orange)
    f.draws[#f.draws+1]={kind='text',x=x,y=y+21,text=tostring(i),size=13,color=white}
   end
  end
 end
 return lava
end
