return function(C)
 local M={gold='#f4d198',water='#a2edff',ice='#c8ebff',violet='#ccb7ff',moon='#f9b2ba'}
 function M.clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 function M.x(spec,u) return spec.board.left+spec.board.unit*u end
 function M.point(spec,x)
  return M.clamp(x,spec.board.left+44,spec.board.right-44)
 end
 function M.band(x1,x2,y,h,color)
  return {lo=math.min(x1,x2),hi=math.max(x1,x2),y=y,h=h,color=color}
 end
 function M.ring(x,r,y,h,color) return M.band(x-r,x+r,y,h,color) end
 function M.inside(a,z)
  return a.hp>0 and a.x>=z.lo and a.x<=z.hi and a.y>=z.y-z.h and a.y<=z.y+5
 end
 function M.ward(spec,i)
  local x=M.x(spec,spec.cover.pointsU[i])
  local r=spec.cover.wardHalfWidthU*spec.board.unit
  local offset=(i==1 and -1 or 1)*spec.cover.offsetU*spec.board.unit
  return M.ring(x+offset,r,spec.floorY,spec.cover.wardHeightU*spec.board.unit,M.water)
 end
 function M.protects(a,z)
  return a.x-19>=z.lo and a.x+19<=z.hi and a.y<=z.y+1 and a.y-78>=z.y-z.h
 end
 function M.coverAt(spec,a)
  for i in ipairs(spec.cover.pointsU) do if M.protects(a,M.ward(spec,i)) then return i end end
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
 function M.hurt(s,w,spec,key,a,n,source)
  local party=s.actorOwners and s.actorOwners[a] or s
  local damage=C.damageActor(party,a,n,source or w.primary,true,true)
  if damage>0 then C.combatEvent(party,'false-moon:'..key..':hit',a.id,w.primary.id,damage) end
 end
 function M.lock(s,w,spec,c,i)
  local a=M.target(s,c.origin)
  if not a then return end
  c.mark=M.point(spec,a.x)
  c.dir=a.x>=c.origin and 1 or -1
  if c.key=='WM01' then
   for _,x in ipairs({M.point(spec,a.x-c.dir*205),M.point(spec,a.x+c.dir*205)}) do
    local free=true
    for _,owner in ipairs(s.actors) do if owner.hp>0 and math.abs(owner.x-x)<1.2*spec.board.unit then free=false end end
    if free then c.arrival=x;break end
   end
  elseif c.key=='WM07' then
   c.entry=c.mark
  end
 end
 function M.shapes(w,spec,c,i)
  local U,y,x,d=spec.board.unit,spec.floorY,c.origin,c.dir
  local function rays(length,color,base)
   local boxes={}
   for j=0,2 do
    local finish=M.point(spec,x+d*(length-.18*j)*U)
    boxes[#boxes+1]=M.band(M.point(spec,x+d*base*U),finish,y-j*32,32,color)
   end
   return boxes
  end
  local key=c.key
  if key=='WM02' then return rays(4,M.water,1) end
  if key=='WM03' then
   if i==1 then return {M.band(M.point(spec,x+d*25),M.point(spec,x+d*3.9*U),y,.50*U,M.violet)} end
   return {M.ring(M.point(spec,c.mark+(i==2 and -95 or 95)),.35*U,y,1.55*U,M.violet)}
  end
  if key=='WM04' then
   if i==2 then return rays(2.5,M.violet,.26) end
   local length=i==1 and 1.8 or i==3 and 2 or 3
   local color=i==1 and M.gold or i==3 and M.ice or M.water
   return {M.band(M.point(spec,x+d*20),M.point(spec,x+d*length*U),y,1.42*U,color)}
  end
  if key=='WM05' then
   return {M.ring(M.point(spec,c.mark+(i-3)*121),.325*U,y,2*U,M.gold)}
  end
  if key=='WM06' then
   local radius=i==4 and 2*U or .45*U
   local hitX=i==4 and c.mark or M.point(spec,c.mark+(i-2)*147)
   return {M.ring(hitX,radius,y,1.62*U,M.water)}
  end
  if key=='WM07' then
   local result={}
   if i<4 then return {M.ring(M.point(spec,(c.entry or c.mark)+(i-2)*127),.55*U,y,1.32*U,M.ice)} end
   for j=-1,1 do result[#result+1]=M.ring(M.point(spec,c.mark+j*154),.48*U,y,1.37*U,M.ice) end
   return result
  end
  if key=='WM08' then
   if i==2 then return {M.band(20,940,y,365,M.ice)} end
   local r={}
   for j,u in ipairs(spec.cover.pointsU) do
    r[j]=M.ring(M.x(spec,u),spec.cover.pillarImpactU*U,y,1.8*U,M.gold)
   end
   return r
  end
  return {}
 end
 function M.tick(s,w,spec,c)
  for i,t in ipairs(c.move.locks) do if c.t==t then M.lock(s,w,spec,c,i) end end
  if c.key=='WM01' and c.t==72 and c.arrival then w.primary.x=c.arrival end
  for i,win in ipairs(c.move.windows) do
   if c.t>=win[1] and c.t<win[2] then
    local zones=M.shapes(w,spec,c,i)
    c.seen[i]=c.seen[i] or {};w.phase='active'
    for _,a in ipairs(s.actors) do
     if not c.seen[i][a] then
      for _,z in ipairs(zones) do
       if M.inside(a,z) then
        c.seen[i][a]=true
        if c.key=='WM08' and i==2 and M.coverAt(spec,a) then
         local party=s.actorOwners and s.actorOwners[a] or s
         C.combatEvent(party,'false-moon:WM08:ward',a.id,w.primary.id,M.coverAt(spec,a))
        else M.hurt(s,w,spec,c.key,a,c.key=='WM08' and i==2 and spec.damage.shock or spec.damage.base) end
        break
       end
      end
     end
    end
   end
  end
 end
 function M.warnings(w,spec,c)
  local result={}
  if not c then return result end
  for i,win in ipairs(c.move.windows) do
   local lead=math.max(0,win[1]-75)
   if c.key=='WM08' and i==1 or c.key=='WM03' and i>1 then lead=60 end
   if c.t>=lead and c.t<win[2] then
    for _,b in ipairs(M.shapes(w,spec,c,i)) do b.at=win[1];result[#result+1]=b end
   end
  end
  return result
 end
 return M
end
