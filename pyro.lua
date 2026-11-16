return function(C)
 local frame=C.frame
 C.skillDefinitions.SK21={range=180,targets=5,mult=1.95,hits=3,ct=3,lock=.5,interval=.15,color='#ffb078',element='pyro'}
 C.skillDefinitions.SK22={range=130,targets=6,mult=1.75,hits=5,ct=9,lock=.4,interval=1,delay=1,color='#ff965c',element='pyro',placed=true,offset=180}
 C.skillDefinitions.SK23={range=150,targets=7,mult=1.2,hits=6,ct=12,lock=.8,interval=.15,color='#ffc080',element='pyro',dash=.75,trail=true}
 C.skillDefinitions.SK24={range=200,targets=6,mult=1.15,hits=8,ct=18,lock=.4,interval=1,delay=1,color='#ffae62',element='pyro',follow=true,radial=true,placed=true}
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  for _,cast in ipairs(s.pending) do
   if cast.placed=='SK22' then
    for i=0,4 do
     f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera-32+i*4,y=cast.y-24-i*22,w=64-i*8,h=25,color=i%2==0 and '#ff965c' or '#ffe19d'}
    end
   elseif cast.placed=='SK24' then
    local a=s.actors[cast.id]
    for i=1,16 do local angle=i*math.pi/8+s.t*2
     f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera+math.cos(angle)*cast.range-5,y=a.y-25+math.sin(angle)*25-5,w=10,h=10,color='#ffae62'}
    end
   end
  end
  f.commands=#f.draws;return f
 end
end
