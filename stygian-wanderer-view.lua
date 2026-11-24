return function(C,G,M)
 local ink,storm,mint,bright,warm='#173d57','#397482','#4bf0c9','#f0ffde','#ffe5a3'
 local labels={'風を読む','足場を渡る','四風の決着'}
 local hints={WD01='低・中・低。足元の線を見て跳ぶ',WD02='渡り風。床か、風の帯より上へ',
              WD03='左右の風標で着地する。風輪の中でジャンプ',WD04='落ちる位置が固定されたら外へ移動する',
              WD05='最初は低い風を跳ぶ。次は高い風の下へ'}
 local function painter(f,camera)
  return function(x,y,w,h,color,alpha,optional,motion)
   if w>0 and h>0 then
    f.draws[#f.draws+1]={kind='rect',x=x-camera,y=y,w=w,h=h,color=color,opacity=alpha,translucentFill=optional,motionOnly=motion}
   end
  end
 end
 local function oval(rect,x,y,rx,ry,color,alpha)
  for i=0,19 do
   local v=math.pi*i/10
   rect(x+math.cos(v)*rx,y+math.sin(v)*ry,5,3,color,alpha)
  end
 end
 local function pads(rect,r,s)
  for _,x in ipairs(r.spec.arena.risingPads) do
   local y=r.spec.arena.floor-7
   rect(x-28,y+3,56,5,ink)
   rect(x-23,y+3,46,3,mint)
   for i=1,3 do
    local h=11+i*9
    rect(x-8,y-h,5,3,ink)
    rect(x-2,y-h-4,5,3,bright)
    rect(x+4,y-h,5,3,ink)
    rect(x-16,y-5-(s.t*23+i*18)%45,2,6,bright,.75,false,true)
   end
  end
 end
 local function gate(rect,g,floor)
  local l,r=g.x-g.half,g.x+g.half
  rect(l-2,floor-114,5,115,ink);rect(r-2,floor-114,5,115,ink)
  rect(l,floor-115,r-l,6,ink)
  rect(l,floor-113,r-l,2,bright)
  rect(l,floor-110,2,109,mint);rect(r,floor-110,2,109,mint)
  rect(l,floor-3,r-l,3,mint)
  for y=floor-90,108,-34 do rect(l,y,2,16,ink,.8);rect(r,y,2,16,ink,.8) end
 end
 local function hint(r,c)
  if r.status=='clear' then return '空中決闘を終えた' end
  if r.phase=='enter' then return '足元の風輪でジャンプすると高く上がれる' end
  if r.phase=='phase' then return labels[r.stage] end
  if not c then return '次の風を読む' end
  if c.t>=c.recover then return string.format('反撃の隙 %.1f秒',(c.untilTick-c.t)/60) end
  if c.drop then return '二つ点灯。放浪者が足場へ降りる' end
  if c.key=='WD03' and c.t>=399 then return '地面を走る風が来る。上の足場かジャンプへ' end
  if c.key~='WD06' then return hints[c.key] end
  if c.t<86 then return '四風 1　床の風を跳ぶか足場に上がる' end
  if c.t<438 then return '四風 2　外側と中央上段の風標を踏む' end
  return '四風 3　線の間の門へ。地面でも上段でも避けられる'
 end
 local function cues(rect,s,r,c,v)
  local floor=r.spec.arena.floor
  local progress=M.progress(s,c)
  for _,z in ipairs(M.cues(r,c,s)) do
   local g=z.shape
   G.drawShape(rect,g,ink,false,true)
   if z.active then
    rect(g.left+3,g.top+3,g.right-g.left-6,g.bottom-g.top-6,storm,.35,true)
    rect(g.left+3,g.bottom-6,g.right-g.left-6,3,bright,.91)
   end
   v.areas[#v.areas+1]={left=g.left,right=g.right,top=g.top,bottom=g.bottom,active=z.active,index=z.index}
  end
  if c.stopX and c.t<c.data.windows[1][2] then
   v.destination=c.stopX
   oval(rect,c.stopX,c.key=='WD04' and floor-6 or floor-108,19,5,ink,.93)
   rect(c.stopX-7,(c.key=='WD04' and floor or floor-108)-7,14,3,warm)
  end
  if c.marks then
   local w=c.data.markWindow
   v.windMarks,v.windGoal=progress.collected,#c.marks
   v.markers={}
   v.markTime=progress.collected<#c.marks and c.t<w[2] and math.max(0,w[2]-math.max(c.t,w[1])) or nil
   if c.t<w[2] then
    for i,p in ipairs(c.marks) do
     local near=c.t>=w[1]
     local taken=M.markTaken(s,c,p)
     local border=taken and storm or ink
     oval(rect,p.x,p.y-5,21,8,border,.93)
     rect(p.x-14,p.y-3,28,3,taken and warm or mint,near and .95 or .49)
     if near and not taken then
      rect(p.x-2,p.y-28,4,12,bright)
      rect(p.x-7,p.y-24,14,3,bright)
      v.markers[#v.markers+1]={id=i,x=p.x,y=p.y}
     end
    end
   end
  end
  if c.key=='WD06' then
   v.beat=c.t<86 and 1 or c.t<438 and 2 or c.t<600 and 3 or 4
   for i=1,4 do rect(433+i*17,54,11,5,i==v.beat and bright or ink,.94) end
   if progress.gate and c.t<574 then
    local g=progress.gate
    local a=s.actors[s.active]
    v.safe={x=g.x,half=g.half,inside=math.abs(a.x-g.x)+8<g.half}
    gate(rect,g,floor)
   end
  end
 end
 return function(f,s,r,spec,mode,profile)
  local v,b,c=f.endgameRun,r.boss,r.cast
  v.stage,v.stageName=r.stage,labels[r.stage]
  v.phase=r.status=='clear' and 'clear' or c and c.t>=c.recover and 'recover' or r.phase
  v.tick,v.card=c and c.t or r.age-r.phaseAt,c and c.key
  v.targetSlot=c and c.targetMember and c.targetMember.id
  v.hint=hint(r,c)
  if r.phase=='enter' then v.dialogue='ついて来られるかい？' end
  if c and c.drop then v.dialogue='そこまで登ってきたか。' end
  if r.status=='clear' then v.dialogue='今の風は悪くなかったよ。' end
  f.boss={name=spec.name,hp=b.hp,maxhp=b.maxhp,x=b.x,y=b.y,dir=b.dir,phase=v.phase,label=c and c.data.title or labels[r.stage]}
  if r.status=='failed' then return end
  local back={draws={}}
  local rect=painter(back,s.camera)
  pads(rect,r,s)
  local side=b.dir<0 and 'left' or 'right'
  local art=C.stygianWandererArt[side]
  local inDash=c and c.key=='WD02' and c.t>=83 and c.t<125
  if inDash then
   local first=#back.draws+1
   C.drawFieldDisplayArt(back,art,b.x-b.dir*24-s.camera,b.y+3,108,mode,profile,false,nil,nil,.23)
   for i=first,#back.draws do back.draws[i].motionOnly=true end
  end
  if b.y<spec.arena.floor-10 and v.phase~='recover' then
   oval(rect,b.x,b.y-6,36,10,storm,.86)
   oval(rect,b.x,b.y-4,26,7,mint,.82)
  end
  C.drawFieldDisplayArt(back,art,b.x-s.camera,b.y,108,mode,profile,false)
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws)
  f.draws=back.draws
  if c then
   v.areas={}
   cues(painter(f,s.camera),s,r,c,v)
  end
  f.commands=#f.draws
 end
end
