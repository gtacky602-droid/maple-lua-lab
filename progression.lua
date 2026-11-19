-- Shared EXP uses the versioned, provisional design data supplied by the host.
return function(C,config)
 local action,frame,checkpoint,restore,onKill=C.action,C.frame,C.checkpoint,C.restore,C.onKill
 local regions={'モンド','璃月','稲妻','スメール','フォンテーヌ','ナタ','ナド・クライ','スネージナヤ'}
 local cap,levels=config.cap,config.levels

 function C.expNeeded(level) return levels[level].required_exp_to_next end
 local function spent(level) return levels[level].maple_reference_total_exp_to_reach end

 local function setup(s)
  if s.campaign and not s.progression then
   s.progression={curve=config.curve,level=1,xp=0,total=0,baseXp=0,overflowXp=0,curveAdjustment=0,
    killXp=0,questXp=0,lastKills=s.kills,questRewarded=s.campaign.quest=='complete'}
  end
 end

 function C.grantExp(s,amount,source,bonus)
  setup(s);local p=s.progression
  if not p or amount<=0 then return end
  local awarded=amount+(source=='kill' and bonus or 0)
  p.total=p.total+awarded;p.baseXp=p.baseXp+amount
  if source=='quest' then p.questXp=p.questXp+awarded else p.killXp=p.killXp+awarded end
  p.xp=p.xp+awarded
  while p.level<cap and p.xp>=C.expNeeded(p.level) do
   p.xp=p.xp-C.expNeeded(p.level);p.level=p.level+1
  end
  if p.level==cap then p.overflowXp=p.overflowXp+p.xp;p.xp=0 end
 end

 local function levelFactor(gap)
  local draft=config.gap
  if gap>40 then return draft.player_higher_by_over_40 end
  if gap>20 then return draft.player_higher_by_21_to_40 end
  if gap>10 then return draft.player_higher_by_11_to_20 end
  if gap>4 then return draft.player_higher_by_5_to_10 end
  if gap< -20 then return draft.enemy_higher_by_over_20 end
  if gap< -10 then return draft.enemy_higher_by_11_to_20 end
  return 1
 end

 function C.onKill(s,enemy)
  setup(s)
  local p=s.progression
  if p then
   local amount=config.legacyBossExp
   if enemy.fixedKillXp then
    amount=enemy.fixedKillXp
   elseif enemy.expRole or not enemy.boss then
    local level=math.max(1,math.min(cap,enemy.level or 1))
    local role=enemy.expRole or (enemy.storyName and 'elite' or 'normal')
    amount=math.max(1,math.floor(levels[level].normal_enemy_base_exp*config.roles[role]*levelFactor(p.level-level)+.5))
   end
   C.grantExp(s,amount,'kill')
   p.lastKills=s.kills
  end
  if onKill then onKill(s,enemy) end
 end

 function C.action(s,key)
  local before=s.campaign and s.campaign.quest
  action(s,key);setup(s)
  if before=='report' and s.campaign.quest=='complete' and not s.progression.questRewarded then
   s.progression.questRewarded=true;C.grantExp(s,config.trainingQuestExp,'quest')
  end
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);setup(s)
  if s.progression then
   f.progression=s.progression;f.nextExp=C.expNeeded(s.progression.level);f.levelCap=cap;f.regionEligibility={}
   for i,name in ipairs(regions) do
    local required=math.max(1,(i-1)*20)
    f.regionEligibility[i]={name=name,required=required,eligible=s.progression.level>=required,mapImplemented=false}
   end
  end
  return f
 end

 function C.checkpoint(s)
  local d=checkpoint(s);setup(s)
  if d then
   s.progression.lastKills=s.kills
   d.progression=s.progression
  end
  return d
 end

 function C.restore(d,density)
  local s=restore(d,density);setup(s)
  local past=d.progression
  if past then
   local p=s.progression
   for key in pairs(p) do if past[key]~=nil then p[key]=past[key] end end
   if not past.curve then
    local oldNeeded=100+20*(p.level-1)^2
    p.overflowXp=p.level==cap and past.xp or 0
    p.xp=p.level==cap and 0 or math.floor(past.xp*C.expNeeded(p.level)/oldNeeded)
    p.baseXp=p.total
    p.curveAdjustment=spent(p.level)+p.xp+p.overflowXp-p.total
   end
  end
  s.progression.questRewarded=s.campaign.quest=='complete'
  s.progression.lastKills=s.kills
  return s
 end
end
