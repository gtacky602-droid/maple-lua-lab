-- Simplified laboratory reaction experiment, not canonical Genshin formulas.
return function(C)
 local step,frame=C.step,C.frame
 local colors={pyro='#ff965c',hydro='#72cff7',electro='#cb9fff',cryo='#b9e8ff',dendro='#b6da83'}
 function C.afterElementHit(s,cast,e,element)
  if cast.reaction or cast.suppressAura or e.hp<=0 or e.immune==element then return end
  if not colors[element] and element~='anemo' then return end
  e.applicationClocks=e.applicationClocks or {}
  local key=tostring(cast.id)..':'..(cast.key or 'support')
  if s.t<(e.applicationClocks[key] or -1) then return end
  e.applicationClocks[key]=s.t+2.5
  local prior=e.aura
  if prior and prior.expires>s.t and ((element=='pyro' and prior.element=='dendro') or (element=='dendro' and prior.element=='pyro')) then
   e.burning={owner=cast.id,atk=cast.atk,next=s.t+1,remaining=4};e.aura=nil
   s.reactions=s.reactions or {};s.reactions[#s.reactions+1]={t=s.t,kind='burning',element='pyro',owner=cast.id,auraOwner=prior.owner,target=e.id}
   if #s.reactions>80 then table.remove(s.reactions,1) end
   return
  end
  if colors[element] then e.aura={element=element,expires=s.t+6,owner=cast.id};return end
  local aura=e.aura
  if not aura or aura.expires<=s.t or aura.element=='dendro' then return end
  e.aura=nil
  s.reactions=s.reactions or {};s.reactions[#s.reactions+1]={t=s.t,kind='swirl',element=aura.element,owner=cast.id,auraOwner=aura.owner,target=e.id}
  if #s.reactions>80 then table.remove(s.reactions,1) end
  -- Explicitly prevent reactions generating aura, gauge or further reactions.
  C.resolveCast(s,{id=cast.id,key='reaction:swirl',atk=cast.atk,x=e.x,y=e.y,dir=1,radial=true,range=140,limit=4,mult=.6,
   element=aura.element,color=colors[aura.element],gain=0,reaction=true,critRate=0})
  s.effects[#s.effects+1]={x=e.x,y=e.y-35,w=280,h=70,color=colors[aura.element],life=.3}
 end
 function C.step(s,dt,input)
  if not s.paused then
   for _,e in ipairs(s.enemies) do
    if e.hp<=0 then e.aura=nil;e.applicationClocks=nil;e.burning=nil
    elseif e.aura and e.aura.expires<=s.t+math.max(0,math.min(dt,1/30)) then e.aura=nil end
    if e.applicationClocks then for key,untilTime in pairs(e.applicationClocks) do if untilTime<=s.t then e.applicationClocks[key]=nil end end end
    local burn=e.burning
    if burn and s.t+math.max(0,math.min(dt,1/30))+1e-8>=burn.next then
     C.resolveCast(s,{id=burn.owner,key='reaction:burning',atk=burn.atk,x=e.x,y=e.y,targetId=e.id,persistentTarget=e,dir=1,radial=true,range=1,limit=1,mult=.3,element='pyro',color=colors.pyro,gain=0,reaction=true,critRate=0})
     burn.remaining=burn.remaining-1;burn.next=burn.next+1
     if burn.remaining<=0 or e.hp<=0 then e.burning=nil end
    end
   end
  end
  return step(s,dt,input)
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);f.reactions=s.reactions or {};f.auras={}
  for _,e in ipairs(s.enemies) do if e.hp>0 and e.aura then
   f.auras[#f.auras+1]={target=e.id,element=e.aura.element,owner=e.aura.owner,seconds=math.max(0,e.aura.expires-s.t)}
   if not e.underground then f.draws[#f.draws+1]={kind='rect',x=e.x-s.camera-6,y=e.y-78,w=12,h=12,color=colors[e.aura.element]} end
  end end
  for _,e in ipairs(s.enemies) do if C.canTargetEnemy(e) and e.burning then
   f.draws[#f.draws+1]={kind='rect',x=e.x-s.camera-10,y=e.y-72,w=20,h=10,color='#ff6d46'}
  end end
  f.commands=#f.draws;return f
 end
end
