return function(C,M)
 local controller={}
 local attack,onMotion,avoid=C.attack,C.onPlayerMotion,C.aiAvoidTarget
 local rules={WM09=true,WM10=true}
 local scheduled={WM01=true,WM02=true,WM03=true,WM04=true,WM05=true,WM06=true,WM07=true,WM08=true}
 local function active(s) return s.actors[s.active] end
 local function live(s)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='false_moon' and not w.waitUntil then return w,spec end
 end
 local function log(s,w,key,a,n)
  C.combatEvent(s,'false-moon:'..key,a or 0,w.primary.id,n or 0)
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function targetable(e,open)
  e.invulnerable=not open;e.underground=not open;e.noAutoTarget=not open
 end
 local function ready(s)
  local a=active(s)
  return a.hp>0 and a.ground and a.lock<=2 and not a.grapple and not s.auto
 end
 local function contact(s,w,spec,e,cast,mult,color,element)
  if e.hp<=0 or e.invulnerable then return false end
  local c=w.cast
  if c and c.key=='WM16' and e==w.primary and (w.contactTick or c.t)>=c.move.exposure[2] then return false end
  local r=C.enemyResistance(cast,e,element)
  if r>=1 then return false end
  local amount,crit=C.enemyHitDamage(s,cast,e,mult,element,r)
  amount=math.min(amount,e.hp)
  if amount<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+amount
  C.combatNumber(s,e,crit and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,e.id,amount)
  local event=s.events[#s.events]
  event.element=element;event.reaction=cast.reaction or false;event.critical=not not crit
  if amount==e.hp then
   if e==w.primary then C.defeatEnemy(s,e,cast.id)
   else
    e.hp=0;targetable(e,false)
    w.defeated[e.id]=true;w.innerCount=w.innerCount+1
    log(s,w,'WM15:shadow',cast.id,e.id)
   end
  else
   e.hp=e.hp-amount
   local m=spec.moves.WM17
   if e==w.primary and not w.rewindUsed and not w.rewindLoss and amount>=spec.hp*m.trigger_loss_fraction then
    w.rewindLoss=amount;log(s,w,'WM17:reserve',cast.id,amount)
   end
   if C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,amount) end
  end
  return true
 end
 local function dropShadows(s,w)
  for _,e in ipairs(w.shadows) do remove(s,e) end
  w.shadows={}
 end
 local function openShadows(s,w,spec)
  for i,u in ipairs(spec.rift.pointsU) do
   local hp=spec.rift.shadowHp
   local e={id=spec.entity+10+i,kind='shadow',x=M.x(spec,u),y=spec.floorY,hp=hp,maxhp=hp,dir=-1,
    hitTop=spec.floorY-92,hitBottom=spec.floorY,hitHalfWidth=16,level=spec.level,custom=true,boss=true,
    noRewards=true,warning=0,respawn=math.huge}
   e.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,e,cast,mult,color,element) end
   w.shadows[#w.shadows+1]=e;s.enemies[#s.enemies+1]=e
  end
 end
 local function start(s,w,spec,key)
  local a,e=active(s),w.primary
  local c={key=key,t=0,move=spec.moves[key],startedAt=s.t,origin=e.x,dir=a.x>=e.x and 1 or -1,
   mark=M.point(spec,a.x),seen={}}
  if key=='WM10' and math.abs(a.x-e.x)<108 then
   e.x=M.point(spec,a.x+(a.x<480 and 184 or -184));c.origin=e.x
  end
  if rules[key] then
   c.logical=a.dir;c.ruleTarget=e.x
  end
  if key=='WM14' or key=='WM16' then
   targetable(e,false);C.clearWeeklySceneCasts(s)
   e.burning=nil;e.aura=nil;e.applicationClocks=nil
   w.stage=key=='WM14' and 'entering' or 'returning'
   if key=='WM16' then dropShadows(s,w) end
  elseif key=='WM15' then
   w.stage='inner';openShadows(s,w,spec)
  elseif key=='WM17' then
   c.rewindLoss=w.rewindLoss;w.rewindLoss=nil;w.rewindUsed=true
  end
  w.cast=c;w.phase='warning';w.contactTick=nil
  log(s,w,key)
  return c
 end
 local function switch(s,w,spec,inside)
  local id=inside and spec.innerNode or spec.node
  if not C.moveWeeklyScene(s,id,inside and spec.rift.innerSpawn or spec.rift.outerSpawn) then error('Unregistered scene: '..id) end
  for _,a in ipairs(s.actors) do a.buffer=0;a.jumpInputAt=nil;a.dash=0;a.floatUntil=nil;a.leap=0 end
  w.epoch=w.epoch+1
  log(s,w,'WM18:scene',0,w.epoch)
 end
 local function inRule(c,when)
  local elapsed=(when-c.startedAt)*60
  return elapsed>=c.move.rule_window[1]-1e-6 and elapsed<c.move.rule_window[2]-1e-6
 end
 local function breach(s,w,c,a,kind)
  if c.violation then return end
  c.violation={actor=a.id,kind=kind}
  log(s,w,c.key..':violation:'..kind,a.id)
 end
 local function look(s,w,c,a,dir,at)
  if not dir or not at or at<c.startedAt-1e-6 then return end
  c.logical=dir
  if c.key=='WM10' and inRule(c,at) and (c.ruleTarget-a.x)*dir>0 then breach(s,w,c,a,'facing') end
 end
 function C.onPlayerMotion(s,a,kind,at,dir)
  if onMotion then onMotion(s,a,kind,at,dir) end
  local w=live(s)
  local c=w and w.cast
  if not c or not rules[c.key] or a.id~=s.active or s.auto then return end
  if c.key=='WM09' and inRule(c,at) then breach(s,w,c,a,kind)
  elseif c.key=='WM10' and kind=='walk' then look(s,w,c,a,dir,at) end
 end
 function C.attack(s,a,key)
  local w=live(s)
  local c=w and w.cast
  if c and (w.stage=='entering' or w.stage=='returning' and w.phase~='exposure') then return false end
  if not c or not rules[c.key] then return attack(s,a,key) end
  local at=C.playerAttackAt(s,a)
  if not at then return attack(s,a,key) end
  local dash,grapple,leap,float=a.dash,a.grapple,a.leap,a.floatUntil
  local definition=a.id==1 and C.skillDefinitions and C.skillDefinitions[key]
  local direction=c.logical or a.dir
  local okay=attack(s,a,key)
  if not okay or w.cast~=c then return okay end
  local movement=definition and definition.dash or (a.dash or 0)>(dash or 0) or a.grapple and a.grapple~=grapple or
   (a.leap or 0)>(leap or 0) or (a.floatUntil or 0)>(float or 0)
  if c.key=='WM09' and movement and inRule(c,at) then breach(s,w,c,a,'root')
  elseif c.key=='WM10' and (not definition or not definition.radial) then look(s,w,c,a,direction,at) end
  return okay
 end
 local function stepRule(s,w,spec,c)
  local at,stop=c.move.rule_window[1],c.move.rule_window[2]
  local a=active(s)
  if c.t==at and c.key=='WM10' and not s.auto and (c.ruleTarget-a.x)*c.logical>0 then
   breach(s,w,c,a,'facing')
  end
  if c.t==stop then
   if c.violation and a.hp>0 then
    c.sentence={t=0,mark=a.x,owner=a.id,seen=false}
    log(s,w,'WM12',a.id)
   else log(s,w,c.key..':success',a.id) end
  end
  local p=c.sentence
  if p then
   local m=spec.moves.WM12
   p.t=c.t-stop
   local owner=s.actors[p.owner]
   if owner.hp<=0 then p.seen=true end
   if p.t==m.locks[1] then p.mark=owner.x end
   local win=m.windows[1]
   if not p.seen and p.t>=win[1] and p.t<win[2] and M.inside(owner,M.ring(p.mark,.55*spec.board.unit,spec.floorY,118,M.ice)) then
    p.seen=true;M.hurt(s,w,spec,'WM12',owner,spec.damage.sentence)
   end
  end
  w.phase=c.t>=stop and (not p and 'exposure' or c.t>=c.move.recovery and 'recover' or 'sentence') or
   c.t>=at and 'rule' or 'prepare'
 end
 local function riftNear(spec,a,x)
  return a.hp>0 and math.abs(a.x-x)<=spec.rift.radius and math.abs(a.y-spec.floorY)<48
 end
 local function cycleStart(s,w,spec)
  w.cycle=w.cycle+1;w.defeated={};w.innerCount=0;w.paidCycle=nil;w.lastRift=w.clock
  start(s,w,spec,'WM14')
 end
 function controller.interact(s,w,spec,key)
  local c,a=w.cast,active(s)
  if not c then return end
  if key=='encounter_cancel' and c.key=='WM13' and c.confirm then
   c.confirm=nil;c.confirmActor=nil;log(s,w,'WM13:cancel',a.id);return
  end
  if key~='encounter_interact' or s.auto or a.hp<=0 then return end
  if c.key=='WM13' and c.t>=spec.rift.enterTick and c.t+c.move.confirmation_ticks<c.move.total and not c.confirm and riftNear(spec,a,spec.rift.x) then
   c.confirm=c.t+c.move.confirmation_ticks;c.confirmActor=a.id;log(s,w,'WM13:confirm',a.id)
  elseif c.key=='WM15' and riftNear(spec,a,spec.rift.exitX) then c.exit=true;log(s,w,'WM15:exit',a.id) end
 end
 local function stepRift(s,w,spec,c)
  local m=c.move
  w.phase='rift'
  if c.confirm then
   if s.actors[c.confirmActor].hp<=0 then c.confirm=nil;c.confirmActor=nil;log(s,w,'WM13:cancel')
   elseif c.t>=c.confirm and c.t<m.total then cycleStart(s,w,spec);return end
  end
  local p=m.damage_pulses
  if c.t>=p.first_tick and (c.t-p.first_tick)%p.period_ticks==0 then
   for _,a in ipairs(s.actors) do
    for _,u in ipairs(spec.rift.pointsU) do
     local z=M.ring(M.x(spec,u),.55*spec.board.unit,spec.floorY,64,M.moon)
     if M.inside(a,z) then M.hurt(s,w,spec,'WM13',a,spec.damage.pulse);break end
    end
   end
  end
 end
 local function shadowWave(spec,e)
  if e.x<spec.center then return M.band(e.x-133,e.x+23,spec.floorY,.58*spec.board.unit,M.ice) end
  return M.band(e.x-19,e.x+128,spec.floorY,.58*spec.board.unit,M.ice)
 end
 local function stepInner(s,w,spec,c)
  if c.exit or w.innerCount==c.move.object_count or c.t>=c.move.total then start(s,w,spec,'WM16');return end
  w.phase='inner'
  for i,e in ipairs(w.shadows) do
   if e.hp>0 then
    local at=spec.rift.shadowFirst+(i-1)*60
    if c.t>=at and (c.t-at)%spec.rift.shadowPeriod==0 then
     local z=shadowWave(spec,e)
     for _,a in ipairs(s.actors) do if M.inside(a,z) then M.hurt(s,w,spec,'WM15',a,spec.damage.inner,e) end end
    end
   end
  end
 end
 local function settle(s,w,spec)
  if w.paidCycle==w.cycle then return end
  w.paidCycle=w.cycle
  local n=math.min(w.primary.hp,w.budget,w.innerCount*math.floor(spec.hp*spec.moves.WM15.per_kill_main_maxhp_fraction))
  w.budget=w.budget-n
  if n<=0 then return end
  s.damage=s.damage+n;log(s,w,'WM16:loss',0,n)
  if n==w.primary.hp then C.defeatEnemy(s,w.primary,s.active) else w.primary.hp=w.primary.hp-n end
 end
 local function tick(s,w,spec)
  w.clock=w.clock+1
  if not w.cast then
   if w.rest>0 then w.rest=w.rest-1;return end
   if w.rewindLoss and not w.rewindUsed then start(s,w,spec,'WM17');return end
   local key=spec.order[w.index];w.index=w.index%#spec.order+1
   if (rules[key] or key=='WM08') and not ready(s) or key=='WM13' and w.clock<w.lastRift+spec.rift.spacing then
    w.rest=30;return
   end
   start(s,w,spec,key);return
  end
  local c=w.cast
  c.t=c.t+1;w.phase=c.t>=c.move.recovery and 'recover' or 'warning'
  if c.key=='WM15' then stepInner(s,w,spec,c);return end
  if c.key=='WM14' then
   w.phase='entering'
   if c.t==c.move.scene_commit_tick then switch(s,w,spec,true) end
   if c.t>=c.move.total then start(s,w,spec,'WM15') end
   return
  end
  if c.key=='WM16' then
   w.phase='returning'
   local exposed=c.t>=c.move.exposure[1] and c.t<c.move.exposure[2]
   if c.t==c.move.scene_commit_tick then switch(s,w,spec,false) end
   if c.t==c.move.settlement_tick then settle(s,w,spec) end
   if w.primary.hp<=0 then return end
   targetable(w.primary,exposed)
   if exposed then w.phase='exposure' end
  elseif c.key=='WM13' then stepRift(s,w,spec,c)
  elseif rules[c.key] then stepRule(s,w,spec,c)
  elseif scheduled[c.key] then M.tick(s,w,spec,c)
  elseif c.key=='WM17' and c.t==c.move.heal_tick then
   local e=w.primary
   local n=math.min(math.floor(c.rewindLoss*c.move.loss_refund_fraction),math.floor(spec.hp*c.move.max_heal_fraction),e.maxhp-e.hp)
   if e.hp>0 and n>0 then e.hp=e.hp+n;log(s,w,'WM17:heal',0,n) end
  end
  if w.cast==c and c.t>=c.move.total then
   if c.key=='WM13' then w.lastRift=w.clock end
   w.stage='outer';w.cast=nil;w.rest=spec.restTicks;w.phase='available';targetable(w.primary,true)
  end
 end
 function controller.spawn(s,w,spec)
  w.clock,w.remainder,w.index,w.rest=0,0,1,spec.noticeTicks
  w.stage='outer';w.epoch=0;w.cycle=0;w.lastRift=-math.huge
  w.shadows={};w.innerCount=0;w.defeated={};w.paidCycle=nil
  w.rewindUsed=false;w.rewindLoss=nil;w.contactTick=nil
  w.budget=math.floor(spec.hp*spec.moves.WM15.encounter_fraction_cap)
  local e=w.primary;e.x,e.y,e.dir=spec.center,spec.floorY,-1
  e.hitTop=spec.floorY-108;e.hitBottom=spec.floorY;e.hitHalfWidth=18
  e.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,e,cast,mult,color,element) end
 end
 function controller.attach(s,w,spec)
  s.enemies[#s.enemies+1]=w.primary
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  dropShadows(s,w);remove(s,w.primary);w.cast=nil;w.contactTick=nil
 end
 function controller.prepare(s,w,spec,input,dt)
  local c=w.cast
  if c then w.contactTick=c.t+math.floor(w.remainder+math.min(dt,1/30)*60+1e-8) end
 end
 function controller.finish(s,w,spec,dt)
  w.contactTick=nil
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;tick(s,w,spec) end
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=live(s)
  local c=w and w.cast
  if c then
   if rules[c.key] and c.t<c.move.rule_window[2] or w.stage=='entering' or w.stage=='returning' and w.phase~='exposure' then return a.x end
   if c.key=='WM08' and c.t>=282 and c.t<372 then
    if M.coverAt(spec,a) then return a.x end
    local best,distance
    for i in ipairs(spec.cover.pointsU) do
     local ward=M.ward(spec,i);local x=(ward.lo+ward.hi)/2
     if not best or math.abs(x-a.x)<distance then best,distance=x,math.abs(x-a.x) end
    end
    return best
   end
  end
  if avoid then return avoid(s,a) end
 end
 local function painter(f,s)
  return function(x,y,width,height,color,opacity)
   if width<=0 or height<=0 then return end
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity}
  end
 end
 local function orbits(rect,x,y,age,down)
  local radius=down and 53 or 68
  for i=0,31 do
   local a=2*math.pi*i/32
   rect(x+math.cos(a)*radius-3,y+math.sin(a)*radius*.77-3,6,6,i%4==0 and M.water or M.gold,.81)
  end
  for i=1,3 do
   local a=age*.012+i*2*math.pi/3
   local px,py=x+math.cos(a)*(radius+17),y+math.sin(a)*(radius+4)
   local co=i==1 and M.water or i==2 and M.violet or M.ice
   rect(px-6,py-4,12,8,co);rect(px-3,py-8,6,16,co)
  end
 end
 local function box(rect,z,active)
  local alpha=active and 1 or .62
  rect(z.lo,z.y-3,z.hi-z.lo,3,z.color,alpha)
  rect(z.lo,z.y-z.h,2,z.h,z.color,alpha);rect(z.hi-2,z.y-z.h,2,z.h,z.color,alpha)
  if active then rect(z.lo,z.y-z.h,z.hi-z.lo,2,z.color,.9) end
 end
 local labels={outer='外界',entering='異界へ移動中',inner='異界',returning='外界へ帰還'}
 function controller.observe(f,s,w,spec,mode,profile)
  local b,e,c=f.weeklyBoss,w.primary,w.cast
  b.label=c and c.move.title or '構え直し';b.formName=labels[w.stage]
  b.x,b.y,b.damageable=e.x,e.y,e.hp>0 and not e.invulnerable
  local v={stage=w.stage,scene=s.story.node==spec.innerNode and 'inner' or 'outer',epoch=w.epoch,
   card=c and c.key,tick=c and c.t,pendingDamage=w.innerCount,limit=w.budget,
   shadows={},wards={},warnings={}}
  b.falseMoon=v
  if e.hp<=0 then return end
  local back={draws={}};local rear=painter(back,s)
  local art=C.falseMoonWeeklyArt.idle;local y=spec.floorY
  local inside=v.scene=='inner'
  if not inside then
   local down=w.phase=='exposure';local hover=down and 0 or 15+math.sin(w.clock/25)*3
   orbits(rear,e.x,y-109-hover,w.clock,down)
   C.drawFieldDisplayArt(back,art,e.x-s.camera,e.y-hover,down and 136 or 148,mode,profile,e.dir>0)
  end
  for i,shadow in ipairs(w.shadows) do
   v.shadows[#v.shadows+1]={x=shadow.x,hp=shadow.hp,max=shadow.maxhp,id=shadow.id}
   if shadow.hp>0 then
    rear(shadow.x-18,y-3,36,3,M.ice)
    C.drawFieldDisplayArt(back,art,shadow.x-s.camera,y,128,mode,profile,false,nil,nil,.64)
    local glow=({M.ice,M.violet,M.water})[i]
    rear(shadow.x-5,y-140,10,9,glow);rear(shadow.x-3,y-144,6,17,glow)
   end
  end
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws);f.draws=back.draws
  if not c then return end
  local rect=painter(f,s);local a=active(s)
  if scheduled[c.key] then
   v.warnings=M.warnings(w,spec,c)
   for _,z in ipairs(v.warnings) do box(rect,z,c.t>=z.at) end
  end
  if c.key=='WM01' and c.arrival and c.t<72 then rect(c.arrival-38,y-7,76,4,M.water) end
  if c.key=='WM08' then
   local opens,closes=table.unpack(c.move.protection)
   if c.t>=60 and c.t<closes then
    for i,u in ipairs(spec.cover.pointsU) do
     local x=M.x(spec,u);local ward=M.ward(spec,i)
     v.wards[#v.wards+1]={lo=ward.lo,hi=ward.hi,active=c.t>=opens}
     if c.t>=126 then
      rect(x-13,y-125,26,125,'#536783');rect(x-8,y-129,16,13,M.gold);rect(x-4,y-112,8,93,M.water,.7)
     end
     box(rect,ward,c.t>=opens and M.protects(a,ward))
    end
   end
   if c.t>=300 and c.t<372 then
    for i=1,8 do rect(e.x-80+i*17,y-207-math.abs(i-4)*5,10,7,M.ice,.68) end
   end
   v.cover=M.coverAt(spec,a)~=nil and c.t>=opens and c.t<closes
  elseif rules[c.key] then
   local window=c.move.rule_window
   v.rule={kind=c.key=='WM09' and 'still' or 'away',state=w.phase,
    remaining=math.max(0,(c.t<window[1] and window[1] or window[2])-c.t),violated=c.violation~=nil,
    target=c.ruleTarget,away=c.ruleTarget>a.x and 'left' or 'right'}
   rect(e.x-14,y-201,28,4,c.violation and M.moon or M.ice)
   if c.sentence and c.sentence.t<66 then
    box(rect,M.ring(c.sentence.mark,.55*spec.board.unit,y,118,M.ice),c.sentence.t>=60)
   end
  elseif c.key=='WM11' and c.t>=90 and c.t<330 then
   for i=-5,5 do rect(spec.center+99*i-c.t%34,y-178,2,140,i%2==0 and M.violet or M.gold,.48) end
  elseif c.key=='WM13' then
   v.canUse=c.t>=spec.rift.enterTick and c.t+c.move.confirmation_ticks<c.move.total and not c.confirm and riftNear(spec,a,spec.rift.x)
   v.confirm=c.confirm and c.confirm-c.t
   if c.t>=spec.rift.enterTick then
    rect(spec.rift.x-23,y-103,46,103,'#473661');rect(spec.rift.x-13,y-92,26,89,M.violet,.78)
   end
   local p=c.move.damage_pulses
   local nextAt=c.t<=p.first_tick and p.first_tick or p.first_tick+math.ceil((c.t-p.first_tick)/p.period_ticks)*p.period_ticks
   for _,u in ipairs(spec.rift.pointsU) do
    local x=M.x(spec,u)
    rect(x-42,y-6,84,5,M.moon,nextAt-c.t<=p.tell_ticks and .95 or .42)
   end
  elseif c.key=='WM15' then
   v.canUse=riftNear(spec,a,spec.rift.exitX);v.seconds=math.ceil((c.move.total-c.t)/60)
   rect(spec.rift.exitX-18,y-84,36,84,'#3f3d69');rect(spec.rift.exitX-13,y-77,26,74,M.ice,.67)
   for i,shadow in ipairs(w.shadows) do
    if shadow.hp>0 then
     local at=spec.rift.shadowFirst+(i-1)*60
     if c.t>at then at=at+math.ceil((c.t-at)/spec.rift.shadowPeriod)*spec.rift.shadowPeriod end
     if at-c.t<=spec.rift.shadowWarn then box(rect,shadowWave(spec,shadow),at==c.t) end
    end
   end
  elseif c.key=='WM16' and w.phase=='exposure' then
   v.exposure=c.move.exposure[2]-c.t
  end
 end
 return controller
end
