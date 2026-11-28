return function(C)
 local attack,action,step,frame,prerequisite=C.attack,C.action,C.step,C.frame,C.skillPrerequisite
 local cooldown=24
 -- v0.5 direct/channel trial scope; deployment copying remains undecided.
 local eligible={skill1=true,SK05=true,SK07=true,SK09=true,SK10=true,SK11=true,SK13=true,SK14=true,SK15=true,SK17=true,SK19=true,SK21=true,SK25=true,SK26=true,SK27=true,SK28=true,SK31=true,SK32=true,SK36=true,SK39=true,SK43=true,SK49=true,SK51=true,SK52=true,SK57=true}
 local function copy(t)
  if type(t)~='table' then return t end
  local r={};for k,v in pairs(t) do r[k]=copy(v) end;return r
 end
 function C.onCastBuilt(s,a,cast,delay,lock,definition)
  if a.id==1 and eligible[cast.key] then s.echoSource={cast=copy(cast),delay=delay,lock=lock,dash=definition and definition.dash} end
 end
 function C.skillPrerequisite(s,a,key)
  if key=='SK59' then
   if C.growthSkillCondition then
    local ok,reason=C.growthSkillCondition(s,key)
    if not ok then return false,reason end
   end
   if a.id~=1 or a.light<=0 then return false,'光界反響は光界解放中に使えます。' end
   if not s.echoSource then return false,'先に反響できる直接攻撃・照射を使ってください。' end
   return prerequisite(s,a,s.echoSource.cast.key)
  end
  return prerequisite(s,a,key)
 end
 function C.attack(s,a,key)
  if key~='SK59' then return attack(s,a,key) end
  local ok,reason=C.skillPrerequisite(s,a,key)
  if not ok then s.skillNotice=reason;return false end
  if s.paused or a.hp<=0 or a.lock>0 or (a.cd.SK59 or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  local source=s.echoSource;local cast=copy(source.cast);cast.startedAt=s.t;cast.playerInputAt=C.playerAttackAt(s,a)
  for _,k in ipairs({'atk','elementBonus','normalBonus','skillBonus','troupe4','critRate','critDamageBonus'}) do cast[k]=a[k] end
  cast.key='SK59';cast.echoOf=source.cast.key;cast.mult=cast.mult*.55;cast.x=a.x;cast.y=a.y;cast.dir=a.dir;cast.color='#e9dcff';cast.next=s.t+.12
  if cast.groundWave then C.placeGroundCast(s,cast) end
  if cast.travelSpeed then cast.lastPulseX=cast.x end
  a.cd.SK59=cooldown;a.lock=cast.channel and source.lock or .35;s.skillNotice=nil
  if source.dash then a.dash=source.dash;a.dashDir=a.dir end
  if cast.channel then a.channel='SK59' end
  if cast.remaining>0 then s.pending[#s.pending+1]=cast end
  return true
 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then s.echoSource=nil end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.actors[1].hp<=0 or returns~=s.returns then s.echoSource=nil end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  local a=s.actors[1]
  local remaining=a.cd.SK59 or 0
  f.echoSource=s.echoSource and s.echoSource.cast.key or nil
  local available=s.active==1 and a.hp>0 and a.light>0 and f.echoSource~=nil and remaining==0
   and a.lock<=0 and #s.pending<64 and (not C.canAttack or C.canAttack(s))
   and C.skillPrerequisite(s,a,'SK59')==true
  if available then
   for _,slot in ipairs(f.loadout) do
    for _,key in ipairs(slot) do
     if key=='SK59' then f.echoReady=true end
    end
   end
  end
  local flash=a.hp>0 and remaining>cooldown-.46
  local x=math.floor(a.x-s.camera)
  if (f.echoReady or flash) and x>=-50 and x<=1010 then
   local spread=flash and math.floor(20+48*(cooldown-remaining)) or 12
   local y=math.floor(a.y)-(flash and 43 or 78)
   local function rect(px,py,w,h,color)
    f.draws[#f.draws+1]={kind='rect',x=px,y=py,w=w,h=h,color=color}
   end
   for _,dir in ipairs({-1,1}) do
    local px=x+spread*dir
    rect(px-4,y-2,8,4,'#c6b0fa')
    rect(px-2,y-5,4,10,'#c6b0fa')
    rect(px-1,y-1,2,2,'#f4eaff')
   end
   f.commands=#f.draws
  end
  return f
 end
end
