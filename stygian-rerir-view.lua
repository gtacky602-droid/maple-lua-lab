return function(C,G,M)
 local crimson,ink,pink,gold,pale='#be4468','#512639','#ff98bd','#ffe1a1','#fff3c8'
 local function paint(f,cam)
  return function(x,y,w,h,color,alpha,blend,rotation)
   if w<.1 or h<.1 then return end
   f.draws[#f.draws+1]={kind='rect',x=x-cam,y=y,w=w,h=h,color=color,opacity=alpha,
    translucentFill=blend,rotation=rotation}
  end
 end
 local function pixelsLine(rect,x0,y0,x1,y1,color,wide,alpha)
  local dx,dy=x1-x0,y1-y0
  local length=math.sqrt(dx*dx+dy*dy)
  rect(x0,y0,length,wide,color,alpha,false,math.atan(dy,dx))
 end
 local function ring(rect,x,y,rx,ry,color,alpha)
  for i=0,39 do
   local angle=math.pi*i/20
   rect(x+math.cos(angle)*rx,y+math.sin(angle)*ry,5,i%5==0 and 6 or 3,color,alpha)
  end
 end
 local function actionPose(rect,b,c,stage)
  local armed=stage==2
  local active=false
  if c then
   for _,w in ipairs(c.windows) do
    if c.t>=w.first and c.t<math.min(w.last,w.first+7) then active=true;break end
   end
  end
  local startX=b.x+b.dir*25
  if armed then
   local startY=b.y-60
   local angle=c and c.path and -.68 or c and c.key=='RR07' and -.67 or active and -.18 or -.40
   local tipX,tipY=startX+b.dir*math.cos(angle)*97,startY+math.sin(angle)*123
   local backX,backY=startX-b.dir*math.cos(angle)*56,startY-math.sin(angle)*76
   pixelsLine(rect,backX,backY,tipX,tipY,'#281928',7)
   pixelsLine(rect,backX,backY+1,tipX,tipY+1,'#966486',3)
   local headX,headY=tipX+b.dir*23,tipY+math.sin(angle)*27
   pixelsLine(rect,tipX-b.dir*8,tipY+3,headX,headY,pink,10)
   pixelsLine(rect,tipX-b.dir*3,tipY+4,headX,headY,pale,3)
   rect(startX-3,startY-2,7,7,'#c8a198')
  elseif c and not c.lamp and c.t<c.data.recovery[1] and (c.key~='RR05' or c.t>=48) then
   local foot=c.key=='RR01' and c.t>=96
   local sy=b.y-(foot and 28 or 59)
   for i=0,2 do
    local length=active and 28 or 12
    pixelsLine(rect,startX,sy+i*7,startX+b.dir*length,sy+i*7-9,active and pink or crimson,4,.88)
   end
  end
 end
 local function hint(run,c,progress)
  if run.phase=='enter' then return '狩人が間合いを測っている' end
  if run.phase=='interlude' then return '第一幕終了。長槍を構える' end
  if run.phase=='fog-entry' then return '足跡を探し、輪郭が赤くなったら灯を掲げる（H）' end
  if run.phase=='blessing' then return '月光の祝福' end
  if not c then return '次の構えを見る' end
  if c.key=='RR05' then
   if c.lamp then
    if c.t<c.lamp.at+12 then return '灯が霧を割る' end
    local result=run.fog.ward==0 and '結界が消えた' or '灯が通った'
    return string.format('%s。反撃の隙 %.1f秒',result,(c.lamp.stop-c.t)/60)
   end
   if c.t>=84 and c.t<132 then return '赤い輪郭が見えた。灯を掲げる（H）' end
   local attempt=run.lampAttempt
   local tryAt=(attempt and attempt.cast==c.serial and attempt.tick) or c.tryAt
   if tryAt and c.t-tryAt<32 then
    return tryAt<84 and 'まだ霧が濃い。赤い輪郭を待つ' or '灯の合図に間に合わなかった。次の足跡を探す'
   end
   return c.t<84 and '足跡が示す側を見て、灯の合図を待つ' or '蹴りの範囲から離れる'
  end
  if c.path and c.t<1080 then
   if progress.burstDamage then return 'レリルの着地を待つ' end
   if c.t<120 then return '上空の試練。淡金の光を三つ集める' end
   if c.t<960 then return progress.collected<3 and '上段はジャンプで登る。赤い落下帯を避ける' or '三つそろった。淡金の輪で最後の衝撃を防ぐ' end
   return progress.collected==3 and '淡金の輪で最終衝撃に備える' or 'レリルが最終衝撃を溜めている'
  end
  local recovery=c.stop or c.data.total_ticks
  if c.t>=c.data.recovery[1] then return string.format('反撃の隙 %.1f秒',(recovery-c.t)/60) end
  return c.title
 end
 local function fogDraw(rect,b,c,v,floor)
  if not c then return end
  if c.key~='RR05' then return end
  if c.lamp then
   local t=c.t-c.lamp.at
   if t<24 then
    local r=t*4+9
    ring(rect,b.x,b.y-51,r,r*.7,gold,math.max(.12,1-t/26))
   end
  else
   for i=3,1,-1 do
    local x=c.origin+(46+i*17)*c.dir
    if i<=1+math.floor(c.t/15) then
     rect(x,floor-9-i%2*6,5,9,gold,.87)
     rect(x-7,floor-10-i%2*6,4,6,gold,.87)
    end
   end
   local tip=c.origin+c.dir*50
   for i=0,4 do rect(tip+c.dir*i*4,floor-31+i*3,5,4,gold,.94) end
   if v.lampReady then ring(rect,b.x,b.y-52,37,57,pink,.85) end
  end
 end
 local function pickups(rect,s,c,progress)
  if c.t<120 then return end
  for _,p in ipairs(progress.pickups) do
   if not p.owner and c.t<960 then
    rect(p.x-8,p.y-9,16,19,'#705845')
    rect(p.x-11,p.y-5,22,11,gold)
    rect(p.x-5,p.y-10,10,21,gold)
    rect(p.x-4,p.y-4,8,9,'#fffef0')
    rect(p.x-11,p.sole-3,22,2,pale,.77)
   elseif p.owner and c.t-p.t<12 then
    local a=s.actors[s.active];local u=(c.t-p.t)/12
    rect(p.x+(a.x-p.x)*u-3,p.y+(a.y-48-p.y)*u-3,7,7,pale,1-u)
   end
  end
  if progress.collected==3 and c.t<1020 then
   local a=s.actors[s.active]
   ring(rect,a.x,a.y-40,39,47,gold,.8)
  end
 end
 local function shots(rect,rays,shots,floor)
  for _,ray in ipairs(rays) do
   local ttl=ray.dy>0 and math.min(ray.life,(floor-ray.y)/ray.dy) or ray.life
   for t=1,ttl,5 do
    rect(ray.x+t*ray.dx,ray.y+t*ray.dy,5,2,pink,.6)
   end
  end
  for _,p in ipairs(shots) do
   if p.kind=='spike' then
    pixelsLine(rect,p.x-p.dx*4,p.y-p.dy*4,p.x+p.dx*3,p.y+p.dy*3,ink,8)
    pixelsLine(rect,p.x,p.y,p.x+p.dx*4,p.y+p.dy*4,pink,4)
   else
    rect(p.x-10,p.y-10,20,20,crimson)
    rect(p.x-7,p.y-12,14,24,crimson)
    rect(p.x-8,p.y-7,16,14,'#261826')
    rect(p.x-3,p.y-6,5,5,pink,.8)
   end
  end
 end
 return function(f,s,run,spec,mode,profile)
  local b,c,v=run.boss,run.cast,f.endgameRun
  local progress=c and c.path and M.trialProgress(c,s)
  local clear=run.status=='clear'
  v.stage,v.stageName=run.stage,run.stage==1 and '第一幕　狩人の爪' or '第二幕　深淵の長槍'
  v.phase=clear and 'clear' or run.phase
  v.card,v.variant,v.tick=c and c.key,c and c.variant,c and c.t or run.age
  v.hint=clear and '狩場の試練を終えた' or hint(run,c,progress)
  if run.phase=='fog-entry' or run.phase=='fog' then
   v.ward=run.fog.ward
   v.fogAttempt=run.fog.attempt
   v.lampVisible=run.phase=='fog' and c~=nil and not c.lamp
   v.lampReady=v.lampVisible and c.t>=84 and c.t<132
   v.lampOwner=c and c.lamp and c.lamp.owner
  elseif c and c.path then
   v.trial,v.collected=c.path,progress.collected
   v.protected=progress.protected
   if progress.burstDamage then
    local actor=s.actors[s.active]
    v.trialResult={protected=progress.protected,damage=progress.burstDamage[actor.id] or 0}
   end
   if run.status=='fighting' then
    v.pickups={}
    for i,p in ipairs(progress.pickups) do v.pickups[i]={x=p.x,y=p.y,owner=p.owner} end
   end
  end
  f.boss={name=spec.name,hp=b.hp,maxhp=b.maxhp,x=b.x,y=b.y,dir=b.dir,phase=v.phase,label=c and c.title or v.stageName}
  if run.status=='failed' then return end

  local back={draws={}}
  if mode=='rect' and s.packRectArt then
   back.rectIndex,back.rectBatches={},f.rectBatches or {}
   f.rectBatches=back.rectBatches
  end
  local rect=paint(back,s.camera)
  if v.ward then
   local density=run.phase=='fog-entry' and math.min(1,run.age/36) or c.lamp and .35 or 1
   for i=1,5 do
    local u=((run.shared and run.shared.elapsed or s.t)*12+i*194)%1110
    rect(u-175,332+i*24,344,23,'#72576d',density*.24,true)
   end
  elseif c and c.path and c.t>=90 and c.t<1050 then
   local airY=spec.arena.floor-3.5*spec.arena.unit-47
   ring(rect,b.x,airY,102,65,crimson,c.t>=960 and .9 or .5)
   ring(rect,b.x,airY,79,49,crimson,.65)
   if c.path==2 and (c.burst.complete or progress.collected==3) then
    for _,sign in ipairs({-1,1}) do
     pixelsLine(rect,b.x+sign*75,airY-27,b.x+sign*53,airY+14,gold,4)
    end
   end
  elseif c and c.key=='RR12' then
   for i=1,6 do rect(b.x+i*14-52,24,4,405,gold,math.max(0,.23-c.t/456),true) end
  end
  local side=b.dir>0 and 'right' or 'left'
  local opacity=(run.phase=='fog-entry' or c and c.key=='RR05' and c.t<84) and .23 or nil
  C.drawFieldDisplayArt(back,C.stygianRerirArt[side],b.x-s.camera,b.y,144,mode,profile,false,nil,nil,opacity)
  if not clear then actionPose(rect,b,c,run.stage) end
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws)
  f.draws=back.draws
  if c then
   rect=paint(f,s.camera)
   fogDraw(rect,b,c,v,spec.arena.floor)
   local hints=M.cues(run,c)
   v.areas={};v.shots=#c.shots
   if hints.road then rect(math.min(hints.road.from,hints.road.to),472,math.abs(hints.road.from-hints.road.to),3,pink,.8) end
   for _,entry in ipairs(hints.areas) do
    local z=entry.shape
    if entry.final then
     for i=0,5 do
      local edge=30+i*24
      rect(edge,32,6,434,crimson,entry.active and .83 or .42,true)
      rect(960-edge-6,32,6,434,crimson,entry.active and .83 or .42,true)
     end
    else
     G.drawShape(rect,z,entry.active and pink or crimson,entry.active,true)
    end
    v.areas[#v.areas+1]={left=z.left,right=z.right,top=z.top,bottom=z.bottom,index=entry.index,active=entry.active,final=entry.final}
   end
   if progress and run.status=='fighting' then pickups(rect,s,c,progress) end
   shots(rect,hints.rays,c.shots,spec.arena.floor)
  end
  f.commands=#f.draws
 end
end
