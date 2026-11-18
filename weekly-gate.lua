return function(C,M)
 local controller={}
 local previousFactor,previousAvoid=C.fieldMoveFactor,C.aiAvoidTarget
 local cancelInput={jump=true,drop=true,dodge=true,normal=true,skill1=true,skill2=true,skill3=true,skill4=true}
 local queenMoves={WT06=true,WT07=true,WT08=true,WT12=true,WT13=true}
 local transient={WT09=true,WT16=true,WT17=true,WT18=true,WT19=true}
 local function active(s) return s.actors[s.active] end
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local function fromU(s,u) return s.board.left+s.board.unit*u end
 local function board(s,x) return clamp(x,s.board.left+13,s.board.right-13) end
 local function log(s,w,key,actor,n) C.combatEvent(s,'gate:'..key,actor or 0,w.primary.id,n or 0) end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function clearAuras(e)
  e.aura=nil;e.burning=nil;e.applicationClocks=nil
 end
 local function royalMax(spec) return spec.kingHp+spec.queenHp end
 local function syncHP(w,spec)
  local hp=w.king.hp+w.queen.hp+(w.stage=='royal' and 0 or royalMax(spec))
  if hp>0 then w.primary.hp=hp end
 end
 local function available(w,e)
  if w.stage=='royal' then return e.hp>0 end
  return e==((w.stage=='queen') and w.queen or w.king) and e.hp>0
 end
 local function targetable(w,yes)
  for _,e in ipairs({w.king,w.queen}) do
   local live=yes and available(w,e)
   e.invulnerable=not live;e.underground=not live;e.noAutoTarget=not live
  end
 end
 local function cancelHold(w,c,reason,s)
  if c.hold then
   log(s,w,'WT20:cancel:'..reason,c.hold.actor)
   c.hold=nil
   if reason~='released' then w.requireRelease=true end
  end
 end
 local function transition(s,w,spec,stage)
  w.stage=stage;w.index=1;w.phase='available';w.rest=spec.restTicks;w.cast=nil
  w.king.x=fromU(spec,stage=='king' and 1.8 or 3.4);w.queen.x=fromU(spec,6.55)
  for _,e in ipairs({w.king,w.queen}) do clearAuras(e) end
  targetable(w,true);syncHP(w,spec);log(s,w,'phase:'..stage)
 end
 local function start(s,w,spec,key)
  if w.cast then cancelHold(w,w.cast,'target',s) end
  local first=queenMoves[key] and w.queen or w.king
  if first.hp<=0 then first=first==w.king and w.queen or w.king end
  local a=active(s)
  local c={key=key,move=spec.moves[key],t=0,body=first,x=first.x,dir=a.x>=first.x and 1 or -1,
   mark=board(spec,a.x),points={},shots={},seen={}}
  w.cast=c;w.phase='warning'
  targetable(w,not (key=='WT03' or key=='WT05' or key=='WT09' or key=='WT18'))
  if key=='WT03' then
   c.pawns={}
   for i,u in ipairs(spec.charge.pawnU) do c.pawns[i]={x=fromU(spec,u),next=90+i*44} end
   c.shield=#c.pawns;c.failures=0;c.next=0
  elseif key=='WT05' then
   c.g=c.move.shield_units;c.last={};c.casts=setmetatable({},{__mode='k'})
   w.king.invulnerable=false;w.king.noAutoTarget=false;w.king.underground=false
  elseif key=='WT16' or key=='WT17' then
   c.freeze=0;c.ready=0;c.freezeBy=c.move.freeze_completed_by or c.move.deadline_ticks-1
   if key=='WT17' then
    w.king.x=fromU(spec,spec.charge.royalKingU);w.queen.x=fromU(spec,spec.charge.royalQueenU)
    c.body=w.queen
   else w.king.x=spec.center end
  elseif key=='WT19' then
   c.donor=w.king.hp>0 and w.king or w.queen;c.receiver=c.donor==w.king and w.queen or w.king
  end
  log(s,w,key)
  return c
 end
 local function contact(s,w,spec,e,cast,mult,color,element)
  if e.hp<=0 or e.invulnerable then return false end
  local c=w.cast
  local tick=w.contactTick or c and c.t
  if c and c.key=='WT05' then
   if tick>=c.move.total or c.g<=0 or e~=w.king then return false end
   local root=cast.rootCast or cast
   local clock=w.clock+tick-c.t
   if c.casts[root] or clock<(c.last[cast.id] or -math.huge)+24 then return false end
   c.casts[root]=true;c.last[cast.id]=clock
   local n=math.min(c.g,element=='physical' and 1 or 2)
   c.g=c.g-n;log(s,w,'WT05:barrier',cast.id,n)
   return true
  end
  if c and c.key=='WT18' and tick>=c.move.exposure[2] then return false end
  local floor=w.stage=='king' and e==w.king and math.floor(spec.pieceKingHp*.25) or 0
  local resist=C.enemyResistance(cast,e,element)
  if resist>=1 then return false end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,resist)
  n=math.min(e.hp-floor,n)
  if n<=0 then return false end
  e.hp=e.hp-n
  if e.hp<=0 then e.underground=true;e.noAutoTarget=true;clearAuras(e) end
  s.hits=s.hits+1;s.damage=s.damage+n
  C.combatNumber(s,e,critical and n..'!' or n,color)
  C.combatEvent(s,'hit',cast.id,e.id,n)
  local event=s.events[#s.events]
  event.element=element;event.reaction=cast.reaction or false;event.critical=not not critical
  syncHP(w,spec)
  if e.hp>0 and C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  return true
 end
 local function royal(s,w,spec)
  for _,data in ipairs({{w.king,spec.kingHp},{w.queen,spec.queenHp}}) do
   local e=data[1]
   e.hp=data[2];e.maxhp=e.hp;e.generation=e.generation+1;clearAuras(e)
  end
  w.stage='royal';w.index=1
  w.king.x,w.queen.x=fromU(spec,2.9),fromU(spec,6.8)
  syncHP(w,spec);targetable(w,false);log(s,w,'WT09:pair')
 end
 function controller.spawn(s,w,spec)
  w.clock,w.remainder=0,0;w.reviveLeft=spec.moves.WT19.revive_budget_total
  w.pawnsDone=false;w.requireRelease=false;w.contactTick=nil
  local function body(id,hp,x,dir)
   local e={id=spec.entity+id,hp=hp,maxhp=hp,x=x,y=spec.floorY,hitTop=spec.floorY-86,hitBottom=spec.floorY,
    hitHalfWidth=22,dir=dir,level=spec.level,custom=true,boss=true,noRewards=true,warning=0,respawn=math.huge,generation=1}
   e.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,e,cast,mult,color,element) end
   return e
  end
  w.king=body(1,spec.pieceKingHp,fromU(spec,2),1);w.queen=body(2,spec.pieceQueenHp,fromU(spec,6.55),-1)
  transition(s,w,spec,'king');w.rest=spec.noticeTicks
 end
 function controller.attach(s,w,spec)
  s.enemies[#s.enemies+1]=w.king;s.enemies[#s.enemies+1]=w.queen
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  if w.cast then cancelHold(w,w.cast,'scene',s) end
  w.cast=nil;w.contactTick=nil;w.requireRelease=false
  remove(s,w.king);remove(s,w.queen)
 end
 local function rest(w,spec)
  w.cast=nil;w.phase='available';w.rest=spec.restTicks;targetable(w,true)
 end
 local function choose(s,w,spec)
  if w.stage=='king' and not w.pawnsDone then start(s,w,spec,'WT03');return end
  if w.stage=='king' and w.king.hp<=math.floor(spec.pieceKingHp*.25) then transition(s,w,spec,'queen');return end
  local royalPhase=w.stage=='royal'
  local list=royalPhase and spec.royalOrder or w.stage=='queen' and spec.queenOrder or spec.kingOrder
  local key=list[w.index];w.index=w.index%#list+1
  if royalPhase and (w.king.hp<=0 or w.queen.hp<=0) then
   if key=='WT17' or key=='WT14' or key=='WT15' or (w.king.hp<=0 and not queenMoves[key]) or
      (w.queen.hp<=0 and queenMoves[key]) then key=w.king.hp<=0 and 'WT12' or 'WT10' end
  end
  start(s,w,spec,key)
 end
 local function resolveDeaths(s,w,spec)
  if w.stage=='royal' then
   if w.king.hp<=0 and w.queen.hp<=0 then
    C.defeatEnemy(s,w.primary,s.active);return true
   end
   local dead=w.king.hp<=0 and w.king or w.queen.hp<=0 and w.queen
   if dead and not dead.retired and (not w.cast or w.cast.key~='WT19') then start(s,w,spec,'WT19');return true end
  elseif w.stage=='queen' and w.queen.hp<=0 then transition(s,w,spec,'finish');return true
  elseif w.stage=='finish' and w.king.hp<=0 and (not w.cast or w.cast.key~='WT09') then
   start(s,w,spec,'WT09');return true
  end
  return false
 end
 local function chargeLock(s,w,spec,run,leftOnly)
  local a=active(s)
  local from=w.king.x
  local max=spec.charge.rangeU*spec.board.unit
  run.origin=from
  run.owner=s.active
  run.goal=board(spec,from+clamp(a.x-from,-max,max))
  if leftOnly then run.goal=math.max(from,run.goal) end
  run.prior=from;w.king.dir=run.goal>=from and 1 or -1
 end
 local function chargeMove(s,w,spec,c,run,i,length)
  local x=run.origin+(run.goal-run.origin)*(i+1)/length
  local lo,hi=math.min(run.prior,x),math.max(run.prior,x)
  local impact
  if c.key=='WT03' then
   local front=spec.board.unit*.29
   for _,pawn in ipairs(c.pawns) do
    if not pawn.broken and pawn.x>=lo and pawn.x<=hi+front then impact=pawn;break end
   end
  else
   local front=spec.board.unit*.74
   if run.goal>=fromU(spec,c.move.lure_min_x_U) and w.queen.x>=lo and w.queen.x<=hi+front then impact=w.queen end
  end
  local separation=c.key=='WT03' and 12 or spec.board.unit*.74
  w.king.x=impact and math.min(x,impact.x-separation) or x
  if impact then return impact end
  M.damage(s,w,spec,c,{M.band(lo-13,hi+13,spec.floorY,.9*spec.board.unit,M.gold)},
   run.seen,spec.damage.charge,w.king)
  run.prior=x
 end
 local function pawnTick(s,w,spec,c)
  local cfg=spec.charge
  if not c.run and c.t>=c.next then
   c.run={start=c.t,seen={},owner=s.active};w.king.x=fromU(spec,cfg.kingStartU)
   log(s,w,'WT04',s.active,c.shield)
  end
  local run=c.run
  if run then
   local t=c.t-run.start
   if t<=cfg.lock and s.actors[run.owner].hp<=0 then
    run.start=c.t;run.owner=s.active
   elseif t==cfg.lock then chargeLock(s,w,spec,run,true);log(s,w,'WT04:lock',run.owner,run.goal)
   elseif t>=cfg.active[1] and t<cfg.active[2] and not run.hit then
    local pawn=chargeMove(s,w,spec,c,run,t-cfg.active[1],cfg.active[2]-cfg.active[1])
    if pawn then
     pawn.broken=true;run.hit=true;c.shield=c.shield-1;c.failures=0
     log(s,w,'WT04:pawn',run.owner,c.shield)
     if c.shield==0 then w.pawnsDone=true;start(s,w,spec,'WT18');return end
    end
   elseif t==cfg.finish then
    if not run.hit then c.failures=c.failures+1;log(s,w,'WT04:miss',run.owner,c.failures) end
    c.run=nil;c.next=c.t+(c.failures>=3 and 84 or 50)
   end
  end
  for _,p in ipairs(c.pawns) do
   if not p.broken then
    if p.attack then
     local a=p.attack
     if c.t>=a.at and c.t<a.at+8 then
      M.damage(s,w,spec,c,{M.band(p.x,p.x+a.dir*.8*spec.board.unit,spec.floorY,64,M.fire)},a.seen,spec.damage.pawn)
     elseif c.t>=a.at+8 then p.attack=nil;p.next=c.t+cfg.pawnGap end
    elseif c.t>=p.next and math.abs(active(s).x-p.x)<=.8*spec.board.unit then
     p.attack={at=c.t+cfg.pawnWarn,dir=active(s).x>=p.x and 1 or -1,seen={}}
    end
   end
  end
 end
 local function frostAt(spec,a)
  if not a.ground or math.abs(a.y-spec.floorY)>5 then return end
  local move=spec.moves.WT20
  for i,u in ipairs(move.context_positions_U) do
   if math.abs(a.x-fromU(spec,u))<=move.context_radius_U*spec.board.unit then return i end
  end
 end
 local function summonRun(s,w,spec,c)
  if c.t>c.move.last_retry_start_tick then return end
  w.king.x=fromU(spec,spec.charge.royalKingU)
  c.run={start=c.t,owner=s.active,seen={}}
  log(s,w,'WT17:lead',s.active,c.t)
 end
 local function freezeTick(s,w,spec,c)
  local a=active(s)
  if c.freeze<100 and c.t<=c.freezeBy then
   local at=frostAt(spec,a)
   local h=c.hold
   if h and (not w.held or a.id~=h.actor or a.hp<=0 or h.at~=at or a.hp<h.hp or a.channel) then
    cancelHold(w,c,not w.held and 'released' or 'owner',s);h=nil
   end
   if not c.hold and w.held and not w.requireRelease and not s.auto and a.hp>0 and a.lock<=0 and
      not a.channel and at and c.t>=c.ready then
    c.hold={actor=a.id,at=at,start=c.t,hp=a.hp}
    log(s,w,'WT20:hold',a.id,at)
   elseif h and c.t-h.start>=spec.moves.WT20.context_channel_ticks then
    c.hold=nil;c.ready=c.t+spec.moves.WT20.context_cooldown_ticks;w.requireRelease=true
    c.freeze=math.min(100,c.freeze+spec.moves.WT20.context_gain)
    log(s,w,'WT20:complete',a.id,c.freeze)
    if c.freeze==100 then
     if c.key=='WT16' then start(s,w,spec,'WT18');return end
     summonRun(s,w,spec,c)
    end
   end
  else cancelHold(w,c,'deadline',s) end
  local run=c.run
  if run and c.t<c.move.deadline_ticks then
   local t=c.t-run.start
   local window=c.move.charge_window_offset
   if t<=c.move.lock_offset and s.actors[run.owner].hp<=0 then
    c.run=nil;summonRun(s,w,spec,c)
   elseif t==c.move.lock_offset then
    chargeLock(s,w,spec,run,true);log(s,w,'WT17:lock',run.owner,run.goal)
   elseif t>=window[1] and t<window[2] then
    if chargeMove(s,w,spec,c,run,t-window[1],window[2]-window[1]) then
     log(s,w,'WT17:collision',run.owner,w.king.x);start(s,w,spec,'WT18');return
    end
   elseif t==window[2] then
    c.run=nil;log(s,w,'WT17:miss',run.owner,c.t);summonRun(s,w,spec,c)
   end
  end
  local window=c.move.failure_window
  if c.t>=window[1] and c.t<window[2] then
   cancelHold(w,c,'deadline',s)
   M.damage(s,w,spec,c,{M.band(spec.board.left,spec.board.right,spec.floorY,350,M.water)},c.seen,spec.damage.catastrophe)
   w.phase='active'
  end
 end
 local function bishopTick(s,w,spec,c)
  if c.g==0 then start(s,w,spec,'WT18');return end
  local cycle=c.t%c.move.pulse_period_ticks
  if cycle==0 then c.seen={};c.points={} end
  if cycle==c.move.relative_lock_tick then
   local x=active(s).x
   for i=-1,1 do c.points[i+2]=board(spec,x+i*105) end
  end
  for i,win in ipairs(c.move.windows) do
   if cycle>=win[1] and cycle<win[2] then
    local x=c.points[i] or c.mark
    c.seen[i]=c.seen[i] or {}
    M.damage(s,w,spec,c,{M.band(x-38,x+38,spec.floorY,120,M.violet)},c.seen[i],spec.damage.normal)
   end
  end
 end
 local function revive(s,w,spec,c)
  local donor,receiver,move=c.donor,c.receiver,c.move
  if donor.hp>donor.maxhp*move.donor_threshold_fraction and w.reviveLeft>0 then
   local n=math.min(math.floor(donor.hp*move.donor_fraction),receiver.maxhp)
   donor.hp=donor.hp-n;receiver.hp=n;receiver.generation=receiver.generation+1;clearAuras(receiver)
   w.reviveLeft=w.reviveLeft-1
   log(s,w,'WT19:transfer',0,n)
  else receiver.retired=true;log(s,w,'WT19:retire') end
  syncHP(w,spec);rest(w,spec)
 end
 local function tick(s,w,spec)
  w.clock=w.clock+1
  if resolveDeaths(s,w,spec) then return end
  if not w.cast then
   if w.rest>0 then w.rest=w.rest-1 else choose(s,w,spec) end
   return
  end
  local c=w.cast
  c.t=c.t+1
  w.phase=c.move.recovery and c.t>=c.move.recovery and 'recover' or 'warning'
  if c.key=='WT03' then pawnTick(s,w,spec,c);return end
  if c.key=='WT19' then
   if c.t>=c.move.revive_channel_ticks then revive(s,w,spec,c) end
   return
  end
  if c.t>=c.move.total then
   if c.key=='WT05' then
    if c.g==0 then start(s,w,spec,'WT18');return end
    for _,a in ipairs(s.actors) do
     if a.hp>1 then C.damageActor(s,a,math.min(a.hp-1,spec.damage.fallback),w.king,false,true) end
    end
    log(s,w,'WT05:expired')
   end
   rest(w,spec);return
  end
  if c.key=='WT05' then bishopTick(s,w,spec,c)
  elseif c.key=='WT09' then
   if c.t==192 then royal(s,w,spec) end
  elseif c.key=='WT16' or c.key=='WT17' then freezeTick(s,w,spec,c)
  elseif c.key=='WT18' then
   local exposure=c.move.exposure
   local open=c.t>=exposure[1] and c.t<exposure[2]
   targetable(w,open);w.phase=open and 'exposure' or 'collapse'
  else M.step(s,w,spec,c) end
 end
 function controller.beforeAction(s,w,key)
  if w.cast and cancelInput[key] then cancelHold(w,w.cast,'action',s) end
 end
 function controller.prepare(s,w,spec,input,dt)
  if not input.interact then w.requireRelease=false end
  w.held=input.interact and not (input.jump or input.attack or s.auto)
  local c=w.cast
  if not c then return end
  if c.hold and input.interact and not w.held then cancelHold(w,c,'action',s) end
  w.contactTick=c.t+math.floor(w.remainder+math.min(dt,1/30)*60+1e-8)
 end
 function controller.finish(s,w,spec,dt)
  w.contactTick=nil
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;tick(s,w,spec) end
 end
 local function live(s)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='game_before_gate' and not w.waitUntil then return w,spec end
 end
 function C.fieldMoveFactor(s,a)
  local w,spec=live(s)
  local c=w and w.cast
  local base=previousFactor and previousFactor(s,a) or 1
  if c and c.key=='WT14' and c.whirl then
   local z=c.move.control_regions[1]
   if c.t>=z.active[1] and c.t<z.active[2] and math.abs(a.x-c.whirl)<=.6*spec.board.unit and a.y>=spec.floorY-45 then
    return base*z.speed_floor_ratio
   end
  end
  return base
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=live(s)
  local c=w and w.cast
  if c and c.run and c.run.goal and not c.run.hit then
   local lo,hi=math.min(c.run.origin,c.run.goal),math.max(c.run.origin,c.run.goal)
   if a.x>=lo-30 and a.x<=hi+30 then return hi+51<940 and hi+51 or lo-51 end
  elseif c and not transient[c.key] and c.key~='WT03' and c.key~='WT05' then
   for _,z in ipairs(M.warnings(w,spec,c)) do
    if z.at-c.t<=35 and M.inside(a,z) then
     local left,right=z.lo-23,z.hi+23
     if left>=24 and (right>936 or a.x-left<right-a.x) then return left end
     if right<=936 then return right end
    end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 local function painter(f,s)
  return function(x,y,width,height,color,opacity)
   if width<=0 or height<=0 then return end
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity}
  end
 end
 local function piece(rect,x,y,kind,land)
  local pawn=kind=='pawn'
  local h=pawn and 41 or kind=='king' and 127 or 141
  local r=pawn and 19 or kind=='king' and 44 or 31
  local dark='#542438';local red='#a23b50';local gold=M.gold
  rect(x-r,y-9,r*2,9,dark);rect(x-r+3,y-12,r*2-6,4,gold)
  rect(x-r*.66,y-h+22,r*1.32,h-31,dark);rect(x-r*.3,y-h+25,r*.57,h-37,red)
  rect(x-r*.75,y-h+18,r*1.5,7,gold)
  rect(x-r*.60,y-h+5,r*1.2,15,red)
  if pawn then rect(x-8,y-h,16,6,red);rect(x-4,y-h+6,8,4,gold)
  elseif kind=='king' then
   rect(x-7,y-h-7,14,24,gold);rect(x-18,y-h+1,36,8,gold)
  else
   for i=-1,1 do rect(x+i*13-4,y-h-6,8,18,gold) end
   rect(x-5,y-h+20,10,8,M.ice)
  end
  if land then rect(x-r-5,y-3,2*r+10,3,'#fff0cd') end
 end
 local titles={king='駒王',queen='女王駒',finish='駒王・終手',royal='王族二体'}
 function controller.observe(f,s,w,spec,mode,profile)
  local b,c,k,q=f.weeklyBoss,w.cast,w.king,w.queen
  b.formName=titles[w.stage]
  b.label=c and c.move.title or '構え直し'
  b.phaseHp=w.stage=='royal' and {{name='キング',hp=k.hp,max=k.maxhp},{name='クイーン',hp=q.hp,max=q.maxhp}} or
   {{name='駒王',hp=k.hp,max=spec.pieceKingHp},{name='女王駒',hp=q.hp,max=spec.pieceQueenHp},{name='王族二体',hp=royalMax(spec),max=royalMax(spec)}}
  local v={stage=w.stage,card=c and c.key,tick=c and c.t,bodies={},warnings={},revives=w.reviveLeft}
  b.gate=v
  if w.primary.hp<=0 then return end
  local back={draws={}};local backRect=painter(back,s)
  local eSplit=c and c.key=='WT09' and c.t>=96
  for _,e in ipairs({k,q}) do
   local kind=e==k and 'king' or 'queen'
   local visible=w.stage=='royal' or eSplit and (e==k or c.t>=144) or
    w.stage=='queen' and e==q or (w.stage=='king' or w.stage=='finish') and e==k
   if visible then
    local x=eSplit and fromU(spec,e==k and 2.9 or 6.8) or e.x
    local drawnRoyal=w.stage=='royal' or eSplit
    local down=w.phase=='exposure' or e.hp<=0 and not eSplit
    if drawnRoyal then
     local height=(e==k and 150 or 158)-(down and 18 or 0)
     C.drawFieldDisplayArt(back,C.gateWeeklyArt[kind],x-s.camera,e.y,height,mode,profile,
      (e==k and (e.dir or 1)<0) or (e==q and (e.dir or -1)>0),nil,nil,down and e.hp<=0 and .36 or 1)
    else piece(backRect,x,e.y,kind,w.phase=='active') end
    v.bodies[#v.bodies+1]={kind=kind,x=x,hp=e.hp,max=e.maxhp,damageable=e.hp>0 and not e.invulnerable and not eSplit}
   end
  end
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws);f.draws=back.draws
  if not c then return end
  local rect=painter(f,s);local a=active(s);local y=spec.floorY
  if c.key=='WT03' then
   v.pawns={};v.shield=c.shield;v.failures=c.failures
   for _,pawn in ipairs(c.pawns) do
    if not pawn.broken then
     piece(rect,pawn.x,y,'pawn',false);v.pawns[#v.pawns+1]={x=pawn.x}
     if pawn.attack then
      local x=pawn.x+pawn.attack.dir*.8*spec.board.unit
      rect(math.min(pawn.x,x),y-10,math.abs(x-pawn.x),3,M.fire)
     end
    end
   end
   if c.failures>=3 and v.pawns[1] then rect(v.pawns[1].x+34,y-7,46,5,M.ice) end
  elseif c.key=='WT05' then
   v.shield=c.g;v.maxShield=c.move.shield_units
   local cycle=c.t%c.move.pulse_period_ticks
   for i,win in ipairs(c.move.windows) do
    local x=c.points[i]
    if x and cycle<win[2] then
     for j=1,10 do rect(x-34+j*6,y-j*12,6,10,M.violet,cycle>=win[1] and 1 or .58) end
    end
   end
  elseif c.key=='WT16' or c.key=='WT17' then
   local mode=spec.moves.WT20
   v.freeze=c.freeze;v.freezeBy=c.freezeBy;v.deadline=c.move.deadline_ticks
   v.nearFrost=frostAt(spec,a);v.frostReady=math.max(0,c.ready-c.t);v.hold=c.hold and c.t-c.hold.start
   v.releaseRequired=w.requireRelease
   v.canFrost=c.freeze<100 and c.t<=c.freezeBy
   if v.canFrost then
    for _,u in ipairs(mode.context_positions_U) do
     local x=fromU(spec,u)
     rect(x-16,y-23,32,23,'#375575');rect(x-11,y-30,22,11,M.ice)
     rect(x-14,y-37,28,3,c.t>=c.ready and '#fff6e7' or '#64849d')
    end
   end
   if c.freeze>0 then
    for i=1,c.freeze/25 do rect(c.body.x-22+i*9,y-176,6,8,M.ice) end
    if c.freeze==100 then
     rect(c.body.x-31,y-2,62,5,M.ice);rect(c.body.x-31,y-113,4,111,M.ice,.65);rect(c.body.x+27,y-113,4,111,M.ice,.65)
    end
   end
   if c.key=='WT17' and c.run then
    v.lure=fromU(spec,c.move.lure_min_x_U)
    rect(v.lure,y-8,155,3,M.ice,.88)
   end
   if c.t>=c.move.deadline_ticks-50 and c.t<c.move.failure_window[2] and not c.run then
    rect(spec.board.left,y-13,spec.board.right-spec.board.left,7,M.water,c.t>=c.move.deadline_ticks and 1 or .7)
   end
  elseif c.key=='WT18' and w.phase=='exposure' then v.exposure=c.move.exposure[2]-c.t
  elseif c.key=='WT19' then
   v.transfer=c.move.revive_channel_ticks-c.t
   rect(math.min(k.x,q.x),y-55,math.abs(k.x-q.x),3,M.gold,.75)
  end
  if c.run then
   local run=c.run
   v.run={t=c.t-run.start,goal=run.goal,owner=run.owner,hit=run.hit}
   local marked=run.goal or active(s).x
   local victim=run.goal and s.actors[run.owner] or a
   if victim and victim.hp>0 then
    rect(victim.x-10,victim.y-105,20,6,M.gold);rect(victim.x-7,victim.y-111,4,7,M.gold);rect(victim.x+3,victim.y-111,4,7,M.gold)
   end
   local from=run.origin or k.x
   if not run.hit then rect(math.min(from,marked),y-6,math.abs(from-marked),4,M.gold,run.goal and 1 or .58) end
  end
  if not transient[c.key] and c.key~='WT03' and c.key~='WT05' then
   v.warnings=M.warnings(w,spec,c)
   for _,z in ipairs(v.warnings) do
    local alpha=c.t>=z.at and 1 or .69
    rect(z.lo,z.y-2,z.hi-z.lo,3,z.color,alpha);rect(z.lo,z.y-z.h,2,z.h,z.color,alpha);rect(z.hi-2,z.y-z.h,2,z.h,z.color,alpha)
   end
   for _,p in ipairs(c.shots) do rect(p.x-9,p.y-6,18,12,p.color);rect(p.x-5,p.y-6,6,5,'#fff6e8') end
   if c.whirl and c.t>=96 and c.t<300 then
    rect(c.whirl-49,y-6,98,5,M.water,.78)
    for i=-4,4 do rect(c.whirl+i*10,y-13+math.abs(i),5,4,M.water,.69) end
   end
  end
 end
 return controller
end
