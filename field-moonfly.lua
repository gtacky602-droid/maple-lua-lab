return function(C)
 local moonfly={}
 local U=88
 local lime,fire,pale='#c9db48','#ffad57','#eef6c4'
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
  C.clearEncounterCocoons(state)
  moonfly.spawn(b,s)
 end
 function moonfly.onDefeat(state,b,s) moonfly.cancel(b,s,state) end
 function moonfly.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{},{}},contacts=setmetatable({},{__mode='k'}),
   source={id=b.id,owner=b,y=s.floorY,damageElement='dendro'}}
 end
 function moonfly.shareCast(c,actors)
  C.shareFieldHits(c.seen,actors)
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
   if t==m.bind then C.bindRadiantCocoon(state,s,c.source,c.left,c.right) end
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
  local mark=C.radiantCocoonEffect(state,state.active)
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
 return moonfly
end
