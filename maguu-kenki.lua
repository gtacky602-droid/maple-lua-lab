-- Single-body encounter prototype. Geometry/timings are lab values, not game measurements.
return function(C)
 local action,step,frame,intercept=C.action,C.step,C.frame,C.interceptHit
 local function phase(b,p,t) b.phase=p;b.timer=t;b.invulnerable=p=='awake' or p=='transition' end
 local function hit(s,b,x,r,damage)
  for _,a in ipairs(s.actors) do if a.hp>0 and math.abs(a.x-x)<r+12 and a.y>390 then C.damageActor(s,a,damage,b,true,true) end end
 end
 local function combo(s,b)
  b.facing=s.actors[s.active].x>b.x and 1 or -1
  b.zoneX=b.x+b.facing*90;b.radius=105
  phase(b,'combo_warning',b.combo==1 and 1.1 or .8)
 end
 local function threat(b)
  if b.phase=='transition' then return b.x,230 end
  if b.phase=='phantom_warning' and b.ghost then return b.ghost.x,b.ghost.r end
  if b.phase:match('_warning$') or b.phase=='push' then return b.zoneX,b.radius end
 end
 local previousAvoid=C.aiAvoidTarget
 function C.aiAvoidTarget(s,a)
  local b=s.maguu
  if b and b.hp>0 then
   local x,r=threat(b)
   if x then
    if math.abs(a.x-x)>r+25 then return a.x end
    local best=nil
    for _,target in ipairs({x-r-35,x+r+35}) do
     if target>=25 and target<=935 and (not best or math.abs(target-a.x)<math.abs(best-a.x)) then best=target end
    end
    return best
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 function C.interceptHit(s,cast,e,element)
  -- Distance proxy until every player attack carries a reliable projectile classification.
  if e==s.maguu and (e.phase=='ready' or e.phase=='recover') and math.abs((cast.x or e.x)-e.x)>220 then e.parries=e.parries+1;e.maskFlash=.25;return true end
  if intercept then return intercept(s,cast,e,element) end
 end
 function C.action(s,key)
  if key=='boss_maguu' then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='maguu';s.worldwidth=960;s.platforms={{x=0,y=480,w=960}}
   s.campaign.message='魔偶剣鬼：仮面・居合いの予告から離れる。HP71%で移行し、その後は分身の追撃。静止素材の試作。'
   local b={id=25090101,x=620,home=620,y=480,hp=700,maxhp=700,minhp=490,kind=1,boss=true,custom=true,respawn=1e9,cd=999,warning=0,cycle=0,stage=1,parries=0,resist={physical=.1,pyro=.1,hydro=.1,cryo=.1,electro=.1,anemo=.1,geo=.1,dendro=.1}}
   s.enemies={b};s.maguu=b;phase(b,'awake',2);return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='maguu' then s.maguu=nil end
 end
 function C.step(s,dt,input)
  local b=s.maguu;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30));b.maskFlash=math.max(0,(b.maskFlash or 0)-dt)
  b.slashTime=math.max(0,(b.slashTime or 0)-dt)
  if b.hp>0 then
   if b.stage==1 and b.hp<=b.maxhp*.71 and b.phase~='transition' then b.ghost=nil;b.mask=nil;b.combo=nil;phase(b,'transition',2.5) end
   b.timer=b.timer-dt
   if b.timer<=0 then
    local p=b.phase
    if p=='transition' then hit(s,b,b.x,230,30);b.stage=2;b.minhp=0;phase(b,'recover',2)
    elseif p=='awake' then phase(b,'ready',1)
    elseif p=='ready' or p=='recover' then
     b.cycle=b.cycle+1;b.target=math.max(60,math.min(900,s.actors[s.active].x));b.from=b.x;b.facing=b.target>b.x and 1 or -1
     local kind=(b.cycle-1)%5
     if kind==0 then b.zoneX=b.target;b.radius=100;phase(b,'mask_warning',1.3)
     elseif kind==1 then b.zoneX=(b.from+b.target)/2;b.radius=math.abs(b.target-b.from)/2+55;phase(b,'iai_warning',1.2)
     elseif kind==2 then b.zoneX=b.x;b.radius=160;phase(b,'sweep_warning',1.2)
     elseif kind==3 then
      b.pushFrom=b.x+b.facing*45;b.pushTo=math.max(25,math.min(935,b.x+b.facing*360))
      b.zoneX=(b.pushFrom+b.pushTo)/2;b.radius=math.abs(b.pushTo-b.pushFrom)/2+35;phase(b,'push_warning',1.2)
     else b.combo=1;combo(s,b) end
    elseif p=='push_warning' then b.mask={x=b.pushFrom,elapsed=0,hits={}};phase(b,'push',.6)
    elseif p=='push' then b.mask=nil;phase(b,'recover',2)
    elseif p=='combo_warning' then
     b.slashTime=.3
     hit(s,b,b.zoneX,b.radius,18);b.flash={x=b.zoneX,r=b.radius,t=.2}
     if b.stage==2 then b.ghost={x=b.zoneX,r=b.radius};phase(b,'phantom_warning',.75)
     elseif b.combo<3 then b.combo=b.combo+1;combo(s,b)
     else b.combo=nil;phase(b,'recover',2) end
    elseif p=='mask_warning' or p=='iai_warning' or p=='sweep_warning' then
     if p~='mask_warning' then b.slashTime=.3 end
     hit(s,b,b.zoneX,b.radius,p=='mask_warning' and 22 or 25)
     b.flash={x=b.zoneX,r=b.radius,t=.25}
     if p=='iai_warning' then b.x=b.target end
     if b.stage==2 and p~='mask_warning' then b.ghost={x=b.from,r=p=='sweep_warning' and 210 or 120};phase(b,'phantom_warning',.9) else phase(b,'recover',2) end
    elseif p=='phantom_warning' then
     hit(s,b,b.ghost.x,b.ghost.r,b.combo and 16 or 24);b.flash={x=b.ghost.x,r=b.ghost.r,t=.25};b.ghost=nil
     if b.combo and b.combo<3 then b.combo=b.combo+1;combo(s,b) else b.combo=nil;phase(b,'recover',2) end
    end
   end
   if b.phase=='push' and b.mask then
    local m=b.mask;local old=m.x;m.elapsed=math.min(.6,m.elapsed+dt);m.x=b.pushFrom+(b.pushTo-b.pushFrom)*m.elapsed/.6
    for _,a in ipairs(s.actors) do
     if not m.hits[a.id] and a.hp>0 and a.inv<=0 and a.y>390 and a.x+12>math.min(old,m.x)-35 and a.x-12<math.max(old,m.x)+35 then
      m.hits[a.id]=true;C.damageActor(s,a,24,b,true,true)
     end
    end
   end
  end
  if b.flash then b.flash.t=b.flash.t-dt;if b.flash.t<=0 then b.flash=nil end end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='maguu' then s.maguu=nil;return end
  s.camera=0;for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end
  if b.hp<=0 then b.ghost=nil;b.flash=nil;b.mask=nil;b.combo=nil;b.respawn=1e9;phase(b,'defeated',1e9) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.maguu;if not b then return f end
  local labels={awake='起動中',ready='構え',recover='攻撃後の隙・遠距離防御',transition='氷風の移行攻撃・離れる',mask_warning='爆発する仮面・予告から離れる',iai_warning='居合い・進路から離れる',sweep_warning='周囲斬り・離れる',phantom_warning='分身の追撃',defeated='討伐完了'}
  labels.push_warning='押し出す仮面・進路から離れる';labels.push='仮面の突進';labels.combo_warning='三連斬り '..tostring(b.combo or 1)..'/3'
  f.location='魔偶剣鬼（静止素材の試作）';f.boss={name='魔偶剣鬼',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,stage=b.stage,parries=b.parries}
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
  if b.hp>0 then
   C.drawMaguuArt(f,b,mode,profile)
   if (b.maskFlash or 0)>0 then C.drawMaguuMask(f,b.x+(b.facing or -1)*40,455,85,b.facing,mode,profile) end
   if b.phase=='transition' then rect(b.x-230,470,460,10,'#abdbf0')
   elseif b.phase=='phantom_warning' and b.ghost then
    C.drawMaguuArt(f,{x=b.ghost.x,facing=b.facing},mode,profile)
    f.draws[#f.draws+1]={kind='text',x=b.ghost.x,y=320,text='分身',color='#a7dcff',size=18}
    rect(b.ghost.x-b.ghost.r,470,b.ghost.r*2,10,'#a7bcdf')
   elseif b.phase:match('_warning$') then rect(b.zoneX-b.radius,470,b.radius*2,10,'#ee9b66') end
   if b.flash then
    rect(b.flash.x-b.flash.r,422,b.flash.r*2,3,'#c8ffff')
    rect(b.flash.x-b.flash.r,470,b.flash.r*2,4,'#9ddbdc')
   end
   if b.phase=='mask_warning' then C.drawMaguuMask(f,b.zoneX,465,65+10*math.sin(s.t*14),b.facing,mode,profile) end
   if b.phase=='push_warning' then C.drawMaguuMask(f,b.pushFrom,475,85,b.facing,mode,profile) end
   if b.mask then C.drawMaguuMask(f,b.mask.x,475,85,b.facing,mode,profile) end
  end
  f.commands=#f.draws;return f
 end
end

