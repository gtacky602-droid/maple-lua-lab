return function(C)
 local boss={}
 local action,frame,avoid=C.action,C.frame,C.aiAvoidTarget
 local labels={geo='岩',pyro='炎',hydro='水',electro='雷',cryo='氷'}
 local colors={geo='#dba05c',pyro='#ff794e',hydro='#64bfff',electro='#bd91f1',cryo='#b5edff'}
 local options={{'pyro','cryo'},{'pyro','electro'},{'hydro','cryo'},{'hydro','electro'}}
 local firstMoves={WZ01=true,WZ02=true,WZ07=true,WZ10=true}
 local secondMoves={WZ03=true,WZ04=true,WZ05=true,WZ06=true,WZ11=true,WZ12=true,WZ14=true}
 local function atHarbor(s)
  return s.story and s.story.active and s.story.node=='liyue-harbor'
    and s.campaign and s.campaign.zone=='town'
 end
 local function pair(s) return s.azhdahaPair or options[1] end
 function C.action(s,key)
  local a,b=key:match('^azhdaha_pair:(%a+):(%a+)$')
  if a then
   if not s.paused and atHarbor(s) then
    for _,option in ipairs(options) do
     if option[1]==a and option[2]==b then s.azhdahaPair=option;return end
    end
   end
   return
  end
  action(s,key)
 end
 function C.frame(s,...)
  local f=frame(s,...)
  if atHarbor(s) then f.azhdahaLobby={choices=options,selected=pair(s)} end
  return f
 end
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local function mix(a,b,q) return a+(b-a)*q end
 local function live(s)
  local a=s.actors[s.active]
  if a.hp>0 then return a end
  for _,other in ipairs(s.actors) do if other.hp>0 then return other end end
 end
 local function box(x,r,y,h) return {lo=x-r,hi=x+r,y=y,h=h} end
 local function body(e,x,y,h)
  e.x,e.y=x,y;e.drawHeight=h;e.hitTop=y-h;e.hitBottom=y
 end
 local function event(s,w,name,id,value)
  C.combatEvent(s,'azhdaha:'..name,id or 0,w.primary.id,value)
 end
 local function remove(s,w)
  for i=#s.enemies,1,-1 do if s.enemies[i]==w.primary then table.remove(s.enemies,i) end end
 end
 local function shield(s,a)
  local water,thunder=a.waterShield,a.thunderShield
  return water and water.hp>0 and water.life>0
    or s.companion=='beidou' and thunder and thunder.hp>0 and thunder.untilTime>s.t
 end
 local function marks(s,w,spec)
  for id,mark in pairs(w.marks) do
   local a=s.actors[id]
   if a.hp<=0 or w.clock>=mark.expiry or shield(s,a) then
    w.marks[id]=nil
    if a.hp>0 and shield(s,a) then event(s,w,'mark-cleansed',id) end
   elseif w.clock>=mark.next then
    mark.next=mark.next+spec.markPeriod
    C.damageActor(s,a,spec.markDamage,{id=w.primary.id,damageElement=mark.element},false,false)
    event(s,w,'mark-tick:'..mark.element,id)
   end
  end
 end
 local function hurt(s,w,spec,c,group,a,amount,primary)
  if w.primary.hp<=0 then return end
  local key=group..':'..a.id
  if c.hit[key] or (c.count[a.id] or 0)>=(c.id=='WZ10' and c.element=='pyro' and 6 or 100) then return end
  c.hit[key]=true
  local protected=shield(s,a)
  local damage=C.damageActor(s,a,amount,{id=w.primary.id,x=w.primary.x,y=w.primary.y,damageElement=c.element},true,true)
  if damage>0 then
   c.count[a.id]=(c.count[a.id] or 0)+1
   event(s,w,c.id..':hit:'..c.element,a.id,group)
   if primary and a.hp>0 and w.primary.hp>0 and not protected and c.element~='geo' then
    w.marks[a.id]={element=c.element,expiry=w.clock+spec.markTicks,next=w.clock+spec.markPeriod}
    event(s,w,'mark:'..c.element,a.id)
   end
  end
 end
 local function inBox(a,b)
  return a.hp>0 and a.x+9>=b.lo and a.x-9<=b.hi and a.y<=b.y+5 and a.y>b.y-b.h
 end
 local function area(s,w,spec,c,group,b,amount,primary)
  for _,a in ipairs(s.actors) do if inBox(a,b) then hurt(s,w,spec,c,group,a,amount,primary) end end
 end
 local function orb(s,w,spec,c,o,x,radius)
  for _,a in ipairs(s.actors) do
   if a.hp>0 and math.abs(a.x-x)<radius+9 and a.y-8>=o.y-radius and a.y-76<=o.y+radius then
    hurt(s,w,spec,c,o.index,a,c.move.damage,true)
   end
  end
 end

 function boss.spawn(s,w,spec)
  w.pair=pair(s);w.form=1;w.index=1;w.clock=0;w.remainder=0
  w.rest=spec.noticeTicks;w.cast=nil;w.marks={};w.tailing=false;w.defeatAt=nil
  local e=w.primary;e.dir=-1;e.underground=false;e.invulnerable=false
  body(e,spec.center,spec.floorY,176)
 end
 function boss.attach(s,w)
  remove(s,w);s.enemies[#s.enemies+1]=w.primary
  if not w.cast and w.primary.hp==w.primary.maxhp then w.pair=pair(s) end
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function boss.cleanup(s,w)
  remove(s,w);w.cast=nil;w.marks={}
  w.defeatAt=w.tailing and w.primary.hp<=0 and s.t or nil
  w.tailing=false;w.primary.underground=true
 end
 local function variant(w,id)
  if id=='WZ04' and w.form==3 then return id..'.infused' end
  if id=='WZ05' and w.form==3 then return id..'.'..w.pair[2] end
  if id=='WZ10' and w.pair[1]=='hydro' then return id..'.hydro' end
  if (id=='WZ11' or id=='WZ12') and w.pair[2]=='cryo' then return id..'.cryo' end
  return id
 end
 local function element(w,id)
  if firstMoves[id] and w.form>=2 then return w.pair[1] end
  if secondMoves[id] and w.form==3 then return w.pair[2] end
  return 'geo'
 end
 local function spread(x,offsets,spec)
  local out={}
  for i,offset in ipairs(offsets) do out[i]=clamp(x+offset,56,spec.width-56) end
  return out
 end
 local function lock(s,w,spec,c,index)
  local e=w.primary;local a=live(s);local x=a and a.x or spec.center
  local id=c.id
  if index==1 and id~='WZ08' and id~='WZ12' then
   c.dir=x>=e.x and 1 or -1;e.dir=c.dir
  end
  if id=='WZ03' then
   c.finish=clamp(c.origin+c.dir*70,144,spec.width-144)
  elseif id=='WZ04' or id=='WZ05' then
   c.zone=clamp(c.origin-c.dir*155,105,spec.width-105)
  elseif id=='WZ06' then
   c.finish=clamp(c.origin+c.dir*246,142,spec.width-142)
  elseif id=='WZ07' then
   c.finish=clamp(x,200,spec.width-200)
  elseif id=='WZ08' then
   if index<=3 then c.targets[index]=clamp(x,96,spec.width-96)
   else c.finish=clamp(x-c.dir*90,205,spec.width-205) end
  elseif id=='WZ10' then
   c.targets=spread(x,{-128,0,128},spec)
  elseif id=='WZ11' then
   c.targets=spread(x,{-188,-93,0,93,188},spec)
  elseif id=='WZ12' then
   c.slots[index]=spread(x,{-102,0,102},spec)
  elseif id=='WZ14' then
   c.targets=spread(x,{-106,106},spec)
  end
 end
 local function start(s,w,spec,id)
  local e=w.primary;local aim=live(s)
  local vid=variant(w,id)
  local c={id=id,variant=vid,move=spec.moves[vid],element=element(w,id),t=0,
   origin=e.x,dir=e.dir,finish=e.x,floor=spec.floorY,hit={},count={},objects={},targets={},slots={},
   safe={1,2,3},tailX=spec.center}
  if aim then c.dir=aim.x>=e.x and 1 or -1 end
  for i in ipairs(c.move.locks) do lock(s,w,spec,c,i) end
  w.cast=c;w.phase='tell'
  if id=='WZ09' then
   c.infusion=w.pair[w.form];e.invulnerable=true
  end
  event(s,w,id,0,w.form)
 end
 local function threshold(w,spec)
  return w.form<3 and w.primary.hp<=spec.hp*(3-w.form)/3
 end
 local function motion(w,spec,c)
  local e=w.primary;local t,id=c.t,c.id
  if id=='WZ03' and t>=72 and t<=108 then
   body(e,mix(c.origin,c.finish,(t-72)/36),c.floor,176)
  elseif id=='WZ06' and t>=102 and t<=138 then
   body(e,mix(c.origin,c.finish,(t-101)/37),c.floor,176)
  elseif id=='WZ07' and t>=72 and t<=132 then
   local q=(t-72)/60
   body(e,mix(c.origin,c.finish,q),c.floor-math.sin(math.pi*q)*88,176)
  elseif id=='WZ08' then
   if t==72 then e.underground=true;e.invulnerable=true
   elseif t==300 then
    e.underground=false;e.invulnerable=false
    body(e,c.finish,c.floor,176)
   end
  elseif id=='WZ12' then
   if t==90 then w.tailing=true;body(e,c.tailX,c.floor,135)
   elseif t==540 then w.tailing=false;body(e,c.tailX,c.floor,176) end
  elseif id=='WZ09' and t==396 then
   w.form=w.form+1;e.invulnerable=false
  end
 end
 local function spans(c,spec,i)
  local id=c.id
  if id=='WZ01' then return {box(c.origin+c.dir*119,75,c.floor,80)}
  elseif id=='WZ03' then return {box(c.finish+c.dir*87,114,c.floor,141)}
  elseif id=='WZ04' then return {box(c.zone,i==1 and 79 or 57,c.floor,100)}
  elseif id=='WZ05' then
   if i==1 then return {box(c.zone,119,c.floor,112)} end
   return {box(c.zone-78,31,c.floor,82),box(c.zone,31,c.floor,82),box(c.zone+78,31,c.floor,82)}
  elseif id=='WZ06' then
   local a,b=c.origin+c.dir*87,c.finish+c.dir*87
   return {{lo=math.min(a,b)-44,hi=math.max(a,b)+44,y=c.floor,h=84}}
  elseif id=='WZ07' then return {box(c.finish,i==1 and 158 or 220,c.floor,114)}
  elseif id=='WZ08' then return {box(i<4 and c.targets[i] or c.finish,i<4 and 53 or 112,c.floor,128)}
  elseif id=='WZ09' then return {box(c.origin,i<6 and 211 or 281,c.floor,133)}
  elseif id=='WZ10' then return {box(c.targets[i],53,c.floor,148)}
  elseif id=='WZ11' then return {box(c.targets[i],35,c.floor,162)}
  elseif id=='WZ12' and c.element=='electro' then
   local zones={}
   for lane=1,3 do
    if lane~=c.safe[i] then
     local width=spec.width/3
     zones[#zones+1]={lo=(lane-1)*width+9,hi=lane*width-9,y=c.floor,h=235}
    end
   end
   return zones
  elseif id=='WZ12' then
   local group=math.floor((i-1)/3)+1
   return {box(c.slots[group][(i-1)%3+1],48,c.floor,149)}
  end
  return {}
 end
 local function spawn(c,i)
  local t,id=c.t,c.id
  local o={start=t,index=i,x=c.origin,y=c.floor-36}
  if id=='WZ01' then
   o.kind='fissure';o.life=72;o.x=c.origin+c.dir*56
  elseif id=='WZ02' then
   o.kind='wave';o.life=36;o.x=c.origin+c.dir*82
  elseif id=='WZ10' then
   o.kind='water';o.life=228;o.center=clamp(c.targets[i],100,956);o.x=o.center-65;o.y=c.floor-35
  elseif id=='WZ11' then
   o.kind='bolt';o.life=90;o.y=c.floor-55
  elseif id=='WZ14' then
   o.kind='scale';o.life=90;o.dest=c.targets[i];o.y=c.floor-130
  else return end
  c.objects[#c.objects+1]=o
 end
 local function impact(s,w,spec,c,o,x,y)
  o.kind='impact';o.x=x;o.y=y;o.start=c.t;o.life=60
  event(s,w,'WZ14:impact',0,o.index)
 end
 local function objects(s,w,spec,c)
  for i=#c.objects,1,-1 do
   local o=c.objects[i]
   local age=c.t-o.start
   if age>=o.life then table.remove(c.objects,i)
   elseif o.kind=='fissure' then
    area(s,w,spec,c,1,box(o.x+c.dir*155*age/72,24,c.floor,58),c.move.damage,true)
   elseif o.kind=='wave' then
    local distance=211*age/36
    for _,sign in ipairs({-1,1}) do
     area(s,w,spec,c,o.index,box(o.x+sign*distance,23,c.floor,48.4),c.move.damage,true)
    end
   elseif o.kind=='fire' then
    if age==1 or age==91 then
     area(s,w,spec,c,10+o.index*2+(age>90 and 1 or 0),box(o.x,49,c.floor,31),spec.residualDamage,false)
    end
   elseif o.kind=='water' then
    local q=(age%228)/114
    local x=o.center-65+(q<=1 and q or 2-q)*130
    o.drawX=x
    orb(s,w,spec,c,o,x,31)
   elseif o.kind=='bolt' then
    local x=o.x+c.dir*352*age/60
    o.drawX=x
    orb(s,w,spec,c,o,x,26)
   elseif o.kind=='scale' then
    local q=age/88
    local x=mix(o.x,o.dest,q)
    local y=mix(o.y,c.floor,q)-math.sin(math.pi*q)*76
    o.drawX,o.drawY=x,y
    if x<28 or x>spec.width-28 then table.remove(c.objects,i)
    else
     local hit=false
     for _,a in ipairs(s.actors) do
      if a.hp>0 and math.abs(a.x-x)<=29 and y>=a.y-82 and y<=a.y then
       hurt(s,w,spec,c,o.index,a,c.move.damage,true);hit=true;break
      end
     end
     if hit or age>=88 then impact(s,w,spec,c,o,x,c.floor) end
    end
   elseif o.kind=='impact' and age>=36 and age<42 then
    if age==36 then event(s,w,'WZ14:secondary',0,o.index) end
    area(s,w,spec,c,10+o.index,box(o.x,61,c.floor,90),spec.secondaryDamage,false)
   elseif o.kind=='ice' then
    area(s,w,spec,c,o.group,box(o.x,44,c.floor,32),spec.residualDamage,false)
   end
  end
 end
 local function tick(s,w,spec)
  w.clock=w.clock+1
  marks(s,w,spec)
  if w.primary.hp<=0 then return end
  local e,c=w.primary,w.cast
  if not c then
   if threshold(w,spec) then start(s,w,spec,'WZ09');return end
   w.rest=w.rest-1
   local a=live(s)
   if a and math.abs(a.x-e.x)>164 then
    e.dir=a.x>=e.x and 1 or -1
    body(e,clamp(e.x+e.dir*2.6,138,spec.width-138),spec.floorY,176)
   end
   if w.rest<=0 and a then
    local order=spec.orders[w.form];local id=order[w.index]
    w.index=w.index%#order+1;start(s,w,spec,id)
   end
   return
  end
  c.t=c.t+1;local t,id=c.t,c.id
  if id~='WZ09' and t>=c.move.recovery and threshold(w,spec) then start(s,w,spec,'WZ09');return end
  for i,k in ipairs(c.move.locks) do
   if t==k then lock(s,w,spec,c,i);event(s,w,id..':lock',0,i) end
  end
  motion(w,spec,c)
  w.phase=t>=c.move.recovery and 'recovery' or 'tell'
  for i,win in ipairs(c.move.windows) do
   if t>=win[1] and t<win[2] then
    w.phase='active'
    if win[3]=='spawn' then spawn(c,id=='WZ01' and 1 or i)
    else
     local shapes=spans(c,spec,i)
     if id=='WZ06' then shapes={box(e.x+c.dir*87,44,c.floor,84)} end
     local group=id=='WZ12' and c.element=='cryo' and math.floor((i-1)/3)+1 or i
     local primary=not (id=='WZ05' and i>1)
     for _,shape in ipairs(shapes) do
      if w.primary.hp<=0 then return end
      area(s,w,spec,c,group,shape,c.move.damage,primary)
     end
     if t==win[1] and id=='WZ10' and c.element=='pyro' then
      c.objects[#c.objects+1]={kind='fire',x=c.targets[i],start=t,life=132,index=i}
     elseif t==win[1] and id=='WZ12' and c.element=='cryo' then
      c.objects[#c.objects+1]={kind='ice',x=(shapes[1].lo+shapes[1].hi)/2,start=t,life=24,group=group}
     end
    end
   end
  end
  objects(s,w,spec,c)
  if t>=c.move.total and w.primary.hp>0 then w.cast=nil;w.rest=spec.restTicks;w.phase='available' end
 end
 function boss.prepare() end
 function boss.finish(s,w,spec,dt)
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do
   w.remainder=w.remainder-1;tick(s,w,spec)
  end
 end
 local function warns(c,spec)
  local all={}
  for i,win in ipairs(c.move.windows) do
   local early=0
   if c.id=='WZ08' then early=({84,156,228,282})[i]
   elseif c.id=='WZ09' and i==6 then early=276
   elseif c.id=='WZ12' then early=120*(c.element=='cryo' and math.floor((i-1)/3)+1 or i)
   elseif c.id=='WZ04' and i>1 then early=102
   elseif c.id=='WZ05' and i>1 then early=102 end
   if win[3]~='spawn' and c.t>=early and c.t<win[2] then
    for _,shape in ipairs(spans(c,spec,i)) do
     all[#all+1]={shape=shape,at=win[1],now=c.t>=win[1]}
    end
   end
  end
  return all
 end
 local function safeLane(c)
  if not c or c.id~='WZ12' or c.element~='electro' then return end
  local group=math.floor(c.t/120)
  if group>=1 and group<=3 and c.t<120*group+72 then return c.safe[group] end
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='azhdaha' and w.cast then
   local lane=safeLane(w.cast)
   if lane then
    local width=spec.width/3
    if a.x<(lane-1)*width+25 or a.x>lane*width-25 then return (lane-.5)*width end
   end
   for _,warn in ipairs(warns(w.cast,spec)) do
    local b=warn.shape
    if warn.at-w.cast.t<=33 and inBox(a,b) then
     local left,right=b.lo-38,b.hi+38
     if left>=20 and (right>=spec.width-20 or a.x-left<right-a.x) then return left end
     if right<spec.width-20 then return right end
    end
   end
  end
  if avoid then return avoid(s,a) end
 end

 function boss.observe(f,s,w,spec,mode,profile)
  local c,e=w.cast,w.primary
  local view=f.weeklyBoss
  view.x,view.y,view.form,view.damageable=e.x,e.y,w.form,e.hp>0 and not e.invulnerable and not e.underground
  view.elementSlots=w.pair;view.moveslot=c and c.variant or nil;view.move=c and c.id or nil
  view.moveTick=c and c.t or nil;view.tail=w.tailing;view.marks={}
  view.safeLane=safeLane(c)
  for id,mark in pairs(w.marks) do view.marks[tostring(id)]={element=mark.element,ticks=mark.expiry-w.clock} end
  view.label=c and (c.id=='WZ09' and '地脈を吸収・'..labels[c.infusion]..
    (c.t<c.move.recovery and '／防御中' or '／反撃の隙')
    or c.t>=c.move.recovery and '反撃の隙' or c.move.title) or labels[w.form==1 and 'geo' or w.pair[w.form-1]]..'の構え'
  local function rect(x,y,width,height,color)
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color}
  end
  local function text(x,y,value,color)
   f.draws[#f.draws+1]={kind='text',x=x-s.camera,y=y,text=value,color=color,size=15}
  end
  if e.hp<=0 then
   if w.defeatAt and s.t-w.defeatAt<.65 then
    C.drawFieldDisplayArt(f,C.azhdahaWeeklyArt.idle,e.x-s.camera,e.y,142,mode,profile,e.dir>0)
   end
   return
  end
  local color=colors[c and c.element or (w.form==1 and 'geo' or w.pair[w.form-1])]
  if c then
   if view.safeLane then
    local width=spec.width/3
    local center=(view.safeLane-.5)*width
    rect(center-48,c.floor-4,96,3,'#7bdabe')
    text(center,c.floor-18,'安全帯','#bcf8dc')
   end
   for _,warn in ipairs(warns(c,spec)) do local b=warn.shape
    rect(b.lo,b.y-8,b.hi-b.lo,8,'#513b44')
    rect(b.lo+2,b.y-6,b.hi-b.lo-4,4,warn.now and '#ff885e' or '#fff0b6')
    if c.id=='WZ12' and c.element=='electro' then
     rect((b.lo+b.hi)/2-3,b.y-b.h,6,b.h,warn.now and '#d4b2fa' or '#7f5698')
    end
    if b.lo<s.camera or b.hi>s.camera+960 then
     local left=b.lo<s.camera
     text(s.camera+(left and 37 or 920),407,left and '‹ 危険' or '危険 ›','#ffdfaf')
    end
   end
   if c.id=='WZ02' and c.t<264 then
    local left=c.t<84 and 3 or c.t<174 and 2 or 1
    local x=c.origin+c.dir*82
    for i=1,left do rect(x+(i-2)*12-4,c.floor-22,8,8,'#ffebad') end
   elseif c.id=='WZ11' and c.element=='electro' and c.t<210 then
    local x=c.dir>0 and c.origin or 0
    rect(x,c.floor-56,c.dir>0 and spec.width-c.origin or c.origin,2,'#f1d8ff')
   elseif c.id=='WZ10' and c.element=='hydro' and c.t<180 then
    for i,x in ipairs(c.targets) do
     if i<=2 then rect(x-65,c.floor-4,130,2,'#a2eafe') end
    end
   elseif c.id=='WZ14' and c.t<126 then
    for _,x in ipairs(c.targets) do rect(x-25,c.floor-4,50,4,'#ffe8b9') end
   end
   for _,o in ipairs(c.objects) do
    local age=c.t-o.start
    local x=o.drawX or o.x
    if o.kind=='wave' then
     for _,sign in ipairs({-1,1}) do rect(x+sign*211*age/36-21,c.floor-14,42,14,color) end
    elseif o.kind=='fissure' then
     rect(x+c.dir*155*age/72-23,c.floor-12,46,12,color)
    elseif o.kind=='fire' or o.kind=='ice' then
     rect(x-44,c.floor-8,88,8,color);rect(x-23,c.floor-18,46,8,color)
    elseif o.kind=='impact' then rect(x-60,c.floor-6,120,6,age>=36 and color or '#ffe2b7')
    elseif o.kind=='water' or o.kind=='bolt' then
     local r=o.kind=='water' and 31 or 26
     rect(x-r,o.y-r/2,2*r,r,color)
     rect(x-r/2,o.y-r*.82,r,r*1.64,color)
     rect(x-r*.40,o.y-r*.57,r*.9,5,'#e6faff')
    else
     local y=o.drawY or o.y
     rect(x-20,y-13,40,26,color);rect(x-12,y-12,22,5,'#e6faff')
    end
   end
  end
  if w.tailing then
   local x,y=e.x,e.y
   local shadow,stone,face='#443852','#765663','#a1767c'
   local ledges={{-83,-12,166,13},{-64,-24,123,13},{-51,-40,87,17},
    {-35,-59,60,20},{-22,-78,46,20},{-7,-97,36,20},{10,-115,27,20},{22,-137,18,23}}
   for _,ledge in ipairs(ledges) do
    local dx,dy,a,h=table.unpack(ledge)
    rect(x+dx,y+dy,a,h,shadow);rect(x+dx+5,y+dy+2,a-10,h-4,stone)
    rect(x+dx+8,y+dy+2,math.max(1,a-19),3,face)
   end
   for _,twig in ipairs({{-38,-80,36,10},{-48,-92,26,11},{-56,-106,17,15},
      {18,-86,41,9},{48,-100,15,15},{55,-116,11,18},{27,-149,13,16}}) do
    rect(x+twig[1],y+twig[2],twig[3],twig[4],stone)
   end
   for _,leaf in ipairs({{-58,-110},{-48,-118},{-34,-100},{25,-154},{41,-145},{56,-124},{64,-132},{71,-115}}) do
    local a,b=x+leaf[1],y+leaf[2]
    rect(a-4,b-3,11,9,color);rect(a,b-6,7,3,'#fff1be')
   end
   text(x,y-173,'露出した尾',color)
  elseif e.underground then
   rect(e.x-88,e.y-9,176,9,'#806859')
  else
   C.drawFieldDisplayArt(f,C.azhdahaWeeklyArt.idle,e.x-s.camera,e.y,e.drawHeight,mode,profile,e.dir>0)
   for i=1,2 do
    if i<w.form or c and c.infusion==w.pair[i] then
     local x=e.x-e.dir*(30+i*39);local y=e.y-125-i*8
     rect(x-6,y-12,12,24,colors[w.pair[i]])
     rect(x-10,y-7,20,13,colors[w.pair[i]])
     rect(x-4,y-14,8,6,'#fcf4cf')
    end
   end
   if c and c.id=='WZ09' then text(e.x,e.y-188,'吸収・'..labels[c.infusion],colors[c.infusion]) end
  end
  for id,mark in pairs(w.marks) do
   local a=s.actors[id]
   text(a.x,a.y-91,labels[mark.element]..'刻印 '..math.ceil((mark.expiry-w.clock)/60)..'秒',colors[mark.element])
  end
 end
 return boss
end
