-- Representative sentinel attacks. Distances/timers are 2D laboratory values.
return function(C)
 local intercept=C.interceptHit
 function C.interceptHit(s,cast,e,element)
  if s.array and e.part==1 and e.state=='shield' and ((cast.x or e.x)-e.x)*e.facing>0 then return true end
  if intercept then return intercept(s,cast,e,element) end
 end
 function C.clearArrayShots(s)
  for i=#(s.projectiles or {}),1,-1 do local id=s.projectiles[i].source;if id and id>=99062001 and id<=99062004 then table.remove(s.projectiles,i) end end
 end
 function C.stepArrayPart(s,e,dt,area)
  e.state=e.state or 'ready';e.cycle=e.cycle or 0;e.clock=e.clock-dt
  if e.state=='field' then
   e.pulse=(e.pulse or 0)-dt
   if e.pulse<=0 then e.pulse=.65;area(s,e,e.target,100,8) end
  elseif e.state=='orb' then
   for _,a in ipairs(s.actors) do if a.hp>0 and math.abs(a.x-e.target)<30 and a.y>410 then e.clock=0 end end
  end
  if e.clock>0 then return end
  if e.state=='ready' then
   e.cycle=e.cycle+1;e.facing=s.actors[s.active].x>e.x and 1 or -1;e.warning=1;e.clock=1
   if e.part==1 then
    if e.cycle%2==1 then e.state='shield';e.clock=2;e.target=e.x+e.facing*60;e.radius=75
    else e.state='leap_warning';e.target=math.max(60,math.min(900,s.actors[s.active].x));e.radius=85 end
   elseif e.part==2 then e.state='orb_warning';e.target=e.x;e.radius=65
   elseif e.part==3 then e.state='shot_warning';e.target=s.actors[s.active].x;e.aim=math.atan(s.actors[s.active].y-30-430,e.target-e.x);e.radius=0
   else e.state='field_warning';e.target=s.actors[s.active].x;e.radius=100;e.clock=1.4 end
  elseif e.state=='shield' then area(s,e,e.target,75,14);e.state='ready';e.clock=2;e.warning=0
  elseif e.state=='leap_warning' then e.x=e.target;area(s,e,e.x,85,18);e.state='ready';e.clock=2.5;e.warning=0
  elseif e.state=='orb_warning' then e.state='orb';e.clock=3;e.warning=0
  elseif e.state=='orb' then area(s,e,e.target,65,16);e.state='ready';e.clock=2
  elseif e.state=='shot_warning' then
   C.spawnEnemyProjectile(s,e.x,430,s.active,e.aim,{source=e.id,speed=250,homingTime=0,damage=14,life=4,color='#f4c97a'})
   e.state='ready';e.clock=2.5;e.warning=0
  elseif e.state=='field_warning' then e.state='field';e.clock=3;e.pulse=0;e.warning=0
  elseif e.state=='field' then e.state='ready';e.clock=2 end
 end
 function C.drawArrayPart(f,e,rect)
  local names={'盾型','偵察型','巡航型','殲滅型'}
  f.draws[#f.draws+1]={kind='text',x=e.x,y=382,text=names[e.part],size=13,color=e.marked and '#ffe370' or '#c9d6d0'}
  if e.state=='shield' then rect(e.x+e.facing*35-5,425,10,55,'#a5daff') end
  if e.state=='orb' then rect(e.target-14,451,28,28,'#f5c56e');rect(e.target-65,477,130,3,'#f5c56e') end
  if e.state=='field' then rect(e.target-100,466,200,14,'#e3a45c') end
  if e.warning>0 then
   if e.part==3 then
    for i=1,16 do rect(e.x+math.cos(e.aim)*i*20,430+math.sin(e.aim)*i*20,4,4,'#edb973') end
   else rect(e.target-(e.radius or 65),470,(e.radius or 65)*2,10,'#e7a065') end
  end
 end
end
