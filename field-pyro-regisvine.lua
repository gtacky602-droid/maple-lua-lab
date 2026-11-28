return function(C)
 local U=88
 local radius=.12*U

 local function poseFor(boss,cast)
  if boss.down>0 or boss.rise>12 then return 'down' end
  if boss.rise>0 then return 'raised' end
  if not cast then return 'idle' end
  local move,t=cast.move,cast.tick
  if move.pattern=='slam' then
   if t<16 then return 'idle' end
   if t<move.lock then return 'raised' end
   if t<move.active[1][1] then return 'bowed' end
   if t<120 then return 'impact' end
   return 'down'
  elseif move.pattern=='bolts' then
   if t<18 or t>=move.shotTicks[2]+25 then return 'idle' end
   return t<move.shotTicks[1]+14 and 'bud_first' or 'bud_second'
  end
  if t>=move.recover then return 'idle' end
  return t<move.active[1][1] and 'sweep_ready' or 'sweep'
 end

 local pyro=C.fieldRegisvine(C.pyroFieldArt,poseFor)
 pyro.packRectArt=true
 local baseLabel=pyro.label

 function pyro.label(boss,cast)
  if boss.down>0 then
   return string.format('核を破壊・ダウン（あと%.1f秒）',math.ceil(boss.down/6)/10)
  end
  if boss.rise>0 then return baseLabel(boss) end
  if boss.coreHits==0 and boss.rearm==0 then
   if cast and cast.move.pattern=='slam' then return '核を破壊・火走りが消えるとダウン' end
   return '核を破壊・攻撃が終わるとダウン'
  end
  if not cast then return end
  local move,t=cast.move,cast.tick
  if t>=move.recover then
   return boss.coreHits>0 and '反撃の隙・地上で根元に近づいて攻撃' or '反撃の隙'
  end
  if move.pattern=='slam' then
   if t<move.shotTicks[1] then return move.title..'・低い炎を跳び越す' end
   if t<move.shotTicks[1]+move.shotLife then return '火走り・低い炎を跳び越す' end
   return '火走りが消えた・攻撃できる'
  end
  if move.pattern=='bolts' then return move.title..'・二発目まで注意' end
  return move.title..'・薙ぎの範囲から離れる'
 end

 function pyro.farMove(spec)
  return spec.moves[2]
 end

 function pyro.begin(boss,spec,move,target)
  local dir=target.x<boss.x and -1 or 1
  boss.facing=dir
  return {move=move,tick=0,dir=dir,seen={},shots={},projectiles={}}
 end

 function pyro.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end

 local function bounds(boss,cast)
  local move=cast.move
  local a,b=boss.x+cast.dir*move.near*U,boss.x+cast.dir*move.far*U
  return math.min(a,b),math.max(a,b),boss.y-move.high*U,boss.y-move.low*U
 end

 local function shotPosition(boss,cast,age)
  local move=cast.move
  return boss.x+cast.dir*(move.shotOrigin+age*move.shotSpeed/60)*U,boss.y-move.shotHeight*U
 end

 function pyro.tick(s,boss,spec,cast,target)
  local move=cast.move
  local t=cast.tick+1
  cast.tick=t
  if t<=move.lock and target then
   cast.dir=target.x<boss.x and -1 or 1
   boss.facing=cast.dir
  end
  local window=move.active[1]
  if window and t>=window[1] and t<window[2] then
   local left,right,top,bottom=bounds(boss,cast)
   C.hitFieldArea(s,boss,cast.seen,left,right,top,move.damage,bottom)
  end
  for i,fired in ipairs(move.shotTicks or {}) do
   local age=t-fired
   if age>=0 and age<move.shotLife and not cast.shots[i] then
    local x,y=shotPosition(boss,cast,age)
    if move.pattern=='slam' then
     -- The falling head and the traveling flame share one hit per actor.
     local previous=shotPosition(boss,cast,math.max(0,age-1))
     C.hitFieldCapsule(s,boss,cast.seen,previous,x,y,radius,move.shotDamage)
    else
     C.stepFieldBolt(s,boss,cast,i,x,y,radius,move.shotDamage)
    end
   end
  end
  pyro.updateHeight(boss,spec,t<move.total and cast or nil)
  return t>=move.total
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function mark(f,left,right,y,active)
  local light=active and '#fff0ac' or '#ffd197'
  rect(f,left,y-6,right-left,5,'#452c35')
  rect(f,left+2,y-5,right-left-4,2,light)
  rect(f,left,y-13,3,9,light)
  rect(f,right-3,y-13,3,9,light)
 end

 local function drawFire(f,x,y,dir,wave,age)
  local tail=wave and math.min(19,6+age) or 12
  local tailX=dir>0 and x-tail-9 or x+3
  rect(f,tailX,y-2,tail+5,4,'#a94323')
  rect(f,x-6,y-10,12,20,'#623042')
  rect(f,x-10,y-6,20,12,'#623042')
  rect(f,x-8,y-5,16,10,'#fa6d26')
  rect(f,x-5,y-8,10,16,'#ff9140')
  rect(f,x-4,y-4,8,8,age<2 and '#fff8dc' or '#ffe0a3')
 end

 local function lane(f,boss,cast,camera,y)
  local a=shotPosition(boss,cast,0)-camera
  local b=shotPosition(boss,cast,cast.move.shotLife-1)-camera
  local left,right=math.min(a,b),math.max(a,b)
  for x=left,right-12,20 do
   rect(f,x,y-2,12,4,'#554032')
   rect(f,x+(cast.dir>0 and 6 or 0),y-1,6,2,'#e9b184')
  end
 end

 function pyro.draw(f,s,boss,spec,cast,mode,profile)
  local camera=s.camera
  local x,y=boss.x-camera,boss.y
  if cast then
   local move,t=cast.move,cast.tick
   local window=move.active[1]
   if window and t>=move.lock and t<window[2] then
    local left,right=bounds(boss,cast)
    mark(f,left-camera,right-camera,y,t>=window[1])
   end
   if move.pattern=='slam' then
    if t<move.lock then
     local progress=t/move.lock
     rect(f,x-4-cast.dir*progress*14,y-29-progress*112,8,9,'#ffce70')
    elseif t<move.shotTicks[1] then
     lane(f,boss,cast,camera,y-12)
    elseif t>=156 and t<180 then
     for i=1,4 do
      local px=x+cast.dir*(112+i*24+(t-156)*.75)
      rect(f,px,y-8-i*5-(t-156)*1.3,5,4,'#d18b52')
     end
    end
   elseif move.pattern=='bolts' and t>=move.lock and t<move.shotTicks[2] then
    lane(f,boss,cast,camera,y-move.shotHeight*U)
   elseif move.pattern=='sweep' and t>=window[2] and t<window[2]+24 then
    local drift=t-window[2]
    for i=1,4 do
     rect(f,x+cast.dir*(i*24+drift*.7),y-29+i*4-drift*.3,12,3,'#cb7648')
    end
   end
   for i,fired in ipairs(move.shotTicks or {}) do
    local age=t-fired
    if move.pattern=='bolts' and age<0 then
     local px=x+cast.dir*(35+i*18)
     rect(f,px,y-79+i*6,10,9,'#9e482d')
     rect(f,px+2,y-78+i*6,6,6,'#ffd287')
    elseif age>=0 and age<move.shotLife and not cast.shots[i] then
     local bx,by=shotPosition(boss,cast,age)
     drawFire(f,bx-camera,by,cast.dir,move.pattern=='slam',age)
    end
   end
  end
  C.drawFieldRegisvine(f,C.pyroFieldArt,x,y,spec.artHeight,boss.facing>0,poseFor(boss,cast),mode,profile)
  if boss.coreHits>0 then
   local coreY=y-.35*U
   rect(f,x-8,coreY-7,16,14,'#743c3f')
   rect(f,x-5,coreY-4,10,8,'#fff0b8')
   for i=1,boss.coreHits do rect(f,x-13+(i-1)*9,coreY+11,6,4,'#ffc478') end
  end
 end

 return pyro
end
