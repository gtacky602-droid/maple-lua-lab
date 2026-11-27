return function(C,G,M)
 local ink,amber,white,wind,fire='#3c435b','#885922','#fff7df','#78e7d4','#ff9c66'
 local labels={'双剣の手ほどき','風と炎の二刀','終盤の連係'}
 local hints={FK01='五連撃。背後か剣の届かない位置へ',FK02='跳び斬り。固定された着地点の前から離れる',
   FK03='二刀を突き立てる。着地点の印の外へ',FK04='交差する切り上げ。背後か間合いの外へ',
   FK06='二刀を構え直している'}
 local function painter(f,camera)
  return function(x,y,w,h,color,alpha,soft,angle)
   if w>0 and h>0 then
    f.draws[#f.draws+1]={kind='rect',x=x-camera,y=y,w=w,h=h,color=color,opacity=alpha,translucentFill=soft,rotation=angle}
   end
  end
 end
 local function line(rect,x0,y0,x1,y1,color,width,alpha)
  local dx,dy=x1-x0,y1-y0
  rect(x0,y0,math.sqrt(dx*dx+dy*dy),width,color,alpha,false,math.atan(dy,dx))
 end
 local function oval(rect,x,y,rx,ry,color,alpha)
  for i=0,23 do
   local a=math.pi*i/12
   rect(x+math.cos(a)*rx,y+math.sin(a)*ry,6,3,color,alpha)
  end
 end
 local function attackWindow(c)
  if not c then return end
  for i,w in ipairs(c.card.active_windows) do
   if c.t>=w[1] and c.t<w[2] then return i end
  end
 end
 local function stance(c,i)
  if not c then return 0,0,1 end
  local k,t=c.key,c.t
  if t>=c.card.recovery[1] then return -.62,-.65,.98 end
  if k=='FK03' then
   if t<66 then return -.25,.16,.94 end
   return -1.48,-1.56,t<102 and 1 or .92
  elseif k=='FK04' then
   if t<54 then return .68,.41,.96 end
   return i==1 and 1.16 or .94,i==2 and 1.32 or -.62,1
  elseif k=='FK05' then
   if t<105 then return -.48,-.60,.93 end
   if t<120 then return -.04,-.26,.98 end
   if t<171 then return .64,1.00,1 end
   return 1.03,.83,1
  elseif k=='FK02' then return t<90 and .37 or -.28,.81,t<66 and .94 or 1
  elseif k=='FK06' then return -.65,.34,1
  else
   local angles={-.05,.12,.98,-.42,.10}
   return angles[i or 4],angles[i and math.max(1,i-1) or 2],1
  end
 end
 local function blades(f,s,r,c,mode,profile)
  local b=r.boss
  local art=C.stygianFarkaArt
  local side=b.dir>0 and 'right' or 'left'
  local body,pose=art[side],art.hands[side]
  local i=attackWindow(c)
  local front,back,size=stance(c,i)
  local h=152*size
  local powered=r.stage>1 or c and (c.key=='FK02' and c.t>=96 or c.key=='FK06' and r.infused)
  local frontDirection,backDirection=b.dir,b.dir
  if not c or c.t>=c.card.recovery[1] or c.key=='FK06' then
   frontDirection=-b.dir
   if not c then front,back=-.63,-.60 end
  end
  local rect=painter(f,s.camera)
  local function drawSword(hand,dir,angle,color,w)
   local x,y=b.x+pose[hand][1]*size,b.y+pose[hand][2]*size
   C.drawSocketArt(f,art.sword,x-s.camera,y,w,dir,angle,mode,profile)
   if powered or i then
    local dx,dy=dir*math.cos(angle),-math.sin(angle)
    line(rect,x+dx*22,y+dy*22,x+dx*(w*.81),y+dy*(w*.81),powered and color or white,i and 4 or 2,.92)
   end
  end
  if c and c.key=='FK05' and c.t>=84 and c.t<105 then
   local start=#f.draws+1
   C.drawFieldDisplayArt(f,body,b.x-b.dir*22-s.camera,b.y,145,mode,profile,false,nil,nil,.26)
   for j=start,#f.draws do f.draws[j].motionOnly=true end
  end
  drawSword('back',backDirection,back,wind,90)
  C.drawFieldDisplayArt(f,body,b.x-s.camera,b.y,h,mode,profile,false)
  drawSword('front',frontDirection,front,fire,94)
 end
 local function prompt(s,r,parent,c)
  if r.status=='clear' then return '鍛錬を終えた' end
  if r.phase=='enter' then return '剣が動く前に、間合いを見ておけ' end
  if r.phase=='phase' then return labels[r.stage] end
  if not c then return '次の構えを見る' end
  if parent.t>=parent.card.recovery[1] then
   return string.format('反撃の隙 %.1f秒',(parent.card.total_ticks-parent.t)/60)
  end
  if c.t>=c.card.recovery[1] then
   return string.format('連係の途中。反撃の隙 %.1f秒',(r.spec.timing.chainAt-parent.t)/60)
  end
  if c.key=='FK05' then
   if c.t<111 then return '一撃目は低い。跳んでかわす' end
   local a=s.actors[s.active]
   if a.ground and a.y<r.spec.arena.floor then return '二撃目は高い。下＋Spaceで床へ降りる' end
   return '二撃目は高い。地面に着地する'
  end
  return hints[c.key]
 end
 local function cues(rect,r,c,v)
  v.areas={}
  for _,z in ipairs(M.cues(r,c)) do
   local g=z.area
   local color=z.high and ink or amber
   G.drawShape(rect,g,color,false,c.t>=c.lock)
   if z.active then
    if g.kind=='rect' then
     rect(g.left+3,g.top+3,g.right-g.left-6,g.bottom-g.top-6,z.high and wind or fire,.31,true)
     rect(g.left+3,g.bottom-6,g.right-g.left-6,3,white,.94)
    else
     local x0,x1=g.x+g.direction*g.u0*g.unit,g.x+g.direction*g.u1*g.unit
     local y0,y1=g.y-g.v0*g.unit,g.y-g.v1*g.unit
     line(rect,x0,y0,x1,y1,z.index==1 and fire or wind,7,.95)
    end
   end
   v.areas[#v.areas+1]={left=g.left,right=g.right,top=g.top,bottom=g.bottom,active=z.active,index=z.index}
  end
  if c.destination and c.t<c.card.active_windows[1][2] then
   v.destination,v.floor=c.destination,c.floor
   if c.key=='FK03' then
    local width=1.15*r.spec.arena.unit
    oval(rect,c.destination,c.floor-11,width,10,amber,.9)
    if c.t>=30 then oval(rect,c.destination,c.floor-17,width-7,8,amber,.91) end
    rect(c.destination-8,c.floor-14,16,3,white,.94)
    if c.t>=102 then
     for i=1,2 do oval(rect,c.destination,c.floor-18,width-10*i,9,i==1 and wind or fire,.94) end
    end
   else
    local x0,x1=math.min(c.x,c.destination),math.max(c.x,c.destination)
    rect(x0,c.floor-10,x1-x0,4,amber,.86)
    rect(c.destination-10,c.floor-7,20,3,white,.87)
   end
  end
  if c.key=='FK01' then
   for i,w in ipairs(c.card.active_windows) do
    rect(r.boss.x-34+i*10,r.boss.y-169,6,4,c.t>=w[1] and ink or white,.93)
   end
  end
 end
 return function(f,s,r,spec,mode,profile)
  local v,b,parent=f.endgameRun,r.boss,r.cast
  local c=parent and parent.child
  local recover=c and c.t>=c.card.recovery[1]
  v.stage,v.stageName=r.stage,labels[r.stage]
  v.phase=r.status=='clear' and 'clear' or recover and 'recover' or r.phase
  v.tick,v.card=parent and parent.t or r.age-r.phaseAt,parent and parent.key
  v.hint=prompt(s,r,parent,c)
  if parent and parent.second then
   v.variant,v.child,v.childTick=parent.variant,c.key,c.t
   v.chain={spec.cards.FK03.title,spec.cards[parent.second].title}
   local hits=parent.chainHits[s.actors[s.active]]
   v.chainResult={}
   for i,window in ipairs(parent.card.active_windows) do
    local damage=hits and hits[i]
    local resolved=parent.t>=window[2]
    v.chainResult[i]={contact=damage~=nil,damage=damage or resolved and 0 or nil}
   end
  end
  if r.phase=='enter' then v.dialogue='まずは一歩、剣の外へ出てみろ。' end
  if r.phase=='phase' then v.dialogue=r.stage==2 and '次は二本の刃を見ておけ。' or '低い一撃のあとが肝心だ。' end
  if r.status=='clear' then v.dialogue='いい間合いだった。風の読み方を覚えたな。' end
  f.boss={name=spec.name,hp=b.hp,maxhp=b.maxhp,x=b.x,y=b.y,dir=b.dir,phase=v.phase,
   label=parent and parent.title or v.stageName}
  if r.status=='failed' then return end
  local back={draws={}}
  if mode=='rect' and s.packRectArt then
   back.rectIndex,back.rectBatches={},f.rectBatches or {}
   f.rectBatches=back.rectBatches
  end
  blades(back,s,r,c,mode,profile)
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws)
  f.draws=back.draws
  if c then cues(painter(f,s.camera),r,c,v) end
  f.commands=#f.draws
 end
end
