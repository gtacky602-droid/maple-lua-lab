return function(C)
 local primo={}
 local U=88
 local traits=C.primoTraits
 local palettes={}

 local function scalePalette(tint)
  if not tint then return nil end
  local function remap(cache,color)
   local r=tonumber(color:sub(2,3),16)
   local g=tonumber(color:sub(4,5),16)
   local b=tonumber(color:sub(6,7),16)
   local result=color
   if b-r>=32 and g-r>=12 and b-g>=8 then
    local function channel(i) return math.floor(r+(b-r)*tint[i]/255+.5) end
    result=string.format('#%02x%02x%02x',channel(1),channel(2),channel(3))
   end
   cache[color]=result
   return result
  end
  return setmetatable({},{__index=remap})
 end

 function primo.spawn(boss,spec,generation)
  local variant=spec.variants[(generation-1)%#spec.variants+1]
  boss.element=variant.element
  boss.tint=variant.tint
  boss.displayName=spec.name..'（'..traits.names[boss.element]..'）'
  boss.hitBottom=boss.y-.3*U
  boss.resist={}
  for element,value in pairs(traits.resistance) do
   boss.resist[element]=value+(element==boss.element and .2 or 0)
  end
  if variant.tint and not palettes[boss.element] then palettes[boss.element]=scalePalette(variant.tint) end
 end

 function primo.begin(boss,spec,move,target)
  local dir=target.x<boss.x and -1 or 1
  if move.pattern=='tail' then dir=boss.facing end
  boss.facing=dir
  local cast={move=move,tick=0,dir=dir,groups={{},{}},total=move.total}
  cast.source={id=boss.id,x=boss.x,y=boss.y,owner=boss,
               damageElement=move.element=='variant' and boss.element or move.element}
  if move.bonusTicks then
   cast.source.onShieldAbsorb=function()
    if boss.hp<=0 or cast.guardTick then return end
    cast.guardTick=cast.tick
    cast.total=move.total+move.bonusTicks
   end
  end
  return cast
 end

 function primo.shareCast(cast,actors)
  C.shareFieldHits(cast.groups,actors)
 end

 function primo.frame(f,boss,spec,cast)
  if not cast then return end
  f.guardTick=cast.guardTick
  if cast.tick>=cast.move.recover then
   f.recoveryTicks=cast.total-cast.tick
  end
 end

 local function bounds(boss,cast)
  local move=cast.move
  local a,b
  if move.radius then a,b=boss.x-move.radius*U,boss.x+move.radius*U
  else a,b=boss.x+cast.dir*move.near*U,boss.x+cast.dir*move.far*U end
  return math.min(a,b),math.max(a,b),boss.y-move.high*U,boss.y-move.low*U
 end

 local function poseFor(cast)
  if not cast then return 'idle' end
  local move,t=cast.move,cast.tick
  if move.pattern=='claw' then
   if t<78 then return 'windup' end
   if t<103 then return 'claw_first' end
   if t<139 then return 'windup' end
   if t<166 then return 'claw_second' end
  elseif move.pattern=='tail' then
   if t<90 then return 'tail_ready' end
   if t<move.recover then return 'tail_sweep' end
  else
   if t<move.active[1][1] then return 'charge' end
   if t<move.active[1][2] then return 'burst' end
   return 'down'
  end
  return 'idle'
 end

 local function poseHeight(spec,pose)
  return pose=='idle' and spec.artHeight or C.primoFieldArt[pose].profiles.legacy.height
 end

 function primo.tick(s,boss,spec,cast,target)
  local move,t=cast.move,cast.tick+1
  cast.tick=t
  if t<=move.lock and target and move.pattern~='tail' then
   cast.dir=target.x<boss.x and -1 or 1
   boss.facing=cast.dir
  end
  for i,window in ipairs(move.active) do
   if t>=window[1] and t<window[2] then
    local left,right,top,bottom=bounds(boss,cast)
    C.hitFieldArea(s,cast.source,cast.groups[i],left,right,top,move.damage,bottom)
   end
  end
  boss.drawHeight=poseHeight(spec,poseFor(t<cast.total and cast or nil))
  boss.hitTop=boss.y-boss.drawHeight
  return t>=cast.total
 end

 function primo.label(boss,cast)
  if not cast then return end
  if cast.guardTick then return '盾で受けた・隙＋1秒' end
  if cast.tick>=cast.move.recover then return '息継ぎ' end
  if cast.move.pattern=='claw' then
   return cast.tick<103 and '前爪二連・1/2' or '前爪二連・2/2'
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function mark(f,left,right,top,bottom,active)
  local color=active and '#fff2b9' or '#e8a072'
  rect(f,left,bottom-5,right-left,5,'#523530')
  rect(f,left+2,bottom-4,right-left-4,2,color)
  rect(f,left,top,3,bottom-top,color)
  rect(f,right-3,top,3,bottom-top,color)
 end

 local function drawAttack(f,s,boss,cast)
  local move,t=cast.move,cast.tick
  local index=move.pattern=='claw' and t>=103 and 2 or 1
  local window=move.active[index]
  local left,right,top,bottom=bounds(boss,cast)
  left,right=left-s.camera,right-s.camera
  local active=t>=window[1] and t<window[2]
  local x,y=boss.x-s.camera,boss.y
  if t>=move.lock and t<window[2] then mark(f,left,right,top,bottom,active) end
  if move.pattern=='shower' then
   local color=traits.colors[boss.element]
   if t<window[1] then
    local ratio=t/window[1]
    local glowX=x+cast.dir*(20+ratio*49)
    local glowY=y-28-ratio*55
    rect(f,glowX-6,glowY-4,12,9,color)
    rect(f,glowX-3,glowY-2,6,4,'#fbf3cf')
   elseif active then
    local age=t-window[1]
    for i=-3,3 do
     local px=x+i*(32+age*2)
     local height=math.max(9,51-8*math.abs(i)-2*age)
     rect(f,px-7,y-height,14,height,color)
     rect(f,px-3,y-height+5,6,height-5,'#fff1cf')
    end
   end
   if cast.guardTick and t<cast.guardTick+20 then
    local age=t-cast.guardTick
    rect(f,x+cast.dir*33-15+cast.dir*age,y-59+age,29,4,'#f9f5d2')
    rect(f,x+cast.dir*33-4+cast.dir*age,y-67+age,7,20,'#f2d592')
   end
  elseif active then
   for i=0,2 do
    local span=move.pattern=='claw' and 38 or 62
    rect(f,(left+right-span)/2+i*8,top+13+i*11,span,3,'#e6dbce')
   end
  end
 end

 function primo.draw(f,s,boss,spec,cast,mode,profile)
  local pose=poseFor(cast)
  C.drawPrimoFieldArt(f,boss,boss.x-s.camera,pose,poseHeight(spec,pose),mode,profile,palettes[boss.element])
  if cast then drawAttack(f,s,boss,cast) end
 end

 return primo
end
