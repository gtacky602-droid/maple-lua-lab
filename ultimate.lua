return function(C)
 local attack,step,action,frame,prerequisite=C.attack,C.step,C.action,C.frame,C.skillPrerequisite
 local colors={'#ff8557','#74d8ff','#ace674','#ffce66','#bc8cf5','#79ead7','#fba8cc'}
 function C.skillPrerequisite(s,a,key)
  if key=='SK60' then
   if a.id~=1 then return false,'七律開天は旅人の技です。' end
   if s.gauge<100 then return false,'七律開天には共通ゲージ100が必要です。' end
  end
  return prerequisite(s,a,key)
 end
 function C.attack(s,a,key)
  if key~='SK60' then return attack(s,a,key) end
  local ok,reason=C.skillPrerequisite(s,a,key)
  if not ok then s.skillNotice=reason;return false end
  if s.paused or a.hp<=0 or a.lock>0 or (a.cd.SK60 or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  local cast={id=1,key='SK60',x=a.x,y=a.y,dir=a.dir,range=600,vertical=300,radial=true,limit=15,mult=2.5,remaining=20,next=s.t+.12,interval=.134,gain=0,color='#fff2c4',element='seven',damageElements={'anemo','geo','electro','dendro','hydro','pyro','cryo'},special=true,suppressAura=true}
  for _,k in ipairs({'atk','elementBonus','skillBonus','troupe4','critRate','critDamageBonus'}) do cast[k]=a[k] end
  cast.startedAt=s.t;cast.playerInputAt=C.playerAttackAt(s,a)
  s.pending[#s.pending+1]=cast;s.ultimate={cast=cast,finish=s.t+2.8,zone=s.campaign and s.campaign.zone,returns=s.returns}
  s.gauge=s.gauge-100;a.cd.SK60=90;a.lock=2.8;s.skillNotice=nil
  if C.noteGrowth then C.noteGrowth(s,'seven-strike') end
  return true
 end
 local function valid(s,u)
  return s.actors[1].hp>0 and u.zone==(s.campaign and s.campaign.zone) and u.returns==s.returns
 end
 function C.step(s,dt,input)
  step(s,dt,input);local u=s.ultimate
  if not u then return end
  if not valid(s,u) then s.ultimate=nil;return end
  if not s.paused and s.t+1e-8>=u.finish then
   local c=u.cast;local target=nil
   for _,e in ipairs(s.enemies) do
    if C.canTargetEnemy(e) and math.abs(e.x-c.x)<c.range and math.abs(e.y-c.y)<c.vertical and (not target or e.hp>target.hp or (e.hp==target.hp and e.id<target.id)) then target=e end
   end
   if target then
    c.key='SK60:final';c.mult=12;c.limit=1;c.targetId=target.id
    C.resolveCast(s,c)
    s.effects[#s.effects+1]={x=target.x,y=target.y-65,w=28,h=130,life=.5,color='#fff2c4',sevenFinisher=true}
   end
   s.ultimate=nil
  end
 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then s.ultimate=nil end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local u=s.ultimate
  local function beam(x,y,w,h,color,opacity,motionOnly)
   f.draws[#f.draws+1]={kind='rect',x=math.floor(x-w/2),y=math.floor(y),w=w,h=h,color=color,
    opacity=opacity,motionOnly=motionOnly,translucentFill=opacity and opacity<.5 or nil}
  end
  if u and valid(s,u) then
   f.ultimate={seconds=math.max(0,u.finish-s.t),pulses=20-u.cast.remaining}
   local c=u.cast
   local elapsed=s.t-c.startedAt
   for i,color in ipairs(colors) do
    local offset=i-4
    local x=c.x-s.camera+offset*c.range*.185
    if x>=-48 and x<=1008 then
     local y=c.y-(offset==0 and 92 or 5)
     local rise=math.max(.08,math.min(1,(elapsed-math.abs(offset)*.027)/.30))
     local h=math.floor(c.vertical*rise)
     beam(x,y-h,32,h,color,.31)
     beam(x,y-h,13,h,color,.78)
     beam(x,y-h,4,h,'#fff9dc',.88)
     beam(x,y-8,40,5,color,.86)
     beam(x,y-3,70,3,color,.68)
     for j=1,3 do
      local lift=(j/3+elapsed*.7+i*.08)%1
      beam(x+math.sin(lift*math.pi*2+i)*24,y-h*lift,8,3,color,.88,true)
     end
    end
   end
  end
  for _,effect in ipairs(s.effects) do
   if effect.sevenFinisher then
    local x,y=effect.x-s.camera,effect.y+65
    if x>=-65 and x<=1025 then
     local fade=math.min(1,effect.life*4)
     beam(x,y-246,36,246,'#ffc977',fade*.46)
     beam(x,y-246,9,246,'#fff9dc',fade*.94)
     beam(x,y-46,62,4,'#fff9dc',fade*.84)
     beam(x,y-7,106,5,'#ffc977',fade*.86)
    end
   end
  end
  f.commands=#f.draws;return f
 end
end
