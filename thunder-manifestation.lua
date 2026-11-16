-- Laboratory 2D adaptation: fury probes, walls and homing prison.
return function(C)
 local action,step,frame=C.action,C.step,C.frame
 local function phase(b,p,t) b.phase=p;b.timer=t end
 local function area(s,b,x,r,damage,top)
  for _,a in ipairs(s.actors) do if a.hp>0 and math.abs(a.x-x)<r+12 and a.y>(top or 300) then C.damageActor(s,a,damage,b,true,true) end end
 end
 function C.action(s,key)
  if key=='boss_thunder' then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='thunder';s.worldwidth=960;s.platforms={{x=0,y=480,w=960}}
   s.campaign.message='雷音権現：索敵パルスから離れる。怒り状態では雷壁と追尾する檻を避ける。雷無効、形状は試作。'
   local b={id=20070101,x=620,home=620,y=440,hitTop=340,hitBottom=480,hp=700,maxhp=700,kind=1,boss=true,custom=true,respawn=1e9,cd=999,warning=0,immune='electro',resist={physical=.1,pyro=.1,hydro=.1,cryo=.1,anemo=.1,geo=.1,dendro=.1},fury=0,cycle=0,probes={}}
   s.enemies={b};s.thunder=b;phase(b,'survey',1);return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='thunder' then s.thunder=nil end
 end
 function C.step(s,dt,input)
  local b=s.thunder;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  if b.hp>0 then
   b.timer=b.timer-dt
   if not b.enraged then
    for _,p in ipairs(b.probes) do
     p.clock=p.clock-dt;p.flash=math.max(0,(p.flash or 0)-dt)
     if p.clock<=0 then
      p.clock=2;p.flash=.25;local detected=false
      for _,a in ipairs(s.actors) do if a.hp>0 and math.abs(a.x-p.x)<82 and a.y>390 then detected=true end end
      if detected then b.fury=math.min(100,b.fury+25);area(s,b,p.x,70,10,390) end
     end
    end
    if b.hp<=b.maxhp*.75 or b.fury>=100 then b.enraged=true;b.fury=100;b.probes={};phase(b,'enrage_warning',1.4) end
   end
   if b.timer<=0 then
    local p=b.phase
    if p=='survey' then b.probes={{x=200,clock=1,flash=0},{x=480,clock=1.6,flash=0},{x=760,clock=2.2,flash=0}};phase(b,'survey_idle',3)
    elseif p=='survey_idle' then b.target=math.max(60,math.min(900,s.actors[s.active].x));phase(b,'bolt_warning',1)
    elseif p=='bolt_warning' then
     area(s,b,b.target,70,16)
     if b.enraged then b.boltCount=(b.boltCount or 0)+1;phase(b,'bolt_flash',.2)
     else phase(b,'survey_idle',2) end
    elseif p=='bolt_flash' then
     if b.boltCount<3 then b.target=math.max(60,math.min(900,s.actors[s.active].x));phase(b,'bolt_warning',.7)
     else b.boltCount=nil;phase(b,'recover',2) end
    elseif p=='enrage_warning' then area(s,b,480,480,20,410);phase(b,'recover',2)
    elseif p=='recover' then
     b.cycle=b.cycle+1;b.target=math.max(60,math.min(900,s.actors[s.active].x))
     if b.cycle%4==1 then b.wallLeft=math.max(20,b.target-250);b.wallRight=math.min(940,b.target+250);phase(b,'walls_warning',1.2)
     elseif b.cycle%4==2 then b.prisonX=b.target;phase(b,'prison_warning',1.5)
     elseif b.cycle%4==3 then b.boltCount=0;phase(b,'bolt_warning',1)
     else
      b.dashFrom=b.target<480 and 900 or 60;b.dashTo=960-b.dashFrom;b.x=b.dashFrom;b.dashHits={};phase(b,'dash_warning',1.2)
     end
    elseif p=='dash_warning' then phase(b,'dash',2)
    elseif p=='walls_warning' then phase(b,'walls',3)
    elseif p=='walls' then b.wallLeft=nil;b.wallRight=nil;phase(b,'recover',2)
    elseif p=='prison_warning' then phase(b,'prison_lock',.6)
    elseif p=='prison_lock' then phase(b,'prison',4)
    elseif p=='prison' then b.prisonX=nil;phase(b,'recover',2) end
   end
   if b.phase=='dash' then
    local old=b.x;local dx=b.dashTo-b.x;b.x=b.x+(dx>=0 and 1 or -1)*math.min(math.abs(dx),700*dt)
    for i,a in ipairs(s.actors) do
     if a.hp>0 and not b.dashHits[i] and (a.inv or 0)<=0 and a.y>410 and a.x>math.min(old,b.x)-57 and a.x<math.max(old,b.x)+57 then
      b.dashHits[i]=true;C.damageActor(s,a,24,b,true,true)
     end
    end
    if b.x==b.dashTo then b.dashFrom=nil;b.dashTo=nil;b.dashHits=nil;phase(b,'recover',2) end
   elseif b.phase=='walls' then
    b.wallLeft=b.wallLeft+100*dt;b.wallRight=b.wallRight-100*dt
    area(s,b,b.wallLeft,12,18,320);area(s,b,b.wallRight,12,18,320)
    if b.wallLeft>=b.wallRight then b.wallLeft=nil;b.wallRight=nil;phase(b,'recover',2) end
   elseif b.phase=='prison_warning' then b.prisonX=s.actors[s.active].x
   elseif b.phase=='prison' then
    local dx=s.actors[s.active].x-b.prisonX;b.prisonX=b.prisonX+(dx>=0 and 1 or -1)*math.min(math.abs(dx),100*dt)
    area(s,b,b.prisonX,50,12,280)
   end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='thunder' then s.thunder=nil;return end
  s.camera=0;for _,a in ipairs(s.actors) do a.x=math.max(20,math.min(940,a.x)) end
  if b.hp<=0 then b.probes={};b.wallLeft=nil;b.wallRight=nil;b.prisonX=nil;b.boltCount=nil;b.dashFrom=nil;b.dashTo=nil;b.dashHits=nil;b.respawn=1e9;phase(b,'defeated',1e9) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.thunder;if not b then return f end
  local labels={survey='索敵準備',survey_idle='索敵パルス',bolt_warning='落雷予告',enrage_warning='怒り移行・衝撃波を跳ぶ',recover='攻撃後の隙',walls_warning='両側に雷壁',walls='雷壁が迫る',prison_warning='檻の照準が追尾中',prison_lock='照準固定・離れる',prison='追尾する雷の檻',defeated='討伐完了'}
  labels.bolt_flash='落雷';if b.enraged and (b.phase=='bolt_warning' or b.phase=='bolt_flash') then labels[b.phase]=labels[b.phase]..' '..math.min(3,(b.boltCount or 0)+(b.phase=='bolt_warning' and 1 or 0))..'/3' end
  labels.dash_warning='直線突進・跳んで避ける';labels.dash='直線突進'
  f.location='雷音権現（静止絵試作）';f.boss={name='雷音権現',hp=b.hp,maxhp=b.maxhp,phase=b.phase,label=labels[b.phase],timer=b.timer,fury=b.fury,enraged=not not b.enraged,x=b.x}
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
  if b.hp>0 then
   C.drawThunderArt(f,b,mode,profile)
   for _,p in ipairs(b.probes) do rect(p.x-70,474,140,6,p.flash>0 and '#f2d1ff' or '#8062aa');rect(p.x-5,430,10,40,'#ab80d1') end
   if b.phase=='bolt_warning' then rect(b.target-70,470,140,10,'#e0a2f5') end
   if b.phase=='bolt_flash' then rect(b.target-70,300,140,180,'#e8c4ff') end
   if b.phase=='enrage_warning' then rect(0,470,960,10,'#e0a2f5') end
   if b.dashFrom then rect(math.min(b.dashFrom,b.dashTo)-45,474,math.abs(b.dashTo-b.dashFrom)+90,6,'#e0a2f5');if b.phase=='dash' then rect(b.x-45,410,90,4,'#f4dbff') end end
   if b.wallLeft then for _,x in ipairs({b.wallLeft,b.wallRight}) do rect(x-12,320,b.phase=='walls' and 24 or 3,160,'#bb88eb') end end
   if b.prisonX then
    rect(b.prisonX-50,475,100,5,'#e0a2f5')
    if b.phase=='prison' then rect(b.prisonX-50,280,4,200,'#c897ff');rect(b.prisonX+46,280,4,200,'#c897ff');rect(b.prisonX-50,280,100,4,'#c897ff') end
   end
  end
  f.commands=#f.draws;return f
 end
end
