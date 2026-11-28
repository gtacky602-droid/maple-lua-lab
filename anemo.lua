-- Anemo Hypostasis: 2D adaptation, provisional numbers and geometric art.
return function(C)
 local action,step,frame=C.action,C.step,C.frame
 local function phase(b,name,seconds)
  b.phase=name;b.timer=seconds;b.invulnerable=name~='exposed'
 end
 local function hurt(s,x,radius,damage,ceiling,telegraphed)
  for _,a in ipairs(s.actors) do
   if a.hp>0 and a.inv<=0 and math.abs(a.x-x)<radius and a.y>(ceiling or 0) then
    C.damageActor(s,a,damage,{id=20040201,x=x,y=480},false,telegraphed)
   end
  end
 end
 function C.action(s,key)
  if key=='boss_anemo' then
   if not s.campaign then action(s,'campaign') end
   action(s,'town');s.campaign.zone='anemo'
   s.campaign.message='無相の風：核が露出したら攻撃。赤い予告から離れ、終盤は風域で跳んで風玉を集める。'
   s.platforms={{x=0,y=480,w=960}};s.worldwidth=960
   local b={id=20040201,x=620,home=620,y=480,hp=300,maxhp=300,minhp=1,
    respawn=1e9,cd=999,warning=0,kind=1,custom=true,boss=true,cycle=0,orbs={},collected=0,
    immune='anemo',resist={pyro=.1,geo=.1,electro=.1,dendro=.1,hydro=.1,cryo=.1}}
   s.enemies={b};s.encounter=b;phase(b,'shielded',2);return
  end
  action(s,key)
  if s.campaign and s.campaign.zone~='anemo' then s.encounter=nil end
 end
 function C.step(s,dt,input)
  local b=s.encounter
  if not b then return step(s,dt,input) end
  if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp<=0 then b.respawn=1e9;phase(b,'defeated',1e9)
  else
   if b.hp<=15 and b.collected<4 and b.phase~='revival' then
    phase(b,'revival',12);b.x=620
    if #b.orbs==0 then for i=1,4 do b.orbs[i]={x=160+(i-1)*200,y=300,taken=false} end end
   end
   local rate=b.phase=='revival' and 1 or C.enemyRate(b)
   b.timer=b.timer-dt*rate
   if b.phase=='revival' then
    local a=s.actors[s.active]
    -- Updrafts turn the normal jump into an aerial collection route.
    for _,o in ipairs(b.orbs) do if not o.taken then
     if math.abs(a.x-o.x)<40 and (input and input.jump) and a.y>280 then a.vy=-380 end
     if a.hp>0 and math.abs(a.x-o.x)<35 and math.abs((a.y-45)-o.y)<45 then o.taken=true;b.collected=b.collected+1 end
    end end
    if b.timer<=0 or b.collected==4 then
     b.hp=math.min(b.maxhp,15+(4-b.collected)*60)
     if b.collected==4 then b.minhp=nil end
     phase(b,'exposed',5)
    end
   elseif b.phase=='shielded' and b.timer<=0 then
    b.cycle=b.cycle+1;b.target=s.actors[s.active].x
    phase(b,b.cycle%2==1 and 'clap_warning' or 'vortex_warning',1.2)
   elseif b.phase=='clap_warning' and b.timer<=0 then
    hurt(s,b.target,125,28,390,true);phase(b,'exposed',4)
   elseif b.phase=='vortex_warning' and b.timer<=0 then
    b.vortices={{x=100,dir=1},{x=850,dir=-1}};phase(b,'vortices',4)
   elseif b.phase=='vortices' then
    for _,v in ipairs(b.vortices) do v.x=v.x+v.dir*95*dt*rate;hurt(s,v.x,42,12) end
    if b.timer<=0 then b.vortices=nil;phase(b,'exposed',4) end
   elseif b.phase=='exposed' and b.timer<=0 then phase(b,'shielded',1.5) end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='anemo' then s.encounter=nil;return end
  for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end
  s.camera=0
  if b.hp<=0 and not b.rewarded then
   b.rewarded=true;b.respawn=1e9;phase(b,'defeated',1e9)
   s.campaign.message='無相の風の2D試作を撃破。町に戻るか、再戦できます。'
  end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.encounter
  if not b then return f end
  f.location='無相の風・2Dアレンジ試作'
  local labels={shielded='外殻・攻撃無効',clap_warning='挟撃予告・離れる',vortex_warning='竜巻予告',vortices='移動する竜巻を回避',exposed='核が露出・攻撃可能',defeated='撃破'}
  labels.revival=string.format('風域でSpace長押し・残った風玉で回復（あと%.1f秒）',math.ceil(math.max(0,b.timer)*10)/10)
  f.boss={name='無相の風（形状仮素材）',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,orbs=b.collected}
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color} end
  if b.hp>0 then
   C.drawAnemoPart(f,'core',b.x,460,44,mode,profile)
   if b.invulnerable then for i=1,6 do
    local a=s.t*.7+i*math.pi/3;local x=b.x+math.cos(a)*62;local y=438+math.sin(a)*52
    C.drawAnemoPart(f,'shell',x,y+19,38,mode,profile)
   end end
  end
  if b.phase=='clap_warning' then rect(b.target-125,470,250,10,'#ff7357') end
  if b.phase=='vortex_warning' then rect(70,470,80,10,'#ff7357');rect(810,470,80,10,'#ff7357') end
  if b.vortices then for _,v in ipairs(b.vortices) do for i=0,6 do rect(v.x-10-i*4,460-i*22,20+i*8,9,'#a2f3d0') end end end
  if b.phase=='revival' then for _,o in ipairs(b.orbs) do if not o.taken then
   rect(o.x-14,o.y-14,28,28,'#b5ffe2');rect(o.x-7,o.y-7,14,14,'#ffffff')
   for i=0,5 do rect(o.x-22,470-i*24,44,3,'#78d8c4') end
  end end end
  f.commands=#f.draws;return f
 end
end
