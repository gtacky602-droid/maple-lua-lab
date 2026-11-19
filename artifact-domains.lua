return function(C,config,sets)
 local action,step,frame=C.action,C.step,C.frame
 local afterHit,damageBonus=C.afterElementHit,C.damageBonus
 local byNode={}
 for _,spec in ipairs(config.domains) do
  byNode[spec.node]=spec
 end

 local function current(s)
  local node=s.story and s.story.active and s.story.node
  return node and s.campaign.zone=='story:'..node and byNode[node] or nil
 end

 function C.enterArtifactDomainNode(s)
  s.artifactDomainRun=nil
 end

 local function reflect(s,run,enemy)
  if s.artifactDomainRun~=run or run.status~='fighting' or enemy.hp<=0 or s.t<run.reflectAt then return end
  run.reflectAt=s.t+2
  for _,other in ipairs(s.enemies) do
   if other.hp>0 and math.abs(other.x-enemy.x)<=130 then
    local damage=math.min(other.hp,math.max(1,math.floor(other.maxhp*.05)))
    s.damage=s.damage+damage
    C.combatNumber(s,other,damage,'#f4d49b')
    C.combatEvent(s,'domain_reflect',s.active,other.id,damage)
    if damage==other.hp then C.defeatEnemy(s,other,s.active) else other.hp=other.hp-damage end
   end
  end
  s.effects[#s.effects+1]={x=enemy.x,y=enemy.y-35,w=260,h=42,life=.32,color='#eed599'}
 end

 local function spawnWave(s,run)
  s.enemies={}
  local wave=run.rank.waves[run.wave]
  for index,id in ipairs(wave) do
   local def=config.enemies[id]
   local x=#wave==1 and 655 or 380+(index-1)*740/(#wave-1)
   local hp=math.floor(def.hp*run.rank.hpScale+.5)
   local resist={}
   for element,value in pairs(def.resist or {}) do resist[element]=value end
   local enemy={id=run.spawned+index,domainEnemy=true,storyName=def.name,art=def.art,
    x=x,home=x,y=480,hp=hp,maxhp=hp,level=run.rank.level,contactDamage=run.rank.damage,kind=1,cd=1.35+index*.20,warning=0,
    respawn=0,noRewards=true,patrolMin=235,patrolMax=1190,pursuit={range=260,leash=325,speed=62},
    resist=resist,elementHits=def.learnElements and {} or nil}
   if run.spec.rule=='shield' then
    enemy.onShieldAbsorb=function() reflect(s,run,enemy) end
   end
   s.enemies[index]=enemy
  end
  run.spawned=run.spawned+#wave
 end

 local function finish(s,run)
  run.status='clear'
  local record=C.recordArtifactDomainClear(s,run.spec.id,run.rank.id,s.t-run.started)
  local rank=run.rank
  local slot=(record.clears-1)%5+1
  local itemLevel=math.min(220,rank.level+20)
  local preset={setId=run.set,subpair=slot==3 and 'hp_crit' or 'atk_crit'}
  local stored=C.giveArtifact(s,slot,itemLevel,rank.rarity,preset)
  if not stored then C.dropArtifact(s,slot,itemLevel,rank.rarity,180,480,preset,'town') end
  C.grantExp(s,rank.xp,'kill')
  s.mora=s.mora+rank.mora
  run.result={slot=slot,setName=sets[run.set].name,rarity=rank.rarity,itemLevel=itemLevel,
   held=not stored,xp=rank.xp,mora=rank.mora}
 end

 function C.action(s,key)
  local rankId,setId=key:match('^artifact_domain_start:(%a+):(%a+)$')
  if not rankId then return action(s,key) end
  local spec=current(s)
  local run=s.artifactDomainRun
  if not spec or s.paused or s.lift or s.actors[s.active].hp<=0 or (run and run.status=='fighting') then return end
  if setId~=spec.sets[1] and setId~=spec.sets[2] then return end
  for _,rank in ipairs(spec.ranks) do
   if rank.id==rankId then
    if s.progression.level<rank.level then s.storyNotice='必要レベル '..rank.level;return end
    if not C.canAttack(s) then s.storyNotice='保留中の聖遺物を町で整理してください。';return end
    C.enterStoryNode(s,spec.node)
    C.clearWeeklySceneCasts(s)
    s.storyNotice=nil
    s.artifactDomainRun={spec=spec,rank=rank,set=setId,status='fighting',started=s.t,wave=1,spawned=0,
     reflectAt=0,chain={},chainOwner=s.active}
    spawnWave(s,s.artifactDomainRun)
    return
   end
  end
 end

 function C.afterElementHit(s,cast,enemy,element,damageElement,damage)
  afterHit(s,cast,enemy,element,damageElement,damage)
  local run=s.artifactDomainRun
  if not run or run.status~='fighting' or not enemy.domainEnemy or cast.reaction then return end
  if run.spec.rule=='chain' and cast.isNormal and cast.id==s.active and not cast.domainChain then
   cast.domainChain=true
   if #run.chain==5 then table.remove(run.chain,1) end
   run.chain[#run.chain+1]=s.t+5
  end
  if enemy.elementHits and (element=='pyro' or element=='hydro' or element=='cryo' or element=='electro') then
   local hits=(enemy.elementHits[element] or 0)+1
   enemy.elementHits[element]=hits
   if hits==3 then
    enemy.resist[element]=.55
    C.combatEvent(s,'domain_resist:'..element,cast.id,enemy.id,55)
   end
  end
 end
 function C.damageBonus(s,cast,element,enemy)
  local bonus=damageBonus(s,cast,element,enemy)
  local run=s.artifactDomainRun
  if run and run.status=='fighting' and enemy and enemy.domainEnemy and cast.id==s.active and not cast.isNormal and not cast.reaction then
   bonus=bonus+#run.chain*.15
  end
  return bonus
 end

 function C.step(s,dt,input)
  local run=s.artifactDomainRun
  local before=s.t
  if run then
   if run.chainOwner~=s.active then run.chain={};run.chainOwner=s.active end
   while run.chain[1] and s.t>=run.chain[1] do table.remove(run.chain,1) end
  end
  step(s,dt,input)
  if not run or run~=s.artifactDomainRun or run.status~='fighting' or s.t==before then return end
  if current(s)~=run.spec then s.artifactDomainRun=nil;return end
  if s.t>run.started+run.rank.limit+1e-8 then
   run.status='timeout';s.enemies={}
   return
  end
  for _,enemy in ipairs(s.enemies) do if enemy.hp>0 then return end end
  if run.wave==#run.rank.waves then finish(s,run)
  else
   run.wave=run.wave+1
   spawnWave(s,run)
  end
 end

 function C.frame(s,...)
  local f=frame(s,...)
  local spec=current(s)
  if not spec then return f end
  local history=s.endgame and s.endgame.artifactDomains
  local run=s.artifactDomainRun
  local view={id=spec.id,name=spec.name,rule=spec.rule,sets={},ranks={},status=run and run.status or 'ready',
   blocked=f.artifactAttackBlocked or s.actors[s.active].hp<=0}
  for _,id in ipairs(spec.sets) do
   view.sets[#view.sets+1]={id=id,name=sets[id].name,twoPiece=sets[id].twoPiece}
  end
  for _,rank in ipairs(spec.ranks) do
   view.ranks[#view.ranks+1]={id=rank.id,name=rank.name,level=rank.level,count=rank.count,rarity=rank.rarity,xp=rank.xp,mora=rank.mora,
    itemLevel=math.min(220,rank.level+20),available=s.progression.level>=rank.level and not s.paused,
    record=history and history[spec.id..':'..rank.id]}
  end
  if run then
   local alive,nearest,distance=0,nil,340
   local actor=s.actors[s.active]
   for _,enemy in ipairs(s.enemies) do
    if enemy.hp>0 then
     alive=alive+1
     local dx=math.abs(enemy.x-actor.x)
     if dx<distance then nearest,distance=enemy,dx end
    end
   end
   if nearest then
    f.draws[#f.draws+1]={kind='text',x=nearest.x-s.camera,y=C.enemyHeadY(nearest)-26,
     text=nearest.storyName,color='#fff0c1',size=14}
   end
   view.wave,view.waves=run.wave,#run.rank.waves
   view.remainingEnemies=run.rank.count-run.spawned+alive
   view.remaining=math.max(0,run.started+run.rank.limit-s.t)
   view.chain=#run.chain
   view.result=run.result
  end
  f.artifactDomain=view
  f.commands=#f.draws
  return f
 end
end
