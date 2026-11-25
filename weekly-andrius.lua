return function(C)
 local wolf={}
 local avoid=C.aiAvoidTarget
 local ice,wind,pale,ink='#74ddff','#b9f4d9','#efffff','#233855'
 local function clamp(x,a,b)return math.max(a,math.min(b,x))end
 local function actorKey(s,a) return s.actorOwners and a or a.id end
 local function lerp(a,b,q)return a+(b-a)*q end
 local function active(s)
  local w,spec=C.currentWeeklyBoss(s)
  return w and spec.controller=='andrius' and w or nil,spec
 end
 local function target(s)
  local a=s.actors[s.active];if a.hp>0 then return a end
  for _,other in ipairs(s.actors)do if other.hp>0 then return other end end
 end
 local function remove(s,w)
  for i=#s.enemies,1,-1 do if s.enemies[i]==w.primary then table.remove(s.enemies,i)end end
 end
 local function body(w,x,y)
  local e=w.primary;e.x,e.y=x,y;e.hitTop=y-130;e.hitBottom=y
 end
 function wolf.spawn(s,w,spec)
  w.stage,w.pose,w.index,w.notice='P1','ready',1,spec.noticeTicks
  w.transitioned,w.transitionPending,w.transitions=false,false,0
  w.awakened=false
  w.hazards,w.falls={},0
  local e=w.primary;e.dir=-1;e.resist=spec.resist;e.underground=false
  body(w,spec.center,spec.floorY)
 end
 function wolf.attach(s,w,spec)
  remove(s,w);s.enemies[#s.enemies+1]=w.primary
  s.grappleNodes={};s.selectedGrapple=1
  for _,a in ipairs(s.actors)do a.grapple=nil end
 end
 function wolf.cleanup(s,w,spec)
  remove(s,w);w.cast=nil;w.hazards={};w.primary.underground=true
  w.stage=w.primary.hp<=0 and 'finished' or 'P1'
 end
 function wolf.share(w,actors)
  if w.cast then
   local c=w.cast
   C.shareFieldHits(c.seen,actors)
   C.shareFieldHits({c.counts},actors)
   for _,bolt in pairs(c.bolts) do C.shareFieldHits({bolt.seen},actors) end
  end
  for _,h in ipairs(w.hazards) do C.shareFieldHits({h.hits},actors) end
 end
 local function start(s,w,spec,id)
  if not id then
   local order=w.stage=='P2' and spec.rotation or spec.opening
   id=order[w.index];w.index=w.index%#order+1
  end
  local m=spec.moves[id];local e=w.primary;local a=target(s)
  if m.kind~='tail' then e.dir=(a and a.x or e.x-1)>=e.x and 1 or -1 end
  local c={move=m,tick=0,dir=e.dir,origin=e.x,originY=e.y,seen={{},{},{}},counts={},bolts={}}
  c.variant=m.kind=='tail' and a and math.abs(a.x-e.x)>220 and 'ranged' or 'melee'
  c.total=c.variant=='ranged' and m.rangedTotal or m.total
  if id=='WA06' then
   w.stage='INTERLUDE';w.transitioned=true;w.transitionPending=false;w.transitions=w.transitions+1
   c.entry1,c.end1,c.entry2,c.end2=160,800,800,160
  end
  w.cast=c
 end
 local function lock(s,w,spec,c)
  local e=w.primary;local a=target(s);local x=a and a.x or spec.center
  local m=c.move.kind
  c.center=c.origin
  if m=='swipe' then c.left,c.right=math.min(c.origin+c.dir*20,c.origin+c.dir*176),math.max(c.origin+c.dir*20,c.origin+c.dir*176)
  elseif m=='tail' then
   c.left,c.right=math.min(c.origin-c.dir*20,c.origin-c.dir*145),math.max(c.origin-c.dir*20,c.origin-c.dir*145)
   c.targets={clamp(x-35,40,920),clamp(x,40,920),clamp(x+35,40,920)}
  elseif m=='leap' then
   c.center=clamp(x,210,750);c.left,c.right=c.center-88,c.center+88
  elseif m=='dash' then
   c.finish=clamp(x,210,750)
   if math.abs(c.finish-c.origin)<100 then c.finish=clamp(c.origin+c.dir*220,210,750)end
   c.dir=c.finish>=c.origin and 1 or -1;e.dir=c.dir
   c.left,c.right=math.min(c.origin,c.finish)-45,math.max(c.origin,c.finish)+45
  elseif m=='spin' then
   c.left,c.right=c.origin-(c.dir>0 and 114.4 or 176),c.origin+(c.dir>0 and 176 or 114.4)
  elseif m=='wave' or m=='blades' then
   c.startX=c.origin+c.dir*70;c.finishX=c.startX+c.dir*650
  elseif m=='rain' then
   c.points={};c.floorY=spec.floorY
   local left,right=90,870
   for _,p in ipairs(spec.platforms)do
    if p.y<480 and a and a.ground and math.abs(a.y-p.y)<3 and a.x>=p.x and a.x<=p.x+p.w then
     c.floorY=p.y;left,right=p.x+26,p.x+p.w-26
    end
   end
   for i,offset in ipairs({-120,0,120})do c.points[i]=clamp(x+offset,left,right)end
  elseif m=='roar' then c.left,c.right=clamp(c.origin-240,40,920),clamp(c.origin+240,40,920)
  elseif m=='phantom' then
   c.entry=x<480 and 800 or 160;c.finish=c.entry==800 and 160 or 800
   c.left,c.right=120,840;c.phantomDir=c.finish>c.entry and 1 or -1
  end
 end
 local function transitionPosition(w,c,spec)
  local t=c.tick
  local x,y=spec.center,spec.floorY
  if t>=150 and t<174 then x=lerp(c.entry1,c.end1,(t-150)/24);w.primary.dir=1
  elseif t>=318 and t<342 then x=lerp(c.entry2,c.end2,(t-318)/24);w.primary.dir=-1
  elseif t>=420 and t<456 then
   local q=(t-420)/36;x=lerp(c.entry2,spec.center,q);y=spec.floorY-158.4*4*q*(1-q);w.primary.dir=-1;w.pose='leap'
  elseif t>=456 then x=spec.center;w.pose=t>=504 and 'ready' or 'land'
  else x=spec.center+280*math.sin(t/35);y=320;w.primary.dir=math.cos(t/35)>=0 and 1 or -1 end
  body(w,x,y)
  w.primary.underground=t<504
  if t>=468 then w.awakened=true end
 end
 function wolf.prepare(s,w,spec,_,dt)
  if w.phase=='available' then w.phase='notice' end
  if w.phase=='notice' then w.notice=w.notice-1;if w.notice<=0 then w.phase='combat' end;return end
  if not w.transitioned and w.primary.hp<=w.primary.maxhp*.5 then w.transitionPending=true end
  if not w.cast then start(s,w,spec,w.transitionPending and 'WA06' or nil)end
  local c=w.cast;c.tick=c.tick+1;local m,t=c.move,c.tick
  if t==m.lock and m.kind~='interlude' then lock(s,w,spec,c)end
  w.pose=({swipe='swipe',tail='tail',leap='leap',dash='run',spin='tail',interlude='run',wave='rise',blades='rise',rain='ready',roar='howl',phantom='howl'})[m.kind]
  if m.kind=='leap' then
   if t<72 then w.pose='land' end
   if t>=72 and t<108 then local q=(t-72)/36;body(w,lerp(c.origin,c.center,q),spec.floorY-158.4*4*q*(1-q))
   elseif t>=108 then body(w,c.center,spec.floorY);w.pose='land' end
  elseif m.kind=='dash' then
   if t<84 then w.pose='land' end
   if t>=84 and t<108 then body(w,lerp(c.origin,c.finish,(t-84)/24),spec.floorY)
   elseif t>=108 then body(w,c.finish,spec.floorY);w.pose='land' end
  elseif m.kind=='interlude' then transitionPosition(w,c,spec)
  end
 end
 local function area(s,w,seen,left,right,top,damage,bottom,element)
  C.hitFieldArea(s,{id=w.primary.id,owner=w.primary,y=bottom or 480,damageElement=element or 'cryo'},seen,left,right,top,damage,bottom)
 end
 local function capsule(s,w,seen,oldx,newx,y,radius,damage,element)
  C.hitFieldCapsule(s,{id=w.primary.id,owner=w.primary,damageElement=element or 'cryo'},seen,oldx,newx,y,radius,damage)
 end
 local function bolt(s,w,c,index,spawn,ending,y,damage,element,targets)
  local t=c.tick
  if t<spawn or t>ending then return end
  local p=c.bolts[index]
  if p and p.ended then return end
  if not p then
   local x=c.startX or c.origin-c.dir*80
   p={x=x,y=y,start=x,seen={},radius=element=='anemo' and 16 or 10};c.bolts[index]=p
  end
  local q=clamp((t-spawn+1)/(ending-spawn),0,1)
  local nx=lerp(p.start,targets and targets[index] or c.finishX,q)
  local ny=targets and lerp(400,y,q) or y
  -- Fixed swept projectile path; cap is shared across all blades/pieces of this cast.
  local dx,dy=nx-p.x,ny-p.y;local length=dx*dx+dy*dy
  for _,a in ipairs(s.actors)do
   local key=actorKey(s,a)
   if a.hp>0 and not p.seen[key] and (c.counts[key] or 0)<2 then
    local u=length>0 and clamp(((a.x-p.x)*dx+(a.y-25-p.y)*dy)/length,0,1) or 0
    local x,cy=p.x+u*dx,p.y+u*dy
    if math.abs(x-a.x)<p.radius+10 and cy+p.radius>a.y-50 and cy-p.radius<a.y then
     p.seen[key]=true
     local before=a.hp
     C.damageActor(s.actorOwners and s.actorOwners[a] or s,a,damage,{id=w.primary.id,x=x,y=cy+30,damageElement=element},true,true)
     if a.hp<before then c.counts[key]=(c.counts[key] or 0)+1 end
    end
   end
  end
  p.x,p.y=nx,ny;if t>=ending then p.ended=true end
 end
 local function hazard(s,w,spec)
  for i=#w.hazards,1,-1 do
   local h=w.hazards[i]
   if h.remaining<=0 then table.remove(w.hazards,i)
   else
    for _,a in ipairs(s.actors)do
     local key=actorKey(s,a)
     if a.hp>0 and a.ground and math.abs(a.y-spec.floorY)<3 and a.x>=h.left and a.x<=h.right
      and s.t+1e-8>=(h.hits[key] or 0) then
      h.hits[key]=s.t+1;C.damageActor(s.actorOwners and s.actorOwners[a] or s,a,spec.floorDamage,{id=w.primary.id,damageElement='cryo'},false,true)
     end
    end
    h.remaining=h.remaining-1
   end
  end
 end
 function wolf.finish(s,w,spec)
  if w.phase~='combat' or not w.cast then return end
  local c=w.cast;local m,t=c.move,c.tick;local e=w.primary
  if not w.transitioned and e.hp<=e.maxhp*.5 then w.transitionPending=true end
  if m.kind=='swipe' and t>=60 and t<72 then area(s,w,c.seen[1],c.left,c.right,410,m.damage)
  elseif m.kind=='tail' then
   if t>=72 and t<84 then
    local before={};for i,a in ipairs(s.actors)do before[i]=a.hp end
    area(s,w,c.seen[1],c.left,c.right,420,m.damage)
    for i,a in ipairs(s.actors) do
     if a.hp<before[i] then local key=actorKey(s,a);c.counts[key]=(c.counts[key] or 0)+1 end
    end
   end
   if c.variant=='ranged' then for i=1,3 do bolt(s,w,c,i,90,144,420+(i-1)*24,m.rangedDamage,'cryo',c.targets)end end
  elseif m.kind=='leap' and t>=108 and t<120 then area(s,w,c.seen[1],c.left,c.right,400,m.damage)
  elseif m.kind=='dash' and t>=84 and t<108 then
   capsule(s,w,c.seen[1],c.lastX or c.origin,e.x,442,38,m.damage);c.lastX=e.x
  elseif m.kind=='spin' and t>=84 and t<108 then area(s,w,c.seen[1],c.left,c.right,360,m.damage)
  elseif m.kind=='interlude' then
   if t>=150 and t<174 then capsule(s,w,c.seen[1],c.lastX1 or c.entry1,e.x,442,38,m.damage);c.lastX1=e.x
   elseif t>=318 and t<342 then capsule(s,w,c.seen[2],c.lastX2 or c.entry2,e.x,442,38,m.damage);c.lastX2=e.x
   elseif t>=456 and t<468 then area(s,w,c.seen[3],spec.center-100,spec.center+100,400,m.landingDamage)end
  elseif m.kind=='wave' then
   if t>=90 and t<=168 and not c.waveEnded then
    local x=lerp(c.startX,c.finishX,clamp((t-90+1)/78,0,1));c.waveX=x
    capsule(s,w,c.seen[1],c.lastWaveX or c.startX,x,spec.floorY-14,18,m.damage)
    c.lastWaveX=x;if t==168 then c.waveEnded=true end
   end
  elseif m.kind=='blades' then
   for i,spawn in ipairs({96,186,276})do bolt(s,w,c,i,spawn,spawn+60,i==2 and 355 or 452,m.damage,'anemo')end
  elseif m.kind=='rain' then
   if t==132 then
    w.hazards={{left=40,right=92.8,remaining=360,hits={}},{left=867.2,right=920,remaining=360,hits={}}}
   end
   for i,at in ipairs({132,168,204})do if t>=at and t<at+12 then
    area(s,w,c.seen[i],c.points[i]-25,c.points[i]+25,c.floorY-110,m.damage,c.floorY)
   end end
  elseif m.kind=='roar' then
   for i,at in ipairs({108,138,168})do if t>=at and t<at+12 then area(s,w,c.seen[i],c.left,c.right,390,m.damage,nil,'anemo')end end
  elseif m.kind=='phantom' and t>=72 and t<=120 then
   local x=lerp(c.entry,c.finish,clamp((t-72+1)/48,0,1));c.phantomX=x
   capsule(s,w,c.seen[1],c.lastPhantomX or c.entry,x,446,25,m.damage,'anemo');c.lastPhantomX=x
  end
  hazard(s,w,spec)
  if t>=c.total then
   if m.kind=='interlude' then w.stage='P2';w.awakened=true;w.index=1;e.underground=false end
   w.cast=nil;w.pose='ready';body(w,e.x,spec.floorY)
  end
 end
 function wolf.afterStep(s,w,spec)
  for _,a in ipairs(s.actors)do if a.hp>0 and a.y>560 then
   a.x=clamp(a.x,60,900);a.y=spec.floorY;a.vy=0;a.ground=true;w.falls=w.falls+1
   if not w.waitUntil then C.damageActor(s,a,spec.fallDamage,{id=w.primary.id,damageElement='cryo'},false,true)end
  end end
 end
 local function upper(s,a,spec)
  local dest=a.x<480 and spec.platforms[2] or spec.platforms[3]
  local x=clamp(a.x,dest.x+24,dest.x+dest.w-24)
  if a.ground and a.y>dest.y+3 and math.abs(a.x-x)<110 then a.buffer=.1 end
  return x
 end
 local function recovery(c)
  local starts={swipe=84,tail=c.variant=='ranged' and 144 or 96,leap=138,dash=120,spin=120,
   interlude=504,wave=168,blades=342,rain=240,roar=180,phantom=120}
  return c.tick>=starts[c.move.kind]
 end
 local function escape(s,w,a,spec,left,right)
  local choices={}
  for _,x in ipairs({left-35,right+35})do
   if x>=20 and x<=940 and (#w.hazards==0 or x>=110 and x<=850)then choices[#choices+1]=x end
  end
  if #choices==0 then return upper(s,a,spec)end
  table.sort(choices,function(x,y)return math.abs(x-a.x)<math.abs(y-a.x)end)
  return choices[1]
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=active(s)
  if not w or w.waitUntil then return avoid and avoid(s,a)end
  local c=w.cast;if not c then return avoid and avoid(s,a)end
  local m,t=c.move.kind,c.tick
  if recovery(c) then return avoid and avoid(s,a)end
  if m=='interlude' and t<504 then
   local p=a.x<480 and spec.platforms[2] or spec.platforms[3]
   local x=p.x+p.w/2
   if a.ground and a.y>p.y+3 and math.abs(a.x-x)<110 then a.buffer=.1 end
   return x
  end
  local left,right=c.left,c.right
  if m=='roar' then left,right=clamp(c.origin-240,40,920),clamp(c.origin+240,40,920)end
  if (m=='dash' or m=='roar') and left and a.x>left-24 and a.x<right+24 then
   if a.y<=spec.platforms[2].y+3 then return nil end
   return escape(s,w,a,spec,left,right)
  elseif (m=='swipe' or m=='tail' or m=='spin' or m=='leap') and c.left and a.x>c.left-24 and a.x<c.right+24 then
   return escape(s,w,a,spec,c.left,c.right)
  elseif m=='wave' and t>=78 and t<170 and a.ground and a.y==480 then a.buffer=.1
  elseif m=='blades' and c.startX then
   for _,p in pairs(c.bolts)do if not p.ended and p.y>420 and math.abs(p.x-a.x)<120 and a.ground then a.buffer=.1 end end
  elseif m=='rain' and c.points then
   for _,x in ipairs(c.points)do if math.abs(a.x-x)<60 then return clamp(a.x+(a.x<480 and 100 or -100),100,860)end end
  elseif m=='phantom' and t>=60 and t<122 and a.ground then a.buffer=.1 end
  for _,h in ipairs(w.hazards)do if a.x>=h.left-12 and a.x<=h.right+12 then return a.x<480 and h.right+50 or h.left-50 end end
  return avoid and avoid(s,a)
 end
 local function rect(f,x,y,w,h,color)f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}end
 local function text(f,x,y,t,color,size)f.draws[#f.draws+1]={kind='text',x=x,y=y,text=t,color=color,size=size or 12}end
 local function line(f,left,right,y,color)
  for x=left,right,16 do rect(f,x,y,9,3,color)end
 end
 function wolf.observe(f,s,w,spec,mode,profile)
  local c=w.cast;local e=w.primary;local b=f.weeklyBoss
  b.stage=w.stage;b.awakened=not not w.awakened;b.transitions=w.transitions;b.transitionPending=w.transitionPending
  b.x,b.y,b.dir,b.falls=e.x,e.y,e.dir,w.falls
  b.move=c and c.move.id;b.tick=c and c.tick;b.variant=c and c.variant
  b.recovery=c and recovery(c) or false
  b.label=w.waitUntil and '試練終了・再挑戦待ち' or c and c.move.title or '王狼の試練'
  b.resistance='風・氷 無効 / 物理 有効'
  if c then
   b.attack={left=c.left,right=c.right,center=c.center,origin=c.origin,finish=c.finish,dir=c.dir,
    startX=c.startX,finishX=c.finishX,points=c.points,floorY=c.floorY,entry=c.entry}
   b.bolts={};for _,p in pairs(c.bolts)do if not p.ended then b.bolts[#b.bolts+1]={x=p.x,y=p.y}end end
   if c.phantomX then b.phantom={x=c.phantomX,dir=c.phantomDir}end
  end
  b.hazards={};for _,h in ipairs(w.hazards)do b.hazards[#b.hazards+1]={left=h.left,right=h.right,remaining=h.remaining}end
  if e.hp<=0 then return end
  local layer={draws={}};local pose=c and recovery(c) and 'ready' or w.pose or 'ready';local variant=w.awakened and 'awake' or 'normal'
  if variant=='normal' and (pose=='rise' or pose=='howl')then pose='ready' end
  local height=spec.artHeight
  if c and c.move.kind=='interlude' and e.y==320 then height=110 end
  C.drawAndriusWeeklyArt(layer,e.x-s.camera,e.y,variant..'-'..pose,height,mode,profile,e.dir>0)
  if c then
   local m,t=c.move.kind,c.tick
   local tellEnd=({swipe=72,tail=84,spin=108,leap=120,dash=108,roar=180})[m]
   if c.left and tellEnd and t<tellEnd then
    line(layer,c.left,c.right,476,m=='roar' and wind or ice)
    if m=='roar' then
     text(layer,c.center,355,'咆哮・上段 / 範囲外 SAFE',pale)
     for _,p in ipairs(spec.platforms)do if p.y<480 then line(layer,p.x,p.x+p.w,p.y-3,wind);text(layer,p.x+p.w/2,p.y-15,'SAFE',wind)end end
    end
   end
   if recovery(c) then text(layer,e.x,e.y-200,'反撃の好機',wind)end
   if m=='tail' and c.variant=='ranged' then text(layer,e.x,300,'尾＋氷片3本',ice)end
   if m=='wave' and c.startX then
    line(layer,math.min(c.startX,c.finishX),math.max(c.startX,c.finishX),478,ice)
    if c.waveX and not c.waveEnded then
     local x=c.waveX;rect(layer,x-22,462,44,18,ice);rect(layer,x-13,448,26,14,pale)
    end
   elseif m=='blades' and c.startX then
    text(layer,e.x,270,'低 → 高 → 低（1.5秒間隔）',wind)
    for i,spawn in ipairs({96,186,276})do if t<spawn then
     local y=i==2 and 355 or 452;line(layer,math.min(c.startX,c.finishX),math.max(c.startX,c.finishX),y,wind..'66')
    end end
   elseif m=='interlude' then
    if t>=60 and t<174 then line(layer,120,840,476,ice);text(layer,72,420,'→',pale,35)end
    if t>=228 and t<342 then line(layer,120,840,476,ice);text(layer,888,420,'←',pale,35)end
    if t>=342 and t<468 then line(layer,spec.center-100,spec.center+100,476,ice);text(layer,480,390,'着地予告',pale)end
    if t>=504 then text(layer,e.x,280,'反撃の好機',wind)end
   elseif m=='rain' and c.points then
    line(layer,40,92.8,476,ice);line(layer,867.2,920,476,ice);text(layer,480,465,'中央へ / 端に冷気',pale)
    for i,x in ipairs(c.points)do
     local at=96+i*36
     if t<at+12 then
      line(layer,x-25,x+25,c.floorY-4,ice)
      if t>=at-36 then
       local y=lerp(190,c.floorY-15,clamp((t-at+36)/36,0,1));rect(layer,x-8,y-30,16,30,pale);rect(layer,x-3,y-42,6,12,ice)
      end
     end
    end
   elseif m=='phantom' and c.entry then
    if t<120 then line(layer,c.left,c.right,476,wind);text(layer,c.entry,420,c.phantomDir>0 and '→' or '←',pale,28)end
    if c.phantomX and t<=120 then C.drawAndriusWeeklyArt(layer,c.phantomX,480,'awake-run',100,mode,profile,c.phantomDir>0)end
   end
   for _,p in pairs(c.bolts)do if not p.ended then
    local color=m=='blades' and wind or ice
    rect(layer,p.x-6,p.y-24,12,48,color);rect(layer,p.x-11,p.y-10,22,20,pale)
   end end
  end
  for _,h in ipairs(w.hazards)do line(layer,h.left,h.right,475,ice);text(layer,(h.left+h.right)/2,460,'冷気',ice)end
  local draws={};local prefix=#(f.storyPortals or {})*4
  for i=1,prefix do draws[#draws+1]=f.draws[i]end
  for _,d in ipairs(layer.draws)do draws[#draws+1]=d end
  for i=prefix+1,#f.draws do draws[#draws+1]=f.draws[i]end
  f.draws=draws
  text(f,480,72,w.stage=='INTERLUDE' and '疾走試練 / 入口と着地点を見る' or w.stage=='P2' and '北風形態' or '氷牙形態',pale,13)
  text(f,480,91,b.resistance,ice,11)
 end
 return wolf
end
