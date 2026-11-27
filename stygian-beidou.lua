-- Beidou's independent training duel. Contact provenance is recorded by the shared combat core.
return function(C,G)
 local D={}
 local previousAvoid=C.aiAvoidTarget
 local gold,red,green,violet='#ffc778','#f68f81','#9cf6cd','#dfb6ff'
 local function phase(b,key,span)
  b.phase,b.tick,b.span=key,0,span
 end
 local function location(spec,x)
  return math.max(spec.arena.left,math.min(spec.arena.right,x))
 end
 local function turn(a,b)
  if a.x~=b.x then b.dir=a.x>b.x and 1 or -1 end
 end
 local function log(s,b,key,actor,value)
  C.combatEvent(s,'stygian:beidou:'..key,actor or 0,b.id,value or 0)
 end
 local function openTime(run,ticks)
  return math.floor(ticks*run.rules.openScale+.5)
 end
 local function prepareAttack(s,run,spec,key,span,x,dialogue)
  local b,a=run.boss,run.target or s.actors[s.active]
  if key=='quiet' or key=='baited' then
   b.guardReply={kind=key,hasWave=key=='baited' and run.rules.reprise,impacts={}}
  elseif key~='wake' then
   b.guardReply=nil
  end
  local slot=run.targetMember and run.targetMember.id
  if key=='baited' and b.guardMember then slot=b.guardMember.id
  elseif key=='wake' then slot=b.move.targetSlot end
  local m=spec.moves[key]
  if x and x~=b.x then b.dir=x>b.x and 1 or -1 else turn(a,b) end
  local mark=x or location(spec,b.x+b.dir*math.min(spec.timing.targetReach,math.abs(a.x-b.x)))
  local start,finish
  if m.reach then
   start,finish=b.x-b.dir*18,b.x+b.dir*m.reach
  else
   start,finish=mark-m.radius,mark+m.radius
  end
  b.move={key=key,name=m.name,lo=location(spec,math.min(start,finish)),hi=location(spec,math.max(start,finish)),
   ground=spec.arena.floor,height=m.height,mark=mark,origin=b.x,targetSlot=slot,
   damage=math.floor(m.damage*run.rules.attackScale+.5),seen={}}
  b.line=dialogue
  phase(b,'tell',span)
  log(s,b,'tell:'..key,a.id)
 end
 local function invite(s,run,spec)
  local b=run.boss
  b.move,b.guardReply=nil,nil
  b.line=spec.dialogue.guard;b.guardAt=s.t
  b.guardOwner,b.guardMember,b.guardX,b.guardInputAt=nil,nil,nil,nil
  if run.parties then
   -- Each browser keeps its own combat clock, including through disconnects.
   b.guardInputAt={}
   for _,member in ipairs(s.coop.members) do b.guardInputAt[member]=member.state.t end
  end
  b.aura=nil;b.burning=nil;b.applicationClocks=nil
  phase(b,'guard',run.rules.guard)
  log(s,b,'guard')
 end
 local function contact(s,run,spec,b,cast,mult,color,element)
  local party=s.endgameRun
  if not party or party.status~='fighting' or run.status~='fighting' or b.hp<=0 or b.phase=='intro' then return false end
  if b.phase=='guard' then
   local guardAt=b.guardInputAt and b.guardInputAt[s.coopMember] or b.guardAt
   if not b.guardOwner and not s.auto and not cast.growthAI and not cast.reaction and cast.playerInputAt and
      cast.playerInputAt>=guardAt-1e-8 and (cast.startedAt or -1)>=guardAt-1e-8 then
    b.guardOwner=cast.id
    if party.shared then b.guardMember,b.guardX=s.coopMember,s.actors[cast.id].x end
    log(s,b,'baited',cast.id)
   end
   return false
  end
  -- The first hit during guard commits the reply before any further pulses.
  if b.phase=='tell' and b.move.key=='baited' and b.tick<spec.timing.baitedLock then return false end
  local r=C.enemyResistance(cast,b,element)
  if r>=1 then return false end
  local amount,crit=C.enemyHitDamage(s,cast,b,mult,element,r)
  if b.phase~='recover' then amount=math.max(1,math.floor(amount*spec.timing.armorFactor)) end
  amount=math.min(b.hp,amount)
  local ability=cast.key or 'normal'
  party.skills[ability]=(party.skills[ability] or 0)+amount
  s.damage=s.damage+amount;s.hits=s.hits+1
  C.combatNumber(s,b,crit and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,b.id,amount)
  local event=s.events[#s.events]
  event.element=element;event.critical=not not crit;event.reaction=cast.reaction or false
  if b.phase=='recover' then log(s,b,'opening-hit',cast.id,amount);C.noteGrowth(s,'stygian-opening') end
  if amount==b.hp then C.defeatEnemy(s,b,cast.id)
  else
   b.hp=b.hp-amount
   if C.afterElementHit then C.afterElementHit(s,cast,b,cast.applicationElement or element,element,amount) end
  end
  return true
 end
 function D.spawn(s,run,spec)
  C.clearWeeklySceneCasts(s)
  s.camera=0
  for index,a in ipairs(s.actors) do
   a.x,a.y=spec.arena.playerX-(index-1)*46,spec.arena.floor
   a.vy,a.ground,a.dash,a.buffer=0,true,0,0
  end
  local b={id=spec.entity,boss=true,custom=true,fieldBoss=true,hp=run.rules.hp,maxhp=run.rules.hp,level=run.rules.level,
   x=spec.arena.bossX,y=spec.arena.floor,warning=0,dir=-1,turn=0,respawn=math.huge,rewardMora=0,
   hitTop=spec.arena.floor-100,hitBottom=spec.arena.floor,hitHalfWidth=24,damageElement='electro'}
  b.onCastContact=function(state,cast,_,mult,color,element) return contact(state,run,spec,b,cast,mult,color,element) end
  s.enemies={b};run.boss=b;run.remainder=0;run.skills={}
  phase(b,'intro',spec.timing.intro);b.line=spec.dialogue.intro
  log(s,b,'intro')
 end
 local function recover(s,run,spec,key)
  local b,t=run.boss,spec.timing
  local window=key=='quiet' and t.guardWithdrewRecovery or key=='baited' and t.guardStruckRecovery or t.ordinaryRecovery
  phase(b,'recover',openTime(run,window))
  b.move=nil;b.line=nil
  log(s,b,'recover',0,b.span)
 end
 local function nextAction(s,run,spec)
  local b=run.boss
  if b.turn%2==1 then invite(s,run,spec)
  else
   local key=b.turn%4==2 and 'sweep' or 'overhead'
   prepareAttack(s,run,spec,key,run.rules.tell)
   if run.rules.feint and key=='overhead' and b.hp<=b.maxhp*spec.timing.lateHealthFraction then
    phase(b,'feint',spec.timing.feint);log(s,b,'feint')
   end
  end
 end
 local function impact(s,run)
  local b,m=run.boss,run.boss.move
  G.eachContact(s,run,m.seen,function(a)
   return a.x>=m.lo and a.x<=m.hi and a.y>m.ground-m.height
  end,function(party,a)
   local n=C.damageActor(party,a,m.damage,b,true,true)
   local reply=b.guardReply
   if reply then
    local hits=reply.impacts[a] or {}
    hits[m.key]=n
    reply.impacts[a]=hits
   end
   log(party,b,'impact:'..m.key,a.id,n)
  end)
 end
 local function tick(s,run,spec)
  local b,t=run.boss,spec.timing
  local a=run.target or s.actors[s.active]
  b.tick=b.tick+1
  if b.phase=='guard' then
   if b.guardOwner then
    local owner=s.actors[b.guardOwner]
    local x=b.guardX or (owner and owner.hp>0 and owner.x or a.x)
    local reach=t.targetReach
    local mark=location(spec,b.x+math.max(-reach,math.min(reach,x-b.x)))
    prepareAttack(s,run,spec,'baited',run.rules.quickTell,mark,spec.dialogue.baited)
   elseif b.tick>=b.span then
    log(s,b,'waited',0,b.span)
    prepareAttack(s,run,spec,'quiet',run.rules.tell,nil,spec.dialogue.patient)
   end
  elseif b.phase=='approach' then
   turn(a,b)
   local gap=math.abs(a.x-b.x)
   if gap<=t.range or b.tick>=b.span then nextAction(s,run,spec)
   else b.x=location(spec,b.x+b.dir*math.min(t.speed/60,gap-t.range)) end
  elseif b.phase=='strike' then
   local m=b.move
   if m.key~='sweep' and m.key~='wake' then
    local x=location(spec,m.mark-b.dir*48)
    b.x=m.origin+(x-m.origin)*math.min(1,b.tick/t.impactStart)
   end
   if b.tick>=t.impactStart and b.tick<t.impactEnd then impact(s,run) end
   if b.tick>=b.span then
    local key=m.key
    if run.rules.reprise and (key=='baited' or key=='overhead') then
     prepareAttack(s,run,spec,'wake',run.rules.tell,m.mark)
     b.move.previous=key
    else recover(s,run,spec,m.previous or key) end
   end
  elseif b.tick>=b.span then
   if b.phase=='tell' then phase(b,'strike',t.action);log(s,b,'strike:'..b.move.key)
   elseif b.phase=='feint' then prepareAttack(s,run,spec,'overhead',run.rules.tell)
   else
    b.turn=b.turn+1;b.line=nil
    phase(b,'approach',t.approach)
   end
  end
 end
 function D.finish(s,run,spec,dt)
  if run.boss.hp<=0 then return end
  run.remainder=run.remainder+math.min(dt,1/30)*60
  while run.remainder>=1-1e-8 do
   run.remainder=run.remainder-1
   tick(s,run,spec)
  end
 end
 function C.aiAvoidTarget(s,a)
  local run=s.endgameRun
  if run and run.match=='beidou' and run.status=='fighting' then
   local b=run.boss
   if b.phase=='guard' then
    local offset=a.x<b.x and -115 or 115
    if b.x+offset<24 or b.x+offset>936 then offset=-offset end
    return math.abs(a.x-b.x)<110 and b.x+offset or a.x
   end
   local m=b.move
   if m and b.phase~='feint' and a.x>=m.lo-6 and a.x<=m.hi+6 and a.y>m.ground-m.height then
    local l,r=m.lo-22,m.hi+22
    if a.x-l<r-a.x then return l>=22 and l or r end
    return r<=938 and r or l
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 local hints={
  intro='北斗と手合わせする',approach='間合いを測る',guard='構え中。攻撃を止めて待つと、反撃の隙が長くなる',
  tell='色の付いた攻撃範囲から離れる',feint='振り下ろす直前に構え直す。次の範囲を見て避ける',
  strike='攻撃範囲から離れる',recover='反撃のチャンス'
 }
 local function paint(f,s)
  return function(x,y,w,h,color,opacity)
   if w>0 and h>0 then f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=w,h=h,color=color,opacity=opacity} end
  end
 end
 local function outline(rect,x,y,w,h,color)
  rect(x,y,w,3,color);rect(x,y+h-3,w,3,color)
  rect(x,y,3,h,color);rect(x+w-3,y,3,h,color)
 end
 local function sword(rect,x,y,dir,stepX,stepY,glow)
  for i=0,9 do
   local x0,y0=x+dir*i*stepX,y+i*stepY
   local size=i>=8 and 10 or 14
   rect(x0-size/2,y0-size/2,size,size,'#27293c')
   rect(x0-size/2+3,y0-size/2+3,size-6,size-7,glow and violet or '#a298b1')
  end
  rect(x-11,y-3,22,7,gold)
 end
 function D.observe(f,s,run,spec,mode,profile)
  local b=run.boss
  local cleared=run.status=='clear'
  local hint=cleared and spec.dialogue.clear or hints[b.phase]
  if b.phase=='recover' and not cleared then hint=string.format('反撃のチャンス %.1f秒',(b.span-b.tick)/60) end
  if b.phase=='tell' and b.move.key=='sweep' then hint='低い横薙ぎ。ジャンプか足場へ' end
  if b.phase=='tell' and b.move.key=='wake' then hint='低い返し波。もう一度ジャンプ' end
  f.boss={name=spec.name,hp=b.hp,maxhp=b.maxhp,x=b.x,y=b.y,dir=b.dir,
   phase=b.phase,label=cleared and '模擬戦突破' or b.move and b.move.name or hint}
  f.endgameRun.hint=hint;f.endgameRun.dialogue=cleared and spec.dialogue.clear or b.line
  f.endgameRun.phase=b.phase;f.endgameRun.tick=b.tick
  if run.status~='fighting' or b.hp<=0 then return end
  local n=b.phase
  local reply=b.guardReply
  if reply and (n=='tell' or n=='strike' or n=='recover') then
   local hits=reply.impacts[s.actors[s.active]] or {}
   local replyOver=n=='recover' or b.move and b.move.key=='wake'
    or n=='strike' and b.tick>=spec.timing.impactEnd
   local waveOver=n=='recover' or n=='strike' and b.move.key=='wake' and b.tick>=spec.timing.impactEnd
   f.endgameRun.guardReply={kind=reply.kind,damage=hits[reply.kind] or replyOver and 0 or nil,
    waveDamage=hits.wake or reply.hasWave and waveOver and 0 or nil}
  end
  local rear={draws={}}
  if mode=='rect' and s.packRectArt then
   rear.rectIndex,rear.rectBatches={},f.rectBatches or {}
   f.rectBatches=rear.rectBatches
  end
  local rect=paint(rear,s)
  local facing=b.dir<0 and 'left' or 'right'
  local guarded=n=='guard' or n=='tell' or n=='feint'
  local pose=guarded and C.stygianBeidouArt.guard[facing] or C.stygianBeidouArt.idle[facing]
  local scale=n=='recover' and .94 or 1
  C.drawFieldDisplayArt(rear,pose,b.x-s.camera,b.y,112*scale*(pose.heightScale or 1),mode,profile,false)
  if not guarded then
   local up=n=='strike' and b.tick<spec.timing.impactStart
   local phaseAngle=up and -5 or n=='strike' and 1 or 4
   sword(rect,b.x+b.dir*19,b.y-45,b.dir,n=='strike' and 8 or 4,phaseAngle,n=='strike')
  elseif n=='guard' then
   outline(rect,b.x-56,b.y-124,112,118,gold)
   rect(b.x-50,b.y-133,100,6,'#4d3954')
   rect(b.x-50,b.y-133,100*(b.span-b.tick)/b.span,6,gold)
  end
  if n=='recover' then rect(b.x-33,b.y-3,66,4,green,.9) end
  table.move(f.draws,1,#f.draws,#rear.draws+1,rear.draws);f.draws=rear.draws
  rect=paint(f,s)
  local move=b.move
  if move then
   f.endgameRun.card,f.endgameRun.targetSlot=move.key,move.targetSlot
   f.endgameRun.area={left=move.lo,right=move.hi,top=move.ground-move.height,ground=move.ground}
   local width=move.hi-move.lo
   local hue=n=='feint' and '#b298be' or (n=='strike' and violet or red)
   outline(rect,move.lo,move.ground-move.height,width,move.height,hue)
   local active=n=='strike' and b.tick>=spec.timing.impactStart and b.tick<spec.timing.impactEnd
   rect(move.lo,move.ground-move.height,width,move.height,hue,active and .39 or .10)
   for x=move.lo+4,move.hi-3,18 do
    rect(x,move.ground-8,6,4,hue)
    if active then rect(x,move.ground-move.height+6+(math.floor(x)%19),12,4,'#f0ddff',.8) end
   end
  end
  f.commands=#f.draws
 end
 return D
end
