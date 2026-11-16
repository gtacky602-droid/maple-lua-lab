-- Cryo Regisvine 2D adaptation. Timing, core durability and damage are lab proposals.
return function(C)
 local action,step,frame,after,factor=C.action,C.step,C.frame,C.afterElementHit,C.damageFactor
 local function phase(b,p,t) b.phase=p;b.timer=t end
 local function beamCells(b,callback)
  for _,ray in ipairs(b.beams or {}) do
   local count=math.ceil(math.sqrt((ray.x2-ray.x1)^2+(ray.y2-ray.y1)^2)/7)
   for i=0,count do local t=i/count;callback(ray.x1+(ray.x2-ray.x1)*t,ray.y1+(ray.y2-ray.y1)*t) end
  end
 end
 local function height(b)
  b.y=480;b.hitTop=b.phase=='down' and 480 or 350;b.hitBottom=480
  b.coreY=(b.corePosition=='head' and b.phase~='down' and b.phase~='slam_warning') and 350 or 480
 end
 local function hurt(s,b,x,r,damage)
  for _,a in ipairs(s.actors) do if a.hp>0 and math.abs(a.x-x)<=r and a.y>390 then C.damageActor(s,a,damage,b,false,true) end end
 end
 function C.damageFactor(s,cast,e)
  return (factor and factor(s,cast,e) or 1)*(e==s.regisvine and e.phase~='down' and .2 or 1)
 end
 function C.afterElementHit(s,cast,e,element)
  if e==s.regisvine and e.hp>0 and e.core>0 and e.phase~='down' and not cast.reaction and math.abs(cast.y-e.coreY)<(cast.vertical or 75) and (not cast.upward or e.coreY-cast.y<75) then
   local amount=({pyro=1,electro=.5,anemo=.25,geo=.25,physical=.1})[element] or 0
   local key=tostring(cast.id)..':'..(cast.key or 'unknown')
   if amount>0 and s.t>=(e.coreClocks[key] or -1) then
    e.coreClocks[key]=s.t+.25;e.core=math.max(0,e.core-amount)
    if e.core<=0 then e.frozenGround=nil;e.beams=nil;e.breaks=e.breaks+1;phase(e,'down',10);height(e) end
   end
  end
  if after then after(s,cast,e,element) end
 end
 function C.action(s,key)
  if key=='boss_cryo_regisvine' then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='cryo_regisvine'
   s.campaign.message='急凍樹：炎で核を壊すと10秒ダウン。2回破壊後は高い花冠を狙う。足場・数値は2D試作。'
   s.worldwidth=960;s.platforms={{x=0,y=480,w=960},{x=380,y=340,w=150},{x=730,y=340,w=150}}
   local b={id=26020101,x=640,home=640,y=480,hp=750,maxhp=750,respawn=1e9,cd=999,warning=0,kind=1,boss=true,custom=true,core=6,coreMax=6,coreClocks={},breaks=0,corePosition='root',cycle=0,resist={cryo=.7}}
   phase(b,'ready',2);height(b);s.enemies={b};s.regisvine=b;return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='cryo_regisvine' then s.regisvine=nil end
 end
 function C.step(s,dt,input)
  local b=s.regisvine;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp>0 then
   b.timer=b.timer-dt
   if b.timer<=0 then
    if b.phase=='down' then phase(b,'rise_warning',1.2)
    elseif b.phase=='rise_warning' then
     hurt(s,b,b.x,180,30);b.core=6;b.coreClocks={};b.corePosition=b.breaks>=2 and 'head' or 'root';b.frozenGround={kind=b.corePosition=='head' and 'inner' or 'outer',starts=s.t+1.5,expires=s.t+9.5,nextHit={}};phase(b,'ready',2)
    elseif b.phase=='ready' or b.phase=='recover' then
     b.cycle=b.cycle+1;b.target=s.actors[s.active].x;b.slams=0
     if b.cycle%3==0 then
      b.beams={{x1=b.x-65,y1=300,x2=b.target+90,y2=475},{x1=b.x+65,y1=300,x2=b.target-90,y2=475}};b.beamHits={};phase(b,'beam_warning',1.3)
     else phase(b,b.cycle%3==1 and 'slam_warning' or 'ice_warning',1.1) end
    elseif b.phase=='slam_warning' then
     hurt(s,b,b.target,95,22);b.slams=b.slams+1
     if b.slams<3 then b.target=s.actors[s.active].x;phase(b,'slam_warning',.9) else phase(b,'recover',2) end
    elseif b.phase=='beam_warning' then phase(b,'beam_active',.7)
    elseif b.phase=='beam_active' then b.beams=nil;phase(b,'recover',2)
    elseif b.phase=='ice_warning' then
     for i=-1,1 do C.spawnEnemyProjectile(s,b.x,310,s.active,math.atan(s.actors[s.active].y-340,s.actors[s.active].x-b.x)+i*.25,{homingTime=1.5,speed=200,damage=18,life=5,source=b.id,color='#a4dfff'}) end
     phase(b,'recover',2)
    end
   end
   height(b)
   if b.phase=='beam_active' then
    beamCells(b,function(x,y)
     for _,a in ipairs(s.actors) do
      if a.hp>0 and not b.beamHits[a.id] and x+7>=a.x-14 and x-7<=a.x+14 and y+7>=a.y-55 and y-7<=a.y then
       b.beamHits[a.id]=true;C.damageActor(s,a,28,b,false,true)
      end
     end
    end)
   end
   local g=b.frozenGround
   if g and s.t>=g.expires then b.frozenGround=nil
   elseif g and s.t>=g.starts then
    for _,a in ipairs(s.actors) do
     local inside=math.abs(a.x-b.x)<200
     if a.hp>0 and a.y>=475 and (g.kind=='inner' and inside or g.kind=='outer' and not inside) and s.t>=(g.nextHit[a.id] or -1) then
      g.nextHit[a.id]=s.t+1;C.damageActor(s,a,10,b,false,false)
     end
    end
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='cryo_regisvine' then s.regisvine=nil;return end
  for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end;s.camera=0
  if b.hp<=0 then
   for i=#(s.projectiles or {}),1,-1 do if s.projectiles[i].source==b.id then table.remove(s.projectiles,i) end end
   b.frozenGround=nil;b.beams=nil;phase(b,'defeated',1e9);b.respawn=1e9;s.campaign.message='急凍樹の試作を撃破。専用報酬と残りの攻撃は制作中。' end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.regisvine;if not b then return f end
  local labels={ready='核を狙う',beam_warning='交差ビーム予告・線から離れる',beam_active='交差ビーム',slam_warning='3連叩きつけ予告',ice_warning='追尾氷弾の予告',recover='攻撃後の隙',down='ダウン・攻撃の好機',rise_warning='起き上がり・近接から離れる',defeated='撃破'}
  f.location='急凍樹・2D試作';f.boss={name='急凍樹（仮素材）',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase]..' ／ 核 '..b.core..'/6',timer=b.timer,core=b.core,corePosition=b.corePosition,coreY=b.coreY,breaks=b.breaks,frozenGround=b.frozenGround and {kind=b.frozenGround.kind,warning=s.t<b.frozenGround.starts,seconds=math.max(0,b.frozenGround.expires-s.t)} or nil}
  local function rect(x,y,w,h,c) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=c} end
  if b.hp>0 then
   if C.drawRegisvineArt then C.drawRegisvineArt(f,b,mode,profile) end
   if b.core>0 then rect(b.x-12,b.coreY-53,24,26,'#ffda75') end
   if b.phase=='slam_warning' then rect(b.target-95,468,190,12,'#ff785a') end
   if b.phase=='ice_warning' then rect(b.x-75,290,20,20,'#a4dfff');rect(b.x+55,290,20,20,'#a4dfff') end
   if b.beams then beamCells(b,function(x,y) local size=b.phase=='beam_active' and 14 or 4;rect(x-size/2,y-size/2,size,size,b.phase=='beam_active' and '#bdeeff' or '#ffbd79') end) end
   if b.frozenGround then
    local g=b.frozenGround;local color=s.t<g.starts and '#ffbd79' or '#78c5ef'
    if g.kind=='inner' then rect(b.x-200,475,400,5,color) else rect(0,475,b.x-200,5,color);rect(b.x+200,475,960-b.x-200,5,color) end
   end
   if b.phase=='rise_warning' then rect(b.x-180,468,360,12,'#ff785a') end
  end
  f.commands=#f.draws;return f
 end
end
