return function(C,G)
 local M={warn='#ffc97d',fire='#ff863f',gold='#ffca63',white='#fff0ad',ash='#7f382a'}
 local function face(x,b)
  if math.abs(x-b.x)<10 then return b.dir end
  return x>b.x and 1 or -1
 end
 local function localShape(spec,p,x,dir)
  return G.shape(spec,p,x,dir)
 end
 local function horizon(spec,x)
  return G.clamp(spec,x,1.2*spec.arena.unit)
 end
 function M.aim(s,run,spec,c)
  local b,target=run.boss,G.trackTarget(s,c)
  local d,U=c.data,spec.arena.unit
  c.origin,c.dir=b.x,face(target,b)
  if d.reach then
   c.landing=horizon(spec,b.x+c.dir*math.min(d.reach*U,math.abs(target-b.x)))
  end
  c.areas={};c.roots={}
  local x=c.origin
  for i,p in ipairs(d.shapes) do
   if d.root then x=horizon(spec,x+c.dir*d.root[i]*U) end
   c.roots[i]=x
   c.areas[i]=localShape(spec,p,c.landing or x,c.dir)
  end
  if c.key=='XB08' then
   c.areas[2]=localShape(spec,d.shapes[2],spec.arena.left,1)
   c.areas[3]=localShape(spec,d.shapes[3],spec.arena.left,1)
  end
  b.dir=c.dir
 end
 function M.begin(s,run,spec,key,cast)
  local d=spec.moves[key]
  local target=run.target or s.actors[s.active]
  local child={key=key,data=d,owner=target.id,targetActor=target,targetMember=run.targetMember,target=target.x,t=0,new={},shots={},sparks={},
   parent=cast.serial,offset=cast.t,damage=math.floor(d.damage*run.rules.attackScale+.5)}
  if key=='XB08' then child.finaleDamage={} end
  M.aim(s,run,spec,child)
  return child
 end
 local function log(s,b,c,key,actor,value,index)
  C.combatEvent(s,'stygian:xbalanque:'..c.key..':'..key,actor or 0,b.id,value or 0)
  local e=s.events[#s.events]
  e.tick=c.offset+c.t;e.childTick=c.t;e.cast=c.parent;e.group=index
 end
 local function hit(s,run,c,a,index)
  local n=C.damageActor(s,a,c.damage,run.boss,true,true)
  if c.finaleDamage then
   local hits=c.finaleDamage[index] or {};c.finaleDamage[index]=hits
   hits[a]=n
  end
  log(s,run.boss,c,'contact',a.id,n,index)
  if n>0 then c.sparks[#c.sparks+1]={x=a.x,y=a.y-32,t=c.t} end
 end
 local function sampleArea(s,run,c,i)
  local seen=c.new[i] or {}
  c.new[i]=seen
  G.eachContact(s,run,seen,function(a) return G.bodyContact(c.areas[i],a) end,
   function(party,actor) hit(party,run,c,actor,i) end)
 end
 local function fireball(s,run,spec,c,index)
  local p=c.data.projectile
  local U=spec.arena.unit
  local shot={x=c.origin+c.dir*p.start*U,y=spec.arena.floor-p.height*U,dir=c.dir,
   speed=p.speed*U/60,radius=p.radius*U,expires=c.t+p.ttl,index=index,seen={}}
  c.shots[#c.shots+1]=shot
  log(s,run.boss,c,'launch',nil,index,index)
 end
 local function fly(s,run,spec,c)
  for i=#c.shots,1,-1 do
   local p=c.shots[i]
   local nx=p.x+p.dir*p.speed
   if c.t>=p.expires or nx<spec.arena.left-p.radius or nx>spec.arena.right+p.radius then
    table.remove(c.shots,i)
   else
    G.eachContact(s,run,p.seen,function(a) return G.boltContact(p.x,p.y,nx,p.y,p.radius,a) end,
     function(party,actor) hit(party,run,c,actor,p.index) end)
    p.x=nx
   end
  end
 end
 function M.tick(s,run,spec,c)
  local b,d=run.boss,c.data
  if c.t<=d.locks[1] then M.aim(s,run,spec,c) end
  if d.finalAim and c.t>=d.finalAim and c.t<=d.locks[2] then
   c.dir=face(G.trackTarget(s,c),b);b.dir=c.dir
   c.areas[4]=localShape(spec,d.shapes[4],b.x,c.dir)
  end
  if c.t==d.locks[1] or c.t==d.locks[2] then log(s,b,c,'lock',c.owner,c.dir) end
  local travel=d.dash or d.jump
  if travel and c.t>=travel[1] and c.t<=travel[2] then
   local elapsed,span=c.t-travel[1],travel[2]-travel[1]
   local u=d.dash and G.dashProgress(elapsed,span) or elapsed/span
   b.x=c.origin+(c.landing-c.origin)*u
   b.y=spec.arena.floor-(d.jump and 4*d.height*spec.arena.unit*u*(1-u) or 0)
   b.hitTop,b.hitBottom=b.y-80,b.y
  end
  for i,w in ipairs(d.windows) do
   if c.t==w[1] then
    log(s,b,c,'window',nil,i,i)
    if d.projectile then fireball(s,run,spec,c,i)
    elseif d.root then b.x=c.roots[i] end
   end
   if c.t>=w[1] and c.t<w[2] and c.areas[i] then sampleArea(s,run,c,i) end
  end
  if #c.shots>0 then fly(s,run,spec,c) end
 end
 function M.cues(spec,c)
  local d=c.data
  local cues={}
  if d.dash and c.t<d.dash[2] then cues.road={from=c.origin,to=c.landing} end
  if d.jump and c.t<d.jump[2] then cues.land=c.landing end
  for i,g in ipairs(c.areas) do
   local w=d.windows[i]
   if c.t>=(d.leads and d.leads[i] or 0) and c.t<w[2] then
    cues[#cues+1]={area=g,index=i,active=c.t>=w[1],high=d.raiseTell and i==3 and c.t>=d.raiseTell}
   end
  end
  if d.projectile and c.t<d.windows[#d.windows][1] then
   local p,U=d.projectile,spec.arena.unit
   local x=c.origin+c.dir*p.start*U
   local last=G.clamp(spec,x+c.dir*p.speed*p.ttl/60*U)
   local y=spec.arena.floor-p.height*U
   cues[#cues+1]={area=G.groundBox(spec,math.min(x,last),math.max(x,last),y-p.radius*U,y+p.radius*U),index=1}
  end
  return cues
 end
 function M.danger(spec,c,a)
  for _,z in ipairs(M.cues(spec,c)) do if G.bodyContact(z.area,a) then return z.area end end
 end
 function M.window(c)
  for i,w in ipairs(c.data.windows) do
   if c.t>=w[1] and c.t<w[2] then return i,w end
  end
 end
 return M
end
