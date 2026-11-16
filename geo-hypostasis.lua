-- Geo Hypostasis: 2D prototype. Pillar gauge is a lab abstraction, not HP damage.
return function(C)
 local action,step,frame,intercept=C.action,C.step,C.frame,C.interceptHit
 local function phase(b,p,t)
  b.phase=p;b.timer=t;b.invulnerable=p~='down' and p~='perch_exposed' and p~='ground_exposed'
  b.y=b.activePillar and p~='down' and p~='revival' and p~='defeated' and 330 or 480
  if p~='rain_warning' and p~='rain_fall' then b.rainTargets=nil;b.rocks=nil end
  if p~='seal_tracking' and p~='seal_warning' and p~='seal_impact' then b.sealX=nil end
 end
 local function clearShots(s,b)
  for i=#(s.projectiles or {}),1,-1 do if s.projectiles[i].source==b.id then table.remove(s.projectiles,i) end end
 end
 local function clearPillars(s)
  for i=#s.enemies,1,-1 do if s.enemies[i].geoPillar then table.remove(s.enemies,i) end end
 end
 local function clearWard(s,b)
  for i=#s.enemies,1,-1 do if s.enemies[i].geoWard then table.remove(s.enemies,i) end end
  b.ward=nil;b.crystal=nil;b.pulseFlash=nil
 end
 local function pillar(s,b,index,x,revival)
  local e={id=(revival and 99043300 or 99043200)+index,index=index,geoPillar=true,revivalPillar=revival,x=x,home=x,y=480,hitTop=350,hitBottom=480,hp=6,maxhp=6,clocks={},custom=true,boss=true,noRewards=true,respawn=1e9,cd=999,warning=0,kind=1}
  s.enemies[#s.enemies+1]=e;return e
 end
 local function choose(s,b)
  b.activePillar=nil
  for offset=1,4 do
   local index=((b.lastPillar or 0)+offset-1)%4+1
   for _,e in ipairs(s.enemies) do if e.geoPillar and not e.revivalPillar and e.hp>0 and e.index==index then b.activePillar=e;b.x=e.x;b.lastPillar=index;break end end
   if b.activePillar then break end
  end
  phase(b,b.activePillar and 'perched' or 'ground_ready',2)
 end
 local function normalPillars(s,b)
  clearPillars(s);b.lastPillar=0;for i=1,4 do pillar(s,b,i,150+(i-1)*220,false) end;choose(s,b)
 end
 local function groundHit(s,b,x,r,damage)
  for _,a in ipairs(s.actors) do if math.abs(a.x-x)<=r and a.y>410 then C.damageActor(s,a,damage,b,false,true) end end
 end
 local function rainWarning(s,b)
  b.rainTargets={};local target=s.actors[s.active].x
  for i=-2,2 do b.rainTargets[#b.rainTargets+1]=math.max(45,math.min(915,target+i*100)) end
  phase(b,'rain_warning',1.2)
 end
 function C.interceptHit(s,cast,e,element)
  if e.geoWard then
   local b=s.geoHypostasis;if not b or cast.reaction then return true end
   local key=tostring(cast.id)..':'..(cast.key or 'hit')
   if s.t>=(e.clocks[key] or -1) then
    e.clocks[key]=s.t+.25;e.hp=math.max(0,e.hp-1)
    if e.hp==0 then b.ward={x=e.x,radius=110};b.crystal=nil end
   end
   return true
  end
  if not e.geoPillar then return intercept and intercept(s,cast,e,element) end
  local b=s.geoHypostasis;if not b or cast.reaction then return true end
  local part=cast.applicationElement or element
  -- No weapon-class data yet: Geo is strong, physical is weaker, other elements do not erode this prototype gauge.
  local strength=part=='geo' and 2 or part=='physical' and .5 or 0
  local key=tostring(cast.id)..':'..(cast.key or 'hit')
  if strength>0 and s.t>=(e.clocks[key] or -1) then
   e.clocks[key]=s.t+.25;e.hp=math.max(0,e.hp-strength)
   if e.hp==0 then
    if e.revivalPillar then
     b.broken[e.index]=true;b.destroyed=b.destroyed+1
     if b.destroyed==3 then C.defeatEnemy(s,b,cast.id);b.respawn=1e9;phase(b,'defeated',1e9) end
    elseif b.activePillar==e then
     b.activePillar=nil;b.breaks=b.breaks+1;clearShots(s,b);clearWard(s,b);phase(b,'down',6)
    end
   end
  end
  return true
 end
 function C.action(s,key)
  if key=='boss_geo' then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='geo'
   s.campaign.message='無相の岩：岩攻撃で柱を壊し、落ちた核へ別元素で攻撃。最後は復活柱3本。破壊量・外見は仮。'
   s.platforms={{x=0,y=480,w=960}};s.worldwidth=960
   local b={id=20040301,x=150,home=150,y=330,hp=500,maxhp=500,minhp=1,respawn=1e9,cd=999,warning=0,kind=1,custom=true,boss=true,immune='geo',resist={pyro=.1,cryo=.1,electro=.1,hydro=.1,dendro=.1,anemo=.1},cycle=0,breaks=0,broken={},destroyed=0}
   s.enemies={b};s.geoHypostasis=b;normalPillars(s,b);return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='geo' then s.geoHypostasis=nil end
 end
 function C.step(s,dt,input)
  local b=s.geoHypostasis;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp>0 then
   if b.hp<=25 and b.phase~='revival' then
    clearShots(s,b);clearWard(s,b);clearPillars(s);b.activePillar=nil;b.x=480;phase(b,'revival',15)
    for i=1,3 do if not b.broken[i] then pillar(s,b,i,180+(i-1)*300,true) end end
   end
   b.timer=b.timer-dt
   if b.timer<=0 then
    if b.phase=='revival' then b.hp=b.maxhp*({.15,.35,.5})[3-b.destroyed];normalPillars(s,b)
    elseif b.phase=='down' then choose(s,b)
    elseif b.phase=='perched' then
     b.cycle=b.cycle+1;local nextPhase=({'shots_warning','pulse_warning','barrage_warning','seal_tracking'})[(b.cycle-1)%4+1]
     if nextPhase=='barrage_warning' then
      clearWard(s,b);b.crystal={id=99043401,x=b.x+75,home=b.x+75,y=480,hp=3,maxhp=3,clocks={},geoWard=true,custom=true,boss=true,noRewards=true,respawn=1e9,cd=999,warning=0,kind=1}
      s.enemies[#s.enemies+1]=b.crystal
     end
     phase(b,nextPhase,nextPhase=='barrage_warning' and 2 or 1.2)
    elseif b.phase=='shots_warning' then b.shots=0;phase(b,'shots',0)
    elseif b.phase=='shots' then
     C.spawnEnemyProjectile(s,b.x,300,s.active,nil,{source=b.id,speed=220,damage=14,life=5,homingTime=0,color='#e8bf68'})
     b.shots=b.shots+1;phase(b,b.shots==3 and 'perch_exposed' or 'shots',b.shots==3 and 3 or .5)
    elseif b.phase=='pulse_warning' then
     for _,e in ipairs(s.enemies) do if e.geoPillar and e.hp>0 then groundHit(s,b,e.x,85,22) end end
     phase(b,'perch_exposed',3)
    elseif b.phase=='barrage_warning' then b.pulseClock=.7;b.pulses=0;phase(b,'barrage',6)
    elseif b.phase=='barrage' then clearWard(s,b);phase(b,'perch_exposed',3)
    elseif b.phase=='seal_tracking' then phase(b,'seal_warning',.8)
    elseif b.phase=='seal_warning' then
     for _,a in ipairs(s.actors) do if math.abs(a.x-b.sealX)<=40 and a.y>=240 and a.y-55<=480 then C.damageActor(s,a,26,b,false,true) end end
     phase(b,'seal_impact',.25)
    elseif b.phase=='seal_impact' then phase(b,'perch_exposed',3)
    elseif b.phase=='perch_exposed' then choose(s,b)
    elseif b.phase=='ground_ready' then
     b.groundCycle=(b.groundCycle or 0)+1
     if b.groundCycle==2 then b.rainVolley=0;rainWarning(s,b)
     elseif b.groundCycle%3==0 then b.x=math.max(130,math.min(830,s.actors[s.active].x));phase(b,'clap_warning',1.1)
     else b.target=s.actors[s.active].x;phase(b,'hammer_warning',1.2) end
    elseif b.phase=='rain_warning' then
     b.rocks={};for _,x in ipairs(b.rainTargets) do b.rocks[#b.rocks+1]={x=x,y=80,hits={}} end;phase(b,'rain_fall',1)
    elseif b.phase=='hammer_warning' then groundHit(s,b,b.target,120,28);phase(b,'ground_exposed',4)
    elseif b.phase=='clap_warning' then groundHit(s,b,b.x,125,28);phase(b,'clap_impact',.25)
    elseif b.phase=='clap_impact' then phase(b,'ground_exposed',4)
    elseif b.phase=='ground_exposed' then phase(b,'ground_ready',2) end
   end
   if b.phase=='seal_tracking' then b.sealX=s.actors[s.active].x end
   if b.phase=='rain_fall' then
    local finished=true
    for _,rock in ipairs(b.rocks) do
     local old=rock.y;rock.y=math.min(480,rock.y+1000*dt)
     for _,a in ipairs(s.actors) do
      if not rock.hits[a.id] and math.abs(a.x-rock.x)<26 and a.y>=old-12 and a.y-55<=rock.y+12 then
       if C.damageActor(s,a,18,b,false,true)>0 then rock.hits[a.id]=true end
      end
     end
     if rock.y<480 then finished=false end
    end
    if finished then
     b.rainVolley=b.rainVolley+1;b.rocks=nil
     if b.rainVolley<3 then rainWarning(s,b) else phase(b,'ground_exposed',4) end
    end
   end
   if b.phase=='barrage' then
    b.pulseClock=b.pulseClock-dt
    if b.pulseClock<=0 then
     b.pulseClock=b.pulseClock+.9;b.pulses=b.pulses+1;b.pulseFlash=s.t+.18
     for _,a in ipairs(s.actors) do
      local sheltered=b.ward and math.abs(a.x-b.ward.x)<=b.ward.radius
      if not sheltered and a.y>410 then C.damageActor(s,a,18,b,false,true) end
     end
    end
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='geo' then s.geoHypostasis=nil;return end
  for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end;s.camera=0
  if b.hp<=0 then clearWard(s,b);clearPillars(s);clearShots(s,b);b.respawn=1e9;phase(b,'defeated',1e9) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.geoHypostasis;if not b then return f end
  f.location='無相の岩・2Dアレンジ試作'
  local labels={perched='岩で柱を壊して核を落とす',shots_warning='岩弾の予告',shots='岩弾を移動で回避',pulse_warning='柱の周囲に衝撃波・跳ぶ／離れる',perch_exposed='柱上の核が露出',down='核が落下・岩以外で攻撃',ground_ready='柱が全壊・地上戦',hammer_warning='叩きつけ予告・離れる',ground_exposed='地上の核が露出',revival='復活柱3本を破壊 '..b.destroyed..'/3',defeated='撃破'}
  labels.barrage_warning='結晶を壊して防護場を作る・連続衝撃波の予告';labels.barrage='防護場の中で衝撃波を防ぐ'
  labels.rain_warning='落石の予告・赤い印の間へ移動';labels.rain_fall='落石・横へ避ける'
  labels.seal_tracking='水色の印が追尾中';labels.seal_warning='赤い印で位置確定・横へ離れる';labels.seal_impact='石柱が出現'
  labels.clap_warning='挟撃の予告・跳ぶ／外へ離れる';labels.clap_impact='挟撃'
  f.boss={name='無相の岩（試作素材）',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,brokenPillars=b.breaks,revivalDestroyed=b.destroyed}
  f.boss.ward=b.ward;f.boss.supportCrystal=b.crystal and {x=b.crystal.x,hp=b.crystal.hp} or nil;f.boss.pulses=b.pulses or 0
  f.boss.rainTargets=b.rainTargets;f.boss.activePillar=b.activePillar and b.activePillar.index or nil
  f.boss.sealX=b.sealX
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color} end
  for _,e in ipairs(s.enemies) do if e.geoPillar and e.hp>0 then
   C.drawGeoPart(f,'pillar',e.x,480,130,mode,profile);rect(e.x-27,340,54*e.hp/6,5,'#ffe8a0')
   if e.revivalPillar then rect(e.x-8,325,16,8,'#ffc65f') end
   if b.activePillar==e then rect(e.x-30,480,60,4,'#fff3c6') end
   if b.phase=='pulse_warning' then rect(e.x-85,470,170,10,'#ff7357') end
  end end
  if b.hp>0 then
   C.drawGeoPart(f,'core',b.x,b.y-14,44,mode,profile)
   if b.invulnerable then for i=1,6 do local angle=i*math.pi/3+s.t*.5;C.drawGeoPart(f,'shell',b.x+math.cos(angle)*50,b.y-14+math.sin(angle)*32,38,mode,profile) end end
  end
  if b.phase=='hammer_warning' then rect(b.target-120,470,240,10,'#ff7357') end
  if b.sealX then
   if b.phase=='seal_impact' then C.drawGeoPart(f,'pillar',b.sealX,480,240,mode,profile)
   else local color=b.phase=='seal_tracking' and '#65dfef' or '#ff7357';rect(b.sealX-40,472,80,8,color);rect(b.sealX-40,240,3,240,color);rect(b.sealX+37,240,3,240,color) end
  end
  if b.phase=='clap_warning' or b.phase=='clap_impact' then
   rect(b.x-125,470,250,10,'#ff7357')
   local offset=b.phase=='clap_warning' and 125 or 24
   for _,side in ipairs({-1,1}) do for row=0,2 do C.drawGeoPart(f,'shell',b.x+side*offset,480-row*30,32,mode,profile) end end
  end
  if b.phase=='rain_warning' then for _,x in ipairs(b.rainTargets) do rect(x-30,472,60,8,'#ff7357') end end
  for _,rock in ipairs(b.rocks or {}) do C.drawGeoPart(f,'shell',rock.x,rock.y+12,24,mode,profile) end
  if b.phase=='barrage_warning' or b.phase=='barrage' then rect(20,476,920,4,'#b8925c') end
  if b.pulseFlash and s.t<b.pulseFlash then rect(20,462,920,18,'#efbe69') end
  if b.crystal then C.drawGeoPart(f,'core',b.crystal.x,470,36,mode,profile);rect(b.crystal.x-20,420,40*b.crystal.hp/3,4,'#ffe8a0') end
  if b.ward then
   local x=b.ward.x-b.ward.radius;local w=2*b.ward.radius
   rect(x,350,w,4,'#ffe7a6');rect(x,350,4,130,'#ffe7a6');rect(x+w-4,350,4,130,'#ffe7a6');rect(x,476,w,4,'#ffe7a6')
  end
  f.commands=#f.draws;return f
 end
end
