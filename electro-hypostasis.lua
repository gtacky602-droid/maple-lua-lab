-- Electro Hypostasis, provisional 2D adaptation. Prism gauge is independent of ATK.
return function(C)
 local action,step,frame,intercept=C.action,C.step,C.frame,C.interceptHit
 local function phase(b,p,t)
  b.phase=p;b.timer=t;b.invulnerable=p~='exposed' and p~='laser' and p~='air_burst' and p~='air_recover' and p~='cage'
  b.flying=p=='air_burst' or p=='air_recover';b.y=b.flying and 350 or 480
  if p~='laser' and p~='laser_warning' then b.laserCells=nil end
 end
 local function clearShots(s,b)
  for i=#(s.projectiles or {}),1,-1 do if s.projectiles[i].source==b.id then table.remove(s.projectiles,i) end end
 end
 local function removeWall(s,id)
  for i=#(s.solids or {}),1,-1 do if s.solids[i].electroCage and (not id or s.solids[i].owner==id) then table.remove(s.solids,i) end end
 end
 local function clearCage(s,b)
  removeWall(s)
  for i=#s.enemies,1,-1 do if s.enemies[i].electroPillar then table.remove(s.enemies,i) end end
  if b then b.boltX=nil;b.boltFlash=nil end
 end
 local function laserCells(b)
  local cells={}
  for ray=0,3 do
   local angle=(b.laserAngle or 0)+ray*math.pi/2
   for r=80,1100,7 do
    local x=math.floor(b.x+math.cos(angle)*r-7);local y=math.floor(430+math.sin(angle)*r-7)
    if x>=0 and x<=946 and y>=50 and y<=466 then cells[#cells+1]={x=x,y=y} end
   end
  end
  return cells
 end
 local function clear(s,b)
  for i=#s.enemies,1,-1 do if s.enemies[i].electroPrism then table.remove(s.enemies,i) end end
 end
 local function hurt(s,b,x,r,n)
  for _,a in ipairs(s.actors) do if math.abs(a.x-x)<=r and a.y>410 then C.damageActor(s,a,n,b,false,true) end end
 end
 function C.interceptHit(s,cast,e,element)
  if e.electroPillar then
   local part=cast.applicationElement or element;local key=tostring(cast.id)..':'..(cast.key or 'hit')
   if not cast.reaction and part~='physical' and s.t>=(e.clocks[key] or -1) then
    e.clocks[key]=s.t+.5;e.hp=math.max(0,e.hp-1);if e.hp==0 then removeWall(s,e.id) end
   end
   return true
  end
  if not e.electroPrism then return intercept and intercept(s,cast,e,element) end
  local b=s.electroHypostasis
  if not b or b.phase~='revival' or cast.reaction then return true end
  local strength=({pyro=1,cryo=1,dendro=1,anemo=.5,geo=.5})[cast.applicationElement or element] or 0
  local key=tostring(cast.id)..':'..(cast.key or 'hit')
  if strength>0 and s.t>=(e.clocks[key] or -1) then
   e.clocks[key]=s.t+.5;e.hp=math.max(0,e.hp-strength)
   if e.hp==0 then
    b.broken[e.index]=true;b.destroyed=b.destroyed+1
    if b.destroyed==3 then C.defeatEnemy(s,b,cast.id);b.respawn=1e9;phase(b,'defeated',1e9) end
   end
  end
  return true
 end
 function C.action(s,key)
  if key=='boss_electro' then
   if s.paused then return end
   clearCage(s,s.electroHypostasis)
   action(s,'campaign');action(s,'town');s.campaign.zone='electro'
   s.campaign.message='無相の雷：3連撃の予告を避ける。終盤のプリズムは炎・氷・草で破壊。外見・数値は仮。'
   s.platforms={{x=0,y=480,w=960}};s.worldwidth=960
   local b={id=20040101,x=620,home=620,y=480,hp=420,maxhp=420,minhp=1,respawn=1e9,cd=999,warning=0,kind=1,custom=true,boss=true,immune='electro',cycle=0,broken={},destroyed=0}
   s.enemies={b};s.electroHypostasis=b;phase(b,'shielded',2);return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='electro' then clearCage(s,s.electroHypostasis);s.electroHypostasis=nil end
 end
 function C.step(s,dt,input)
  local b=s.electroHypostasis;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp>0 then
   if b.hp<=21 and b.phase~='revival' then
    clear(s,b);clearCage(s,b);clearShots(s,b);phase(b,'revival',15);b.x=480
    for i=1,3 do if not b.broken[i] then
     local x=150+(i-1)*330
     s.enemies[#s.enemies+1]={id=99040100+i,index=i,electroPrism=true,x=x,home=x,y=480,hp=3,maxhp=3,clocks={},custom=true,boss=true,noRewards=true,respawn=1e9,cd=999,warning=0,kind=1}
    end end
   end
   b.timer=b.timer-dt
   if b.timer<=0 then
    if b.phase=='revival' then
     local left=3-b.destroyed;clear(s,b);b.hp=b.maxhp*({.15,.35,.5})[left];phase(b,'exposed',4)
    elseif b.phase=='shielded' then
     b.cycle=b.cycle+1;b.target=s.actors[s.active].x;b.combo=1
     local attack=({'combo_warning','wave_warning','laser_warning','drill_warning','air_warning','cage_warning','clap_warning'})[(b.cycle-1)%7+1]
     if attack=='clap_warning' then b.x=math.max(130,math.min(830,b.target));b.clapCenter=b.x end
     if attack=='cage_warning' then b.cageCenter=math.max(180,math.min(780,b.target)) end
     if attack=='air_warning' then b.x=620;b.volleys=0 end
     if attack=='laser_warning' then b.x=480;b.laserAngle=-.25 end
     if attack=='drill_warning' then
      b.drillDir=b.target<480 and -1 or 1;b.x=b.drillDir==1 and 80 or 880;b.drillHits={}
     end
     phase(b,attack,attack=='laser_warning' and 1.5 or 1.1)
    elseif b.phase=='combo_warning' then
     hurt(s,b,b.target,b.combo==3 and 145 or 85,b.combo==3 and 28 or 18)
     if b.combo<3 then b.combo=b.combo+1;b.target=s.actors[s.active].x;phase(b,'combo_warning',.85)
     else phase(b,'exposed',4) end
    elseif b.phase=='wave_warning' then b.waveX=30;phase(b,'wave',4)
    elseif b.phase=='wave' then b.waveX=nil;phase(b,'exposed',4)
    elseif b.phase=='laser_warning' then phase(b,'laser',5)
    elseif b.phase=='laser' then phase(b,'collapse_warning',1.1)
    elseif b.phase=='collapse_warning' then hurt(s,b,b.x,120,28);phase(b,'exposed',4)
    elseif b.phase=='drill_warning' then phase(b,'drill',2)
    elseif b.phase=='air_warning' then phase(b,'air_burst',.2)
    elseif b.phase=='air_burst' then
     for _,offset in ipairs({-30,30}) do
      C.spawnEnemyProjectile(s,b.x+offset,320,s.active,nil,{source=b.id,speed=240,damage=16,life=4,homingTime=0,color='#cf8cff'})
     end
     b.volleys=b.volleys+1;phase(b,b.volleys==4 and 'air_recover' or 'air_burst',b.volleys==4 and 1.2 or .65)
    elseif b.phase=='air_recover' then phase(b,'exposed',4)
    elseif b.phase=='cage_warning' then
     clearCage(s,b);s.solids=s.solids or {};b.cageClock=.5;b.boltX=nil
     for i,offset in ipairs({-130,130}) do
      local x=b.cageCenter+offset;local id=99041100+i
      s.enemies[#s.enemies+1]={id=id,x=x,home=x,y=480,hitTop=340,hitBottom=480,hp=3,maxhp=3,clocks={},electroPillar=true,custom=true,boss=true,noRewards=true,respawn=1e9,cd=999,warning=0,kind=1}
      s.solids[#s.solids+1]={x=x-12,y=340,w=24,h=140,electroCage=true,owner=id}
     end
     phase(b,'cage',8)
    elseif b.phase=='cage' then clearCage(s,b);phase(b,'exposed',4)
    elseif b.phase=='clap_warning' then hurt(s,b,b.clapCenter,125,28);phase(b,'clap_impact',.25)
    elseif b.phase=='clap_impact' then phase(b,'exposed',4)
    elseif b.phase=='exposed' then phase(b,'shielded',1.5) end
   end
   if b.phase=='wave' then b.waveX=b.waveX+210*dt;hurt(s,b,b.waveX,35,20) end
   if b.phase=='cage' then
    b.cageClock=b.cageClock-dt
    if b.cageClock<=0 then
     if b.boltX then
      for _,a in ipairs(s.actors) do if math.abs(a.x-b.boltX)<=45 then C.damageActor(s,a,22,b,false,true) end end
      b.boltFlash={x=b.boltX,untilTime=s.t+.18};b.boltX=nil;b.cageClock=.6
     else b.boltX=math.max(b.cageCenter-100,math.min(b.cageCenter+100,s.actors[s.active].x));b.cageClock=.8 end
    end
   end
   if b.phase=='drill' then
    local old=b.x;b.x=math.max(80,math.min(880,b.x+b.drillDir*850*dt))
    for _,a in ipairs(s.actors) do
     if not b.drillHits[a.id] and a.x+12>=math.min(old,b.x)-42 and a.x-12<=math.max(old,b.x)+42 and a.y>410 then
      if C.damageActor(s,a,30,b,false,true)>0 then b.drillHits[a.id]=true end
     end
    end
    if b.x==80 or b.x==880 then phase(b,'exposed',4) end
   end
   if b.phase=='laser' or b.phase=='laser_warning' then
    if b.phase=='laser' then b.laserAngle=b.laserAngle+.35*dt end
    b.laserCells=laserCells(b)
    if b.phase=='laser' then for _,a in ipairs(s.actors) do
     for _,cell in ipairs(b.laserCells) do
      if cell.x<a.x+12 and cell.x+14>a.x-12 and cell.y<a.y and cell.y+14>a.y-60 then C.damageActor(s,a,18,b,false,true);break end
     end
    end end
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='electro' then clearCage(s,b);s.electroHypostasis=nil;return end
  for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end;s.camera=0
  if b.hp<=0 then clear(s,b);clearCage(s,b);clearShots(s,b);b.waveX=nil;b.respawn=1e9;phase(b,'defeated',1e9) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.electroHypostasis;if not b then return f end
  f.location='無相の雷・2Dアレンジ試作'
  local labels={shielded='外殻・攻撃無効',combo_warning='3連撃 '..tostring(b.combo or 1)..'/3：予告から離れる',wave_warning='地面の波・跳んで回避',wave='雷の波・跳んで回避',exposed='核が露出・攻撃可能',revival='炎・氷・草でプリズム破壊 '..b.destroyed..'/3',defeated='撃破'}
  labels.laser_warning='回転光線の予告・核の近くは安全';labels.laser='回転光線・核に攻撃可能';labels.collapse_warning='外殻が収束・核から離れる'
  labels.drill_warning='ドリル突進の予告・近づいたらジャンプ';labels.drill='ドリル突進・ジャンプで回避'
  labels.air_warning='飛翔射撃の予告・動いて回避';labels.air_burst='2発ずつ4連射・跳んで核へ攻撃';labels.air_recover='空中の核が露出'
  labels.cage_warning='檻の予告・囲まれる前に離れる';labels.cage='元素で柱を破壊／跳び越え、落雷予告から離れる'
  labels.clap_warning='挟撃予告・赤い範囲から離れる';labels.clap_impact='挟撃・外殻が閉じる'
  f.boss={name='無相の雷（試作素材）',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,prisms=b.destroyed}
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color} end
  if b.hp>0 then
   C.drawElectroPart(f,'core',b.x,b.y-20,44,mode,profile)
   if b.phase=='clap_warning' or b.phase=='clap_impact' then
    local gap=b.phase=='clap_warning' and 125 or 18
    for _,side in ipairs({-1,1}) do for i=0,2 do C.drawElectroPart(f,'shell',b.x+side*gap,480-i*28,32,mode,profile) end end
   elseif b.flying then
    for i=1,4 do local a=i*math.pi/2;C.drawElectroPart(f,'shell',b.x+math.cos(a)*55,b.y-25+math.sin(a)*45,32,mode,profile) end
   elseif b.phase=='drill' or b.phase=='drill_warning' then
    for i=0,2 do for j=0,i do C.drawElectroPart(f,'shell',b.x-b.drillDir*i*22,445+(j-i/2)*18,28,mode,profile) end end
   elseif b.invulnerable or b.phase=='laser' then for i=1,6 do local a=i*math.pi/3+s.t*.6;C.drawElectroPart(f,'shell',b.x+math.cos(a)*58,449+math.sin(a)*38,38,mode,profile) end end
  end
  if b.phase=='combo_warning' then local r=b.combo==3 and 145 or 85;rect(b.target-r,470,r*2,10,'#ff7357') end
  if b.phase=='wave_warning' then rect(20,470,920,6,'#cf87ff') end
  if b.waveX and b.phase=='wave' then rect(b.waveX-35,425,70,55,'#ac70ea') end
  if b.laserCells then for _,cell in ipairs(b.laserCells) do rect(cell.x,cell.y,14,14,b.phase=='laser' and '#e2a2ff' or '#745086') end end
  if b.phase=='collapse_warning' then rect(b.x-120,470,240,10,'#ff7357') end
  if b.phase=='clap_warning' then rect(b.clapCenter-125,470,250,10,'#ff7357') end
  if b.phase=='cage_warning' then for _,offset in ipairs({-130,130}) do rect(b.cageCenter+offset-12,340,24,140,'#745086') end end
  for _,e in ipairs(s.enemies) do if e.electroPillar and e.hp>0 then
   rect(e.x-12,340,24,140,'#593377');rect(e.x-5,346,10,128,'#cf8cff');rect(e.x-18,330,36*e.hp/3,5,'#ffe18f')
  end end
  if b.boltX then rect(b.boltX-45,472,90,8,'#ff7357') end
  if b.boltFlash and s.t<b.boltFlash.untilTime then rect(b.boltFlash.x-45,50,90,430,'#e2a2ff') end
  if b.phase=='drill_warning' then
   rect(80,474,800,6,'#ff7357')
   for x=160,800,160 do for i=0,3 do rect(x-b.drillDir*i*5,447-i*4,5,8+i*8,'#ffb086') end end
  end
  for _,e in ipairs(s.enemies) do if e.electroPrism and e.hp>0 then
   rect(e.x-22,430,44,50,'#593377');rect(e.x-14,438,28,34,'#d29aff');rect(e.x-24,418,48*e.hp/3,5,'#ffe18f')
  end end
  f.commands=#f.draws;return f
 end
end
