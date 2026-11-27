return function(C,G)
 local M={}
 local function rect(u0,u1,v0,v1)
  return {kind='rect',u0=u0,u1=u1,v0=v0,v1=v1}
 end
 local function capsule(u0,v0,u1,v1,radius)
  return {kind='capsule',u0=u0,v0=v0,u1=u1,v1=v1,radius=radius}
 end
 local shapes={
  FK01={rect(.1,1.45,.15,1.05),rect(.1,1.45,.15,1.05),rect(.1,1.45,.15,1.55),
        rect(.1,1.45,.15,1.05),rect(.1,1.75,.15,1.05)},
  FK02={rect(0,1.4,.05,1.3)},FK03={rect(-1.15,1.15,0,.60)},
  FK04={capsule(.15,.15,1.5,1.65,.18),capsule(.20,1.55,1.6,.20,.18)},
  FK05={rect(0,1.9,0,.65),rect(0,2.1,1.20,2)},
 }
 local function log(s,r,c,kind,i,actor,n)
  C.combatEvent(s,'stygian:farka:'..c.key..':'..kind,actor or 0,r.boss.id,n or i or 0)
  local e=s.events[#s.events]
  e.cast,e.tick,e.localTick,e.index=c.serial,c.offset+c.t,c.t,i
 end
 local function limit(r,x)
  return G.clamp(r.spec,x,32)
 end
 local function facing(a,x,previous)
  if math.abs(a.x-x)<3 then return previous end
  return a.x>x and 1 or -1
 end
 local function aim(s,r,c)
  local b,a=r.boss,r.target or s.actors[s.active]
  local p=r.spec.arena
  local u,m=p.unit,c.motion
  c.dir=facing(a,c.x,c.dir)
  b.dir=c.dir
  if not m then return end
  local dist=math.min(math.abs(a.x-c.x),m.reach*u)
  if c.key=='FK05' then
   dist=math.min(m.reach*u,math.max(0,math.abs(a.x-c.x)-.86*u))
  end
  c.destination,c.floor=limit(r,c.x+c.dir*dist),p.floor
  if c.key=='FK02' and a.ground and a.y<p.floor then
   for _,ledge in ipairs(s.platforms) do
    if a.y==ledge.y and c.destination>=ledge.x+12 and c.destination<=ledge.x+ledge.w-12 then
     c.floor=ledge.y
     break
    end
   end
  end
 end
 function M.begin(s,r,key,serial,offset)
  local b,d=r.boss,r.spec.cards[key]
  local c={key=key,card=d,t=0,serial=serial,offset=offset or 0,x=b.x,y=b.y,dir=b.dir,seen={},
   motion=r.spec.motion[key],lock=d.lock_ticks[1] or 18,
   damage=math.floor((r.spec.damage[key] or 0)*r.rules.damageScale+.5)}
  aim(s,r,c)
  if c.offset>0 then log(s,r,c,'child',nil,nil,c.offset) end
  return c
 end
 local function origin(r,c,i)
  local x,y=c.x,c.y
  local u=r.spec.arena.unit
  if c.key=='FK01' then x=limit(r,x+c.dir*.10*u*math.min(4,i))
  elseif c.key=='FK04' then x=limit(r,x+c.dir*.20*u)
  elseif c.motion then x,y=c.destination,c.floor end
  return x,y
 end
 function M.geometry(r,c,i)
  local x,y=origin(r,c,i)
  return G.shape(r.spec,shapes[c.key][i],x,c.dir,y)
 end
 local function move(r,c)
  local b,m=r.boss,c.motion
  if m and c.t>=m.from then
   local u=G.dashProgress(c.t-m.from,m.land-m.from)
   local lift=m.height and m.height*r.spec.arena.unit*4*u*(1-u) or 0
   b.x=c.x+(c.destination-c.x)*u
   b.y=c.y+(c.floor-c.y)*u-lift
  elseif c.key=='FK04' then
   local stop=origin(r,c,1)
   local u=math.max(0,math.min(1,(c.t-30)/24))
   b.x=c.x+(stop-c.x)*u
  end
  b.hitTop,b.hitBottom=b.y-139,b.y
 end
 local function sample(s,r,c,i)
  local area=M.geometry(r,c,i)
  local seen=c.seen[i]
  for _,party in ipairs(r.parties or {s}) do
   for _,a in ipairs(party.actors) do
    local key=r.parties and a or a.id
    if not seen[key] and G.bodyContact(area,a) then
     seen[key]=true
     local damage=C.damageActor(party,a,c.damage,r.boss,true,true)
     local chainHits=r.cast.chainHits
     if chainHits then
      local hits=chainHits[a] or {}
      hits[(c.offset>0 and 1 or 0)+i]=damage
      chainHits[a]=hits
     end
     log(party,r,c,'contact',i,a.id,damage)
    end
   end
  end
 end
 function M.tick(s,r,c)
  if c.t<=c.lock then aim(s,r,c) end
  if c.t==c.lock and #c.card.lock_ticks>0 then log(s,r,c,'lock',nil,nil,c.destination or c.dir) end
  move(r,c)
  for i,w in ipairs(c.card.active_windows) do
   if c.t==w[1] then
    c.seen[i]={}
    if c.key=='FK01' then r.boss.x=origin(r,c,i) end
    log(s,r,c,'window',i)
   end
   if c.t>=w[1] and c.t<w[2] then sample(s,r,c,i) end
  end
  if c.key=='FK02' and c.t==108 then
   r.infused=true
   log(s,r,c,'infuse')
  end
 end
 local function envelope(r,c)
  local p=r.spec.arena
  local a,b=M.geometry(r,c,1),M.geometry(r,c,5)
  return G.groundBox(r.spec,math.min(a.left,b.left),math.max(a.right,b.right),c.y-1.55*p.unit,c.y-.15*p.unit)
 end
 function M.cues(r,c)
  local result={}
  local combo=c.key=='FK01'
  if combo and c.t<138 then result[1]={area=envelope(r,c),preview=true,index=0} end
  for i,w in ipairs(c.card.active_windows) do
   local active=c.t>=w[1] and c.t<w[2]
   if (not combo and c.t<w[2]) or active then
    result[#result+1]={area=M.geometry(r,c,i),active=active,index=i,high=c.key=='FK05' and i==2}
   end
  end
  return result
 end
 return M
end
