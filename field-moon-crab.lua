return function(C)
 local crab={}

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function clamp(x,low,high)
  return math.max(low,math.min(x,high))
 end

 local function cracked(b,spec)
  return b.hp>0 and b.hp<=spec.hp*spec.shellThreshold
 end

 local function setForm(b,spec,open)
  b.cracked=open
  b.form=open and '水晶が露出' or '箱を背負う殻'
  b.drawHeight=open and spec.crackedHeight or spec.artHeight
  b.hitTop=b.y-b.drawHeight
 end

 function crab.spawn(b,spec) setForm(b,spec,cracked(b,spec)) end
 function crab.cancel(b,spec) setForm(b,spec,cracked(b,spec)) end

 function crab.shareCast(cast,actors)
  if cast.seen then C.shareFieldHits({cast.seen},actors) end
 end

 function crab.preempt(b,spec,slot)
  if b.cracked or not cracked(b,spec) then return false end
  setForm(b,spec,true)
  slot.cast={move=spec.shellBreak,tick=0}
  slot.index=2
  return true
 end

 function crab.selectMove(b,move)
  return b.cracked and move.openMove or move
 end

 function crab.begin(b,spec,move,target)
  b.facing=target.x<b.x and -1 or 1
  local left,right
  if move.type=='box' then
   local center=clamp(target.x,spec.arenaMin+move.width,spec.arenaMax-move.width)
   left,right=center-move.width,center+move.width
  else
   local finish=clamp(b.x+b.facing*move.width,spec.arenaMin,spec.arenaMax)
   left,right=math.min(b.x,finish),math.max(b.x,finish)
  end
  return {
   move=move,tick=0,seen={},dir=b.facing,origin=b.x,left=left,right=right,
   top=spec.floorY-move.height,
   source={x=b.x,y=spec.floorY,id=b.id,owner=b,damageElement=move.element},
  }
 end

 local function reflectionBand(cast,i)
  local length=(cast.right-cast.left)/3
  local a=cast.origin+cast.dir*length*(i-1)
  local b=cast.origin+cast.dir*length*i
  return math.min(a,b),math.max(a,b)
 end

 function crab.tick(s,b,spec,cast)
  local move,t=cast.move,cast.tick+1
  cast.tick=t
  if move.type=='break' then return t>=move.recovery end
  local spread=move.type=='reflection' and move.interval*2 or 0
  if move.type=='reflection' then
   for i=1,3 do
    local at=move.windup+move.interval*(i-1)
    if t>=at and t<at+move.active then
     local left,right=reflectionBand(cast,i)
     C.hitFieldArea(s,cast.source,cast.seen,left,right,cast.top,move.damage)
    end
   end
  elseif t>=move.windup and t<move.windup+move.active then
   C.hitFieldArea(s,cast.source,cast.seen,cast.left,cast.right,cast.top,move.damage)
  end
  return t>=move.windup+spread+move.active+move.recovery
 end

 function crab.damageFactor(_,cast,b,spec)
  if b.cracked then return 1 end
  return (cast.x-b.x)*b.facing>0 and spec.frontFactor or 1
 end

 function crab.label(b,cast)
  if not cast then
   return not b.cracked and '側面と背面に攻撃が通りやすい' or nil
  end
  local move,t=cast.move,cast.tick
  if move.type=='break' then return '殻が崩れ、水晶が露出した' end
  if move.type=='reflection' then
   for i=1,3 do
    local at=move.windup+move.interval*(i-1)
    if t<at then
     return ('反射光 %d/3 まで %.1f秒・岩棚か帯の外へ'):format(i,math.ceil((at-t)/6)/10)
    end
    if t<at+move.active then return ('反射光 %d/3・岩棚か帯の外へ'):format(i) end
   end
   return '反射光が止んだ・反撃の隙'
  end
  local hint=move.type=='box' and '落下位置から横へ' or '低い帯を跳ぶか、帯の外へ'
  if t<move.windup then
   return ('%sまで %.1f秒・%s'):format(move.title,math.ceil((move.windup-t)/6)/10,hint)
  end
  if t<move.windup+move.active then return move.title..'・'..hint end
  return move.title..'の後・反撃の隙'
 end

 function crab.frame(f,b,_,cast)
  f.cracked=b.cracked
  f.facing=b.facing
  if cast and cast.move.type~='break' then
   f.lane={left=cast.left,right=cast.right,top=cast.top,at=cast.move.windup,active=cast.tick>=cast.move.windup}
  end
 end

 local function diamond(f,x,y,color)
  rect(f,x-3,y-12,6,3,color)
  rect(f,x-7,y-9,14,3,color)
  rect(f,x-10,y-6,20,3,color)
  rect(f,x-7,y-3,14,3,color)
 end

 local function telegraph(f,s,b,cast)
  local move=cast.move
  if move.type=='break' then
   local x,y=b.x-s.camera,b.y
   for i=-2,2 do
    rect(f,x+i*(17+cast.tick*.75),y-93+cast.tick*.9+math.abs(i)*9,7,9,'#b6d3dd')
   end
   return
  end
  local y=b.y
  if move.type=='reflection' then
   for i=1,3 do
    local left,right=reflectionBand(cast,i)
    local at=move.windup+move.interval*(i-1)
    local active=cast.tick>=at and cast.tick<at+move.active
    if cast.tick<at+move.active then
     rect(f,left-s.camera,y-5,right-left,5,active and '#d4fff1' or '#679dbd')
     if active then rect(f,left-s.camera,cast.top,right-left,y-cast.top,'#9cfff27d') end
     for x=left+13,right-8,25 do diamond(f,x-s.camera,y,active and '#ecfff9' or '#aff2e5') end
    end
   end
  elseif cast.tick<move.windup+move.active then
   local active=cast.tick>=move.windup
   local left,right=cast.left-s.camera,cast.right-s.camera
   rect(f,left,cast.top,right-left,y-cast.top,active and '#f6bb7661' or '#eab17e28')
   rect(f,left,y-3,right-left,3,'#ffd79b')
   for x=left+5,right-5,18 do rect(f,x,y-9,9,3,'#ffdf9c') end
   if move.type=='box' then
    local x=(left+right)/2
    local fall=clamp((cast.tick-move.windup+18)/18,0,1)
    local top=y-190+fall*164
    rect(f,x-19,top,38,22,'#958da5')
    rect(f,x-19,top+3,38,4,'#d3d2db')
    rect(f,x-3,top+8,6,8,'#edc98c')
   end
  end
 end

 function crab.draw(f,s,b,spec,cast,mode,profile)
  if cast then telegraph(f,s,b,cast) end
  local art=b.cracked and C.moonCrabArt.cracked or C.moonCrabArt.idle
  C.drawFieldDisplayArt(f,art,b.x-s.camera,b.y,b.drawHeight,mode,profile,b.facing>0)
 end

 return crab
end
