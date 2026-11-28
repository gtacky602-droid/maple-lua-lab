return function(C)
 local spirit={packRectArt=true}
 local U=88
 local cyan,pale,ink='#60dbed','#dfe8ff','#25283b'
 local function place(b,s,form,pose)
  b.form,b.pose,b.y=form,pose,s.floorY-(form=='recover' and 0 or s.hover)
  b.hitTop,b.hitBottom=b.y-C.spiritspeakerFieldArt[pose].profiles.legacy.height,b.y
 end
 function spirit.spawn(b,s) place(b,s,'idle','idle') end
 spirit.cancel=spirit.spawn
 function spirit.onDefeat(_,b,s) spirit.spawn(b,s) end
 function spirit.begin(b,s,m)
  return {move=m,tick=0,origin=b.x,dir=b.facing,seen={{},{}},
   source={id=b.id,owner=b,y=s.floorY,damageElement=m.element}}
 end
 function spirit.shareCast(c,actors) C.shareFieldHits(c.seen,actors) end

 local function lock(s,c)
  local m=c.move
  local bands=m.bands
  local far=m.far or (bands and bands[#bands][2]) or (m.offsets[#m.offsets]+m.width/2)
  local edge=c.origin+c.dir*far*U
  if edge<s.arenaMin or edge>s.arenaMax then c.dir=-c.dir end
  local function lane(a,b)
   local first,last=c.origin+c.dir*a*U,c.origin+c.dir*b*U
   return {left=math.min(first,last),right=math.max(first,last)}
  end
  if m.kind=='sweep' then
   local band=lane(m.near,m.far)
   c.lanes={band,band}
  elseif bands then
   c.lanes={}
   for i,band in ipairs(bands) do c.lanes[i]=lane(band[1],band[2]) end
  else
   c.lanes={}
   for i,x in ipairs(m.offsets) do c.lanes[i]=lane(x-m.width/2,x+m.width/2) end
  end
 end

 function spirit.tick(state,b,s,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if t<=m.lock and a then c.dir=a.x<c.origin and -1 or 1;b.facing=c.dir end
  if t==m.lock then lock(s,c);b.facing=c.dir end
  local pose=m.kind=='sweep' and 'ready' or m.kind=='ice' and 'cast' or 'ritual'
  for i,w in ipairs(m.active) do
   if t>=w[1] and t<w[2] then
    local band=c.lanes[i]
    if m.kind=='sweep' then pose='sweep' end
    C.hitFieldArea(state,c.source,c.seen[i],band.left,band.right,s.floorY-m.height*U,m.damage)
   end
  end
  if t>=m.recover then
   c.lanes=nil
   place(b,s,'recover','down')
  else
   place(b,s,m.kind=='echoes' and 'ritual' or 'attack',pose)
  end
  if t<m.total then return false end
  spirit.spawn(b,s)
  return true
 end

 function spirit.frame(f,_,_,c)
  if not c then return end
  if c.tick>=c.move.recover then f.recoveryTicks=c.move.total-c.tick end
  if c.lanes and c.move.kind=='echoes' then
   f.echoLanes=c.lanes
   f.echoesVisible=c.tick>=c.move.deploy
  end
 end

 function spirit.label(b,c)
  if b.form=='recover' then return '筆を下ろした・反撃の好機' end
  if not c then return end
  local m=c.move
  for i,w in ipairs(m.active) do
   if c.tick<w[2] then
    if not c.lanes then return m.title end
    local hint=m.kind=='echoes' and '影が順に攻撃・狙うのは本体' or '番号の範囲から離れる'
    return m.title..'・'..i..'/2・'..hint
   end
  end
  return m.title..'・攻撃終了'
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function color(m,i)
  if m.kind=='echoes' and i==2 then return '#c3a4ff' end
  return cyan
 end
 local function lane(f,left,right,y,height,tint,active)
  if active then rect(f,left,y-height,right-left,height,tint..'44') end
  for x=left+2,right-7,14 do rect(f,x,y-5,8,3,tint) end
 end
 function spirit.draw(f,state,b,s,c,mode,profile)
  local cam,y=state.camera,s.floorY
  if c and c.lanes then
   local m,t=c.move,c.tick
   for i,w in ipairs(m.active) do
    local band=c.lanes[i]
    if t<w[2] then
     lane(f,band.left-cam,band.right-cam,y,m.height*U,color(m,i),t>=w[1])
    end
    if m.kind=='echoes' and t>=m.deploy then
     local x=(band.left+band.right)/2
     local releasing=t>=w[1] and t<w[2]
     local winding=t>=w[1]-18 and t<w[1]
     local pose=releasing and 'sweep' or winding and 'cast' or 'reflection'
     C.drawSpiritspeakerFieldArt(f,x-cam,b.y,pose,mode,profile,c.dir<0,
      releasing and .57 or winding and .44 or t<w[2] and .32 or .20)
     if winding then
      local art=C.spiritspeakerFieldArt.cast
      local height=art.profiles.legacy.height
      local width=height*art.box[3]/art.box[4]
      -- The raised brush tip occupies this point in the cast crop.
      local tipX=x-cam+c.dir*(.86-art.anchorX)*width
      rect(f,tipX-5,b.y-height*.67-2,10,4,color(m,i))
     end
    end
    if m.kind=='sweep' and t<w[2] then break end
   end
  end
  local x=b.x-cam
  C.drawSpiritspeakerFieldArt(f,x,b.y,b.pose,mode,profile,b.facing<0)
  if c then
   rect(f,x-36,b.hitTop-12,72,7,ink)
   rect(f,x-34,b.hitTop-10,68*b.hp/b.maxhp,3,cyan)
  end
 end

 function spirit.drawOverlay(f,state,s,c)
  if not c or not c.lanes then return end
  for i,w in ipairs(c.move.active) do
   if c.tick<w[2] then
    local band=c.lanes[i]
    local x,y=(band.left+band.right)/2-state.camera,s.floorY
    rect(f,x-10,y+6,20,19,ink)
    rect(f,x-10,y+6,20,2,color(c.move,i))
    f.draws[#f.draws+1]={kind='text',x=x,y=y+21,text=tostring(i),size=13,color=pale}
    if c.move.kind=='sweep' then return end
   end
  end
 end
 return spirit
end
