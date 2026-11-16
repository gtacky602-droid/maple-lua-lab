return function(C)
 local attack,step,frame,after,prerequisite=C.attack,C.step,C.frame,C.afterElementHit,C.skillPrerequisite
 C.skillDefinitions.SK56={range=180,targets=8,mult=1.1,hits=12,ct=28,lock=.6,interval=1,delay=1,color='#a5e8dc',element='star',damageElements={'cryo','anemo'},radial=true,placed=true,partnerRequired='wanderer',special=true,suppressAura=true}
 function C.skillPrerequisite(s,a,key)
  if key=='SK56' then
   if s.companion~='wanderer' or s.actors[2].hp<=0 then return false,'星嵐の種には生存している放浪者の同行が必要です。' end
   -- Lab unlock override: production cryo learning gate is not yet implemented.
  end
  return prerequisite(s,a,key)
 end
 function C.attack(s,a,key)
  local result=attack(s,a,key)
  if result and key=='SK56' then
   local cast=s.pending[#s.pending]
   s.starSeed={cast=cast,growth=0,nextGrowth=0,expires=s.t+12.1,zone=s.campaign and s.campaign.zone,returns=s.returns}
  end
  return result
 end
 function C.afterElementHit(s,cast,e,element)
  after(s,cast,e,element)
  local seed=s.starSeed
  if not seed or cast.reaction or cast.special or s.t<seed.nextGrowth or seed.growth>=12 then return end
  if math.abs(e.x-seed.cast.x)>seed.cast.range or math.abs(e.y-seed.cast.y)>100 then return end
  seed.growth=seed.growth+1;seed.nextGrowth=s.t+.25;seed.cast.range=180+seed.growth*5
 end
 local function valid(s,seed)
  return s.actors[1].hp>0 and s.actors[2].hp>0 and s.companion=='wanderer' and seed.zone==(s.campaign and s.campaign.zone) and seed.returns==s.returns
 end
 function C.step(s,dt,input)
  if s.starSeed and not valid(s,s.starSeed) then s.starSeed=nil end
  step(s,dt,input)
  local seed=s.starSeed
  if seed and not s.paused then
   if not valid(s,seed) then s.starSeed=nil
   elseif s.t+1e-8>=seed.expires then
    local cast=seed.cast;cast.mult=3;cast.key='SK56:burst';cast.gain=0
    C.resolveCast(s,cast);s.starSeed=nil
   end
  end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local seed=s.starSeed
  if seed and valid(s,seed) then
   f.starSeed={growth=seed.growth,radius=seed.cast.range,seconds=math.max(0,seed.expires-s.t)}
   local size=14+seed.growth*2
   f.draws[#f.draws+1]={kind='rect',x=seed.cast.x-s.camera-size/2,y=seed.cast.y-50-size,w=size,h=size,color='#a5e8dc'}
   f.draws[#f.draws+1]={kind='rect',x=seed.cast.x-s.camera-seed.cast.range,y=seed.cast.y-3,w=seed.cast.range*2,h=3,color='#a5e8dc'}
  end
  f.commands=#f.draws;return f
 end
end
