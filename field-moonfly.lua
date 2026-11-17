return function(C)
 local moonfly={}
 local U=88
 local lime,fire,pale='#c9db48','#ffad57','#eef6c4'
 local damageFactor,healingFactor,step,action,frame=C.damageFactor,C.healingFactor,C.step,C.action,C.frame
 local function clear(state) state.moonflyEffects=nil;state.moonflyEffectSpec=nil end
 local function effect(state,id)
  return state.moonflyEffects and state.moonflyEffects[id]
 end
 function C.damageFactor(state,cast,e,element)
  local factor=damageFactor and damageFactor(state,cast,e,element) or 1
  local mark=effect(state,cast.id)
  if not mark then return factor end
  local spec=state.moonflyEffectSpec
  if mark.bound then return factor*spec.damageFactor end
  return state.t<mark.untilTime and factor*spec.escapeFactor or factor
 end
 function C.healingFactor(state,a)
  local factor=healingFactor and healingFactor(state,a) or 1
  local mark=effect(state,a.id)
  return mark and mark.bound and factor*state.moonflyEffectSpec.healFactor or factor
 end
 local function updateEffects(state)
  if not state.moonflyEffects then return end
  local spec=state.moonflyEffectSpec
  if not state.story or state.story.node~=spec.node then clear(state);return end
  for id,mark in pairs(state.moonflyEffects) do
   local a=state.actors[id]
   if a.hp<=0 or (not mark.bound and state.t>=mark.untilTime) then
    state.moonflyEffects[id]=nil
   elseif mark.bound and a.hp>=a.maxhp then
    mark.bound=false
    mark.untilTime=state.t+spec.escapeTicks/60
   end
  end
  if not next(state.moonflyEffects) then clear(state) end
 end
 function C.step(state,dt,input)
  step(state,dt,input)
  if not state.paused then updateEffects(state) end
 end
 function C.action(state,key)
  action(state,key)
  updateEffects(state)
 end
 local function place(b,s,form,pose)
  b.form,b.pose=form,pose
  local hover=(pose=='green' or pose=='flame' or pose=='cocoon' or pose=='idle') and s.hover or 0
  b.y=s.floorY-hover
  b.hitTop=b.y-C.moonflyFieldArt[pose].profiles.legacy.height
  b.hitBottom=b.y
 end
 function moonfly.spawn(b,s)
  b.element='dendro'
  place(b,s,'idle','idle')
 end
 function moonfly.cancel(b,s,state)
  clear(state)
  moonfly.spawn(b,s)
 end
 function moonfly.onDefeat(state,b,s) moonfly.cancel(b,s,state) end
 function moonfly.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{}},contacts=setmetatable({},{__mode='k'}),
   source={id=b.id,owner=b,y=s.floorY,damageElement='dendro'}}
 end
 local function lock(c,s,a)
  local m=c.move
  if m.kind=='kick' then
   local near,far=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(near,far),math.max(near,far)
  elseif m.kind=='bolts' then
   local edge=(m.offsets[#m.offsets]+m.width/2)*U
   if c.origin+c.dir*edge<s.arenaMin or c.origin+c.dir*edge>s.arenaMax then c.dir=-c.dir end
   c.centers={}
   for i,offset in ipairs(m.offsets) do c.centers[i]=c.origin+c.dir*offset*U end
  else
   c.left,c.right=c.origin-m.radius*U,c.origin+m.radius*U
  end
 end
 local function bounds(c,i)
  if c.centers then
   local half=c.move.width*U/2
   return c.centers[i]-half,c.centers[i]+half
  end
  return c.left,c.right
 end
 local function bind(state,b,s,c)
  state.moonflyEffects=state.moonflyEffects or {}
  state.moonflyEffectSpec={node=s.node,damageFactor=s.cocoon.damageFactor,healFactor=s.cocoon.healFactor,
                          escapeFactor=s.cocoon.escapeFactor,escapeTicks=s.cocoon.escapeTicks}
  for _,a in ipairs(state.actors) do
   if a.hp>0 and a.x>=c.left and a.x<=c.right then
    C.damageActor(state,a,s.cocoon.damage,c.source,false,true)
    if a.hp>0 then state.moonflyEffects[a.id]={bound=true} end
   end
  end
  if not next(state.moonflyEffects) then clear(state) end
 end
 function moonfly.onHit(cast,b,_,slot,element)
  local c=slot.cast
  if not c or c.move.kind~='cocoon' or b.form~='winged' or cast.reaction or c.contacts[cast] then return end
  if element=='pyro' then b.element='pyro'
  elseif element=='hydro' or element=='cryo' then b.element='dendro'
  else return end
  c.contacts[cast]=true
 end
 function moonfly.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(c,s,a);b.facing=c.dir end
  local form,pose='attack','ready'
  if m.kind=='cocoon' then
   if t==m.bind then bind(state,b,s,c) end
   if t==m.flare then b.element='pyro' end
   if t>=m.bind then form,pose='winged',b.element=='pyro' and 'flame' or 'green' end
   if t>=m.charge then form,pose='charging','cocoon' end
  elseif m.kind=='bolts' then
   pose='green'
  end
  c.source.damageElement=b.element
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    if m.kind=='kick' then pose='kick' end
    local left,right=bounds(c,i)
    C.hitFieldArea(state,c.source,c.seen[i],left,right,s.floorY-m.height*U,m.damage)
   end
  end
  if t>=m.recover then form,pose='recover','down' end
  place(b,s,form,pose)
  if t<m.total then return false end
  moonfly.spawn(b,s)
  return true
 end
 function moonfly.label(b,c,_,state)
  local mark=effect(state,state.active)
  if mark and mark.bound then return '集光の繭・HPを満タンまで回復' end
  if mark and state.t<mark.untilTime then return '脱出・与えるダメージ強化' end
  if b.form=='winged' then return (b.element=='pyro' and '炎の羽' or '草の羽')..'・'..c.move.title end
  if b.form=='charging' then return '繭に集光・爆発範囲から退避' end
  if b.form=='recover' then return '羽がほどけた・反撃の好機' end
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y,color)
  if not c.left and not c.centers then return end
  for i,w in ipairs(c.move.active) do
   if c.tick<w[2] then
    local left,right=bounds(c,i)
    local l,r=left-cam,right-cam
    if c.tick>=w[1] then rect(f,l,y-c.move.height*U,r-l,c.move.height*U,color..'44') end
    for x=l+2,r-7,14 do rect(f,x,y-5,8,3,color) end
    if #c.move.active>1 then
     f.draws[#f.draws+1]={kind='text',x=(l+r)/2,y=y-c.move.height*U-7,
                         text=i..' / '..#c.move.active,size=13,color=pale}
    end
    break
   end
  end
 end
 function moonfly.draw(f,state,b,s,c,mode,profile)
  local color=b.element=='pyro' and fire or lime
  if c then warning(f,c,state.camera,s.floorY,color) end
  C.drawMoonflyFieldArt(f,b.x-state.camera,b.y,b.pose,mode,profile,b.facing<0)
 end
 function C.frame(state,mode,profile)
  local f=frame(state,mode,profile)
  if not state.moonflyEffects then return f end
  f.radiantCocoons={}
  for id,mark in pairs(state.moonflyEffects) do
   local a=state.actors[id]
   local x=a.x-state.camera
   local bound=mark.bound
   local color=bound and lime or '#a4eaff'
   rect(f,x-18,a.y-55,3,50,color)
   rect(f,x+15,a.y-55,3,50,color)
   f.draws[#f.draws+1]={kind='text',x=x,y=a.y-65,text=bound and '集光の繭' or '脱出',size=12,color=color}
   f.radiantCocoons[#f.radiantCocoons+1]={actor=id,bound=not not bound,
     remaining=mark.untilTime and math.max(0,mark.untilTime-state.t) or nil}
  end
  f.commands=#f.draws
  return f
 end
 return moonfly
end
