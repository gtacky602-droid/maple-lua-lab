-- Equal elemental shares are a lab proposal; direct damage does not double.
return function(C)
 local frame,attack,action=C.frame,C.attack,C.action
 C.skillDefinitions.SK29={range=360,vertical=190,targets=8,mult=1.35,hits=8,ct=12,lock=.7,interval=.15,color='#d5dab0',element='fusion',damageElements={'anemo','geo'},applicationElement='geo',radial=true}
 C.skillDefinitions.SK30={range=220,targets=6,mult=.75,hits=10,ct=20,lock=.4,interval=1,delay=1,color='#c3b6ff',element='fusion',damageElements={'anemo','electro'},applicationElement='electro',follow=true,radial=true,placed=true}
 C.skillDefinitions.SK31={range=720,vertical=360,targets=1,mult=2.5,hits=6,ct=12,lock=.65,interval=.15,color='#bee8a0',element='fusion',damageElements={'anemo','dendro'},applicationElement='dendro',homing=true,farthest=true}
 C.skillDefinitions.SK32={range=520,targets=2,mult=1.85,hits=9,ct=15,lock=.9,interval=.1,color='#9bdeef',element='fusion',damageElements={'anemo','hydro'},applicationElement='hydro'}
 C.skillDefinitions.SK33={range=240,targets=10,mult=1.1,hits=12,ct=18,lock=.6,interval=.25,color='#ffbc83',element='fusion',damageElements={'anemo','pyro'},applicationElement='pyro',placed=true,offset=180,pull=24}
 C.skillDefinitions.SK34={range=65,vertical=70,targets=5,mult=.75,hits=11,ct=16,lock=.2,interval=.5,color='#c4efff',element='fusion',damageElements={'anemo','cryo'},applicationElement='cryo',follow=true,radial=true,contactBudget=6,gliding=true}
 C.skillDefinitions.SK35={range=220,targets=4,mult=.9,hits=6,ct=20,lock=.4,interval=8/6,delay=8/6,color='#bdb9ff',element='fusion',damageElements={'geo','electro'},applicationElement='electro',placed=true,offset=100}
 C.skillDefinitions.SK36={range=180,targets=2,mult=4.6,hits=3,ct=16,lock=.8,interval=.25,color='#c6d39a',element='fusion',damageElements={'geo','dendro'},applicationElement='dendro',armorBreak=6}
 function C.attack(s,a,key)
  if key=='SK34' and a.ground then return false end
  local ok=attack(s,a,key);if not ok then return ok end
  if key=='SK34' then a.glide=5
  elseif key=='SK35' then
   for i=#s.platforms,1,-1 do if s.platforms[i].structure=='magnetic' then table.remove(s.platforms,i) end end
   local cast=s.pending[#s.pending];cast.y=math.max(170,a.y-90)
   s.platforms[#s.platforms+1]={x=math.max(0,math.min((s.worldwidth or 2880)-120,cast.x-60)),y=cast.y,w=120,life=8,temporary=true,structure='magnetic'}
  end
  return true
 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then for _,a in ipairs(s.actors) do a.glide=0 end end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  for _,a in ipairs(s.actors) do if a.hp>0 and not a.ground and (a.glide or 0)>0 then
   f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera-55,y=a.y-65,w=110,h=8,color='#c4efff'}
  end end
  for _,cast in ipairs(s.pending) do
   if cast.placed=='SK33' then for i=0,5 do f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera-15-i*5,y=cast.y-i*18,w=30+i*10,h=6,color='#ffbc83'} end
   elseif cast.placed=='SK35' then f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera-60,y=cast.y-6,w=120,h=6,color='#bdb9ff'} end
  end
  for _,cast in ipairs(s.pending) do if cast.placed=='SK30' then local a=s.actors[cast.id]
   for i=1,10 do local angle=i*math.pi/5+s.t*3
    f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera+math.cos(angle)*65-4,y=a.y-45+math.sin(angle)*40-4,w=8,h=8,color='#c3b6ff'}
   end
  end end
  f.commands=#f.draws;return f
 end
end
