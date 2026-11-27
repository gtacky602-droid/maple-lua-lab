-- Directional melee input around mechanics that require the active character.
local function nearTarget(a,x)
 local dx=x-a.x
 local direction=dx<0 and -1 or 1
 local offset=dx-direction*72
 local move=math.abs(offset)>8 and offset or dx*a.dir<0 and dx or 0
 return {left=move<0,right=move>0,attack=math.abs(dx)<113 and dx*a.dir>=0}
end

local function walkTo(a,x)
 return {left=x<a.x-8,right=x>a.x+8}
end

local function shouki(C,s,w,spec,a)
 if w.stage=='p2' and w.shield>0 or w.stage=='trial' and w.trialLeft==0 then
  if w.aim then
   if not w.aim.confirmed then C.action(s,'encounter_confirm') end
   return {}
  end
  if w.charge==spec.charge.max then
   C.action(s,'encounter_interact')
   return {}
  end
  local block,distance=nil,math.huge
  for _,item in ipairs(w.blocks) do
   local dx=math.abs(item.x-a.x)
   if dx<distance then block,distance=item,dx end
  end
  if block then return walkTo(a,block.x) end
 end
 if w.stage=='trial' then
  local nearest,distance=nil,math.huge
  for _,pod in ipairs(w.targets) do
   local dx=math.abs(pod.x-a.x)
   if pod.hp>0 and dx<distance then nearest,distance=pod,dx end
  end
  return nearest and nearTarget(a,nearest.x) or {}
 end
 if not w.primary.invulnerable then return nearTarget(a,w.primary.x) end
 return {}
end

local function beidou(C,s,b,a,bait)
 if b.phase=='recover' or bait and b.phase=='guard' then return nearTarget(a,b.x) end
 local m=b.move
 if (b.phase=='tell' or b.phase=='strike') and m and a.x>m.lo-8 and a.x<m.hi+8 then
  local left,right=m.lo-26,m.hi+26
  local escape=left>=22 and (right>938 or a.x-left<right-a.x) and left or right
  local input=walkTo(a,escape)
  if m.height<=70 and a.ground then
   C.action(s,'jump')
   input.jump=true
  elseif b.phase=='strike' and b.tick<=6 and (a.cd.dodge or 0)<=0 then
   C.action(s,'dodge')
  end
  return input
 end
 if b.phase=='intro' or b.phase=='approach' then
  local input=nearTarget(a,b.x)
  input.attack=false
  return input
 end
 return {}
end

-- A repeatable input sequence for comparing encounters on earned saves.
return function(C,s,encounter,kind,budget,route,options)
 local phases,moves,events={},{},{}
 local phaseSeen,moveSeen,eventSeen={},{},{}
 local begin,damage,hits,returns=s.t,s.damage,s.hits,s.returns
 local seq=s.seq
 local _,spec=C.currentWeeklyBoss(s)
 local function record(list,seen,key,tick)
  if key and not seen[key] then
   list[#list+1]={id=key,tick=tick}
   seen[key]=true
  end
 end
 local function target(a,b)
  local best,score=nil,math.huge
  for _,e in ipairs(s.enemies) do
   if e.hp>0 and not e.underground and not e.invulnerable then
    local x=e.weakpoint and e.weakpoint.x or e.x
    local y=e.weakpoint and e.weakpoint.y or C.targetHeight(a,e)
    local distance=math.abs(x-a.x)+math.abs(y-a.y)*1.5
    if distance<score then
     best,score={x=x,y=y,half=e.hitHalfWidth or 0},distance
    end
   end
  end
  return best or {x=b.x,y=b.y,half=0,waiting=true}
 end
 local function observe(tick)
  local stage=encounter.stage or encounter.form or encounter.phase or encounter.boss and encounter.boss.phase
  if encounter.form and encounter.stage then
   stage=('%s/%s'):format(encounter.form,encounter.stage)
  end
  record(phases,phaseSeen,stage,tick)
  local cast=encounter.cast or encounter.boss and encounter.boss.move
  local move=cast and (cast.key or cast.id or cast.move and cast.move.id)
  record(moves,moveSeen,move,tick)
  for i=#s.events,1,-1 do
   local e=s.events[i]
   if e.seq<=seq then break end
   if e.kind:match(':') and not e.kind:match('^cast:') then
    local item=eventSeen[e.kind]
    if item then item.count=item.count+1
    else
     item={id=e.kind,tick=tick,count=1,value=e.value}
     events[#events+1]=item;eventSeen[e.kind]=item
    end
   end
  end
  seq=s.seq
  if options and options.sample then options.sample(tick,stage,move,cast and (cast.t or cast.tick)) end
 end
 local function status()
  if kind=='weekly' then return encounter.waitUntil and 'clear' or 'fighting' end
  return encounter.status
 end
 local tick=0
 observe(tick)
 while tick<budget and status()=='fighting' and s.returns==returns do
  local b=encounter.primary or encounter.boss
  local a=s.actors[s.active]
  local aim=target(a,b)
  local cast=encounter.cast
  if cast and cast.key=='WT03' then
   aim={x=cast.pawns[#cast.pawns].x+82,y=a.y,half=0,waiting=true}
  elseif cast and cast.key=='WM13' then
   aim={x=spec.rift.x,y=spec.floorY,half=0,waiting=true}
   if not cast.confirm and cast.t>=spec.rift.enterTick and math.abs(a.x-aim.x)<26 then
    C.action(s,'encounter_interact')
   end
  elseif encounter.match=='rerir' and encounter.phase=='fog' and cast and not cast.lamp and cast.t==84 then
   C.action(s,'encounter_interact')
  end
  local dx,dy=aim.x-a.x,aim.y-a.y
  local gap=math.abs(dx)
  local jump=dy< -63 and gap<150 and a.ground
  local slide=gap>(aim.waiting and 12 or a.id==1 and 70 or 180)
  local input={
   left=slide and dx<0,right=slide and dx>0,jump=jump,
   attack=not aim.waiting and gap<(a.id==1 and 114 or 335)+aim.half and math.abs(dy)<83,
  }
  if spec and spec.controller=='shouki' and route=='mechanics' then
   input=shouki(C,s,encounter,spec,a)
  elseif encounter.match=='beidou' and route~='basic' then
   input=beidou(C,s,b,a,route=='bait')
  elseif jump then C.action(s,'jump') end
  if options and options.canAttack and not options.canAttack() then input.attack=false end
  C.step(s,1/60,input)
  tick=tick+1
  observe(tick)
 end
 local b=encounter.primary or encounter.boss
 local result=status()
 if result=='fighting' then result=s.returns>returns and 'returned' or 'input_budget' end
 local partyHp={}
 for _,a in ipairs(s.actors) do partyHp[#partyHp+1]=a.hp end
 return {
  status=result,ticks=tick,elapsed=s.t-begin,node=s.story.node,
  maxHp=b.maxhp,hpRemaining=b.hp,hits=s.hits-hits,damage=s.damage-damage,
  partyHp=partyHp,phases=phases,moves=moves,events=events,
 }
end
