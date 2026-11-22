return function(C)
 local M={}
 M.gold,M.fire,M.ice,M.violet,M.water='#e7bd77','#ff986b','#aeeaff','#cbaeef','#8bcfff'
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local function pos(spec,x) return clamp(x,spec.board.left+31,spec.board.right-31) end
 local function band(lo,hi,y,h,color)
  return {lo=math.min(lo,hi),hi=math.max(lo,hi),y=y,h=h,color=color}
 end
 local function ring(x,r,y,h,color) return band(x-r,x+r,y,h,color) end
 M.band=band
 function M.inside(a,z)
  return a.hp>0 and a.x>=z.lo and a.x<=z.hi and a.y>=z.y-z.h and a.y<=z.y+5
 end
 -- Ordinary moves aim at the nearest living player. A lured charge (no x)
 -- follows the player furthest along the board towards the pieces.
 function M.target(s,x)
  if not s.parties then return s.actors[s.active],s end
  local actor,owner,score
  for _,party in ipairs(s.parties) do
   local a=party.actors[party.active]
   local d=x and -math.abs(x-a.x) or a.x
   if a.hp>0 and (not score or d>score) then actor,owner,score=a,party,d end
  end
  return actor,owner
 end
 function M.damage(s,w,spec,c,zones,seen,amount,source)
  for _,a in ipairs(s.actors) do
   if not seen[a] then
    for _,z in ipairs(zones) do
     if M.inside(a,z) then
      seen[a]=true
      local party=s.actorOwners and s.actorOwners[a] or s
      local dealt=C.damageActor(party,a,amount,source or c.body,true,true)
      if dealt>0 then C.combatEvent(party,'gate:'..c.key..':hurt',a.id,w.primary.id,dealt) end
      break
     end
    end
   end
  end
 end
 local function side(spec,x,d,length,h,color)
  return band(pos(spec,x+d*18),pos(spec,x+d*length),spec.floorY,h,color)
 end
 function M.lock(s,w,spec,c,i)
  local a=M.target(s,c.body.x)
  if not a then return end
  if c.key=='WT01' then
   c.points[i]=pos(spec,a.x)
   return
  end
  c.x=c.body.x
  if i==1 then
   c.dir=a.x>=c.x and 1 or -1
   c.body.dir=c.dir
   c.mark=pos(spec,a.x)
  elseif c.key=='WT11' then
   c.shotX=c.body.x;c.shotDir=a.x>=c.shotX and 1 or -1
  elseif c.key=='WT12' then
   c.mark=pos(spec,a.x)
  elseif c.key=='WT14' then
   c.x=w.king.x;c.dir=a.x>=c.x and 1 or -1
  end
 end
 function M.shapes(w,spec,c,i)
  local key,x,d,y,U=c.key,c.x,c.dir,spec.floorY,spec.board.unit
  if key=='WT01' then return {ring(c.points[i] or c.mark,(i==3 and 1.875 or .625)*U,y,i==3 and 93 or 65,M.gold)} end
  if key=='WT02' then return {ring(pos(spec,c.mark+(i==1 and -58 or 58)),.63*U,y,121,M.gold)} end
  if key=='WT07' then
   if i==1 then return {side(spec,x,d,1.7*U,101,M.gold)} end
   return {ring(c.body.x,1.3*U,y,115,M.gold)}
  end
  if key=='WT08' then
   if i==1 then return {ring(c.mark,1.875*U,y,96,M.violet)} end
   return {ring(pos(spec,c.mark-1.9*U),.62*U,y,88,M.violet),
    ring(pos(spec,c.mark+1.9*U),.62*U,y,88,M.violet),
    ring(d==1 and 3*U or 7.9*U,.88*U,spec.board.top,67,M.violet)}
  end
  if key=='WT10' then
   if i==3 then return {ring(c.body.x,1.42*U,y,112,M.gold)} end
   return {side(spec,x,d,(i==1 and 2.2 or 2.4)*U,109,M.gold)}
  end
  if key=='WT11' then return {ring(c.mark,1.15*U,y,117,M.gold)} end
  if key=='WT12' then
   if i==1 then return {side(spec,x,d,2.8*U,114,M.violet)} end
   return {ring(c.mark,.88*U,y,123,M.water)}
  end
  if key=='WT13' then
   if i==1 then return {ring(x,U,y,113,M.water)} end
   return {ring(pos(spec,x-2*U),.75*U,y,113,M.water),ring(pos(spec,x+2*U),.75*U,y,113,M.water)}
  end
  if key=='WT14' then return {side(spec,x,d,3.7*U,94,M.fire)} end
  if key=='WT15' then return {ring(i==1 and x or c.mark,(i==1 and .72 or 1.35)*U,y,109,M.fire)} end
  return {}
 end
 local function shoot(c,spec,i,def)
  local x,dir=c.shotX or c.x,c.shotDir or c.dir
  local y=spec.floorY-(i%2==1 and 31 or 88)
  c.shots[#c.shots+1]={x=x,y=y,dx=dir*(c.key=='WT06' and 4 or 5)*spec.board.unit/60,
   untilTick=c.t+def.ttl_ticks,seen={},color=c.key=='WT06' and M.fire or M.gold}
 end
 function M.step(s,w,spec,c)
  local m,t=c.move,c.t
  for i,at in ipairs(m.locks) do if t==at then M.lock(s,w,spec,c,i) end end
  if c.key=='WT14' and t==48 then c.whirl=c.mark end
  for i,win in ipairs(m.windows) do
   if t>=win[1] and t<win[2] then
    if t==win[1] then
     if c.key=='WT01' then c.body.x=c.points[i]
     elseif c.key=='WT07' and i==1 then c.body.x=pos(spec,c.x+c.dir*.7*spec.board.unit)
     elseif c.key=='WT10' and i==2 then c.body.x=pos(spec,c.x+c.dir*spec.board.unit)
     elseif c.key=='WT11' or c.key=='WT15' and i==2 then c.body.x=c.mark end
    end
    c.seen[i]=c.seen[i] or {}
    M.damage(s,w,spec,c,M.shapes(w,spec,c,i),c.seen[i],spec.damage.normal)
    w.phase='active'
   end
  end
  for _,def in ipairs(m.shots) do
   for i,at in ipairs(def.spawn_ticks) do if t==at then shoot(c,spec,i,def) end end
  end
  for i=#c.shots,1,-1 do
   local p=c.shots[i]
   if t>=p.untilTick or p.x<spec.board.left or p.x>spec.board.right then table.remove(c.shots,i)
   else
    local z=ring(p.x,21,p.y+58,34,p.color)
    M.damage(s,w,spec,c,{z},p.seen,spec.damage.projectile)
    p.x=p.x+p.dx
   end
  end
 end
 function M.warnings(w,spec,c)
  local result={}
  if not c then return result end
  for i,win in ipairs(c.move.windows) do
   if c.t>=math.max(0,win[1]-74) and c.t<win[2] then
    for _,z in ipairs(M.shapes(w,spec,c,i)) do
     z.at=win[1];result[#result+1]=z
    end
   end
  end
  return result
 end
 return M
end
