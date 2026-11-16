return function(C)
 local frame=C.frame
 C.skillDefinitions.SK41={range=240,vertical=30,targets=7,mult=1,hits=8,ct=16,lock=.4,interval=1,delay=1,color='#9dcff8',element='fusion',damageElements={'electro','hydro'},applicationElement='hydro',placed=true,offset=160,groundOnly=true,groundPlacement=true}
 C.skillDefinitions.SK42={range=520,targets=10,mult=1.7,hits=8,ct=16,lock=.7,interval=.15,color='#ffb6a2',element='fusion',damageElements={'electro','pyro'},applicationElement='pyro',chain=180,push=8}
 C.skillDefinitions.SK43={range=360,targets=8,mult=1.8,hits=7,ct=14,lock=.7,interval=.15,color='#c3dfff',element='fusion',damageElements={'electro','cryo'},applicationElement='cryo',physicalBreak=6}
 C.skillDefinitions.SK44={range=240,targets=8,mult=1.15,hits=12,ct=20,lock=.4,interval=8/12,delay=8/12,color='#bddf8e',element='fusion',damageElements={'dendro','hydro'},applicationElement='hydro',placed=true,offset=140}
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  for _,cast in ipairs(s.pending) do
   if cast.placed=='SK41' then
    f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera-cast.range,y=cast.y-8,w=cast.range*2,h=8,color='#9dcff8'}
    for i=-3,3 do f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera+i*60,y=cast.y-14,w=18,h=6,color='#d4b9ff'} end
   elseif cast.placed=='SK44' then
    for i=-3,3 do
     f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera+i*60-5,y=cast.y-14,w=10,h=14,color='#bddf8e'}
     f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera+i*60-10,y=cast.y-20,w=20,h=8,color='#d7f2a8'}
    end
   end
  end
  f.commands=#f.draws;return f
 end
end
