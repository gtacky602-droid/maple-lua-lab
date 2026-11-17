return function(C)
 local papilla={}
 local U=88
 local rootHeight=172
 local rootBottom=.3
 local lilac,bright,root='#bd96ff','#f4deff','#6245a8'
 local function clamp(n,lo,hi) return math.max(lo,math.min(hi,n)) end

 local function shape(b,y,form,pose,height,bottom)
  b.y=y
  b.form,b.pose,b.drawHeight=form,pose,height
  b.hitTop=y-height
  b.hitBottom=y-bottom*U
 end
 function papilla.spawn(b,s) shape(b,s.floorY,'root','idle',rootHeight,rootBottom) end
 papilla.cancel=papilla.spawn
 function papilla.onDefeat(_,b,s) papilla.spawn(b,s) end

 function papilla.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end

 local function lock(s,m,c,a)
  if m.air then
   local dx=clamp((a and a.x or c.origin)-c.origin,-m.distance*U,m.distance*U)
   c.dest=clamp(c.origin+dx,s.arenaMin+63,s.arenaMax-63)
   local radius=m.width*U/2
   c.left,c.right=c.dest-radius,c.dest+radius
  else
   local x0,x1=c.origin+c.dir*m.near*U,c.origin+c.dir*m.far*U
   c.left,c.right=math.min(x0,x1),math.max(x0,x1)
  end
 end

 local function silhouette(b,s,m,c,active)
  local t=c.tick
  local pose=m.kind..'-ready'
  local y=s.floorY
  local form=m.kind
  if m.air then
   local first,last=m.air[1],m.air[2]
   if t>=first and t<last then
    local u=(t-first)/(last-first)
    b.x=c.origin+(c.dest-c.origin)*u
    y=y-4*m.lift*U*u*(1-u)
    form='airborne'
   elseif t>=last then
    b.x=c.dest
    pose=m.kind..'-strike'
    form='landed'
   end
  elseif active or t>=m.recover then
   pose=m.kind..'-strike'
  end
  if t>=m.recover then form='recover' end
  local progress=t/m.morph
  if t>=m.returnMorph then
   progress=(m.total-t)/(m.total-m.returnMorph)
   form='returning'
  elseif t<m.morph then form='morphing' end
  local height=C.papillaFieldArt[pose].profiles.legacy.height
  if progress<.5 then
   pose='idle'
   height=rootHeight*(1-.72*progress)
  elseif progress<1 then
   height=height*(.64+.36*(progress-.5)*2)
  end
  local bottom=rootBottom+(m.bottom-rootBottom)*math.min(progress,1)
  shape(b,y,form,pose,height,bottom)
 end

 function papilla.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then
   c.dir=a.x<c.origin and -1 or 1
   b.facing=c.dir
  end
  if t==m.lock then lock(s,m,c,a) end
  local active
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then active=i;break end
  end
  silhouette(b,s,m,c,active)
  if active then
   C.hitFieldArea(state,c.source,c.seen[active],c.left,c.right,s.floorY-m.height*U,m.damage,
                  s.floorY-(m.low or 0)*U)
  end
  if t<m.total then return false end
  papilla.spawn(b,s)
  return true
 end

 function papilla.label(b,c)
  if b.form=='returning' then return '暗い花に戻る・反撃' end
  if b.form=='recover' then return '動きが止まる・反撃' end
  if b.form=='airborne' then return '菌獣影・着地点から離れる' end
  if b.form=='morphing' then return '根が動く・'..c.move.title end
  if c and c.move.kind=='wing' and c.tick>=c.move.active[1][2] and c.tick<c.move.active[2][2] then
   return '機竜影・反対の翼が来る'
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function warning(f,c,cam,y)
  local m,t=c.move,c.tick
  for i,w in ipairs(m.active) do
   if t<w[2] then
    local left,right=c.left-cam,c.right-cam
    local top,bottom=y-m.height*U,y-(m.low or 0)*U
    if t>=w[1] then
     rect(f,left,top,right-left,bottom-top,lilac..'66')
     rect(f,left,top,right-left,3,bright)
    end
    for x=left,right-5,12 do rect(f,x,bottom-3,6,2,lilac) end
    if #m.active>1 then
     f.draws[#f.draws+1]={kind='text',x=(left+right)/2,y=top-7,text=i..' / 2',size=13,color=bright}
    end
    break
   end
  end
 end

 function papilla.draw(f,state,b,s,c,mode,profile)
  local x=b.x-state.camera
  if not c then
   C.drawPapillaFieldArt(f,x,b.y,'idle',rootHeight,mode,profile,b.facing<0)
   return
  end
  if c.left then warning(f,c,state.camera,s.floorY) end
  if b.form=='morphing' or b.form=='returning' then
   local spread=17+math.floor(math.sin(c.tick*.24)*7)
   for i=-2,2 do
    local length=9-math.abs(i)*2
    rect(f,x+i*spread-2,b.y-length,4,length,root)
    rect(f,x+i*spread-1,b.y-length-3,2,3,lilac)
   end
  end
  C.drawPapillaFieldArt(f,x,b.y,b.pose,b.drawHeight,mode,profile,(b.facing<0)~=(b.pose=='wing-ready'))
 end
 return papilla
end
