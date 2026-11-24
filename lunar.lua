return function(C)
 local attack,step,frame=C.attack,C.step,C.frame
 C.skillDefinitions.SK54={range=300,targets=8,mult=.9,hits=12,ct=22,lock=.5,interval=1,delay=1,color='#c6d0ff',element='lunar',damageElements={'electro','hydro'},applicationElement='hydro',follow=true,radial=true,placed=true,partnerRequired='columbina',special=true,suppressAura=true}
 C.skillDefinitions.SK55={range=180,targets=6,mult=1.25,hits=10,ct=24,lock=.5,interval=.8,delay=.8,color='#e3e3c0',element='lunar',damageElements={'geo','hydro'},applicationElement='hydro',follow=true,radial=true,placed=true,partnerRequired='columbina',special=true,suppressAura=true}
 function C.skillPrerequisite(s,a,key)
  if a.id==1 and C.growthSkillCondition then
   local ok,reason=C.growthSkillCondition(s,key)
   if not ok then return false,reason end
  end
  if key=='SK54' or key=='SK55' then
   if s.companion~='columbina' then return false,'月技にはコロンビーナの同行が必要です。' end
   if s.actors[2].hp<=0 then return false,'同行するコロンビーナが戦闘不能です。' end
  end
  return true
 end
 function C.attack(s,a,key)
  local ok,reason=C.skillPrerequisite(s,a,key)
  if not ok then s.skillNotice=reason;return false end
  local result=attack(s,a,key);if result then s.skillNotice=nil end;return result
 end
 function C.step(s,dt,input)
  if not s.paused then for i=#s.pending,1,-1 do local cast=s.pending[i]
   if cast.partnerRequired and not (C.partnerAvailable and C.partnerAvailable(s,cast.partnerRequired) or (not C.partnerAvailable and s.companion==cast.partnerRequired and s.actors[2].hp>0)) then table.remove(s.pending,i);s.skillNotice='同行条件が失われたため連携技を解除しました。' end
  end end
  return step(s,dt,input)
 end
 function C.drawLunarCasts(s,f,camera)
  for _,cast in ipairs(s.pending) do
   if cast.placed=='SK54' then local a=s.actors[cast.id]
    f.draws[#f.draws+1]={kind='rect',x=a.x-camera-12,y=a.y-125,w=24,h=24,color='#c6d0ff'}
   elseif cast.placed=='SK55' then local a=s.actors[cast.id]
    for i=1,6 do local angle=i*math.pi/3+s.t*2
     f.draws[#f.draws+1]={kind='rect',x=a.x-camera+math.cos(angle)*145-6,y=a.y-40+math.sin(angle)*40-6,w=12,h=12,color='#e3e3c0'}
    end
   end
  end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);f.skillNotice=s.skillNotice
  C.drawLunarCasts(s,f,s.camera)
  f.commands=#f.draws;return f
 end
end
