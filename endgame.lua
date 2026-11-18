return function(C,abyss,weekly)
 local action,step,frame,checkpoint,restore=C.action,C.step,C.frame,C.checkpoint,C.restore
 local choices={gear=true,discover=true,boss=true}
 local sets={troupe='黄金の劇団',gladiator='剣闘士のフィナーレ'}
 local battleActions={normal=true,skill1=true,skill2=true,skill3=true,skill4=true,light=true,pause=true,
  swap=true,dodge=true,jump=true,drop=true,auto=true,cancel_macro=true,cancel_channel=true}
 local finalQuest='growth-next-goal'

 local function records(s)
  if not s.endgame then s.endgame={abyss={},bosses={}} end
  return s.endgame
 end
 function C.endgameGoalEvent(s,choice)
  local quest=s.story and s.story.quests[finalQuest]
  if quest and quest.status=='active' and s.endgame and s.endgame.goal==choice then
   C.noteGrowth(s,'postgame-progress')
  end
 end
 local function ticks(seconds) return math.max(1,math.floor(seconds*60+.5)) end
 local function personalBest(s,collection,id,elapsed)
  local ticksUsed=ticks(elapsed)
  local entry=collection[id]
  if not entry then entry={clears=0};collection[id]=entry end
  entry.clears=math.min(1000000,entry.clears+1)
  if entry.bestTicks and ticksUsed>=entry.bestTicks then return false,entry end
  entry.bestTicks=ticksUsed
  entry.companion=s.companion or 'amber'
  return true,entry
 end
 function C.recordChallengeBoss(s,id,started)
  if not started or not s.story or not (s.story.active or s.endgameRun or s.bossJourney) then return end
  local improved=personalBest(s,records(s).bosses,id,s.t-started)
  if improved then C.endgameGoalEvent(s,'boss') end
 end

 local function leave(s)
  local trial=s.endgameRun
  s.endgameRun=nil
  s.farka=nil
  C.enterStoryNode(s,trial.origin)
  s.storyNotice=trial.status=='clear' and '挑戦記録を保存しました。依頼は拠点で報告できます。' or '挑戦入口へ戻りました。'
 end
 local function openRoom(s,run)
  local room=abyss.rooms[run.room]
  s.platforms={};s.solids={}
  for _,platform in ipairs(room.platforms) do
   s.platforms[#s.platforms+1]={x=platform.x,y=platform.y,w=platform.w}
  end
  s.enemies={};s.pending={};s.effects={};s.numbers={};s.decoys={}
  s.grappleNodes={};s.selectedGrapple=nil
  s.echoSource=nil;s.ultimate=nil;s.starSeed=nil;s.macro=nil
  s.camera=0;s.worldwidth=960
  for index,actor in ipairs(s.actors) do
   actor.x=200-(index-1)*50;actor.y=480;actor.vy=0;actor.ground=true
  end
  for _,group in ipairs(room.groups) do
   local extra=group.elite and 0 or abyss.modes[run.mode].extraPerGroup
   for index=1,group.count+extra do
    local x=group.x+(index-1)*group.spacing
    local hp=group.hp*abyss.modes[run.mode].healthFactor
    local id=#s.enemies+1
    s.enemies[id]={id=id,x=x,home=x,y=group.y,hp=hp,maxhp=hp,kind=group.kind,art=group.art,noRewards=true,
     cd=1.2+(id%4)*.35,respawn=0,warning=0,pursuit=group.elite and {range=320,leash=350,speed=50} or nil}
   end
  end
  run.status='fighting'
  s.campaign.zone='abyss'
  s.campaign.message='三つの区画を時間内に突破してください。'
 end
 local function abyssClear(s,run)
  local spec=abyss.modes[run.mode]
  local elapsed=s.t-run.start
  local time=ticks(elapsed)
  local stars=time<=spec.threeStars*60 and 3 or time<=spec.twoStars*60 and 2 or 1
  run.status,run.stars,run.elapsed='clear',stars,elapsed
  local improved,record=personalBest(s,records(s).abyss,run.mode,elapsed)
  if improved then record.bestStars=stars end
  if run.mode=='entry' then C.noteGrowth(s,'abyss-entry-clear') end
  local slot=(record.clears-1)%5+1
  local preset={setId=run.set,subpair=slot==3 and 'hp_crit' or 'atk_crit'}
  s.mora=s.mora+spec.mora
  if not C.giveArtifact(s,slot,spec.itemLevel,spec.rarity,preset) then
   C.dropArtifact(s,slot,spec.itemLevel,spec.rarity,180,480,preset,'town')
  end
  s.campaign.message='三つの区画を突破しました。'
 end

 local function atHub(s,id)
  return not s.paused and s.story and s.story.active and s.story.node==id and not s.lift and not s.voyage
    and s.actors[s.active].hp>0 and s.campaign.zone=='town'
 end
 function C.action(s,key)
  local run=s.endgameRun
  if run then
   if key=='endgame_exit' and not s.paused then leave(s)
   elseif (key=='endgame_next' or key=='story_nearby_portal') and not s.paused and run.kind=='abyss' and run.status=='between' then
    run.room=run.room+1;openRoom(s,run)
   elseif key=='pause' or ((run.status=='fighting' or run.status=='between')
       and (battleActions[key] or key:match('^slot[1-8]$'))) then action(s,key) end
   return
  end
  local mode,set=key:match('^abyss_start:(%a+):(%a+)$')
  if mode then
   if abyss.modes[mode] and sets[set] and atHub(s,'mond-town') then
    local origin=s.story.node
    action(s,'field')
    s.endgameRun={kind='abyss',origin=origin,start=s.t,mode=mode,room=1,set=set}
    openRoom(s,s.endgameRun)
   end
   return
  end
  if key=='endgame_farka' then
   if atHub(s,'mond-town') then
    local origin=s.story.node
    action(s,'boss_farka')
    s.endgameRun={kind='stygian',origin=origin,start=s.t,status='fighting',lastHp=s.farka.hp}
   end
   return
  end
  local choice=key:match('^endgame_goal:(%a+)$')
  if choice then
   local q=s.story and s.story.quests[finalQuest]
   if choices[choice] and atHub(s,'mond-town') and q and q.status=='active' and q.count<2 then
    records(s).goal=choice;C.noteGrowth(s,'postgame-goal')
   end
   return
  end
  action(s,key)
 end
 function C.step(s,dt,input)
  local run=s.endgameRun
  if not run then return step(s,dt,input) end
  if (run.status~='fighting' and run.status~='between') or s.paused then return end
  local returns,boss=s.returns,s.farka
  step(s,dt,input)
  if run.kind=='stygian' and boss then
   if boss.hp<=0 or (boss.hp<run.lastHp and boss.phase=='recover') then C.noteGrowth(s,'stygian-opening') end
   run.lastHp=boss.hp
   if boss.hp<=0 then
    C.recordChallengeBoss(s,'farka',run.start);run.status='clear';run.elapsed=s.t-run.start
    s.campaign.message='通常模擬戦を突破しました。自己記録を保存しました。'
    return
   end
  end
  if s.returns~=returns or (run.kind=='abyss' and s.t-run.start>=abyss.modes[run.mode].limit) then
   run.status='failed'
   s.campaign.message='挑戦終了。入口から再挑戦できます。'
   return
  end
  if run.kind=='abyss' and run.status=='fighting' then
   for _,enemy in ipairs(s.enemies) do if enemy.hp>0 then return end end
   if run.room==#abyss.rooms then abyssClear(s,run)
   else run.status='between';s.campaign.message='区画を突破しました。次へ進めます。' end
  end
 end
 function C.checkpoint(s)
  local d=checkpoint(s)
  if d and s.endgameRun and d.story then
   local story={}
   for k,v in pairs(d.story) do story[k]=v end
   story.active=true;story.node=s.endgameRun.origin;d.story=story
  end
  if d and s.endgame then d.endgame=s.endgame end
  return d
 end
 function C.restore(data,density)
  local s=restore(data,density)
  s.endgame=data.endgame
  return s
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  f.endgame=s.endgame
  local run=s.endgameRun
  if run then
   local v={kind=run.kind,status=run.status}
   if run.kind=='abyss' then
    v.room=run.room;v.name=abyss.rooms[run.room].name;v.mode=abyss.modes[run.mode].name
    v.remaining=math.max(0,abyss.modes[run.mode].limit-(s.t-run.start));v.stars=run.stars
    v.targets=0
    for _,enemy in ipairs(s.enemies) do if enemy.hp>0 then v.targets=v.targets+1 end end
    if run.stars then v.reward=abyss.modes[run.mode].mora..'モラ・'..sets[run.set]..' 1個' end
    f.location='深境螺旋・'..v.name..'（試作）'
   end
   f.endgameRun=v
  elseif s.story and s.story.active and s.story.node=='mond-town' then
   f.endgameDesk={weekly={}}
   for _,boss in ipairs(weekly) do
    f.endgameDesk.weekly[#f.endgameDesk.weekly+1]={id=boss.id,name=boss.name,level=boss.level,node=boss.node}
   end
  end
  return f
 end
end
