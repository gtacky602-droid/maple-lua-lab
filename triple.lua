return function(C)
 local attack,action,step,frame=C.attack,C.action,C.step,C.frame
 C.skillDefinitions.SK50={range=360,vertical=180,targets=6,mult=1.15,hits=10,ct=32,lock=.5,interval=1,delay=1,color='#c2e6aa',element='fusion',damageElements={'anemo','geo','dendro'},applicationElement='dendro',placed=true,offset=100}
 C.skillDefinitions.SK51={range=600,vertical=220,targets=10,mult=1.8,hits=10,ct=32,lock=.7,interval=.1,color='#d8d8b2',element='fusion',damageElements={'electro','dendro','hydro'},applicationElement='hydro',homing=true,sharedProjectiles=true}
 C.skillDefinitions.SK52={range=600,vertical=65,targets=3,mult=2.45,hits=12,ct=34,lock=3,interval=.25,delay=.25,color='#c9eff3',element='fusion',damageElements={'anemo','hydro','pyro'},applicationElement='hydro',channel=true}
 C.skillDefinitions.SK53={range=300,targets=6,mult=1.15,hits=12,ct=36,lock=.5,interval=1,delay=1,color='#c1e5dd',element='fusion',damageElements={'geo','dendro','cryo'},applicationElement='cryo',placed=true,offset=160}
 function C.interruptChannel(s,a)
  if not a.channel then return end
  for i=#s.pending,1,-1 do if s.pending[i].id==a.id and s.pending[i].channel then table.remove(s.pending,i) end end
  a.channel=nil;a.lock=0
 end
 function C.attack(s,a,key)
  local ok=attack(s,a,key);if not ok then return ok end
  if key=='SK52' then a.channel='SK52'
  elseif key=='SK50' then
   for i=#s.platforms,1,-1 do if s.platforms[i].structure=='garden' then table.remove(s.platforms,i) end end
   local cast=s.pending[#s.pending];cast.y=math.max(170,a.y-150)
   s.platforms[#s.platforms+1]={x=math.max(0,math.min((s.worldwidth or 2880)-160,cast.x-80)),y=cast.y,w=160,life=10,temporary=true,structure='garden'}
  end
  return true
 end
 function C.action(s,key)
  if key=='cancel_channel' or key=='jump' or key=='drop' or key=='dodge' or key=='swap' then C.interruptChannel(s,s.actors[s.active]) end
  if key=='cancel_channel' then return end
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then for _,a in ipairs(s.actors) do a.channel=nil end end
 end
 function C.step(s,dt,input)
  if not s.paused then for _,a in ipairs(s.actors) do
   if a.channel and (a.hp<=0 or a.id~=s.active or (input and (input.left or input.right or input.jump))) then C.interruptChannel(s,a) end
  end end
  local returns=s.returns;step(s,dt,input)
  if s.returns~=returns then for _,a in ipairs(s.actors) do a.channel=nil end end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  for _,cast in ipairs(s.pending) do
   if cast.channel then
    f.draws[#f.draws+1]={kind='effect',x=cast.x-s.camera+cast.dir*300,y=cast.y-35,w=600,h=35,color='#c9eff3',alpha=.45}
   elseif cast.placed=='SK50' then
    for i=-2,2 do f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera+i*30,y=cast.y-15,w=12,h=15,color='#c2e6aa'} end
   elseif cast.placed=='SK53' then
    for i=-1,1 do f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera+i*28-8,y=cast.y-85+math.abs(i)*20,w=16,h=85-math.abs(i)*20,color='#c1e5dd'} end
   end
  end
  f.commands=#f.draws;return f
 end
end
