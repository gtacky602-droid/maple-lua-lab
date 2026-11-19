-- Optional encounters use fixed warning zones and the shared field-boss lifecycle.
return function(C)
 local legend={}
 local colors={hydro='#82dfd6',pyro='#ffa15b',cryo='#a9dcff',geo='#edd98e',electro='#cd9bff'}
 local poses={idle=1,brace=.83,strike=.89}
 local function clamp(x,lo,hi) return math.max(lo,math.min(x,hi)) end

 local function setPose(body,spec,pose)
  body.legendPose=pose
  body.drawHeight=math.floor((body.legendArtHeight or spec.artHeight)*(spec.poseHeights or poses)[pose]+.5)
  body.hitTop=body.y-body.drawHeight
  body.hitBottom=body.y-(body.legendFloorClearance or spec.hitFloorClearance or 0)
 end

 function legend.spawn(b,spec)
  b.element=spec.element
  b.legendArt=spec.art
  setPose(b,spec,'idle')
  if spec.members then
   b.fieldMembers={}
   for i,p in ipairs(spec.members) do
    local home=b.home+p.offset
    local member={id=p.entity,fieldBoss=b.fieldBoss,fieldGroup=b,boss=true,custom=true,noRewards=true,
     hp=p.hp,maxhp=p.hp,x=home,home=home,y=b.y,level=b.level,facing=-1,respawn=math.huge,warning=0,
     memberName=p.name,element=p.element,legendArt=p.art,
     legendArtHeight=p.artHeight,legendFloorClearance=p.hitFloorClearance}
    setPose(member,spec,'idle')
    b.fieldMembers[i]=member
   end
   return
  end
  if not spec.partner then return end
  local p=spec.partner
  local home=b.home+p.offset
  local partner=C.bindFieldPartner(b,{id=p.entity,fieldBoss=b.fieldBoss,boss=true,custom=true,
   x=home,home=home,y=b.y,level=b.level,maxhp=b.maxhp,facing=-1,respawn=math.huge,warning=0,
   element=p.element,legendArt=p.art})
  setPose(partner,spec,'idle')
 end

 function legend.cancel(b,spec)
  setPose(b,spec,'idle')
  if b.fieldPartner then setPose(b.fieldPartner,spec,'idle') end
 end

 function legend.walk(b,spec,target,speed)
  local partner=b.fieldPartner
  if not partner then return end
  b.x=math.min(b.x,spec.arenaMax-spec.partner.offset-64)
  local dest=b.x+spec.partner.offset
  partner.x=partner.x+clamp(dest-partner.x,-speed,speed)
  partner.facing=target.x<partner.x and -1 or 1
 end

 function legend.begin(b,spec,move,target)
  local cast={move=move,tick=0,strikes={}}
  for i,step in ipairs(move.steps) do
   local owner=step.partner and b.fieldPartner or b
   owner.facing=target.x<owner.x and -1 or 1
   local from,to=owner.x,owner.x
   local left,right
   local distance=step.travel or step.wave
   if distance then
    to=clamp(from+owner.facing*distance,spec.arenaMin+48,spec.arenaMax-48)
    if step.travel and owner==b and b.fieldPartner then to=math.min(to,b.fieldPartner.x-112) end
    if step.travel and owner~=b then to=math.max(to,b.x+112) end
    left,right=math.min(from,to)-step.radius,math.max(from,to)+step.radius
   else
    local center=clamp(target.x+(step.offset or 0),spec.arenaMin+step.radius,spec.arenaMax-step.radius)
    left,right=center-step.radius,center+step.radius
   end
   cast.strikes[i]={step=step,owner=owner,from=from,to=to,position=from,seen={},
    left=math.max(left,spec.arenaMin),right=math.min(right,spec.arenaMax),
    source={id=owner.id,y=spec.floorY,owner=owner,damageElement=owner.element}}
   setPose(owner,spec,'brace')
  end
  return cast
 end

 function legend.tick(state,b,spec,cast)
  cast.tick=cast.tick+1
  local now=cast.tick
  for _,strike in ipairs(cast.strikes) do
   local step,owner=strike.step,strike.owner
   if now>=step.first and now<step.after then
    setPose(owner,spec,'strike')
    local left,right=strike.left,strike.right
    if step.travel or step.wave then
     local previous=strike.position
     local ratio=(now-step.first+1)/(step.after-step.first)
     strike.position=strike.from+(strike.to-strike.from)*ratio
     if step.travel then owner.x=strike.position end
     left=math.max(left,math.min(previous,strike.position)-step.radius)
     right=math.min(right,math.max(previous,strike.position)+step.radius)
    end
    strike.activeLeft,strike.activeRight=left,right
    C.hitFieldArea(state,strike.source,strike.seen,left,right,spec.floorY-step.height,step.damage)
   elseif now==step.after then
    setPose(owner,spec,'brace')
   end
  end
  if now>=cast.move.total then legend.cancel(b,spec);return true end
  return false
 end

 function legend.label(_,cast)
  if cast and cast.tick>=cast.strikes[#cast.strikes].step.after then return '体勢を戻す間に反撃' end
 end

 function legend.frame(f,_,_,cast)
  if not cast then return end
  f.warnings={}
  for _,strike in ipairs(cast.strikes) do
   local step=strike.step
   if cast.tick<step.after then
    f.warnings[#f.warnings+1]={left=strike.left,right=strike.right,first=step.first,after=step.after,
     element=strike.owner.element,active=cast.tick>=step.first,
     activeLeft=strike.activeLeft,activeRight=strike.activeRight}
   end
  end
 end

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 function legend.draw(f,state,b,spec,cast,mode,profile)
  local camera=state.camera
  if cast then
   for i,strike in ipairs(cast.strikes) do
    local step=strike.step
    if cast.tick<step.after then
     local active=cast.tick>=step.first
     local x,y=strike.left-camera,spec.floorY
     local width=strike.right-strike.left
     local color=spec.warningColor or colors[strike.owner.element]
     rect(f,x,y-step.height,width,step.height,color..'20')
     if active then
      rect(f,strike.activeLeft-camera,y-step.height,strike.activeRight-strike.activeLeft,step.height,color..'68')
     end
     rect(f,x,y-6,width,3,color)
     rect(f,x,y-step.height,2,step.height,color)
     rect(f,x+width-2,y-step.height,2,step.height,color)
     if #cast.strikes>1 then
      f.draws[#f.draws+1]={kind='text',x=x+width*.5,y=y-step.height-7,text=tostring(i),size=14,color=color}
     end
    end
   end
  end
  for _,body in ipairs(b.fieldMembers or {b,b.fieldPartner}) do
   if body.hp>0 and body.x>=camera-160 and body.x<=camera+1120 then
    local art=C.branchLegendArt[body.legendArt][body.legendPose]
    local height=spec.artScale and art.box[4]*spec.artScale or body.drawHeight
    C.drawFieldDisplayArt(f,art,body.x-camera,body.y,height,mode,profile,body.facing>0)
    if b.fieldMembers then
     local x,y=body.x-camera-27,body.y-height-10
     rect(f,x,y,54,5,'#1c162a')
     rect(f,x+1,y+1,52*body.hp/body.maxhp,3,colors[body.element])
    end
   end
  end
 end
 return legend
end
