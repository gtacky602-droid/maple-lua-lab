return function(C)
 local M={ice='#a5edf8',lightning='#c8afff',fire='#ff9561',safe='#8cf9d7',corrupt='#ff8395'}
 local function clamp(v,lo,hi) return math.max(lo,math.min(hi,v)) end
 function M.x(spec,u) return spec.board.left+spec.board.unit*u end
 function M.point(spec,x,margin)
  return clamp(x,spec.board.left+(margin or 0),spec.board.right-(margin or 0))
 end
 local function zone(lo,hi,y,h,color)
  return {lo=math.min(lo,hi),hi=math.max(lo,hi),y=y,h=h,color=color}
 end
 local function front(spec,c,lo,hi,h,color)
  local x=c.origin;local d=c.dir*spec.board.unit
  return zone(M.point(spec,x+lo*d),M.point(spec,x+hi*d),spec.floorY,h,color)
 end
 local function inside(a,z)
  return a.hp>0 and a.x>=z.lo and a.x<=z.hi and a.y>=z.y-z.h and a.y<=z.y+4
 end
 function M.target(s,x)
  if not s.parties then return s.actors[s.active] end
  local best,distance
  for _,party in ipairs(s.parties) do
   local a=party.actors[party.active]
   if a.hp<=0 then a=party.actors[3-party.active] end
   local d=math.abs(a.x-x)
   if a.hp>0 and (not distance or d<distance) then best,distance=a,d end
  end
  return best
 end
 local function hurt(s,w,c,a,amount)
  local party=s.actorOwners and s.actorOwners[a] or s
  local n=C.damageActor(party,a,amount,w.primary,true,true)
  if n>0 then C.combatEvent(party,'heretic:'..c.key..':hit',a.id,w.primary.id,n) end
 end
 local function impact(s,w,c,group,zones,damage)
  local seen=c.seen[group] or {};c.seen[group]=seen
  for _,a in ipairs(s.actors) do
   if not seen[a] then
    for _,z in ipairs(zones) do
     if inside(a,z) then
      seen[a]=true;hurt(s,w,c,a,damage);break
     end
    end
   end
  end
 end
 local function target(s,w,spec,c,i)
  local e=w.primary
  local a=M.target(s,e.x)
  if not a then return end
  local U=spec.board.unit
  c.origin,c.dir=e.x,a.x>=e.x and 1 or -1
  if c.key=='WH01' or c.key=='WH09' and i==1 then
   for _,d in ipairs({-c.dir,c.dir}) do
    local x=M.point(spec,a.x+d*2.55*U,.45*U)
    local clear=true
    for _,owner in ipairs(s.actors) do
     if owner.hp>0 and math.abs(owner.x-x)<1.2*U then clear=false;break end
    end
    if clear then c.arrival=x;break end
   end
  elseif c.key=='WH03' then
   c.arrival=M.point(spec,e.x-c.dir*1.25*U,.45*U)
   c.targetX,c.targetY=a.x,a.y-36
  elseif c.key=='WH08' or c.key=='WH12' then
   local offsets=c.key=='WH08' and {0,-2,2} or {-3.3,-1.1,1.1,3.3}
   local pivot=M.point(spec,a.x,(c.key=='WH08' and 2.4 or 3.65)*U)
   c.points={}
   for j,u in ipairs(offsets) do c.points[j]=pivot+u*U end
  end
  e.dir=c.dir
 end
 local function zones(spec,c,i)
  local key,U,y=c.key,spec.board.unit,spec.floorY
  if key=='WH04' then return {front(spec,c,.5,3,.55*U,M.ice)} end
  if key=='WH05' then return {zone(M.point(spec,c.origin-2*U),M.point(spec,c.origin+2*U),y,1.35*U,M.lightning)} end
  if key=='WH06' then return {front(spec,c,.25,i==3 and 3.1 or 3.65,i==3 and .55*U or .85*U,i==3 and M.ice or M.lightning)} end
  if key=='WH07' then
   local offset=(spec.board.right-spec.board.left)/2*clamp((c.t-144)/95,0,1)
   local l,r=spec.board.left+offset,spec.board.right-offset
   return {zone(l-12,l+12,y,.75*U,M.ice),zone(r-12,r+12,y,.75*U,M.ice)}
  end
  if key=='WH08' and c.points then
   local x=c.points[i]
   return {zone(x-1.5*U,x-.65*U,y,.72*U,M.ice),zone(x+.65*U,x+1.5*U,y,.72*U,M.ice)}
  end
  if key=='WH11' then return {zone(spec.board.left,spec.board.right,y,.5*U,M.ice)} end
  if key=='WH12' and c.points then
   local x=c.points[i]
   return {zone(x-.35*U,x+.35*U,y,2.65*U,M.lightning)}
  end
  if key=='WH16' then return {front(spec,c,.32,4.7,i==1 and .8*U or .62*U,i==1 and M.fire or M.ice)} end
  if key=='WH17' then
   -- Preserve a full floor refuge on either side of the forward blade.
   return {front(spec,c,.3,6.4,2.7*U,M.lightning)}
  end
  if key=='WH18' then return {zone(0,960,y,400,M.corrupt)} end
  return {}
 end
 local function volley(w,spec,c,i,j,count,ttl)
  local x,y=c.origin,spec.floorY
  local speed=spec.board.unit*5/60
  local p={expiry=c.t+ttl,x=x,y=y-27,vx=c.dir*speed,vy=0,w=12,h=12,color=M.ice,
   group='shot'..i,kind='square'}
  if c.key=='WH02' then
   p.y=y-(j-1)*39-16;p.color=M.fire
  elseif c.key=='WH03' then
   p.x,p.y=c.arrival,w.primary.y-54;p.color=M.lightning;p.kind='spark'
   local dx,dy=c.targetX-p.x,c.targetY-p.y
   local d=math.max(1,math.sqrt(dx*dx+dy*dy))
   p.vx,p.vy=dx/d*speed,dy/d*speed
  elseif c.key=='WH15' then
   p.vx=(i==1 and 1 or -1)*speed
   p.x=i==1 and M.x(spec,1.8) or M.x(spec,8.2)
   p.y=y-16;p.w,p.h=23,16;p.kind=i==1 and 'king' or 'queen'
   p.color=i==1 and '#f3d394' or '#e0b6ff'
  elseif c.key=='WH16' then
   p.y=y-69+(j-(count+1)/2)*15;p.vx=p.vx*.8
   p.vy=(j-(count+1)/2)*.47;p.color=M.fire;p.kind='feather';p.w,p.h=17,7
  else
   p.w,p.h=19,19
  end
  return p
 end
 function M.tick(s,w,spec,c)
  for i,t in ipairs(c.move.locks) do if c.t==t then target(s,w,spec,c,i) end end
  if c.key=='WH01' and c.t==72 or c.key=='WH09' and c.t==168 then
   if c.arrival then w.primary.x=c.arrival end
  elseif c.key=='WH03' and c.arrival then
   local u=clamp((c.t-60)/24,0,1)
   w.primary.x=c.origin+(c.arrival-c.origin)*u
   w.primary.y=spec.floorY-132*u*clamp((288-c.t)/30,0,1)
  end
  w.primary.hitTop=w.primary.y-110;w.primary.hitBottom=w.primary.y
  local damage=spec.damage
  for i,win in ipairs(c.move.windows) do
   if c.t>=win[1] and c.t<win[2] then
    w.phase='active'
    impact(s,w,c,i,zones(spec,c,i),c.key=='WH18' and damage.failure or
     (c.key=='WH16' or c.key=='WH17') and damage.mimic or damage.base)
   end
  end
  for _,shots in ipairs(c.move.shots) do
   for i,t in ipairs(shots.spawn_ticks) do
    if c.t==t then
     local count=shots.count_per_spawn or 1
     for j=1,count do c.shots[#c.shots+1]=volley(w,spec,c,i,j,count,shots.ttl_ticks) end
    end
   end
  end
  for i=#c.shots,1,-1 do
   local p=c.shots[i]
   local nx,ny=p.x+p.vx,p.y+p.vy
   if c.t>=p.expiry or nx<spec.board.left-45 or nx>spec.board.right+45 then
    table.remove(c.shots,i)
   else
    w.phase='active'
    impact(s,w,c,p.group,{zone(math.min(p.x,nx)-p.w,math.max(p.x,nx)+p.w,
     math.max(p.y,ny)+p.h+78,math.abs(p.y-ny)+2*p.h+78,p.color)},
     (c.key=='WH15' or c.key=='WH16') and damage.mimic or damage.projectile)
    p.x,p.y=nx,ny
   end
  end
 end
 function M.warnings(spec,c)
  local out={};local key,y,U=c.key,spec.floorY,spec.board.unit
  if c.arrival and ((key=='WH01' and c.t<72) or (key=='WH09' and c.t>=126 and c.t<168) or (key=='WH03' and c.t<288)) then
   out[#out+1]=zone(c.arrival-23,c.arrival+23,y,5,M.safe)
  end
  for i,win in ipairs(c.move.windows) do
   local lead=math.max(0,win[1]-85)
   if key=='WH07' then lead=90 end
   if c.t>=lead and c.t<win[2] then
    for _,z in ipairs(zones(spec,c,i)) do z.active=c.t>=win[1];out[#out+1]=z end
   end
  end
  for _,shots in ipairs(c.move.shots) do
   for i,t in ipairs(shots.spawn_ticks) do
    if c.t>=t-48 and c.t<t and (i==1 or c.t>=shots.spawn_ticks[i-1]) then
     if key=='WH15' then
      local x=M.x(spec,i==1 and 1.8 or 8.2)
      out[#out+1]=zone(x,x+(i==1 and 4 or -4)*U,y,.45*U,i==1 and '#f3d394' or '#e0b6ff')
     elseif key~='WH03' then
      out[#out+1]=front(spec,c,0,4.8,key=='WH02' and 1.25*U or .54*U,key=='WH09' and M.ice or M.fire)
     elseif c.arrival then
      out[#out+1]=zone(c.targetX-23,c.targetX+23,c.targetY+38,45,M.lightning)
     end
    end
   end
  end
  return out
 end
 return M
end
