return function(C)
 local cryo={}
 local U=88

 function cryo.spawn(boss,spec)
  boss.coreHits=spec.core.hits;boss.down=0;boss.rise=0;boss.rearm=0
 end

 function cryo.farMove(spec)
  return spec.moves[3]
 end

 function cryo.begin(boss,spec,move,target)
  local direction=target.x<boss.x and -1 or 1
  boss.facing=direction
  return {move=move,tick=0,dir=direction,seen={},shots={},projectiles={}}
 end

 -- This hook sees the same cast table for every hit in a multi-pulse action.
 -- The common hit pipeline alone changes the main HP.
 function cryo.onHit(cast,boss,spec)
  if boss.coreHits<=0 or cast.reaction or cast.cryoFieldCore or
     math.abs(cast.x-boss.x)>94 or math.abs(cast.y-spec.floorY)>38 then return end
  cast.cryoFieldCore=true
  boss.coreHits=boss.coreHits-1
 end

 local function poseFor(boss,cast)
  if boss.down>0 or boss.rise>12 then return 'down' end
  if not cast then return 'idle' end
  local move,t=cast.move,cast.tick
  if move.pattern=='bolts' then return t<move.recover and 'bolts' or 'idle' end
  if t>=move.recover then return move.pattern=='slam' and 'down' or 'idle' end
  return move.pattern..(t<move.active[1][1] and '_ready' or '')
 end

 local function updateHeight(boss,spec,cast)
  local pose=poseFor(boss,cast)
  boss.drawHeight=pose=='idle' and spec.artHeight or C.cryoFieldArt[pose].profiles.legacy.height
  boss.hitTop=boss.y-boss.drawHeight
 end

 function cryo.preempt(boss,spec,slot)
  if boss.down>0 then
   boss.down=boss.down-1
   if boss.down==0 then boss.rise=spec.core.rise;boss.rearm=spec.core.rearm end
   updateHeight(boss,spec,nil)
   return true
  end
  if boss.rearm>0 then
   boss.rearm=boss.rearm-1
   if boss.rearm==0 then boss.coreHits=spec.core.hits end
  end
  if boss.rise>0 then
   boss.rise=boss.rise-1
   updateHeight(boss,spec,nil)
   return true
  end
  updateHeight(boss,spec,slot.cast)
  if boss.coreHits>0 or boss.rearm>0 then return false end
  local cast=slot.cast
  if cast then
   local move=cast.move
   local untilTick=move.shotTicks and move.shotTicks[#move.shotTicks]+move.shotLife or move.active[#move.active][2]
   -- If the final active tick just ran, no future hit belongs to this attack.
   if cast.tick<untilTick-1 then return false end
  end
  slot.cast=nil;slot.delay=0
  boss.down=spec.core.down;updateHeight(boss,spec,nil)
  return true
 end

 function cryo.label(boss)
  if boss.down>0 then return '核を破壊・ダウン' end
  if boss.rise>0 then return '起き上がり' end
 end

 local function attackBounds(boss,cast)
  local slam=cast.move.pattern=='slam'
  local a=boss.x+cast.dir*(slam and .4 or .3)*U
  local b=boss.x+cast.dir*(slam and 1.8 or 1.6)*U
  return math.min(a,b),math.max(a,b),boss.y-(slam and .65 or .75)*U,boss.y-(slam and 0 or .2)*U
 end

 local function bulletPosition(boss,cast,age)
  return boss.x+cast.dir*(.45*U+age*4*U/60),boss.y-.75*U
 end

 function cryo.tick(s,boss,spec,cast,target)
  local t=cast.tick+1
  cast.tick=t
  if t<=cast.move.lock and target then
   cast.dir=target.x<boss.x and -1 or 1
   boss.facing=cast.dir
  end
  if cast.move.shotTicks then
   local radius=.12*U
   for i,fired in ipairs(cast.move.shotTicks) do
    local age=t-fired
    if age>=0 and age<cast.move.shotLife and not cast.shots[i] then
     local x,y=bulletPosition(boss,cast,age)
     local p=cast.projectiles[i]
     if not p then
      p={x=x,y=y,source=boss.id,damage=cast.move.damage}
      cast.projectiles[i]=p
     end
     cast.shots[i]=C.resolveEnemyProjectileSegment(s,p,x,y,radius,10,68)
     p.x=x;p.y=y
    end
   end
  else
   local window=cast.move.active[1]
   if t>=window[1] and t<window[2] then
    local x0,x1,y0,y1=attackBounds(boss,cast)
    for _,a in ipairs(s.actors) do
     if a.hp>0 and not cast.seen[a.id] and a.x+10>x0 and a.x-10<x1 and a.y>y0 and a.y-50<y1 then
      cast.seen[a.id]=true;C.damageActor(s,a,cast.move.damage,boss,false,true)
     end
    end
   end
  end
  updateHeight(boss,spec,t<cast.move.total and cast or nil)
  return t>=cast.move.total
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function cryo.draw(f,s,boss,spec,cast,mode,profile)
  local x=boss.x-s.camera
  local pose=poseFor(boss,cast)
  if cast then
   local move,t=cast.move,cast.tick
   if move.pattern=='bolts' then
    for i,fired in ipairs(move.shotTicks) do
     local age=t-fired
     if age<0 then
      local ox=x+cast.dir*(32+i*12)
      rect(f,ox,boss.y-.75*U-6,8,8,'#bfeaff')
      if t>=move.lock then rect(f,x+cast.dir*46+(cast.dir<0 and -240 or 0),boss.y-.75*U,240,2,'#82afc9') end
     elseif age<move.shotLife and not cast.shots[i] then
      local bx,by=bulletPosition(boss,cast,age)
      rect(f,bx-s.camera-11,by-5,22,10,'#98dbff')
      rect(f,bx-s.camera-5,by-3,12,6,'#e5faff')
     end
    end
   else
    local window=move.active[1]
    local x0,x1,y0,y1=attackBounds(boss,cast)
    if t>=move.lock and t<window[2] then
     local color=t>=window[1] and '#f8d499' or '#e88356'
     rect(f,x0-s.camera,y1-4,x1-x0,4,color)
     rect(f,x0-s.camera,y0,3,y1-y0,color)
     rect(f,x1-s.camera-3,y0,3,y1-y0,color)
    elseif move.pattern=='slam' and t>=84 and t<96 then
     local rise=(t-84)*2
     for i=1,3 do rect(f,x+cast.dir*(42+i*25),boss.y-12-i*4-rise,5,9,'#d2e8fc') end
    end
   end
  end
  C.drawCryoFieldArt(f,x,boss.y,spec.artHeight,boss.facing>0,pose,mode,profile)
  if boss.coreHits>0 then
   local y=boss.y-.35*U
   rect(f,x-8,y-7,16,14,'#5476a1')
   rect(f,x-5,y-4,10,8,'#fff3cb')
   for i=1,boss.coreHits do rect(f,x-13+(i-1)*9,y+11,6,4,'#f4d296') end
  end
 end
 return cryo
end
