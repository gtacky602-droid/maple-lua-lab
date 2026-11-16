-- Explicit provisional EXP model, not an adopted MapleStory EXP table.
return function(C)
 local action,step,frame,checkpoint,restore=C.action,C.step,C.frame,C.checkpoint,C.restore
 local regions={'モンド','璃月','稲妻','スメール','フォンテーヌ','ナタ','ナド・クライ','スネージナヤ'}
 function C.expNeeded(level) return math.floor(100+20*(level-1)^2) end
 local function setup(s)
  if s.campaign and not s.progression then s.progression={level=1,xp=0,total=0,killXp=0,questXp=0,lastKills=s.kills,questRewarded=s.campaign.quest=='complete'} end
 end
 function C.grantExp(s,amount,source)
  setup(s);local p=s.progression
  if not p or amount<=0 then return end
  p.xp=p.xp+amount;p.total=p.total+amount
  if source=='quest' then p.questXp=p.questXp+amount else p.killXp=p.killXp+amount end
  -- 200 is only the laboratory calculation horizon, not the game's level cap.
  while p.level<200 and p.xp>=C.expNeeded(p.level) do p.xp=p.xp-C.expNeeded(p.level);p.level=p.level+1 end
 end
 local function settle(s)
  setup(s);local p=s.progression
  if not p then return end
  if s.kills>p.lastKills then C.grantExp(s,(s.kills-p.lastKills)*10,'kill') end
  p.lastKills=s.kills
 end
 function C.action(s,key)
  settle(s);local before=s.campaign and s.campaign.quest
  action(s,key);setup(s)
  if before=='report' and s.campaign.quest=='complete' and not s.progression.questRewarded then
   s.progression.questRewarded=true;C.grantExp(s,500,'quest')
  end
 end
 function C.step(s,dt,input)
  step(s,dt,input);settle(s)
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);setup(s)
  if s.progression then
   f.progression=s.progression;f.nextExp=C.expNeeded(s.progression.level);f.regionEligibility={}
   for i,name in ipairs(regions) do
    f.regionEligibility[i]={name=name,required=math.max(1,(i-1)*20),eligible=s.progression.level>=math.max(1,(i-1)*20),mapImplemented=false}
   end
  end
  return f
 end
 function C.checkpoint(s)
  settle(s);local d=checkpoint(s)
  if d then d.progression=s.progression end
  return d
 end
 function C.restore(d,density)
  local s=restore(d,density);setup(s)
  if d.progression then
   local p=d.progression
   s.progression={level=p.level,xp=p.xp,total=p.total,killXp=p.killXp,questXp=p.questXp,questRewarded=p.questRewarded,lastKills=s.kills}
  else
   s.progression.questRewarded=s.campaign.quest=='complete';s.progression.lastKills=s.kills
  end
  return s
 end
end
