return function()
 local inlet={}

 local function tile(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function crate(draws,x,y,w,h)
  tile(draws,x,y,w,h,'#34334e')
  tile(draws,x+3,y+3,w-6,h-6,'#575369')
  tile(draws,x+5,y+4,w-10,3,'#a3a0af')
  tile(draws,x+w/2-3,y+5,6,h-8,'#817a8c')
  tile(draws,x+w/2-4,y+h/2,8,5,'#c6ad79')
 end

 local function guide(draws,x,y,text)
  if x<0 or x>960 then return end
  tile(draws,x-12,y-6,24,6,'#304553')
  tile(draws,x-9,y-5,18,3,'#ffe09b')
  draws[#draws+1]={kind='text',x=math.max(64,math.min(896,x)),y=y-112,text=text,size=14,color='#fff1bb'}
 end

 function inlet.lights(s,draws,lamps,showRoute)
  for _,lamp in ipairs(lamps) do
   local x,y=lamp.x-s.camera,lamp.y
   if x>=-32 and x<=992 then
    tile(draws,x-3,y-33,6,33,'#4d4e62')
    tile(draws,x-11,y-49,22,18,'#36415c')
    tile(draws,x-7,y-47,14,14,'#f7ca79')
    tile(draws,x-4,y-44,8,8,'#fff0b7')
   end
   if showRoute and lamp.jumpFrom then guide(draws,x,lamp.jumpFrom,lamp.jumpLabel) end
  end
 end

 function inlet.observe(s,f,draws,spec,progress)
  if not progress or progress.count<2 then return end
  local deck=s.storyMoonDeck
  if deck then
   guide(draws,deck.x-20-s.camera,deck.y,'岩窟口へ →')
   guide(draws,deck.x+deck.w+20-s.camera,deck.y,'← 入江へ')
  end
  local elapsed=s.storyBoxGlimpseStart and s.t-s.storyBoxGlimpseStart
  local glimpse=elapsed and elapsed<spec.seconds
  local moved=progress.count>=spec.after
  local offset=glimpse and spec.shift*math.min(1,elapsed/spec.seconds) or moved and spec.shift or 0
  local x,y=spec.x+offset-s.camera,spec.y
  if x<-220 or x>1090 then return end
  if glimpse then
   f.storyBoxGlimpse={seconds=spec.seconds-elapsed}
   local sway=math.floor(math.sin(elapsed*9)*7)
   tile(draws,x-11+sway,y-18,13,15,'#242941')
   tile(draws,x-25+sway,y-7,26,7,'#272c4a')
   tile(draws,x+28-sway,y-20,15,15,'#292e49')
   tile(draws,x+38-sway,y-8,24,8,'#2e354d')
   tile(draws,x-51,y-2,115,2,'#a6dbe08a')
  end
  local rise=glimpse and 14 or 0
  crate(draws,x-37,y-35-rise,70,29)
  crate(draws,x+21,y-29-rise,44,22)
  crate(draws,x-15,y-61-rise,38,27)
  if glimpse then
   draws[#draws+1]={kind='text',x=x+13,y=y-94,text='箱の下に脚が見えた',size=14,color='#fff0b7'}
  end
 end

 return inlet
end
