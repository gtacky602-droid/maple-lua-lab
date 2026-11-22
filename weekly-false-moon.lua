return function(C,M)
 local controller={}
 local attack,onMotion,avoid=C.attack,C.onPlayerMotion,C.aiAvoidTarget
 local rules={WM09=true,WM10=true}
 local scheduled={WM01=true,WM02=true,WM03=true,WM04=true,WM05=true,WM06=true,WM07=true,WM08=true}
 local function active(s) return s.actors[s.active] end
 local function living(s)
  local a=active(s)
  if a.hp>0 then return a end
  local ally=s.actors[3-s.active]
  if ally.hp>0 then return ally end
 end
 local function weakKeys() return setmetatable({},{__mode='k'}) end
 local function roomFor(s,w)
  return s.coopWorld or (s.coop and s.coop.weeklySlot==w and s.coop)
 end
 local function forParties(s,w,visit,includeOffline)
  local room=roomFor(s,w)
  if not room then visit(s);return end
  for _,member in ipairs(room.members) do
   if (member.online or includeOffline) and C.sharesCoopField(member.state) then visit(member.state) end
  end
 end
 local function live(s)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='false_moon' and not w.waitUntil then return w,spec end
 end
 local function ownLog(s,w,key,a,n)
  C.combatEvent(s,'false-moon:'..key,a or 0,w.primary.id,n or 0)
 end
 local function log(s,w,key,a,n)
  forParties(s,w,function(party) ownLog(party,w,key,a,n) end)
 end
 local function contribute(s,w,id)
  if s.coop and s.coop.weeklySlot==w then C.coopContact(s,w.primary,id) end
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function targetable(e,open)
  e.invulnerable=not open;e.underground=not open;e.noAutoTarget=not open
 end
 local function ready(s)
  local found=false
  for _,party in ipairs(s.parties or {s}) do
   local a=living(party)
   if a then
    if not (a.ground and a.lock<=2 and not a.grapple and not party.auto) then return false end
    found=true
   end
  end
  return found
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
  contribute(s,w,cast.id)
  if e~=w.primary then w.shadowContributors[s]=cast.id end
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
    noRewards=true,weeklyPart=true,warning=0,respawn=math.huge}
   e.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,e,cast,mult,color,element) end
   w.shadows[#w.shadows+1]=e;s.enemies[#s.enemies+1]=e
  end
 end
 local function start(s,w,spec,key)
  local e=w.primary
  local a=M.target(s,e.x) or e
  local c={key=key,t=0,move=spec.moves[key],origin=e.x,dir=a.x>=e.x and 1 or -1,
   mark=M.point(spec,a.x),seen={}}
  if key=='WM10' and math.abs(a.x-e.x)<108 then
   e.x=M.point(spec,a.x+(a.x<480 and 184 or -184));c.origin=e.x
  end
  if rules[key] then
   c.players=weakKeys();c.ruleTarget=e.x
   forParties(s,w,function(party)
    local a=living(party)
    if a then c.players[party]={logical=a.dir,startedAt=party.t} end
   end)
  end
  if key=='WM14' or key=='WM16' then
   targetable(e,false);forParties(s,w,C.clearWeeklySceneCasts,true)
   e.burning=nil;e.aura=nil;e.applicationClocks=nil
   w.stage=key=='WM14' and 'entering' or 'returning'
   if key=='WM16' then dropShadows(s,w) end
  elseif key=='WM15' then
   w.stage='inner';openShadows(s,w,spec)
  elseif key=='WM17' then
   c.rewindLoss=w.rewindLoss;w.rewindLoss=nil;w.rewindUsed=true
  end
  if key=='WM13' or key=='WM15' then c.votes=weakKeys() end
  w.cast=c;w.phase='warning';w.contactTick=nil
  log(s,w,key)
  return c
 end
 local function switch(s,w,spec,inside)
  local id=inside and spec.innerNode or spec.node
  if not C.moveWeeklyScene(s,id,inside and spec.innerSceneSpawn or spec.sceneSpawn) then error('Unregistered scene: '..id) end
  forParties(s,w,function(party)
   for _,a in ipairs(party.actors) do a.buffer=0;a.jumpInputAt=nil;a.dash=0;a.floatUntil=nil;a.leap=0 end
  end,true)
  w.epoch=w.epoch+1
  log(s,w,'WM18:scene',0,w.epoch)
 end
 local function inRule(c,record,when)
  local elapsed=(when-record.startedAt)*60
  return elapsed>=c.move.rule_window[1]-1e-6 and elapsed<c.move.rule_window[2]-1e-6
 end
 local function breach(s,w,c,record,a,kind)
  if record.violation then return end
  record.violation={actor=a.id,kind=kind}
  ownLog(s,w,c.key..':violation:'..kind,a.id)
 end
 local function look(s,w,c,record,a,dir,at)
  if not dir or not at or at<record.startedAt-1e-6 then return end
  record.logical=dir
  if c.key=='WM10' and inRule(c,record,at) and (c.ruleTarget-a.x)*dir>0 then breach(s,w,c,record,a,'facing') end
 end
 function C.onPlayerMotion(s,a,kind,at,dir)
  if onMotion then onMotion(s,a,kind,at,dir) end
  local w=live(s)
  local c=w and w.cast
  local record=c and c.players and c.players[s]
  if not record or a.id~=s.active or s.auto then return end
  if c.key=='WM09' and inRule(c,record,at) then breach(s,w,c,record,a,kind)
  elseif c.key=='WM10' and kind=='walk' then look(s,w,c,record,a,dir,at) end
 end
 function C.attack(s,a,key)
  local w=live(s)
  local c=w and w.cast
  if c and (w.stage=='entering' or w.stage=='returning' and w.phase~='exposure') then return false end
  local record=c and c.players and c.players[s]
  if not record then return attack(s,a,key) end
  local at=C.playerAttackAt(s,a)
  if not at then return attack(s,a,key) end
  local dash,grapple,leap,float=a.dash,a.grapple,a.leap,a.floatUntil
  local definition=a.id==1 and C.skillDefinitions and C.skillDefinitions[key]
  local direction=record.logical
  local okay=attack(s,a,key)
  if not okay or w.cast~=c then return okay end
  local movement=definition and definition.dash or (a.dash or 0)>(dash or 0) or a.grapple and a.grapple~=grapple or
   (a.leap or 0)>(leap or 0) or (a.floatUntil or 0)>(float or 0)
  if c.key=='WM09' and movement and inRule(c,record,at) then breach(s,w,c,record,a,'root')
  elseif c.key=='WM10' and (not definition or not definition.radial) then look(s,w,c,record,a,direction,at) end
  return okay
 end
 local function stepRule(s,w,spec,c)
  local at,stop=c.move.rule_window[1],c.move.rule_window[2]
  local anySentence=false
  for _,party in ipairs(s.parties or {s}) do
   local record=c.players[party]
   if record then
    local a=living(party)
    if c.t==at and c.key=='WM10' and a and not party.auto and (c.ruleTarget-a.x)*record.logical>0 then
     breach(party,w,c,record,a,'facing')
    elseif c.t==stop and a then
     if record.violation then
      record.sentence={mark=a.x,actor=a,seen=false}
      ownLog(party,w,'WM12',a.id)
     else ownLog(party,w,c.key..':success',a.id) end
    end
    local p=record.sentence
    if p then
     anySentence=true
     local m,t=spec.moves.WM12,c.t-stop
     local owner=p.actor
     if owner.hp<=0 then p.seen=true end
     if t==m.locks[1] then p.mark=owner.x end
     local win=m.windows[1]
     if not p.seen and t>=win[1] and t<win[2] and M.inside(owner,M.ring(p.mark,.55*spec.board.unit,spec.floorY,118,M.ice)) then
      p.seen=true;M.hurt(party,w,spec,'WM12',owner,spec.damage.sentence)
     end
    end
   end
  end
  w.phase=c.t>=stop and (not anySentence and 'exposure' or c.t>=c.move.recovery and 'recover' or 'sentence') or
   c.t>=at and 'rule' or 'prepare'
 end
 local function riftNear(spec,a,x)
  return a.hp>0 and math.abs(a.x-x)<=spec.rift.radius and math.abs(a.y-spec.floorY)<48
 end
 local function voteActor(party,ballot)
  local vote=ballot.votes[party]
  if vote and vote.actor.hp>0 and vote.returns==party.returns then return vote.actor end
 end
 local function votes(s,w,c,prune)
  local count,required=0,0
  forParties(s,w,function(party)
   local a=voteActor(party,c)
   if (not party.coopMember or party.coopMember.online) and living(party) then
    required=required+1
    if a then count=count+1 elseif prune then c.votes[party]=nil end
   elseif prune then c.votes[party]=nil end
  end,true)
  return count,required
 end
 local function unanimous(s,w,c)
  local count,required=votes(s,w,c,true)
  return required>0 and count==required
 end
 local function refreshConfirmation(s,w,c)
  if not unanimous(s,w,c) then c.confirm=nil;return end
  if not c.confirm and c.t+c.move.confirmation_ticks<c.move.total then c.confirm=c.t+c.move.confirmation_ticks end
 end
 function controller.interact(s,w,spec,key)
  local c,a=w.cast,active(s)
  if not c then return end
  local ballot=c.votes and c or c.entry
  if key=='encounter_cancel' and ballot and ballot.votes[s] then
   ballot.votes[s]=nil;ballot.confirm=nil
   log(s,w,ballot.key..':cancel',a.id);return
  end
  if key~='encounter_interact' or s.auto or a.hp<=0 then return end
  if c.key=='WM13' and c.t>=spec.rift.enterTick and c.t+c.move.confirmation_ticks<c.move.total and
     not voteActor(s,c) and riftNear(spec,a,spec.rift.x) then
   c.votes[s]={actor=a,returns=s.returns};refreshConfirmation(s,w,c);log(s,w,'WM13:confirm',a.id)
  elseif c.key=='WM15' and not voteActor(s,c) and riftNear(spec,a,spec.rift.exitX) then
   c.votes[s]={actor=a,returns=s.returns};log(s,w,'WM15:exit',a.id)
  end
 end
 local function stepRift(s,w,spec,c)
  local m=c.move
  w.phase='rift'
  refreshConfirmation(s,w,c)
  if c.confirm and c.t>=c.confirm and c.t<m.total then
   start(s,w,spec,'WM14').entry=c
   return
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
  if w.innerCount==c.move.object_count or c.t>=c.move.total or unanimous(s,w,c) then start(s,w,spec,'WM16');return end
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
  forParties(s,w,function(party)
   local id=w.shadowContributors[party]
   if id then contribute(party,w,id) end
  end)
  if n<=0 then return end
  log(s,w,'WM16:loss',0,n)
  if not s.parties then s.damage=s.damage+n end
  if n==w.primary.hp then
   local party=s.parties and s.parties[1] or s
   C.defeatEnemy(party,w.primary,party.active)
  else w.primary.hp=w.primary.hp-n end
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
   if c.entry and s.parties and not unanimous(s,w,c.entry) then
    c.entry.confirm=nil
    w.stage='outer';w.phase='rift';w.cast=c.entry;targetable(w.primary,true)
    log(s,w,'WM14:vote-changed');return
   end
   if c.t==c.move.scene_commit_tick then
    c.entry=nil
    w.cycle=w.cycle+1;w.defeated={};w.innerCount=0;w.paidCycle=nil;w.lastRift=w.clock
    w.shadowContributors=weakKeys()
    switch(s,w,spec,true)
   end
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
  w.shadows={};w.innerCount=0;w.defeated={};w.paidCycle=nil;w.shadowContributors=weakKeys()
  w.rewindUsed=false;w.rewindLoss=nil;w.contactTick=nil
  w.budget=math.floor(spec.hp*spec.moves.WM15.encounter_fraction_cap)
  local e=w.primary;e.x,e.y,e.dir=spec.center,spec.floorY,-1
  e.hitTop=spec.floorY-108;e.hitBottom=spec.floorY;e.hitHalfWidth=18
  e.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,e,cast,mult,color,element) end
 end
 function controller.attach(s,w,spec)
  s.enemies[#s.enemies+1]=w.primary
  forParties(s,w,function(party)
   party.grappleNodes={};party.selectedGrapple=nil
   for _,a in ipairs(party.actors) do a.grapple=nil end
  end,true)
 end
 function controller.cleanup(s,w)
  dropShadows(s,w);remove(s,w.primary);w.cast=nil;w.contactTick=nil
 end
 function controller.prepare(s,w,spec,input,dt)
  local c=w.cast
  if not c then return end
  w.contactTick=c.t+math.floor(w.remainder+math.min(dt,1/30)*60+1e-8)
  if s.parties and c.players then
   for _,party in ipairs(s.parties) do
    local record=c.players[party]
    if record then record.startedAt=party.t-c.t/60 end
   end
  end
 end
 function controller.leaveCoop(s,w)
  local c=w.cast
  local ballot=c and (c.votes and c or c.entry)
  if ballot then ballot.votes[s]=nil end
  if c and c.players then c.players[s]=nil end
  w.shadowContributors[s]=nil
 end
 function controller.finish(s,w,spec,dt)
  w.contactTick=nil
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;tick(s,w,spec) end
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  w.cast=nil;w.rechallenge=true;targetable(w.primary,false)
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
  local ballot=c.votes and c or c.entry
  if ballot and s.coop and s.coop.weeklySlot==w then
   local voted,required=votes(s,w,ballot)
   v.vote={count=voted,required=required,mine=voteActor(s,ballot)~=nil}
  end
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
   local record=c.players[s]
   if record then
    v.rule={kind=c.key=='WM09' and 'still' or 'away',state=w.phase,
     remaining=math.max(0,(c.t<window[1] and window[1] or window[2])-c.t),violated=record.violation~=nil,
     target=c.ruleTarget,away=c.ruleTarget>a.x and 'left' or 'right'}
   end
   rect(e.x-14,y-201,28,4,record and record.violation and M.moon or M.ice)
   local age=c.t-window[2]
   if age>=0 and age<spec.moves.WM12.windows[1][2] then
    forParties(s,w,function(party)
     local rec=c.players[party]
     if rec and rec.sentence then
      box(rect,M.ring(rec.sentence.mark,.55*spec.board.unit,y,118,party==s and M.ice or M.violet),
       age>=spec.moves.WM12.windows[1][1])
     end
    end)
   end
  elseif c.key=='WM11' and c.t>=90 and c.t<330 then
   for i=-5,5 do rect(spec.center+99*i-c.t%34,y-178,2,140,i%2==0 and M.violet or M.gold,.48) end
  elseif c.key=='WM13' then
   v.canUse=c.t>=spec.rift.enterTick and c.t+c.move.confirmation_ticks<c.move.total and not c.confirm and
    not voteActor(s,c) and riftNear(spec,a,spec.rift.x)
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
   v.canUse=not voteActor(s,c) and riftNear(spec,a,spec.rift.exitX);v.seconds=math.ceil((c.move.total-c.t)/60)
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
