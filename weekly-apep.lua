return function(C,D)
 local controller={}
 local previousAvoid=C.aiAvoidTarget
 local mint,gold,shadow='#c2ecc2','#f4dd98','#534f3a'
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local function ownLog(s,w,key,actor,n) C.combatEvent(s,'apep:'..key,actor or 0,w.primary.id,n or 0) end
 local function log(s,w,key,actor,n)
  for _,party in ipairs(s.parties or {s}) do ownLog(party,w,key,actor,n) end
 end
 local function player(s) return s.actors[s.active] end
 local function owner(s,a) return s.actorOwners and s.actorOwners[a] or s end
 local function band(x,r,y,h) return {lo=x-r,hi=x+r,y=y,h=h} end
 local function inside(a,b)
  return a.hp>0 and a.x>=b.lo and a.x<=b.hi and a.y<=b.y+5 and a.y>=b.y-b.h
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function relocate(w,x,y,h)
  local e=w.primary
  e.x,e.y,e.hitTop,e.hitBottom=x,y,y-h,y
  for i,part in ipairs(w.parts) do part.x=x+(i==1 and -118 or 118);part.y=y;part.hitTop=y-105;part.hitBottom=y end
 end
 local function targetable(w,enable)
  local e=w.primary
  e.underground=not enable;e.invulnerable=not enable;e.noAutoTarget=not enable
  for _,part in ipairs(w.parts) do part.underground=not enable;part.invulnerable=not enable end
 end
 local function phase(s,w,spec,stage,card)
  D.clear(s,w);w.stage=stage;w.phase=stage;w.stageTick=0;w.cast=nil;w.wave=nil;w.rest=spec.restTicks
  local live=stage=='dark' or stage=='prime' or stage=='shelter' or stage=='weak'
  relocate(w,spec.center,spec.floorY,135);targetable(w,live)
  if stage=='defense' then D.start(s,w,spec) end
  if stage=='shelter' then w.wave={t=0,hits={}};w.lastDome=w.clock;w.normal=0 end
  if card then log(s,w,card) end
 end
 local function contact(s,w,spec,cast,mult,color,element)
  local e=w.primary
  if e.invulnerable or e.hp<=0 then return false end
  local r=C.enemyResistance(cast,e,element)
  if r>=1 then return false end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,r)
  local barrier=w.stage=='dark' and spec.primeHp or 0
  n=math.min(n,e.hp-barrier)
  if n<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+n
  C.combatNumber(s,e,critical and n..'!' or n,color)
  C.combatEvent(s,'hit',cast.id,e.id,n)
  local hit=s.events[#s.events];hit.element=element;hit.critical=not not critical;hit.reaction=cast.reaction or false
  if s.coop then C.coopContact(s,e,cast.id) end
  if n==e.hp then C.defeatEnemy(s,e,cast.id)
  else
   e.hp=e.hp-n
   if barrier>0 and e.hp==barrier then
    phase(s,w,spec,'expose','WP05')
    e.aura=nil;e.applicationClocks=nil;e.burning=nil
   elseif C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  end
  return true
 end
 function controller.spawn(s,w,spec)
  w.clock,w.remainder=0,0;w.index=1;w.normal=0;w.lastDome=-math.huge;w.parts={}
  w.actorX=setmetatable({},{__mode='k'})
  phase(s,w,spec,'dark');w.rest=spec.noticeTicks
  w.primary.dir=-1
  w.primary.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,cast,mult,color,element) end
 end
 function controller.attach(s,w,spec)
  remove(s,w.primary);s.enemies[#s.enemies+1]=w.primary
  for _,e in ipairs(w.parts) do remove(s,e) end
  w.parts={}
  for i=1,2 do
   local e={id=spec.entity+i,sharedHealth=w.primary,custom=true,boss=true,noRewards=true,noAutoTarget=true,weeklyPart=true,
     hp=1,maxhp=1,respawn=math.huge,warning=0,onCastContact=w.primary.onCastContact}
   w.parts[#w.parts+1]=e;s.enemies[#s.enemies+1]=e
  end
  relocate(w,spec.center,spec.floorY,135)
  targetable(w,w.stage=='dark' or w.stage=='prime' or w.stage=='shelter' or w.stage=='weak')
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  D.clear(s,w);w.cast=nil;w.wave=nil;w.actorX=nil
  for _,e in ipairs(w.parts) do remove(s,e) end
  w.parts={};remove(s,w.primary);w.primary.underground=true
 end
 function controller.interact(s,w,spec,key)
  if w.stage=='failed' and key=='encounter_interact' and not s.auto and player(s).hp>0 then
   phase(s,w,spec,'defense','WP06')
  elseif w.stage=='defense' then D.interact(s,w,key) end
 end
 function controller.leaveCoop(s,w)
  if w.defense then w.defense.wallOrders[s]=nil end
 end
 local function commit(s,w,spec,c)
  local e=w.primary;local a=not s.parties and player(s) or e
  local distance=math.huge
  for _,party in ipairs(s.parties or {}) do
   local hero=player(party);local dx=math.abs(hero.x-e.x)
   if hero.hp>0 and dx<distance then a,distance=hero,dx end
  end
  c.dir=a.x>=e.x and 1 or -1;e.dir=c.dir;c.origin=e.x
  c.target=clamp(a.x,168,792)
  c.y=a.y<=382 and 355 or spec.floorY
  if c.id=='WP04' then
   c.points={clamp(c.target-145,123,837),clamp(c.target+135,123,837),
      clamp(c.target-64,123,837),clamp(c.target+69,123,837)}
  elseif c.id=='WP15' then
   local lo,hi=123,837
   if c.y<spec.floorY then
    lo,hi=123,248
    if a.x>480 then lo,hi=714,836 end
   end
   c.points={clamp(a.x-95,lo,hi),clamp(a.x+95,lo,hi),clamp(a.x,lo,hi)}
  end
 end
 local function start(s,w,spec,key)
  local c={key=key,id=key:sub(1,4),t=0,move=spec.moves[key],hits={},shots={}}
  commit(s,w,spec,c);w.cast=c;w.phase='tell';log(s,w,key)
 end
 local function shape(spec,c,i)
  local x,y,d,id=c.origin,spec.floorY,c.dir,c.id
  if id=='WP01' then
   local a,b=x+d*16,x+d*(i==1 and 211 or 238)
   return {lo=math.min(a,b),hi=math.max(a,b),y=y,h=96}
  elseif id=='WP02' then
   local xs={112,159,181,134}
   return band(x+d*xs[i],i==4 and 88 or 66,y,i==3 and 58 or 98)
  elseif id=='WP03' then return i==1 and band(c.target,86,y,114) or band(c.target+d*92,107,y,99)
  elseif id=='WP04' then return band(c.points[i],40,y,91)
  elseif id=='WP15' then return band(c.points[i],62,c.y,98) end
 end
 local function hit(s,w,spec,c,group,a,x,amount)
  if w.primary.hp<=0 then return end
  local hits=c.hits[group]
  if not hits then hits={};c.hits[group]=hits end
  if hits[a] then return end
  hits[a]=true
  local party=owner(s,a)
  if C.damageActor(party,a,amount,{id=w.primary.id,x=x,y=spec.floorY,damageElement='dendro'},true,true)>0 then
   ownLog(party,w,c.id..':hit',a.id,group)
  end
 end
 local function runCast(s,w,spec,c)
  c.t=c.t+1
  if c.t==c.move.locks[1] then commit(s,w,spec,c);log(s,w,c.key..':lock') end
  if c.id=='WP03' then
   if c.t==48 then targetable(w,false)
   elseif c.t==150 then relocate(w,c.target,spec.floorY,135);targetable(w,true) end
  end
  w.phase=c.t>=c.move.recovery and 'recovery' or 'tell'
  for i,win in ipairs(c.move.windows) do
   if c.t>=win[1] and c.t<win[2] then
    local b=shape(spec,c,i)
    w.phase='active'
    for _,a in ipairs(s.actors) do
     if inside(a,b) then hit(s,w,spec,c,i,a,(b.lo+b.hi)/2,c.move.damage) end
     if w.cast~=c then return end
    end
   end
  end
  for i,t in ipairs(c.move.launches) do if c.t==t then
   for j=1,3 do
    local x=c.origin+c.dir*38
    c.shots[#c.shots+1]={x=x,t=c.t,group=i,y=spec.floorY-72+(j-2)*35,dy=(j-2)*.49}
   end
   log(s,w,c.key..':launch',0,i)
  end end
  for i=#c.shots,1,-1 do
   local p=c.shots[i];local age=c.t-p.t
   p.x=p.x+c.dir*352/60;p.y=p.y+p.dy
   if age>=c.move.ttl or p.x<-25 or p.x>985 then table.remove(c.shots,i)
   else
    for _,a in ipairs(s.actors) do
     if a.hp>0 and math.abs(a.x-p.x)<21 and a.y>=p.y-14 and a.y-69<=p.y+14 then
      hit(s,w,spec,c,p.group,a,p.x,c.move.damage)
      if w.cast~=c then return end
     end
    end
   end
  end
  if c.t>=c.move.total then
   w.cast=nil;w.phase='available';w.rest=spec.restTicks
   if w.stage=='prime' then w.normal=w.normal+1 end
  end
 end
 local function domeReady(w,spec)
  return w.wave and w.wave.t>=spec.dome.opens and w.wave.t<spec.dome.expires
 end
 local function shielded(a,w,spec)
  if not domeReady(w,spec) or a.hp<=0 or a.y>spec.floorY+5 then return false end
  if a.y-72<spec.floorY-spec.dome.safeHeight then return false end
  for _,x in ipairs(spec.dome.x) do if math.abs(a.x-x)+8<=spec.dome.safeHalf then return true end end
  return false
 end
 local function waves(s,w,spec)
  local wave=w.wave
  wave.t=wave.t+1
  local config=spec.moves.WP17
  local t=wave.t-spec.moves.WP16.total
  if t==0 then log(s,w,'WP17') end
  w.phase=t<0 and 'protection' or t>=config.recovery and 'recovery' or 'tell'
  for group,window in ipairs(config.windows) do
   if t>=window[1] and t<window[2] then
    w.phase='active'
    if t==window[1] then
     local n=group==#config.windows and spec.dome.impact or config.damage
     wave.id='WP17'
     for _,a in ipairs(s.actors) do if a.hp>0 then
      if shielded(a,w,spec) then ownLog(owner(s,a),w,'WP17:protected',a.id,group)
      else hit(s,w,spec,wave,group,a,w.primary.x,n) end
      if w.wave~=wave then return end
     end end
    end
   end
  end
  if wave.t>=spec.dome.expires then phase(s,w,spec,'weak','WP18') end
 end
 local function update(s,w,spec)
  w.clock=w.clock+1;w.stageTick=w.stageTick+1
  local stage=w.stage
  if stage=='expose' then
   if w.stageTick>=spec.moves.WP05.total then phase(s,w,spec,'defense','WP06') end
  elseif stage=='defense' then
   local result=D.step(s,w,spec)
   if result then phase(s,w,spec,result,result=='rebirth' and 'WP13' or 'WP06:failed') end
  elseif stage=='rebirth' then
   if w.stageTick>=spec.moves.WP13.total then phase(s,w,spec,'prime');w.index=1 end
  elseif stage=='shelter' then waves(s,w,spec)
  elseif stage=='weak' then
   if w.stageTick>=spec.moves.WP18.total then phase(s,w,spec,'prime') end
  elseif stage=='dark' or stage=='prime' then
   if w.cast then runCast(s,w,spec,w.cast);return end
   w.rest=w.rest-1
   if w.rest>0 then return end
   if stage=='prime' and w.normal>=spec.dome.normalBetween and w.clock>=w.lastDome+spec.dome.repeatAfter then
    phase(s,w,spec,'shelter','WP16');return
   end
   local steps=spec.order[stage=='dark' and 1 or 2]
   start(s,w,spec,steps[w.index]);w.index=w.index%#steps+1
  end
 end
 function controller.prepare(s,w)
  for _,a in ipairs(s.actors) do w.actorX[a]=a.x end
 end
 function controller.finish(s,w,spec,dt)
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;update(s,w,spec) end
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  D.clear(s,w);w.cast=nil;w.wave=nil;w.rechallenge=true;targetable(w,false)
 end
 function controller.afterStep(s,w,spec)
  if w.stage=='defense' then D.collide(s,w,spec,w.actorX) end
 end
 local function warnings(spec,c)
  local out={}
  if not c or c.t>=c.move.recovery then return out end
  for i,win in ipairs(c.move.windows) do
   local lead=c.key=='WP01_PRIME' and i==2 and 108 or 0
   if c.t>=lead and c.t<win[2] then
    out[#out+1]={b=shape(spec,c,i),at=win[1]}
   end
  end
  return out
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='apep' then
   if w.stage=='shelter' then
    if a.y<=spec.floorY-65 then return spec.center end
    local closest=nil
    for _,x in ipairs(spec.dome.x) do
     if not closest or math.abs(a.x-x)<math.abs(a.x-closest) then closest=x end
    end
    return closest
   elseif w.stage=='defense' then D.ai(s,w,a) end
   for _,warn in ipairs(warnings(spec,w.cast)) do
    local b=warn.b
    if warn.at-w.cast.t<=32 and inside(a,b) then
     local l,r=b.lo-23,b.hi+23
     if l>=20 and (r>940 or a.x-l<r-a.x) then return l end
     if r<=940 then return r end
    end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 local function paintHeart(x,y,scale,rect)
  local function draw(dx,dy,w,h,c) rect(x+dx*scale,y+dy*scale,w*scale,h*scale,c) end
  draw(-25,-16,50,12,'#566745')
  draw(-22,-51,44,34,'#b5c883')
  draw(-16,-60,32,32,'#cce4a0')
  draw(-9,-66,18,28,'#f2eab4')
  draw(-5,-55,10,21,'#fff5c7')
  draw(-32,-32,13,15,'#87af83');draw(19,-32,13,15,'#87af83')
 end
 function controller.observe(f,s,w,spec,mode,profile)
  local b,e,c,stage=f.weeklyBoss,w.primary,w.cast,w.stage
  local labels={expose='心の露出',defense='オアシスの心を守る',failed='防衛失敗',rebirth='原初の蘇生',shelter='蘇生の保護',weak='余波後の脱力'}
  local ids={expose='WP05',defense='WP06',rebirth='WP13',shelter='WP16',weak='WP18'}
  b.x,b.y,b.apepStage=e.x,e.y,stage
  b.move=c and c.id or ids[stage];b.moveTick=c and c.t or w.stageTick
  b.formName=stage=='dark' and '暗色' or (stage=='prime' or stage=='shelter' or stage=='weak') and '緑の守護者' or nil
  b.damageable=e.hp>0 and not e.invulnerable and not e.underground
  b.label=c and c.move.title or labels[stage] or '構え'
  if stage~='defense' and stage~='failed' then
   b.phaseHp={{name='前半',max=spec.darkHp,hp=math.max(0,e.hp-spec.primeHp)},
    {name='後半',max=spec.primeHp,hp=math.min(e.hp,spec.primeHp)}}
  end
  local v={defense=stage=='defense' or stage=='failed',failed=stage=='failed',
    progress=stage=='failed' and 0 or nil,max=spec.defense.max}
  b.apep=v
  if stage=='shelter' then
   local t=w.wave.t
   b.moveTick=t
   if t>=spec.moves.WP16.total then b.move='WP17';b.label='終末の余波' end
   v.domes={}
   for _,x in ipairs(spec.dome.x) do v.domes[#v.domes+1]={x=x,open=domeReady(w,spec)} end
   v.protected=shielded(player(s),w,spec)
   v.domeTime=spec.dome.expires-t
   for _,window in ipairs(spec.moves.WP17.windows) do
    local hit=spec.moves.WP16.total+window[1]
    if hit>t then v.nextPulse=hit-t;break end
   end
  elseif stage=='weak' and w.stageTick>=spec.dome.exposureStart and w.stageTick<spec.moves.WP18.recovery then
   v.exposure=spec.moves.WP18.recovery-w.stageTick
  end
  if e.hp<=0 then return end
  local backdrop={draws={}}
  local draws=backdrop.draws
  local function rect(x,y,width,height,color,opacity)
   if width>0 then draws[#draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity} end
  end
  local function label(x,y,value,color)
   draws[#draws+1]={kind='text',x=x-s.camera,y=y,text=value,color=color,size=15}
  end
  local function line(x1,y1,x2,y2,color,size)
   local n=math.max(1,math.ceil(math.max(math.abs(x2-x1),math.abs(y2-y1))/8))
   for i=0,n do rect(x1+(x2-x1)*i/n,y1+(y2-y1)*i/n,size,size,color) end
  end
  local y=spec.floorY
  if stage=='dark' or stage=='expose' and w.stageTick<52 then
   if not e.underground or stage=='expose' then
    local h=stage=='expose' and math.max(31,191-w.stageTick*3) or 191
    C.drawFieldDisplayArt(backdrop,C.apepWeeklyArt.dark,e.x-s.camera,y,h,mode,profile,e.dir>0)
   end
  elseif stage=='prime' or stage=='shelter' or stage=='weak' or stage=='rebirth' and w.stageTick>=60 then
   if not e.underground or stage=='rebirth' then
    local h=stage=='weak' and 154 or stage=='rebirth' and math.min(222,64+w.stageTick) or 222
    C.drawFieldDisplayArt(backdrop,C.apepWeeklyArt.prime,e.x-s.camera,y,h,mode,profile,false)
   end
  end
  if v.defense or stage=='expose' and w.stageTick>=48 or stage=='rebirth' then
   paintHeart(spec.center,y,stage=='failed' and .62 or 1,rect)
   if stage~='rebirth' then label(spec.center,y-78,'オアシスの心',mint) end
  end
  if #draws>0 then
   table.move(f.draws,1,#f.draws,#draws+1,draws)
   f.draws=draws
  end
  draws=f.draws
  D.draw(s,w,spec,v,mode,profile,rect,label,line,f)
  b.warnings={}
  for _,hint in ipairs(warnings(spec,c)) do
   local a=hint.b;local on=hint.at<=c.t
   rect(a.lo,a.y-5,a.hi-a.lo,5,on and mint or gold)
   rect(a.lo,a.y-a.h,3,a.h,shadow);rect(a.hi-3,a.y-a.h,3,a.h,shadow)
   if on then rect((a.lo+a.hi)/2-8,a.y-a.h,16,a.h,stage=='dark' and '#b7a786' or mint,.70) end
   b.warnings[#b.warnings+1]={lo=a.lo,hi=a.hi,y=a.y,h=a.h,at=hint.at}
  end
  if c then for _,p in ipairs(c.shots) do
   rect(p.x-10,p.y-4,16,7,mint);rect(p.x-3,p.y-8,8,16,gold)
  end end
  if w.wave and w.wave.t>=spec.dome.show then
   local rule=spec.dome
   for _,x in ipairs(rule.x) do
    if domeReady(w,spec) then
     for i=0,22 do
      local angle=math.pi*i/22
      rect(x+math.cos(angle)*rule.shellHalf-4,y-math.sin(angle)*rule.shellHeight-5,8,7,mint)
     end
     rect(x-rule.safeHalf,y-5,2*rule.safeHalf,4,gold)
     rect(x-rule.safeHalf,y-rule.safeHeight,3,rule.safeHeight,mint,.65)
     rect(x+rule.safeHalf-3,y-rule.safeHeight,3,rule.safeHeight,mint,.65)
    else paintHeart(x,y,.36,rect) end
   end
   if w.phase=='active' then
    local left=15
    for _,x in ipairs(rule.x) do
     rect(left,y-46,x-rule.safeHalf-left,7,gold);rect(left,y-37,x-rule.safeHalf-left,4,mint)
     left=x+rule.safeHalf
    end
    rect(left,y-46,945-left,7,gold);rect(left,y-37,945-left,4,mint)
   end
  end
 end
 return controller
end
