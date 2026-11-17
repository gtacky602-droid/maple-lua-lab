-- Four elemental variants. Timings, HP and 2D ranges are laboratory values.
return function(C)
 local action,step,frame=C.action,C.step,C.frame
 local base={physical=.3,geo=.5,hydro=.1,pyro=.1,cryo=.1,electro=.1,anemo=.1,dendro=.1}
 local names={hydro='水',pyro='炎',cryo='氷',electro='雷'}
 local colors={hydro='#83d6ea',pyro='#f39163',cryo='#c4eeff',electro='#c2a0ef'}
 C.primoTraits={names=names,colors=colors,resistance=base}
 local function phase(b,p,t)
  b.phase=p;b.timer=t;b.invulnerable=p=='awake' or p=='burrow'
  for k,v in pairs(base) do b.resist[k]=v+(k==b.element and .2 or 0)-(p=='stunned' and .5 or 0) end
 end
 local function area(s,b,x,r,damage)
  for _,a in ipairs(s.actors) do if math.abs(a.x-x)<r and a.y>410 then C.damageActor(s,a,damage,b,true,true) end end
 end
 local function stones(s,b)
  for i=-1,1 do b.stones[#b.stones+1]={x=math.max(60,math.min(900,s.actors[s.active].x+i*130)),timer=2} end
 end
 local function fieldBoxes(field,pulse)
  local boxes={};local function add(x,y,w,h) boxes[#boxes+1]={x=x,y=y,w=w,h=h} end
  if field.element=='pyro' then add(field.x-90,455,180,25)
  elseif field.element=='hydro' then
   local offset=({0,-35,35,-60,60,-20,20})[pulse];add(field.x+offset-28,390,56,90)
  elseif field.element=='cryo' then
   local distance=(pulse-1)*60
   if distance==0 then add(field.x-25,430,50,50) else add(field.x-distance-25,430,50,50);add(field.x+distance-25,430,50,50) end
  else
   for x=-120,120,20 do for _,sign in ipairs({-1,1}) do add(field.x+x-10,420+sign*x*.4-12,20,24) end end
  end
  return boxes
 end
 local function hitBoxes(s,b,boxes,damage)
  for _,a in ipairs(s.actors) do for _,box in ipairs(boxes) do
   if a.x+12>box.x and a.x-12<box.x+box.w and a.y>box.y and a.y-55<box.y+box.h then C.damageActor(s,a,damage,b,true,true);break end
  end end
 end
 local function breathBoxes(b)
  local boxes={}
  for i=0,15 do
   local distance=40+i*20;local half=12+distance*.18
   boxes[#boxes+1]={x=b.facing>0 and b.x+distance or b.x-distance-20,y=420-half,w=20,h=half*2}
  end
  return boxes
 end
 local function shield(s,a)
  if a.waterShield and a.waterShield.hp>0 and a.waterShield.life>0 then return a.waterShield,'hydro' end
  if s.companion=='beidou' and a.thunderShield and a.thunderShield.hp>0 and a.thunderShield.untilTime>s.t then return a.thunderShield,'electro' end
 end
 local function shower(s,b)
  local reflected={};local owner=s.active
  for _,a in ipairs(s.actors) do if a.hp>0 and a.inv<=0 and math.abs(a.x-b.x)<330 and a.y>250 then
   local before,element=shield(s,a);local hp=before and before.hp
   C.damageActor(s,a,20,b,false,true)
   local after=shield(s,a)
   if before and after==before and after.hp>0 and after.hp<hp and a.hp>0 then reflected[element]=true;owner=a.id end
  end end
  local fraction=0;for element in pairs(reflected) do fraction=fraction+(element==b.element and .15 or .05) end
  if fraction>0 then
   b.reflections=b.reflections+1;b.lastReflection=math.floor(b.maxhp*fraction)
   if b.hp<=b.lastReflection then C.defeatEnemy(s,b,owner) else b.hp=b.hp-b.lastReflection end
   b.stones={};b.fields={};phase(b,'stunned',5)
  else phase(b,'recover',2) end
 end
 function C.action(s,key)
  local selected=key=='boss_primo' and 'hydro' or key:match('^boss_primo_(%a+)$')
  if selected and names[selected] then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='primo';s.worldwidth=960;s.platforms={{x=0,y=480,w=960}}
   s.campaign.message='エンシェントヴィシャップ（'..names[selected]..'）：原岩噴射は残るシールドで反射。同属性15%、別属性5%。本体絵は水個体を仮共用。'
   local b={id=26050101,x=620,home=620,y=480,hp=800,maxhp=800,kind=1,boss=true,custom=true,respawn=1e9,cd=999,warning=0,element=selected,resist={},cycle=0,stones={},fields={},reflections=0}
   s.enemies={b};s.primo=b;phase(b,'awake',2);return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='primo' then s.primo=nil end
 end
 function C.step(s,dt,input)
  local b=s.primo;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp>0 then
   for i=#b.stones,1,-1 do local rock=b.stones[i];rock.timer=rock.timer-dt
    if rock.timer<=0 then
     if #b.fields<12 then b.fields[#b.fields+1]={x=rock.x,element=b.element,pulse=0,clock=0,total=({hydro=7,pyro=6,cryo=3,electro=1})[b.element]} end
     table.remove(b.stones,i)
    end
   end
   for i=#b.fields,1,-1 do
    local field=b.fields[i];field.clock=field.clock-dt
    if field.clock<=0 then
     if field.pulse>=field.total then table.remove(b.fields,i)
     else
      field.pulse=field.pulse+1;field.clock=field.element=='hydro' and .35 or .6;field.boxes=fieldBoxes(field,field.pulse);field.flash=.18
      hitBoxes(s,b,field.boxes,field.element=='pyro' and 8 or 14)
     end
    end
    field.flash=math.max(0,(field.flash or 0)-dt)
   end
   b.timer=b.timer-dt
   if b.phase=='burrow' then
    local old=b.x;b.x=b.origin+(b.target-b.origin)*math.max(0,math.min(1,1-b.timer/1.2))
    for _,a in ipairs(s.actors) do
     if not b.burrowHits[a.id] and a.hp>0 and a.inv<=0 and a.y>410 and a.x>=math.min(old,b.x)-55 and a.x<=math.max(old,b.x)+55 then
      C.damageActor(s,a,18,b,true,true);b.burrowHits[a.id]=true
     end
    end
   end
   if b.timer<=1e-8 then
    if b.phase=='awake' or b.phase=='recover' or b.phase=='stunned' then
     local rear=false
     if b.phase=='recover' and s.t>=(b.rearReady or 0) then
      for _,a in ipairs(s.actors) do local distance=(a.x-b.x)*(b.facing or -1)
       if a.hp>0 and distance<-50 and distance>-180 and math.abs(a.y-b.y)<80 then rear=true;break end
      end
     end
     b.target=s.actors[s.active].x;b.rearResponse=rear
     local attack
     if rear then attack='spin_warning';b.rearReady=s.t+8;b.rearResponses=(b.rearResponses or 0)+1
     else b.cycle=b.cycle+1;b.facing=b.target>=b.x and 1 or -1;attack=({'claw_warning','spin_warning','shower_warning','burrow_warning','stones_warning','combo_warning','breath_warning'})[(b.cycle-1)%7+1] end
     if attack=='shower_warning' and b.hp<=b.maxhp*.1 then attack='stones_warning' end
     if attack=='burrow_warning' then b.target=math.max(100,math.min(860,b.target));b.origin=b.x end
     if attack=='combo_warning' then b.combo=1 end
     phase(b,attack,attack=='shower_warning' and 2.5 or 1)
    elseif b.phase=='claw_warning' then area(s,b,b.x+b.facing*95,115,18);phase(b,'recover',1.5)
    elseif b.phase=='spin_warning' then area(s,b,b.x,180,22);phase(b,'recover',1.5)
    elseif b.phase=='shower_warning' then shower(s,b)
    elseif b.phase=='burrow_warning' then b.origin=b.x;b.target=math.max(100,math.min(860,b.target));b.burrowHits={};stones(s,b);phase(b,'burrow',1.2)
    elseif b.phase=='burrow' then b.x=b.target;phase(b,'slam_warning',.7)
    elseif b.phase=='slam_warning' then area(s,b,b.x,130,24);phase(b,'recover',2)
    elseif b.phase=='stones_warning' then stones(s,b);phase(b,'recover',2.5)
    elseif b.phase=='combo_warning' then
     area(s,b,b.x+b.facing*95,b.combo==3 and 145 or 115,b.combo==3 and 26 or 18)
     if b.combo==3 then phase(b,'recover',2.5) else b.combo=b.combo+1;phase(b,'combo_warning',b.combo==3 and 1 or .7) end
    elseif b.phase=='breath_warning' then b.breathClock=.2+dt;b.breathPulses=0;phase(b,'breath',3)
    elseif b.phase=='breath' then phase(b,'recover',2.5) end
   end
   if b.phase=='breath' then
    b.breathClock=b.breathClock-dt
    if b.breathClock<=0 then
     b.breathClock=b.breathClock+.7;b.breathPulses=b.breathPulses+1
     local boxes=breathBoxes(b)
     for _,a in ipairs(s.actors) do
      for _,box in ipairs(boxes) do
       if a.x+12>box.x and a.x-12<box.x+box.w and a.y>box.y and a.y-55<box.y+box.h then C.damageActor(s,a,12,b,true,true);break end
      end
     end
    end
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='primo' then s.primo=nil;return end
  for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end;s.camera=0
  if b.hp<=0 then b.stones={};b.fields={};b.respawn=1e9;phase(b,'defeated',1e9) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.primo;if not b then return f end
  local labels={awake='目覚める',claw_warning='前方への爪攻撃',spin_warning='周囲への回転攻撃',shower_warning='原岩噴射・残るシールドで反射',burrow_warning='潜行の予告',burrow='潜行・着地点から離れる',slam_warning='地上へ出現・叩きつけ',stones_warning='元素石を散布',recover='攻撃の隙',stunned='反射成功・耐性低下',defeated='撃破'}
  labels.combo_warning='3連撃 '..tostring(b.combo or 1)..'/3・背後か範囲外へ';labels.breath_warning='ブレス予告・背後へ回る';labels.breath='前方へブレス・背後が安全'
  f.location='エンシェントヴィシャップ（'..names[b.element]..'）・本体絵は水個体を仮共用'
  f.boss={name='エンシェントヴィシャップ（試作素材）',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,element=b.element,reflections=b.reflections,lastReflection=b.lastReflection}
  f.boss.combo=b.combo;f.boss.breathPulses=b.breathPulses;f.boss.x=b.x;f.boss.facing=b.facing
  f.boss.fields=b.fields
  f.boss.rearResponses=b.rearResponses or 0;f.boss.rearResponse=b.rearResponse
  if b.phase=='spin_warning' and b.rearResponse then f.boss.label='背後を察知・回転攻撃の予告' end
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=math.floor(x),y=y,w=w,h=h,color=color} end
  if b.hp>0 then
   if b.phase~='burrow' then C.drawPrimoArt(f,b,mode,profile)
   else rect(b.x-55,472,110,8,'#83d6ea') end
  end
  if b.hp>0 then rect(b.x-12,315,24,8,colors[b.element]) end
  if b.phase=='claw_warning' then rect(b.x+b.facing*95-115,470,230,10,'#ff8b7b') end
  if b.phase=='spin_warning' then rect(b.x-180,470,360,10,'#ff8b7b') end
  if b.phase=='combo_warning' then local r=b.combo==3 and 145 or 115;rect(b.x+b.facing*95-r,470,r*2,10,'#ff8b7b') end
  if b.phase=='breath_warning' or b.phase=='breath' then
   for _,box in ipairs(breathBoxes(b)) do
    if b.phase=='breath' then rect(box.x,box.y,box.w,box.h,colors[b.element])
    else rect(box.x,box.y,box.w,3,'#ff8b7b');rect(box.x,box.y+box.h-3,box.w,3,'#ff8b7b') end
   end
  end
  if b.phase=='shower_warning' then rect(b.x-330,250,660,4,'#83d6ea');rect(b.x-330,476,660,4,'#ff8b7b') end
  if b.phase=='burrow' or b.phase=='burrow_warning' or b.phase=='slam_warning' then rect(b.target-130,470,260,10,'#ff8b7b') end
  if b.phase=='burrow' or b.phase=='burrow_warning' then rect(math.min(b.origin,b.target)-55,477,math.abs(b.target-b.origin)+110,3,'#ff8b7b') end
  for _,rock in ipairs(b.stones) do
   -- The warning covers the union of the elemental field's later pulses.
   local total=({hydro=7,pyro=6,cryo=3,electro=1})[b.element]
   for pulse=1,total do for _,box in ipairs(fieldBoxes({x=rock.x,element=b.element},pulse)) do rect(box.x,box.y,box.w,2,'#ff8b7b');rect(box.x,box.y+box.h-2,box.w,2,'#ff8b7b') end end
   rect(rock.x-12,450,24,22,colors[b.element])
  end
  for _,field in ipairs(b.fields) do if field.flash>0 or field.element=='pyro' then for _,box in ipairs(field.boxes or {}) do rect(box.x,box.y,box.w,box.h,colors[field.element]) end end end
  f.commands=#f.draws;return f
 end
end
