return function(C,G,M)
 local ink,crimson,pink,white,gold,safe='#432036','#d44862','#ff91a8','#fff3dd','#ffd4ad','#cef2cc'
 local stageNames={'死の気配','命の裁定','冥界の門','最後の審問'}
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
 local function outline(rect,x,y,w,h,color,alpha)
  for i=0,47 do
   local theta=math.pi*i/24
   rect(x+math.cos(theta)*w,y+math.sin(theta)*h,5,3,color,alpha)
  end
 end
 local function eye(rect,x,y,wide,open,alpha)
  rect(x-wide*.53,y-2,wide*1.06,4,ink,alpha,true)
  local h=math.max(3,open*wide*.34)
  outline(rect,x,y,wide,h,crimson,alpha*.82)
  if open>.14 then
   outline(rect,x,y,h*.48,h*1.26,pink,alpha)
   rect(x-2,y-h*.84,5,h*1.68,white,alpha*.65,true)
  end
 end
 local function shadow(rect,p,outlineColor)
  outline(rect,p.x,p.y,11,16,outlineColor,.92)
  rect(p.x-3,p.y-10,6,7,white)
  rect(p.x-5,p.y-2,10,9,gold)
  rect(p.x-3,p.y+8,6,4,white)
  rect(p.x-10,p.sole-3,20,2,outlineColor,.78)
 end
 local function gate(rect,x,w,y)
  rect(x-w,y-107,4,108,safe,.92)
  rect(x+w-3,y-107,4,108,safe,.92)
  rect(x-w,y-109,w*2,4,safe,.92)
  rect(x-w,y-3,w*2,4,safe,.84)
  rect(x-w+3,y-104,w*2-6,101,safe,.13,true)
  for i=0,5 do
   local dx=i*36+9
   local y0=y-9-i%2*7
   rect(x-w-dx,y0,9,3,crimson,.86)
   rect(x+w+dx-9,y0,9,3,crimson,.86)
  end
 end
 local function hint(r,c,p)
  if r.status=='clear' then return '最後の審問を終えた' end
  if r.status=='failed' or r.status=='spectate' then return '復活の灯を使い切った。観戦中' end
  if r.wipe then
   return r.wipe.wait>0 and string.format('復帰まで %.1f秒',r.wipe.wait/60) or '安全な足場を待っています'
  end
  if r.aid then return string.format('救助中 %.1f秒。相方のそばで止まる',(r.aid.finish-r.age)/60) end
  if r.protected>0 then return '復帰の保護中。攻撃や技で保護が終わる' end
  if r.phase=='enter' or r.phase=='phase' then return stageNames[r.stage] end
  if not c then return '間合いを取る' end
  if c.t>=c.recover then return string.format('反撃の隙 %.1f秒',(c.stop-c.t)/60) end
  if p.waived then return '復帰前の裁定から外れた' end
  if c.key=='RN05' then return c.t<84 and '確定死の指名。線が固定されるまで見る' or '確定死の線が固定された。横へ離れる' end
  if c.key=='RN06' then
   return c.t<660 and '命の返還。影を二つ拾う' or '返還の受付終了。まもなく裁定'
  end
  if c.key=='RN07' then return '左右の帳の間にある門へ移動する' end
  if c.key=='RN08' then
   if c.t<240 then return '終告 1　羽の射線から離れる' end
   if c.t<612 then return '終告 2　門を開くために影を二つ拾う' end
   return p.gateX and '終告 3　開いた門の中へ。外側に確定死の裁定' or '終告 3　門が開かなかった。裁定に備える'
  end
  if c.key=='RN12' then return p.arrived and '冥路の終端に到達した' or '冥路の通過印を左から順にたどり、右の門へ' end
  if c.key=='RN02' then return '床の波はジャンプで避け、落ちた命は影から回収する' end
  if c.key=='RN03' then return '離れた命を、床と上段の影に触れて取り戻す' end
  return c.data.title
 end
 local function battleCues(rect,r,c,v)
  local b=r.boss
  local floor=r.spec.arena.floor
  if c.key=='RN02' and c.t<66 then
   local endX=G.clamp(r.spec,b.x+c.dir*530)
   rect(math.min(b.x,endX),floor-9,math.abs(endX-b.x),4,crimson)
  end
  if c.key=='RN01' or c.key=='RN08' or c.key=='RN10' then
   local stops=c.key=='RN01' and {60,78,96} or c.key=='RN08' and {120,120,120} or {54}
   for i,stop in ipairs(stops) do
    if c.t<stop then
     local slope=c.key=='RN10' and 0 or (i-2)*15
     local x0,y0=c.startX+c.dir*30,c.startY-(c.key=='RN10' and 0 or 24)
     for dx=8,260,18 do
      local drawX=x0+c.dir*dx
      if drawX>4 and drawX<956 then rect(drawX,y0+math.tan(math.rad(slope))*dx,7,3,pink,.77) end
     end
    end
   end
   if c.key=='RN10' and c.t>=114 and c.t<150 then
    local edge=G.clamp(r.spec,c.startX+c.dir*4*r.spec.arena.unit,5)
    for x=math.min(edge,c.startX),math.max(edge,c.startX),14 do rect(x,c.startY,5,4,pink,.8) end
    line(rect,edge,c.startY,edge-c.dir*26,c.startY-9,gold,4,.9)
   end
  end
  for _,p in ipairs(c.shots) do
   if p.kind=='wave' then
    rect(p.x-p.radius,floor-27,p.radius*2,25,ink,.88)
    rect(p.x-p.radius,floor-30,p.radius*2,4,pink,.97)
    rect(p.x-p.radius,floor-7,p.radius*2,4,crimson)
   else
    line(rect,p.x-p.dx*4,p.y-p.dy*4,p.x+p.dx*3,p.y+p.dy*3,ink,8)
    line(rect,p.x,p.y,p.x+p.dx*3,p.y+p.dy*3,pink,4)
   end
  end
  v.areas={}
  for _,z in ipairs(M.hazards(r,c)) do
   local g=z.shape
   G.drawShape(rect,g,z.active and pink or z.judge and white or crimson,z.active,c.t>=(c.data.lock_ticks[1] or 0))
   if z.judge and c.t>=84 then
    for y=g.top,g.bottom-10,20 do line(rect,g.left,y,g.right,y+10,pink,2,.77) end
   end
   v.areas[#v.areas+1]={left=g.left,right=g.right,top=g.top,bottom=g.bottom,active=z.active,judge=z.judge}
  end
  if c.key=='RN07' and c.t<252 then
   local x,w=M.curtain(r,c)
   v.safe={x=x,width=w}
   gate(rect,x,w,floor)
   if c.t<72 then rect(c.endMark-4,floor-13,8,12,safe,.84) end
  end
 end
 local function objectives(rect,s,r,c,p,v)
  if p.waived then return end
  local floor=r.spec.arena.floor
  local starts={RN03=78,RN06=60,RN08=252}
  local ends={RN03=606,RN06=660,RN08=612}
  local start=starts[c.key]
  if start then
   local stop=ends[c.key]
   if c.key~='RN08' or c.t>=240 then
    v.shadows={}
    v.found,v.goal=p.found,c.key=='RN03' and #p.shadows or 2
   end
   if c.t>=start and c.t<stop then
    for _,item in ipairs(p.shadows) do
     if not item.taken then
      v.shadows[#v.shadows+1]={x=item.x,y=item.y,id=item.id}
      shadow(rect,item,c.key=='RN06' and gold or pink)
     end
    end
    if #v.shadows>0 then v.untilTick=stop-c.t end
   elseif c.t<start and (c.key~='RN08' or c.t>=240) then
    for _,p in ipairs(r.spec.arena.shadowSlots) do rect(p[1]-11,p[2]-5,22,3,gold,.68) end
   end
  end
  if c.key=='RN08' then
   v.beat=c.t<240 and 1 or c.t<612 and 2 or c.t<846 and 3 or 4
   for i=1,4 do rect(435+i*17,49,11,6,i==v.beat and white or ink,.9) end
   if p.gateX and c.t<846 then
    local w=.7*r.spec.arena.unit
    v.gate={x=p.gateX,width=w,inside=M.gate(s,r,c)}
    gate(rect,p.gateX,w,floor)
   end
   if c.t>=612 and c.t<846 then
    for x=52,912,23 do
     if not p.gateX or math.abs(p.gateX-x)>.7*r.spec.arena.unit then
      rect(x,floor-7,7,7,crimson,.78)
      if c.t>=840 then rect(x,floor-162,7,155,crimson,.46,true) end
     end
    end
   end
  elseif c.key=='RN12' and c.t>=30 and c.t<c.recover then
   v.road={passed=p.passed,total=#r.spec.arena.road}
   local current=r.spec.arena.road[p.passed+1]
   if current then v.road.x,v.road.y=current[1],current[2]-24 end
   for i,point in ipairs(r.spec.arena.road) do
    local color=i==p.passed+1 and safe or '#657b79'
    if i<=p.passed then color='#a3b8af' end
    outline(rect,point[1],point[2]-20,17,i==#r.spec.arena.road and 41 or 19,color,.87)
    rect(point[1]-16,point[2]-3,32,3,color)
   end
  end
 end
 return function(f,s,r,spec,mode,profile)
  local v,b,c=f.endgameRun,r.boss,r.cast
  local p=c and M.progress(s,c)
  local a,other=s.actors[s.active],s.actors[3-s.active]
  v.stage,v.stageName=r.stage,stageNames[r.stage]
  v.phase=r.status=='clear' and 'clear' or r.wipe and 'returning' or c and c.t>=c.recover and 'recover' or r.phase
  v.life,v.maxLife,v.lamps,v.maxLamps=r.life,spec.life.max,r.lamps,spec.revive.lamps
  v.returnTicks=r.wipe and r.wipe.wait or nil
  v.protection=r.protected
  v.aidVisible=r.status=='fighting' and not r.wipe and a.hp>0 and other.hp<=0 and r.aidCooldown==0
  v.aidReady=v.aidVisible and math.abs(a.x-other.x)<=spec.revive.aidRange and math.abs(a.y-other.y)<=48 and not r.aid
  v.aidTicks=r.aid and r.aid.finish-r.age or nil
  v.aidCooldown=r.aidCooldown
  v.card,v.tick,v.hint=c and c.key,c and c.t or r.age-r.phaseAt,hint(r,c,p)
  if c and c.key=='RN08' then v.finalVerdict=p.finalVerdict end
  if c and c.t>=c.recover and (c.key=='RN08' or c.key=='RN12') then v.pose='RN09' end
  if r.lastDown and r.age-r.lastDown.at<=12 then v.lastDown=r.lastDown end
  f.boss={name=spec.name,hp=b.hp,maxhp=b.maxhp,x=b.x,y=b.y,dir=b.dir,phase=v.phase,
   label=c and c.data.title or v.stageName}
  local back={draws={}}
  if mode=='rect' and s.packRectArt then
   back.rectIndex,back.rectBatches={},f.rectBatches or {}
   f.rectBatches=back.rectBatches
  end
  local rect=painter(back,s.camera)
  local inFinale=c and c.key=='RN08'
  local open=r.status=='clear' and .08 or v.pose and .10 or inFinale and 1 or .38+r.stage*.10
  eye(rect,480,170,inFinale and 228 or 168,open,inFinale and .64 or .41)
  local hover=v.pose and .05 or .20
  local y=b.y-spec.arena.unit*hover
  local art=C.stygianRonovaArt
  local direction=b.dir<0 and 'left' or 'right'
  C.drawFieldDisplayArt(back,art.wings,b.x-s.camera,y-98,v.pose and 96 or 112,mode,profile,false,nil,nil,v.pose and .63 or nil)
  C.drawFieldDisplayArt(back,art[direction],b.x-s.camera,y,144,mode,profile,false)
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws)
  f.draws=back.draws
  rect=painter(f,s.camera)
  if c and (r.shared or not r.wipe) then
   battleCues(rect,r,c,v)
   if r.status=='fighting' and not r.wipe then objectives(rect,s,r,c,p,v) end
  end
  for _,p in ipairs(r.echoes) do shadow(rect,p,gold) end
  if r.protected>0 then
   for _,owner in ipairs(s.actors) do
    if owner.hp>0 then outline(rect,owner.x,owner.y-42,29,48,white,.75) end
   end
  end
  if v.lastDown then
   local down=s.actors[v.lastDown.actor]
   for i=0,3 do rect(down.x-14+i*9,down.y-26-i%2*11,5,17,white,.56) end
  end
  if v.aidVisible then rect(other.x-14,other.y-5,28,4,v.aidReady and safe or gold,.92) end
  f.commands=#f.draws
 end
end
