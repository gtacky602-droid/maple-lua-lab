-- Prototype geometry and timings. Only marked sentinel defeat releases the core.
return function(C)
 local action,step,frame=C.action,C.step,C.frame
 local elements={'physical','pyro','hydro','cryo','electro','anemo','geo','dendro'}
 local function phase(b,p,t)
  b.phase=p;b.timer=t;b.invulnerable=p=='split' or p=='rocket'
  for _,e in ipairs(elements) do b.resist[e]=(e=='physical' and .7 or .1)-(p=='down' and .5 or 0) end
 end
 local function area(s,b,x,r,damage)
  for _,a in ipairs(s.actors) do if a.hp>0 and math.abs(a.x-x)<r+12 and a.y>390 then C.damageActor(s,a,damage,b,true,true) end end
 end
 local function beamBoxes(b)
  local boxes={};local dx=b.aimX-b.x;local dy=b.aimY-410;local distance=math.sqrt(dx*dx+dy*dy)
  local scale=math.min(1,500/math.max(1,distance));dx=dx*scale;dy=dy*scale
  local count=math.max(1,math.ceil(math.sqrt(dx*dx+dy*dy)/12))
  for i=0,count do boxes[#boxes+1]={x=b.x+dx*i/count-9,y=410+dy*i/count-9,w=18,h=18} end
  return boxes
 end
 local function roll(s,b)
  b.rollFrom=b.x;b.rollTo=math.max(60,math.min(900,s.actors[s.active].x));b.rollHits={};phase(b,'roll_warning',.9)
 end
 local function spinLeg(b)
  b.spinFrom=b.x;b.spinTo=b.spinPath[b.spinLeg];b.spinClock=0;b.spinHits={};phase(b,'spin',.35)
 end
 local function split(s,b)
  b.splitUsed=true;b.parts={};phase(b,'split',1e9)
  for i=1,4 do
   local x=150+i*140
   local e={id=99062000+i,x=x,home=x,y=480,hp=90,maxhp=90,kind=1,custom=true,boss=true,noRewards=true,respawn=1e9,cd=999,warning=0,part=i,marked=i==b.markedIndex,invulnerable=i~=b.markedIndex,clock=1+i*.5,resist={physical=.3}}
   for _,element in ipairs(elements) do e.resist[element]=element=='physical' and (i<=2 and .5 or .3) or .1 end
   b.parts[#b.parts+1]=e;s.enemies[#s.enemies+1]=e
  end
 end
 function C.action(s,key)
  local selected=key=='boss_array' and 1 or tonumber(key:match('^boss_array_([1-4])$'))
  if selected then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='array';s.worldwidth=960;s.platforms={{x=0,y=480,w=960}}
   s.campaign.message='恒常からくり陣形：分裂したら金色の印の小型機を倒す。本体停止中に反撃。形状と数値は試作。'
   local b={id=24021101,x=620,home=620,y=480,hp=800,maxhp=800,kind=1,boss=true,custom=true,respawn=1e9,cd=999,warning=0,resist={},cycle=0,elapsed=0,parts={}}
   b.markedIndex=selected;s.enemies={b};s.array=b;phase(b,'ready',2);return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='array' then s.array=nil end
 end
 function C.step(s,dt,input)
  local b=s.array;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp>0 then
   b.elapsed=b.elapsed+dt;b.timer=b.timer-dt
   if not b.splitUsed and (b.hp<=b.maxhp*.7 or b.elapsed>=30) then split(s,b) end
   if b.phase=='split' then
    local marked=b.parts[b.markedIndex]
    if marked.hp<=0 then
     C.clearArrayShots(s)
     s.enemies={b};b.parts={};phase(b,'down',10)
    else
     for _,e in ipairs(b.parts) do
      C.stepArrayPart(s,e,dt,area)
     end
    end
   elseif b.timer<=0 then
    if b.phase=='ready' or b.phase=='recover' or b.phase=='down' then
     b.cycle=b.cycle+1;b.target=math.max(60,math.min(900,s.actors[s.active].x));b.facing=b.target>b.x and 1 or -1
     local attack=(b.cycle-1)%5
     if attack==0 then phase(b,'rocket',1)
     elseif attack==1 then phase(b,'sword_warning',1.1)
     elseif attack==2 then phase(b,'orbital_warning',1.5)
     elseif attack==3 then b.aimX=b.target;b.aimY=s.actors[s.active].y-30;phase(b,'beam_warning',1.3)
     elseif math.abs(b.target-b.x)>260 then b.rollCount=1;roll(s,b)
     else
      local function bound(x) return math.max(60,math.min(900,x)) end
      b.spinPath={bound(b.x+b.facing*100),bound(b.x-b.facing*70),bound(b.x+b.facing*130)}
      b.spinLo=math.min(b.x,table.unpack(b.spinPath))-55;b.spinHi=math.max(b.x,table.unpack(b.spinPath))+55;b.spinLeg=1;phase(b,'spin_warning',1.2)
     end
    elseif b.phase=='rocket' then phase(b,'slam_warning',1)
    elseif b.phase=='slam_warning' then b.x=b.target;area(s,b,b.x,110,25);phase(b,'recover',2)
    elseif b.phase=='sword_warning' then area(s,b,b.x+b.facing*110,140,22);phase(b,'recover',2)
    elseif b.phase=='orbital_warning' then area(s,b,b.target,85,24);phase(b,'recover',2)
    elseif b.phase=='beam_warning' then b.beamClock=0;phase(b,'beam',3)
    elseif b.phase=='beam' then phase(b,'recover',2)
    elseif b.phase=='roll_warning' then phase(b,'roll',math.abs(b.rollTo-b.x)/600+dt)
    elseif b.phase=='roll' then
     b.x=b.rollTo
     if b.rollCount<3 then b.rollCount=b.rollCount+1;roll(s,b) else phase(b,'recover',2) end
    elseif b.phase=='spin_warning' then spinLeg(b)
    elseif b.phase=='spin' then
     b.x=b.spinTo
     if b.spinLeg<3 then b.spinLeg=b.spinLeg+1;spinLeg(b) else phase(b,'spin_slash_warning',.75) end
    elseif b.phase=='spin_slash_warning' then area(s,b,b.x,160,26);phase(b,'recover',2)
    end
   end
   if b.phase=='beam' then
    local a=s.actors[s.active];local dx=a.x-b.aimX;local dy=a.y-30-b.aimY;local dist=math.sqrt(dx*dx+dy*dy);local amount=math.min(1,180*dt/math.max(.001,dist))
    b.aimX=b.aimX+dx*amount;b.aimY=b.aimY+dy*amount;b.beamClock=b.beamClock-dt
    if b.beamClock<=0 then
     b.beamClock=b.beamClock+.3
     for _,actor in ipairs(s.actors) do for _,box in ipairs(beamBoxes(b)) do
      if actor.x+12>box.x and actor.x-12<box.x+box.w and actor.y>box.y and actor.y-55<box.y+box.h then C.damageActor(s,actor,8,b,true,true);break end
     end end
    end
   elseif b.phase=='spin' then
    local old=b.x;b.spinClock=math.min(.35,b.spinClock+dt);b.x=b.spinFrom+(b.spinTo-b.spinFrom)*b.spinClock/.35
    for _,a in ipairs(s.actors) do
     if not b.spinHits[a.id] and a.hp>0 and a.inv<=0 and a.y>410 and a.x+12>math.min(old,b.x)-55 and a.x-12<math.max(old,b.x)+55 then b.spinHits[a.id]=true;C.damageActor(s,a,12,b,true,true) end
    end
   elseif b.phase=='roll' then
    local old=b.x;local delta=b.rollTo-b.x;b.x=b.x+(delta>=0 and 1 or -1)*math.min(math.abs(delta),600*dt)
    for _,a in ipairs(s.actors) do
     if not b.rollHits[a.id] and a.hp>0 and a.inv<=0 and a.y>410 and a.x+12>math.min(old,b.x)-45 and a.x-12<math.max(old,b.x)+45 then b.rollHits[a.id]=true;C.damageActor(s,a,20,b,true,true) end
    end
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='array' then s.array=nil;return end
  s.camera=0;for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end
  if b.hp<=0 then C.clearArrayShots(s);s.enemies={b};b.parts={};b.respawn=1e9;phase(b,'defeated',1e9) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.array;if not b then return f end
  local labels={ready='起動',rocket='上空へ退避',slam_warning='落下予告',sword_warning='剣への変形・前方斬り',orbital_warning='照準攻撃・離れる',recover='攻撃後の隙',split='金色の印を狙う',down='停止・全耐性低下',defeated='討伐完了'}
  labels.beam_warning='追尾ビーム予告';labels.beam='追尾ビーム・横切って避ける';labels.roll_warning='転がり予告・跳んで回避';labels.roll='ローリング'
  labels.spin_warning='回転移動の予告';labels.spin='回転する刃';labels.spin_slash_warning='回転後の斬撃・離れる'
  f.location='恒常からくり陣形（静止素材の試作）';f.boss={name='恒常からくり陣形',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,x=b.x,splitUsed=not not b.splitUsed}
  f.boss.markedIndex=b.markedIndex;f.boss.markedName=({'盾型','偵察型','巡航型','殲滅型'})[b.markedIndex]
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
  if b.hp>0 then
   C.drawArrayArt(f,b,mode,profile)
   if b.phase=='slam_warning' or b.phase=='orbital_warning' then local r=b.phase=='slam_warning' and 110 or 85;rect(b.target-r,470,r*2,10,'#ff9767') end
   if b.phase=='sword_warning' then rect(b.x+b.facing*110-140,470,280,10,'#ff9767') end
   if b.phase=='beam' or b.phase=='beam_warning' then for _,box in ipairs(beamBoxes(b)) do rect(box.x,box.y,box.w,b.phase=='beam' and box.h or 2,b.phase=='beam' and '#ffde9b' or '#f59968') end end
   if b.phase=='roll_warning' then rect(math.min(b.rollFrom,b.rollTo)-45,470,math.abs(b.rollTo-b.rollFrom)+90,10,'#ff9767') end
   if b.phase=='spin_warning' then rect(b.spinLo,470,b.spinHi-b.spinLo,10,'#ff9767') end
   if b.phase=='spin' then rect(b.x-55,425,110,12,'#f2c57b');rect(b.x-8,398,16,66,'#f2c57b') end
   if b.phase=='spin_slash_warning' then rect(b.x-160,470,320,10,'#ff9767') end
   for _,e in ipairs(b.parts) do
    C.drawArrayPartArt(f,e,mode,profile)
    if e.marked then rect(e.x-30,366,60,6,'#ffe370');f.draws[#f.draws+1]={kind='text',x=e.x,y=354,text='弱点個体',size=16,color='#ffe370'} end
    C.drawArrayPart(f,e,rect)
   end
  end
  f.commands=#f.draws;return f
 end
end
