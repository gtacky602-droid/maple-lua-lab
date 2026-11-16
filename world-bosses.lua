-- Story entrances preserve a route back; direct laboratory challenges remain separate.
return function(C,graph)
 local action,step,frame,checkpoint,onKill=C.action,C.step,C.frame,C.checkpoint,C.onKill
 local nodes={};for _,n in ipairs(graph.nodes) do nodes[n.id]=n end
 local ids={thunder=20070101,array=24021101,maguu=25090101,primo=26050101,oceanid=20050101,geo=20040301,electro=20040101,anemo=20040201,cryo=26020101,pyro=26020201}
 local function back(s)
  local journey=s.bossJourney;if not journey then return end
  s.bossJourney=nil;action(s,'town');C.enterStoryNode(s,journey.node)
  s.storyNotice='挑戦入口に戻りました。討伐調査は町で報告できます。'
 end
 function C.action(s,key)
  local id=key:match('^world_boss:([%w%-]+)$')
  if id then
   if s.paused or not s.story or not s.story.active or s.actors[s.active].hp<=0 then return end
   local n=nodes[s.story.node];local a=s.actors[s.active]
   if n.challenge~=id or math.abs(a.x-(n.challengeX or 720))>=90 or math.abs(a.y-480)>=60 then s.storyNotice='挑戦碑の近くまで歩いてください。';return end
   if not s.progression or s.progression.level<n.level then return end
   local origin=n.id;action(s,n.challengeAction);s.bossJourney={node=origin,id=id,name=n.challengeName};return
  end
  if key=='world_boss_return' then if not s.paused then back(s) end;return end
  if key:match('^boss_') or key=='town' or key=='field' or key=='arena' or key=='campaign' or key=='story_start' then s.bossJourney=nil end
  action(s,key)
 end
 function C.onKill(s,e)
  if onKill then onKill(s,e) end
  local j=s.bossJourney
  if j and not j.defeated and e.id==ids[j.id] then j.defeated=true;C.storyBossDefeated(s,j.id) end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.bossJourney and s.returns~=returns then back(s) end
 end
 function C.checkpoint(s)
  local d=checkpoint(s)
  if d and s.bossJourney and d.story then
   local copy={};for k,v in pairs(d.story) do copy[k]=v end;copy.active=true;copy.node=s.bossJourney.node;d.story=copy
  end
  return d
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);f.bossJourney=s.bossJourney
  if s.story and s.story.active then
   local n=nodes[s.story.node]
   if n.challenge then f.draws[#f.draws+1]={kind='rect',x=n.challengeX-s.camera-18,y=420,w=36,h=60,color='#c4a7ef'};f.commands=#f.draws end
  end
  return f
 end
end
