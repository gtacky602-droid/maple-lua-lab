return function(C)
 local walker={}

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function walker.spawn(b) b.exposed=false end
 function walker.cancel(b) walker.spawn(b) end
 function walker.shareCast(cast,actors) C.shareFieldHits({cast.seen},actors) end

 function walker.begin(b,spec,move,target)
  b.facing=target.x<b.x and -1 or 1
  local center=move.track and target.x or b.x
  center=math.max(spec.arenaMin+move.halfWidth,math.min(spec.arenaMax-move.halfWidth,center))
  local top=spec.floorY-move.height
  return {move=move,tick=0,left=center-move.halfWidth,right=center+move.halfWidth,top=top,
   images={b.x-move.echoSpacing,b.x+move.echoSpacing},seen={},
   source={id=b.id,owner=b,x=b.x,y=spec.floorY,damageElement=move.element}}
 end

 function walker.tick(s,b,spec,cast)
  cast.tick=cast.tick+1
  local timing,t=cast.move,cast.tick
  if t>=timing.windup and t<timing.windup+timing.active then
   C.hitFieldArea(s,cast.source,cast.seen,cast.left,cast.right,cast.top,timing.damage)
  elseif t==timing.windup+timing.active then b.exposed=true end
  if t<timing.windup+timing.active+timing.recovery then return false end
  b.exposed=false
  return true
 end

 function walker.damageFactor(_,_,b,spec) return b.exposed and spec.recoveryFactor or 1 end

 function walker.label(b) if b.exposed then return '反射が消えた・反撃の機会' end end

 function walker.frame(f,b,_,cast)
  f.exposed=b.exposed
  if cast and not b.exposed then
   f.images=cast.images
   f.lane={left=cast.left,right=cast.right,top=cast.top,at=cast.move.windup,
    active=cast.tick>=cast.move.windup,activeTicks=cast.move.active}
  end
 end

 function walker.draw(f,s,b,spec,cast,mode,profile)
  local x,y=b.x-s.camera,b.y
  if cast and not b.exposed then
   local move=cast.move
   local left,right=cast.left-s.camera,cast.right-s.camera
   rect(f,left,cast.top,right-left,y-cast.top,cast.tick>=move.windup and '#ffd49778' or '#ffd49717')
   rect(f,left,y-5,right-left,5,'#ffd497')
   for _,image in ipairs(cast.images) do
    if image>=spec.arenaMin and image<=spec.arenaMax then
     local echo=image-s.camera
     -- In rectangle modes the reflections always use the low-resolution profile.
     local first=#f.draws+1
     C.drawPrismWalkerArt(f,echo,y,spec.artHeight,mode,'h32c16',b.facing>0)
     for i=first,#f.draws do f.draws[i].opacity=.23 end
     rect(f,echo-22,y-5,12,4,'#a7a7d1')
     rect(f,echo+10,y-5,12,4,'#a7a7d1')
    end
   end
  end
  C.drawPrismWalkerArt(f,x,y,spec.artHeight,mode,profile,b.facing>0)
  rect(f,x-15,y-5,30,4,'#ffedaf')
  if b.exposed then rect(f,x-7,y-11,14,4,'#ffedaf') end
 end
 return walker
end
