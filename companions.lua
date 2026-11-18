return function(C)
 local action,step,frame,checkpoint,restore,after=C.action,C.step,C.frame,C.checkpoint,C.restore,C.afterElementHit
 local skills={normal={mult=.9,hits=3,ct=0,lock=.8,targets=3,delay=.15,interval=.08},skill1={mult=.7,hits=10,ct=15,lock=.45,targets=6,delay=.4,interval=.6,deploy=true},skill2={mult=.45,hits=8,ct=20,lock=.5,targets=6,delay=.6,interval=1.2,deploy=true},skill3={mult=0,hits=0,ct=12,lock=.35,targets=0},skill4={mult=1.1,hits=10,ct=26,lock=.75,targets=8,delay=.15,interval=.08}}
 local windSkills={normal={mult=1.2,hits=3,ct=0,lock=.7,targets=3,delay=.15,interval=.08},skill1={hits=0,ct=18,lock=.35},skill2={mult=1.2,hits=6,ct=9,lock=.75,targets=6,delay=.15,interval=.08},skill3={mult=1,hits=3,ct=10,lock=.4,targets=4,delay=.15,interval=.08},skill4={mult=1.65,hits=8,ct=24,lock=.8,targets=8,delay=.15,interval=.08}}
 local movement=C.moveActorOverride
 function C.moveActorOverride(s,a,dt,move,held)
  if a.id==2 and s.companion=='wanderer' and (a.floatUntil or 0)>s.t then
   local x=math.max(20,math.min((s.worldwidth or 2880)-20,a.x+move*210*dt))
   local y=a.y+math.max(-240*dt,math.min(240*dt,a.floatY-a.y))
   if C.pathClear(s,a,x,y) then a.x=x;a.y=y end
   a.vy=0;a.ground=false;a.walk=move;if move~=0 then a.dir=move>0 and 1 or -1 end
   return true
  end
  return movement(s,a,dt,move,held)
 end
 function C.companionAttack(s,a,key)
  local wind=s.companion=='wanderer'
  if s.companion~='columbina' and not wind then return nil end
  local d=(wind and windSkills or skills)[key]
  if not d or s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  if wind and key=='skill2' and (a.floatUntil or 0)<=s.t then s.skillNotice='空中連射は浮遊中に使えます。';return false end
  a.cd[key]=d.ct;a.lock=d.lock
  if wind then
   if key=='skill1' then a.floatUntil=s.t+10;a.floatY=math.max(140,a.y-100);return true end
   if key=='skill3' then a.inv=math.max(a.inv,.45) end
  else
   if key=='skill2' then s.moonDomain=s.t+10 end
   if key=='skill3' then s.moonMark=s.t+10;return true end
  end
  local cast={id=2,key='columbina:'..key,atk=a.atk,elementBonus=a.elementBonus,normalBonus=a.normalBonus,skillBonus=a.skillBonus,troupe4=a.troupe4,critRate=a.critRate,critDamageBonus=a.critDamageBonus,isNormal=key=='normal',x=a.x,y=a.y,dir=a.dir,range=360,limit=d.targets,mult=d.mult,color='#b9d9f8',element='hydro',remaining=d.hits,interval=d.interval,next=s.t+d.delay,gain=key=='normal' and 2 or 5,radial=d.deploy or false}
  if wind then
   cast.key='wanderer:'..key;cast.element='anemo';cast.color='#b2e8d4';cast.vertical=150
   if key=='normal' and (a.floatUntil or 0)>s.t then cast.normalBonus=(cast.normalBonus or 0)+.15 end
  end
  cast.startedAt=s.t;s.pending[#s.pending+1]=cast;return true
 end
 function C.companionAI(s,a,nearest)
  if s.companion=='wanderer' then
   local danger=(nearest.warning or 0)>0 and math.abs(nearest.x-a.x)<170
   if danger and C.attack(s,a,'skill3') then return true end
   for _,key in ipairs({'skill1','skill4','skill2','normal'}) do if C.attack(s,a,key) then break end end
   return true
  end
  if s.companion~='columbina' then return false end
  for _,key in ipairs({'skill2','skill3','skill4','skill1','normal'}) do if C.attack(s,a,key) then break end end
  return true
 end
 function C.afterElementHit(s,cast,e,element)
  after(s,cast,e,element)
  if s.companion~='columbina' or s.actors[2].hp<=0 or cast.id~=1 or cast.reaction or cast.special or e.hp<=0 or s.t>=(s.moonDomain or 0) or s.t>=(s.moonMark or 0) or s.t<(s.moonICD or 0) then return end
  local eligible=element=='electro' or element=='dendro' or element=='geo'
  for _,part in ipairs(cast.damageElements or {}) do if part=='electro' or part=='dendro' or part=='geo' then eligible=true end end
  if not eligible then return end
  s.moonICD=s.t+1
  C.resolveCast(s,{id=1,key='moon_support_proxy',atk=cast.atk,x=e.x,y=e.y,targetId=e.id,dir=1,radial=true,range=1,limit=1,mult=1.2,color='#e2e4ff',element='hydro',gain=0,reaction=true,critRate=0})
 end
 local function clear(s) s.moonDomain=0;s.moonMark=0;s.moonICD=0;s.actors[2].floatUntil=0 end
 function C.action(s,key)
  local id=string.match(key,'^companion:(%a+)$')
  if id then
   if not s.campaign or s.campaign.zone~='town' or (id~='amber' and id~='columbina' and id~='wanderer' and id~='beidou' and id~='ayaka' and id~='emilie' and id~='kachina' and id~='mitya') then return end
   if (s.companion or 'amber')==id then return end
   s.companion=id
   C.refreshArtifactStats(s,true)
   clear(s);s.actors[2].cd={};s.actors[2].lock=0;s.decoys={}
   for i=#s.pending,1,-1 do if s.pending[i].id==2 then table.remove(s.pending,i) end end
   return
  end
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then clear(s) end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.returns~=returns or s.actors[2].hp<=0 then clear(s) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local col=s.companion=='columbina'
  f.companion={id=s.companion or 'amber',name=col and 'コロンビーナ（仮表示）' or 'アンバー',skills=col and {'通常水弾','さざ波','月の領域','月の印','月光奥義'} or {'通常攻撃','火矢','矢の雨','ウサギ伯爵','跳躍射撃'},moonDomain=math.max(0,(s.moonDomain or 0)-s.t),moonMark=math.max(0,(s.moonMark or 0)-s.t)}
  if s.companion=='wanderer' then f.companion.name='放浪者（仮表示）';f.companion.skills={'通常風弾','浮遊','空中連射','風圧回避','嵐の奥義'};f.companion.floatSeconds=math.max(0,(s.actors[2].floatUntil or 0)-s.t) end
  if not s.toyDive and (col or s.companion=='wanderer' or s.companion=='beidou' or s.companion=='ayaka' or s.companion=='emilie' or s.companion=='kachina' or s.companion=='mitya') then
   for i=#f.draws,1,-1 do local d=f.draws[i];if d.kind=='sprite' and (d.asset==3 or d.asset==4) then table.remove(f.draws,i) end end
   local a=s.actors[2]
   if a.hp>0 and C.companionArt and C.companionArt[s.companion] then
    C.drawCompanionArt(f,s,a,mode,profile)
   elseif a.hp>0 then
    f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera-14,y=a.y-60,w=28,h=60,color='#a4b1d4'}
    f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera-10,y=a.y-78,w=20,h=18,color='#e1d7d4'}
    if s.companion=='wanderer' then f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera-26,y=a.y-80,w=52,h=6,color='#7aa7ba'} end
   end
  end
  f.commands=#f.draws;return f
 end
 function C.checkpoint(s) local d=checkpoint(s);if not d then return nil end;d.companion=s.companion or 'amber';return d end
 function C.restore(d,density) local s=restore(d,density);s.companion=d.companion or 'amber';return s end
end
