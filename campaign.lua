-- Progression trial: locations and encounter are provisional, not official map coverage.
return function(C)
 local baseNew,baseAction,baseStep,baseFrame=C.new,C.action,C.step,C.frame
 local names={town='モンド・町（仮配置）',field='城外の狩場（仮配置）',arena='討伐試験（仮ボス）'}
 local function enter(s,zone)
  s.campaign.zone=zone
  s.worldwidth=2880
  s.campaign.lastKills=s.kills
  local fresh=baseNew(s.density)
  s.platforms=fresh.platforms;s.enemies=zone=='field' and fresh.enemies or {}
  if zone=='arena' then
   s.platforms={{x=0,y=480,w=2880}}
   s.enemies={{id=1,x=650,home=650,y=480,hp=360,maxhp=360,respawn=0,cd=2,warning=0,kind=1,boss=true}}
  end
  s.effects={};s.numbers={};s.pending={};s.decoys={};s.camera=0
  for i,a in ipairs(s.actors) do a.x=200-(i-1)*50;a.y=480;a.vy=0;a.ground=true;a.inv=2 end
  if zone=='town' then for _,a in ipairs(s.actors) do a.hp=a.maxhp end end
 end
 function C.action(s,key)
  if key=='campaign' and not s.campaign then
   s.campaign={zone='town',quest='available',count=0,goal=8,boss=false,reward=200,message='町で依頼を受けよう。'}
   enter(s,'town');return
  end
  local q=s.campaign
  if q then
   if key=='accept' and q.zone=='town' and q.quest=='available' then q.quest='hunt';q.message='城外の魔物を8体倒そう。';return end
   if key=='town' then enter(s,'town');return end
   if key=='field' then enter(s,'field');return end
   if key=='arena' then
    if q.quest=='boss' then enter(s,'arena');q.message='予告された範囲から離れて攻撃を避けよう。'
    else q.message='狩場の依頼を進めると討伐試験が開く。' end
    return
   end
   if key=='report' then
    if q.zone=='town' and q.quest=='report' then q.quest='complete';s.mora=s.mora+q.reward;q.message='報告完了。報酬200モラを受け取った。'
    else q.message='討伐試験を終えて町で報告しよう。' end
    return
   end
  end
  baseAction(s,key)
 end
 function C.step(s,dt,input)
  local q=s.campaign
  if not q then return baseStep(s,dt,input) end
  if s.paused then return end
  local before=q.lastKills or s.kills;local returns=s.returns
  -- Boss attacks use a locked telegraph, independently from the small-enemy contact attack.
  local boss=q.zone=='arena' and s.enemies[1]
  if boss and boss.hp>0 then
   boss.cd=999;boss.warning=0;boss.clock=(boss.clock or 2)-dt*C.enemyRate(boss)
   if boss.clock<=0 and not boss.strike then
    boss.strike={x=s.actors[s.active].x,left=.9,radius=boss.hp<180 and 175 or 110}
   end
   if boss.strike then
    boss.strike.left=boss.strike.left-dt*C.enemyRate(boss)
    if boss.strike.left<=0 then
     for _,a in ipairs(s.actors) do
      if a.hp>0 and math.abs(a.x-boss.strike.x)<boss.strike.radius and a.y>400 then C.damageActor(s,a,32,boss,false,true) end
     end
     boss.strike=nil;boss.clock=boss.hp<180 and 1.5 or 2.5
    end
   end
  end
  baseStep(s,dt,input)
  q.lastKills=s.kills
  if q.zone=='field' and q.quest=='hunt' then
   q.count=math.min(q.goal,q.count+s.kills-before)
   if q.count==q.goal then q.quest='boss';q.message='狩場の討伐完了。討伐試験へ進もう。' end
  end
  if boss and boss.hp<=0 then
   boss.respawn=1e9;boss.strike=nil
   if q.quest=='boss' then q.boss=true;q.quest='report';q.message='討伐試験を突破。町で報告しよう。' end
  end
  if s.returns>returns then enter(s,'town');q.message='町へ帰還。依頼の進行は保持している。' end
 end
 function C.frame(s,mode,profile)
  local f=baseFrame(s,mode,profile)
  if s.campaign then
   f.campaign=s.campaign;f.location=names[s.campaign.zone]
   local b=s.campaign.zone=='arena' and s.enemies[1]
   if b and b.hp>0 then
    f.boss={name='大型スライム・進行検証用',hp=b.hp,maxhp=b.maxhp,phase=b.hp<180 and 2 or 1}
    if b.strike then
     f.draws[#f.draws+1]={kind='rect',x=b.strike.x-b.strike.radius-s.camera,y=470,w=b.strike.radius*2,h=10,color='#ff654e'}
    end
   end
   f.commands=#f.draws
  end
  return f
 end
 -- Checkpoint saves intentionally resume in town, never inside a partially resolved attack.
 function C.checkpoint(s)
  if not s.campaign then return nil end
  return {version=1,quest=s.campaign.quest,count=s.campaign.count,mora=s.mora,
   kills=s.kills,hits=s.hits,damage=s.damage,gauge=s.gauge,active=s.active}
 end
 function C.restore(d,density)
  local s=baseNew(density)
  C.action(s,'campaign')
  s.campaign.quest=d.quest;s.campaign.count=d.count
  s.campaign.boss=d.quest=='report' or d.quest=='complete'
  for _,k in ipairs({'mora','kills','hits','damage','gauge','active'}) do s[k]=d[k] end
  s.campaign.lastKills=s.kills
  s.campaign.message='保存した進行で町から再開。戦闘とCTはリセット。'
  return s
 end
end
