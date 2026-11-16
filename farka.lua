-- Original Stygian duel, not a recreation of an official character moveset.
return function(C)
 local action,step,frame=C.action,C.step,C.frame
 local function phase(b,p,t) b.phase=p;b.timer=t end
 local function hit(s,b,lo,hi,ceiling,damage)
  for _,a in ipairs(s.actors) do
   if a.hp>0 and a.x>=lo and a.x<=hi and a.y>ceiling then C.damageActor(s,a,damage,b,false,true) end
  end
 end
 function C.action(s,key)
  if key=='boss_farka' then
   if s.paused then return end
   action(s,'campaign');action(s,'town')
   s.campaign.zone='farka';s.campaign.message='幽境・ファルカ模擬戦：突進予告から離れ、低い斬撃は跳ぶ。攻撃後に反撃。'
   s.worldwidth=960;s.platforms={{x=0,y=480,w=960}}
   local b={id=990001,x=680,home=680,y=480,hp=600,maxhp=600,respawn=1e9,cd=999,warning=0,kind=1,custom=true,boss=true,cycle=0}
   phase(b,'ready',2);s.enemies={b};s.farka=b;return
  end
  action(s,key)
  if not s.campaign or s.campaign.zone~='farka' then s.farka=nil end
 end
 function C.step(s,dt,input)
  local b=s.farka
  if not b then return step(s,dt,input) end
  if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  b.slashUntil=math.max(0,(b.slashUntil or 0)-dt)
  if b.hp<=0 then phase(b,'defeated',1e9);b.respawn=1e9
  else
   b.timer=b.timer-dt
   if b.timer<=0 then
    if b.phase=='ready' or b.phase=='recover' then
     b.cycle=b.cycle+1
     if b.cycle%2==1 then
      b.from=b.x;b.target=math.max(60,math.min(900,s.actors[s.active].x));b.facing=b.target>b.x and 1 or -1;b.elapsed=0;b.struck={}
      phase(b,'charge_warning',b.hp<=300 and .8 or 1.2)
     else phase(b,'sweep_warning',1.1) end
    elseif b.phase=='charge_warning' then phase(b,'charge',.45)
    elseif b.phase=='charge' then b.x=b.target;phase(b,'recover',2.2)
    elseif b.phase=='sweep_warning' then
     b.slashUntil=.3;hit(s,b,20,940,420,24)
     phase(b,b.hp<=300 and 'followup_warning' or 'recover',b.hp<=300 and .85 or 2.2)
    elseif b.phase=='followup_warning' then b.slashUntil=.3;hit(s,b,20,940,420,24);phase(b,'recover',2.2) end
   end
   if b.phase=='charge' then
    local old=b.x;b.elapsed=math.min(.45,b.elapsed+dt);b.x=b.from+(b.target-b.from)*b.elapsed/.45
    for _,a in ipairs(s.actors) do
     if not b.struck[a.id] and a.hp>0 and a.x>=math.min(old,b.x)-45 and a.x<=math.max(old,b.x)+45 and a.y>370 then
      b.struck[a.id]=true;C.damageActor(s,a,30,b,false,true)
     end
    end
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='farka' then s.farka=nil;return end
  for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end;s.camera=0
  if b.hp<=0 then phase(b,'defeated',1e9);b.respawn=1e9;s.campaign.message='ファルカ模擬戦突破。専用報酬・4難度・記録は未実装。' end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.farka;if not b then return f end
  local labels={ready='構え',charge_warning='突進予告・進路から離れる',charge='突進',sweep_warning='低い斬撃・跳んで回避',followup_warning='追撃・もう一度跳ぶ',recover='攻撃後の隙',defeated='模擬戦突破'}
  f.location='幽境・ファルカ模擬戦（独自設計／衣装仮案）'
  f.boss={name='ファルカ模擬戦',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,stage=b.hp<=300 and 2 or 1}
  local function rect(x,y,w,h,c) f.draws[#f.draws+1]={kind='rect',x=math.floor(x),y=y,w=math.max(1,w),h=h,color=c} end
  if b.hp>0 then
   C.drawFarkaArt(f,b,mode,profile)
   if b.phase=='charge_warning' then rect(math.min(b.from,b.target)-45,466,math.abs(b.target-b.from)+90,14,'#ff785a') end
   if b.phase=='sweep_warning' or b.phase=='followup_warning' then rect(20,466,920,14,'#ffbe64') end
  end
  f.commands=#f.draws;return f
 end
end
