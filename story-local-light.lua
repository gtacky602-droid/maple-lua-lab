return function()
 local light={}

 local function nearest(s,config)
  local a=s.actors[s.active]
  if a.hp<=0 then return nil end
  for _,control in ipairs(config.controls) do
   if (not control.darkOnly or s.storyLightMode=='dark') and math.abs(a.x-control.x)<54 and math.abs(a.y-control.y)<34 then
    return control
   end
  end
 end

 function light.interact(s,config)
  if not nearest(s,config) then return false end
  local bridge=config.bridge
  if s.storyLightMode=='bright' then
   s.storyLightMode='dark'
   s.platforms[#s.platforms+1]=bridge
   s.storyNotice='消灯。影に隠れていた足場と右端の出口が見えます。'
  else
   s.storyLightMode='bright'
   for i,p in ipairs(s.platforms) do
    if p==bridge then table.remove(s.platforms,i);break end
   end
   for i,a in ipairs(s.actors) do
    if a.x>=bridge.x and a.x<=bridge.x+bridge.w and math.abs(a.y-bridge.y)<=30 then
     a.x,a.y,a.vy,a.ground=config.safeX-(i-1)*34,config.safeY,0,true
    end
   end
   s.storyNotice='点灯。壁の模様が見え、影の足場からは手前の安全な床へ戻れます。'
  end
  return true
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function light.observe(s,f,draws,config)
  local dark=s.storyLightMode=='dark'
  f.storyLocalLight={mode=s.storyLightMode}
  rect(draws,440,15,80,25,'#182b3be8')
  draws[#draws+1]={kind='text',x=480,y=32,text=dark and '消灯中' or '点灯中',size=14,
   color=dark and '#cbf1ff' or '#fff1bd'}
  if not dark then
   local bridge=config.bridge
   for i=0,8 do
    rect(draws,bridge.x-s.camera+i*41,bridge.y+9+i*3,42,58-i*3,'#13243266')
   end
  end
  for _,control in ipairs(config.controls) do
   if not control.darkOnly or dark then
    local x,y=control.x-s.camera,control.y
    rect(draws,x-12,y-30,24,30,'#425061')
    rect(draws,x-6,y-29,12,12,dark and '#7fc4d7' or '#fff2b4')
    rect(draws,x-3,y-13,6,6,'#e2e8c6')
   end
  end
  if not s.paused and nearest(s,config) then
   f.storyNearbyMilestone={label=dark and '灯りを点ける' or '灯りを消す'}
  end
 end

 return light
end
