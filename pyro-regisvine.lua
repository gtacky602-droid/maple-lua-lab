-- Pyro Regisvine 2D adaptation; all timing and numerical balance are provisional.
return function(C)
 local action,step,frame,after,factor=C.action,C.step,C.frame,C.afterElementHit,C.damageFactor
 local function clearSeed(s,b)
  if b.seed then for i=#s.enemies,1,-1 do if s.enemies[i]==b.seed then table.remove(s.enemies,i) end end;b.seed=nil end
 end
 local function phase(b,p,t)
  b.phase=p;b.timer=t;b.hitTop=p=='down' and 480 or 350
  b.coreY=b.breaks>=2 and p~='down' and p~='slam_warning' and 350 or 480
 end
 local function damage(s,b,x,r,n)
  for _,a in ipairs(s.actors) do if a.hp>0 and a.y>410 and math.abs(a.x-x)<=r then C.damageActor(s,a,n,b,false,true) end end
 end
 function C.damageFactor(s,cast,e)
  if e.pyroSeed then local element=cast.applicationElement or cast.element;return element=='hydro' and 6 or element=='cryo' and 1.5 or .1 end
  return (factor and factor(s,cast,e) or 1)*(e==s.pyroRegisvine and e.phase~='down' and .2 or 1) end
 function C.afterElementHit(s,cast,e,element)
  if e==s.pyroRegisvine and e.hp>0 and e.core>0 and not cast.reaction and math.abs(cast.y-e.coreY)<(cast.vertical or 75) and (not cast.upward or e.coreY-cast.y<75) then
   local strength=({hydro=1,cryo=.5,electro=.5,anemo=.25,geo=.25,physical=.1})[element] or 0
   local key=tostring(cast.id)..':'..(cast.key or 'hit')
   if strength>0 and s.t>=(e.clocks[key] or -1) then
    e.clocks[key]=s.t+.25;e.core=math.max(0,e.core-strength)
    if e.core==0 then e.breaks=e.breaks+1;clearSeed(s,e);e.burn=nil;e.waves={};e.eruptions=nil;phase(e,'down',10) end
   end
  end
  if after then after(s,cast,e,element) end
 end
 function C.action(s,key)
  if key=='boss_pyro_regisvine' then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='pyro_regisvine'
   s.campaign.message='爆炎樹：水で核を削り、炎波はジャンプ、噴火の予告から離れる。数値・外見は試作。'
   s.platforms={{x=0,y=480,w=960},{x=380,y=340,w=150},{x=740,y=340,w=150}};s.worldwidth=960
   local b={id=26020201,x=640,home=640,y=480,hitBottom=480,hp=800,maxhp=800,respawn=1e9,cd=999,warning=0,kind=1,boss=true,custom=true,resist={pyro=.7},core=6,breaks=0,clocks={},waves={},cycle=0}
   phase(b,'ready',2);s.enemies={b};s.pyroRegisvine=b;return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='pyro_regisvine' then s.pyroRegisvine=nil end
 end
 function C.step(s,dt,input)
  local b=s.pyroRegisvine;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp>0 then
   b.timer=b.timer-dt
   if b.timer<=0 then
    if b.phase=='down' then phase(b,'rise_warning',1.2)
    elseif b.phase=='rise_warning' then damage(s,b,b.x,180,30);b.core=6;b.clocks={};phase(b,'ready',2)
    elseif b.phase=='ready' or b.phase=='recover' then
     b.cycle=b.cycle+1;b.target=s.actors[s.active].x;b.targetActor=s.active
     if b.cycle%5==1 then phase(b,'slam_warning',1.2)
     elseif b.cycle%5==2 then phase(b,'fire_warning',1.1)
     elseif b.cycle%5==4 then phase(b,'seed_warning',1.2)
     elseif b.cycle%5==0 then phase(b,'spin_warning',1.2)
     else b.eruptions={math.max(50,b.target-120),b.target,math.min(910,b.target+120)};phase(b,'eruption_warning',1.5) end
    elseif b.phase=='seed_warning' then
     clearSeed(s,b);b.seedSerial=(b.seedSerial or 0)+1
     b.seed={id=99020200+b.seedSerial,x=b.target,home=b.target,y=480,hp=20,maxhp=20,respawn=1e9,cd=999,warning=0,kind=1,custom=true,boss=true,noRewards=true,pyroSeed=true,immune='pyro',expires=s.t+8}
     s.enemies[#s.enemies+1]=b.seed;phase(b,'recover',2.5)
    elseif b.phase=='spin_warning' then damage(s,b,b.x,210,32);phase(b,'spin_active',.5)
    elseif b.phase=='spin_active' then phase(b,'recover',2.5)
    elseif b.phase=='slam_warning' then
     damage(s,b,b.target,75,24);b.waves={{x=b.target,dir=-1,hits={}},{x=b.target,dir=1,hits={}}};phase(b,'recover',2.8)
    elseif b.phase=='fire_warning' then b.shots=0;phase(b,'fire_burst',0)
    elseif b.phase=='fire_burst' then
     C.spawnEnemyProjectile(s,b.x,310,b.targetActor,nil,{source=b.id,homingTime=0,speed=230,damage=16,life=5,color='#ff9d54'})
     b.shots=b.shots+1;phase(b,b.shots==3 and 'recover' or 'fire_burst',b.shots==3 and 2.5 or .3)
    elseif b.phase=='eruption_warning' then
     for _,x in ipairs(b.eruptions) do damage(s,b,x,45,24) end;phase(b,'eruption_active',.35)
    elseif b.phase=='eruption_active' then b.eruptions=nil;phase(b,'recover',2.5) end
   end
   if b.seed then
    if b.seed.hp<=0 then clearSeed(s,b)
    elseif s.t>=b.seed.expires then b.burn={x=b.seed.x,expires=s.t+6,nextHit={}};clearSeed(s,b) end
   end
   if b.burn then
    if s.t>=b.burn.expires then b.burn=nil
    else for _,a in ipairs(s.actors) do if a.hp>0 and a.y>=475 and math.abs(a.x-b.burn.x)<=110 and s.t>=(b.burn.nextHit[a.id] or -1) then
     b.burn.nextHit[a.id]=s.t+1;C.damageActor(s,a,10,b,false,false)
    end end end
   end
   for i=#b.waves,1,-1 do local w=b.waves[i];local old=w.x;w.x=w.x+w.dir*220*dt
    for _,a in ipairs(s.actors) do
     if a.hp>0 and a.y>435 and not w.hits[a.id] and a.x>=math.min(old,w.x)-25 and a.x<=math.max(old,w.x)+25 then
      w.hits[a.id]=true;C.damageActor(s,a,18,b,false,false)
     end
    end
    if w.x< -30 or w.x>990 then table.remove(b.waves,i) end
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='pyro_regisvine' then s.pyroRegisvine=nil;return end
  for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end;s.camera=0
  if b.hp<=0 then
   clearSeed(s,b);b.burn=nil;b.waves={};b.eruptions=nil;phase(b,'defeated',1e9);b.respawn=1e9
   for i=#(s.projectiles or {}),1,-1 do if s.projectiles[i].source==b.id then table.remove(s.projectiles,i) end end
   s.campaign.message='爆炎樹の試作を撃破。専用素材・報酬・調整は制作中。'
  end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.pyroRegisvine;if not b then return f end
  local labels={seed_warning='火種予告・水で消す',spin_warning='回転予告・近接から離れる',spin_active='回転攻撃',ready='核を狙う',slam_warning='叩きつけ→炎波・跳ぶ',recover='攻撃後の隙',fire_warning='3連火球の予告',fire_burst='火球連射',eruption_warning='噴火予告・印から離れる',eruption_active='噴火',down='ダウン',rise_warning='起き上がり・離れる',defeated='撃破'}
  f.location='爆炎樹・2D試作';f.boss={name='爆炎樹（仮素材）',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase]..' ／ 核 '..b.core..'/6',timer=b.timer,core=b.core,coreY=b.coreY,breaks=b.breaks,seed=b.seed and {hp=b.seed.hp,x=b.seed.x,seconds=math.max(0,b.seed.expires-s.t)} or nil,burn=b.burn and {x=b.burn.x,seconds=math.max(0,b.burn.expires-s.t)} or nil}
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
  if b.hp>0 then
   C.drawPyroRegisvineArt(f,b,mode,profile)
   if b.core>0 then rect(b.x-12,b.coreY-53,24,26,'#ffe6ab') end
   if b.seed then
    rect(b.seed.x-16,450,32,30,'#592c28');rect(b.seed.x-12,448,24,30,'#ff873d');rect(b.seed.x-5,444,10,32,'#ffde79')
    f.draws[#f.draws+1]={kind='text',x=b.seed.x,y=430,text='水で消す '..math.ceil(math.max(0,b.seed.expires-s.t))..'秒',color='#d7f5ff',size=14}
   end
   if b.burn then rect(b.burn.x-110,475,220,5,'#ff6737') end
   if b.phase=='seed_warning' then rect(b.target-20,470,40,10,'#ffe1aa') end
   if b.phase=='spin_warning' or b.phase=='spin_active' then rect(b.x-210,b.phase=='spin_active' and 410 or 470,420,b.phase=='spin_active' and 70 or 10,'#ff873d') end
   if b.phase=='slam_warning' then rect(b.target-75,468,150,12,'#ff6040') end
   if b.phase=='fire_warning' then rect(b.x-70,295,20,20,'#ffb44c') end
   for _,x in ipairs(b.eruptions or {}) do rect(x-45,b.phase=='eruption_active' and 395 or 470,90,b.phase=='eruption_active' and 85 or 10,'#ff7950') end
   for _,w in ipairs(b.waves) do rect(w.x-25,435,50,45,'#ed7138');rect(w.x-12,449,24,31,'#ffdb72') end
   if b.phase=='rise_warning' then rect(b.x-180,468,360,12,'#ff6040') end
  end
  f.commands=#f.draws;return f
 end
end
