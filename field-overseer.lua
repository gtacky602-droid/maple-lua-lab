return function(C)
 local overseer={}
 local U=88
 local cyan,white,blue,ink='#73dfff','#ebfcff','#448ac7','#182d3b'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end
 local function place(b,s,form,pose)
  b.form,b.pose=form,pose
  b.y=s.floorY-(form=='cooled' and 8 or 22)
  b.hitTop=b.y-(pose=='idle' and s.artHeight or C.overseerFieldArt[pose].profiles.legacy.height)
  b.hitBottom=b.y-.19*U
 end
 function overseer.spawn(b,s) place(b,s,'hover','idle') end
 overseer.cancel=overseer.spawn
 function overseer.onDefeat(_,b,s) overseer.spawn(b,s) end
 function overseer.begin(b,s,move)
  return {move=move,tick=0,origin=b.x,dir=b.facing,seen={{},{},{}},damage={},flow=0,flowClock=0,flowMax=s.flow.max,
   chilled=0,cooledCasts=setmetatable({},{__mode='k'}),source={id=b.id,owner=b,y=s.floorY,damageElement=move.element}}
 end
 function overseer.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
 end

 function overseer.frame(f,b,s,c)
  if not c then return end
  f.waveX=c.waveX
  if c.centers and c.tick<c.move.recover then
   f.purgePoints=c.centers
   f.flow={level=c.flow,max=c.flowMax,chilledTicks=c.chilled}
  end
 end

 local function lock(s,c)
  local m=c.move
  local margin=((m.far or m.positions[#m.positions])+(m.width or 0)/2)*U
  if c.origin+c.dir*margin<s.arenaMin or c.origin+c.dir*margin>s.arenaMax then c.dir=-c.dir end
  if m.kind=='blade' then
   local x0,x1=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.lane={math.min(x0,x1),math.max(x0,x1)}
  elseif m.kind=='wave' then
   c.first=c.origin+c.dir*m.near*U
   c.last=c.origin+c.dir*m.far*U
   c.lane={math.min(c.first,c.last)-m.width*U/2,math.max(c.first,c.last)+m.width*U/2}
  else
   c.centers={}
   for i,offset in ipairs(m.positions) do c.centers[i]=c.origin+c.dir*offset*U end
  end
 end

 local function bounds(c,i)
  local m=c.move
  if m.kind=='blade' then return c.lane[1],c.lane[2] end
  local radius=m.width*U/2
  local center=c.centers and c.centers[i] or c.waveX
  if center then return center-radius,center+radius end
  return c.lane[1],c.lane[2]
 end

 function overseer.onHit(cast,_,s,slot)
  local c=slot.cast
  if cast.element~='cryo' or cast.reaction or not c or c.move.kind~='purge' or
     c.tick<c.move.lock or c.tick>=c.move.recover or c.cooledCasts[cast] then return end
  c.cooledCasts[cast]=true
  c.flow=math.max(0,c.flow-1)
  c.chilled=s.flow.coolTicks
 end
 local function flow(s,c)
  if c.tick<c.move.lock or c.tick>=c.move.recover then return end
  if c.chilled>0 then c.chilled=c.chilled-1;return end
  c.flowClock=c.flowClock+1
  if c.flowClock>=s.flow.interval then
   c.flow=math.min(c.flowMax,c.flow+1)
   c.flowClock=0
  end
 end

 function overseer.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c);b.facing=c.dir end
  local pose,form='blade-ready',m.kind
  if m.kind=='purge' then
   flow(s,c)
   pose='purge'
   if c.chilled>0 then form,pose='cooled','cooled' end
  elseif m.kind=='wave' and t>=m.active[1][1] and t<m.active[1][2] then
   local w=m.active[1]
   local progress=(t-w[1])/(w[2]-w[1]-1)
   c.waveX=c.first+(c.last-c.first)*progress
  end
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if t==w[1] then c.damage[i]=m.damage+(m.kind=='purge' and c.flow*s.flow.damagePerLevel or 0) end
    if m.kind~='purge' then pose='blade-cross' end
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,c.damage[i],
                   s.floorY-(m.low or 0)*U)
   end
  end
  if t>=m.recover then form,pose='recover','cooled' end
  place(b,s,form,pose)
  if t<m.total then return false end
  overseer.spawn(b,s)
  return true
 end

 function overseer.label(b,c)
  if b.form=='recover' then return '輪が閉じる・反撃の好機' end
  if b.form=='cooled' then return '冷却中・液流の蓄積が停止' end
  if c and c.move.kind=='purge' and c.tick>=c.move.lock then return '掃討モード・液流 '..c.flow..'／'..c.flowMax end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,b,cam,y,i,mode,profile)
  local m=c.move
  local left,right=bounds(c,i)
  left,right=left-cam,right-cam
  local top,bottom=y-m.height*U,y-(m.low or 0)*U
  for x=left+1,right-5,13 do rect(f,x,bottom-4,7,2,cyan) end
  if c.tick>=m.active[i][1] then
   rect(f,left,top,right-left,bottom-top,cyan..'44')
   if m.kind=='blade' then
    rect(f,left,(top+bottom)/2,right-left,3,white)
   else
    local pose=m.kind=='wave' and 'crest' or 'plume'
    C.drawOverseerFieldArt(f,(left+right)/2,bottom,pose,mode,profile,m.kind=='wave' and b.facing<0)
   end
  end
  if #m.active>1 then
   f.draws[#f.draws+1]={kind='text',x=(left+right)/2,y=top-7,text=i..' / '..#m.active,size=13,color=white}
  end
 end
 function overseer.draw(f,state,b,s,c,mode,profile)
  local x=b.x-state.camera
  if c and c.tick>=c.move.lock then
   for i,w in ipairs(c.move.active) do
    if c.tick<w[2] then warning(f,c,b,state.camera,s.floorY,i,mode,profile);break end
   end
  end
  C.drawOverseerFieldArt(f,x,b.y,c and b.pose or 'idle',mode,profile,b.facing<0)
  if c and c.move.kind=='purge' and c.tick>=c.move.lock and c.tick<c.move.recover then
   local width=s.flow.max*13
   local y=b.y-C.overseerFieldArt[b.pose].profiles.legacy.height-13
   rect(f,x-width/2-2,y,width+4,8,ink)
   for i=1,s.flow.max do
    local color=i<=c.flow and cyan or blue
    if c.chilled>0 then color=i<=c.flow and white or '#3d586a' end
    rect(f,x-width/2+(i-1)*13+1,y+2,10,4,color)
   end
  end
 end
 return overseer
end
