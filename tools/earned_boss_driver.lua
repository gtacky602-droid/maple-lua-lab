-- A repeatable input sequence for comparing encounters on earned saves.
return function(C,s,encounter,kind,budget)
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
  record(moves,moveSeen,cast and (cast.key or cast.id or cast.move and cast.move.id),tick)
  for i=#s.events,1,-1 do
   local e=s.events[i]
   if e.seq<=seq then break end
   if e.kind:match(':') and not e.kind:match('^cast:') then
    record(events,eventSeen,e.kind,tick)
   end
  end
  seq=s.seq
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
  if jump then C.action(s,'jump') end
  C.step(s,1/60,{
   left=slide and dx<0,right=slide and dx>0,jump=jump,
   attack=not aim.waiting and gap<(a.id==1 and 114 or 335)+aim.half and math.abs(dy)<83,
  })
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
