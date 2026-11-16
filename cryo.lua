return function(C)
 local frame=C.frame
 C.skillDefinitions.SK25={range=180,targets=4,mult=2.3,hits=3,ct=3,lock=.5,interval=.15,color='#c8f4ff',element='cryo'}
 C.skillDefinitions.SK26={range=360,targets=8,mult=1.7,hits=5,ct=9,lock=.7,interval=.2,color='#a3e4ff',element='cryo',chill=4}
 C.skillDefinitions.SK27={range=160,targets=6,mult=1.1,hits=4,ct=18,lock=.4,interval=1,delay=1,color='#b9e8ff',element='cryo',placed=true,offset=180,root=2,rootOnce=true}
 C.skillDefinitions.SK28={range=450,targets=3,mult=1.3,hits=8,ct=12,lock=.65,interval=.08,color='#d5f5ff',element='cryo',scatter=true}
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  for _,cast in ipairs(s.pending) do if cast.placed=='SK27' then
   for i=-2,2 do
    f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera+i*55-6,y=cast.y-90,w=12,h=90,color='#b9e8ff'}
   end
  end end
  for _,e in ipairs(s.enemies) do if e.hp>0 and (e.chill or 0)>0 then
   f.draws[#f.draws+1]={kind='rect',x=e.x-s.camera-8,y=e.y-65,w=16,h=7,color='#a3e4ff'}
  end end
  f.commands=#f.draws;return f
 end
end
