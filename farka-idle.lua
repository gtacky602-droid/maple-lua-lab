return function(pose, sprites)
 local function standing(file,h)
  local art=sprites[file]
  local w=h*art.box[3]/art.box[4]
  return {file=file,left=pose.root[1]-art.anchorX*w,top=pose.root[2]-h,width=w,height=h}
 end

 local function sword(hand, target, offset)
  local weapon=pose.sword
  local box=sprites[weapon.file].box
  local gx,gy=table.unpack(weapon.grip)
  local tx,ty=table.unpack(weapon.tip)
  local sx,sy=tx-gx,(ty-gy)*weapon.widthScale
  local dx,dy=target[1]-hand[1],target[2]-hand[2]
  local length=math.sqrt(dx*dx+dy*dy)
  local scale=length/math.sqrt(sx*sx+sy*sy)
  local angle=math.atan(dy,dx)+math.rad(offset)
  local crossScale=scale*weapon.widthScale
  local command={file=weapon.file,left=(box[1]-gx)*scale,top=(box[2]-gy)*crossScale,
   width=box[3]*scale,height=box[4]*crossScale,origin=hand,angle=angle-math.atan(sy,sx)}
  return command,{hand=hand,tip={hand[1]+math.cos(angle)*length,hand[2]+math.sin(angle)*length}}
 end

 local function compose(variant,options)
  local facing=variant.facings[options.side]
  local sockets=facing.sockets
  local frame={height=variant.displayHeight,hands={sockets.hand_front,sockets.hand_back},
   weapons={},draws={},rectangles=0}
  local function append(command)
   frame.draws[#frame.draws+1]=command
   if options.mode~='png' then
    frame.rectangles=frame.rectangles+sprites[command.file].counts[options.mode]
   end
  end
  for _,layer in ipairs({{'back','weapon_tip_B'},{'front','weapon_tip_A'}}) do
   local hand,tip=table.unpack(layer)
   if options[hand] then
    local command,landmarks=sword(sockets['hand_'..hand],sockets[tip],options[hand..'Angle'])
    append(command)
    frame.weapons[hand]=landmarks
   end
  end
  if options.body then append(standing(facing.body,variant.displayHeight)) end
  return frame
 end

 return function(options)
  local guide=options.variant=='guide'
  local frame=compose(guide and pose.guide or pose,options)
  frame.side,frame.mode,frame.root,frame.body=options.side,options.mode,pose.root,options.body
  frame.variant,frame.frontAngle,frame.backAngle=options.variant,options.frontAngle,options.backAngle
  if guide then
   frame.baseline=compose(pose,options)
  else
   frame.reference=standing(pose.facings[options.side].reference,pose.displayHeight)
  end
  return frame
 end
end
