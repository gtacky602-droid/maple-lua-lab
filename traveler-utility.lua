return function(C)
 local action,attack,step,frame=C.action,C.attack,C.step,C.frame
 C.skillDefinitions={
  SK05={range=180,targets=3,mult=1.8,hits=2,ct=3,lock=.45,interval=.12,color='#ebcb7f',element='geo',push=24},
  SK07={range=160,targets=7,mult=1.55,hits=5,ct=9,lock=.7,interval=.2,color='#dcbf7c',element='geo',travelSpeed=250,groundOnly=true},
  SK09={range=320,targets=3,mult=2,hits=2,ct=3,lock=.4,interval=.15,color='#d5adff',element='electro'},
  SK10={range=520,targets=6,mult=1.6,hits=5,ct=8,lock=.6,interval=.2,color='#c68fff',element='electro',chain=180},
  SK11={range=150,targets=5,mult=1.4,hits=4,ct=10,lock=.5,interval=.15,color='#bfa0ff',element='electro',dash=.45},
  SK12={range=300,targets=3,mult=1,hits=6,ct=18,lock=.3,interval=1,delay=1,color='#cb9fff',element='electro',placed=true,groundPlacement=true},
  SK13={range=300,targets=5,mult=.9,hits=2,ct=12,lock=.45,interval=.15,color='#a9de78',element='dendro',root=2},
  SK14={range=360,targets=5,mult=1.7,hits=4,ct=6,lock=.6,interval=.15,color='#c0ed83',element='dendro',vertical=170,upward=true},
  SK15={range=520,targets=6,mult=1.3,hits=6,ct=11,lock=.6,interval=.2,color='#d2ed8d',element='dendro',homing=true,vertical=170}
 }
 local function clear(s)
  for i=#s.platforms,1,-1 do if s.platforms[i].temporary then table.remove(s.platforms,i) end end
  s.updraft=nil;s.rockWall=nil
  for _,a in ipairs(s.actors) do a.haste=0;a.dash=0;a.glide=0 end
 end
 function C.attack(s,a,key)
  local cooldown=({SK03=16,SK04=14,SK06=20,SK08=12,SK16=15})[key]
  if not cooldown then return attack(s,a,key) end
  if a.id~=1 or a.hp<=0 or s.paused or a.lock>0 or (a.cd[key] or 0)>0 then return false end
  a.cd[key]=cooldown
  if key=='SK03' then a.haste=6
  elseif key=='SK04' then s.updraft={x=a.x,y=a.y,life=5};a.lock=.2
  elseif key=='SK06' then
   local hp=math.max(1,math.floor(a.atk*1.6))
   s.rockWall={x=math.max(20,math.min((s.worldwidth or 2880)-20,a.x+a.dir*40)),y=a.y,hp=hp,maxhp=hp,life=7};a.lock=.3
  else
   local kind=key=='SK16' and 'vine' or 'stone'
   local count=0;local first
   for i,p in ipairs(s.platforms) do if p.temporary and (p.structure or 'stone')==kind then count=count+1;first=first or i end end
   if count>=2 then table.remove(s.platforms,first) end
   local width=s.worldwidth or 2880
   local x=math.max(20,math.min(width-140,a.x+a.dir*100-60))
   s.platforms[#s.platforms+1]={x=x,y=math.max(170,math.min(450,a.y-(kind=='vine' and 160 or 90))),base=a.y,w=120,life=kind=='vine' and 7 or 6,temporary=true,structure=kind};a.lock=.2
  end
  return true
 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone
  action(s,key)
  if (s.campaign and s.campaign.zone)~=zone or key=='boss_anemo' then clear(s) end
 end
 function C.step(s,dt,input)
  if s.paused then return step(s,dt,input) end
  dt=math.max(0,math.min(dt,1/30))
  if s.rockWall then s.rockWall.life=s.rockWall.life-dt;if s.rockWall.life<=0 then s.rockWall=nil end end
  for _,a in ipairs(s.actors) do a.haste=math.max(0,(a.haste or 0)-dt) end
  for i=#s.platforms,1,-1 do local p=s.platforms[i];if p.temporary then p.life=p.life-dt;if p.life<=1e-8 then table.remove(s.platforms,i) end end end
  for _,p in ipairs(s.platforms) do if p.structure=='vine' then
   for _,a in ipairs(s.actors) do
    local climbing=(a.id==s.active and input and input.jump) or (a.id~=s.active and a.climbIntent)
    if a.hp>0 and climbing and math.abs(a.x-(p.x+60))<35 and a.y>p.y-5 and a.y<=p.base+10 then a.vy=-280*(C.traversalRate and C.traversalRate(s,a) or 1);a.ground=false;a.leap=.1 end
   end
  end end
  if s.updraft then local d=s.updraft;d.life=d.life-dt
   if d.life<=0 then s.updraft=nil
   else for _,a in ipairs(s.actors) do
    if a.hp>0 and math.abs(a.x-d.x)<45 and a.y>d.y-230 and a.y<=d.y+10 then a.vy=-380;a.ground=false;a.leap=.1 end
   end end
  end
  local returns=s.returns;step(s,dt,input)
  if s.returns~=returns then clear(s) end
 end
 function C.drawRockWall(f,camera,w)
  f.draws[#f.draws+1]={kind='rect',x=w.x-camera-12,y=w.y-120,w=24,h=120,color='#b39a62'}
  f.draws[#f.draws+1]={kind='rect',x=w.x-camera-20,y=w.y-130,w=40*w.hp/w.maxhp,h=5,color='#f1d795'}
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  for _,p in ipairs(s.platforms) do if p.structure=='vine' then
   f.draws[#f.draws+1]={kind='rect',x=p.x+55-s.camera,y=p.y,w=10,h=p.base-p.y,color='#67984a'}
   for y=p.y+15,p.base,25 do f.draws[#f.draws+1]={kind='rect',x=p.x+40-s.camera,y=y,w=40,h=5,color='#b2db75'} end
  end end
  for _,e in ipairs(s.enemies) do if e.hp>0 and ((e.root or 0)>0 or (e.slow or 0)>0) then
   f.draws[#f.draws+1]={kind='rect',x=e.x-20-s.camera,y=e.y-8,w=40,h=6,color='#a9de78'}
  end end
  for _,cast in ipairs(s.pending) do if cast.placed=='SK12' then
   local x,y=cast.x-s.camera,cast.y
   local charge=10*math.max(0, math.min(1, 1-(cast.next-s.t)))
   f.draws[#f.draws+1]={kind='rect',x=x-13,y=y-6,w=26,h=6,color='#493461'}
   f.draws[#f.draws+1]={kind='rect',x=x-7,y=y-34,w=14,h=28,color='#795297'}
   f.draws[#f.draws+1]={kind='rect',x=x-10,y=y-40,w=20,h=10,color='#bb89f3'}
   f.draws[#f.draws+1]={kind='rect',x=x-4,y=y-44,w=8,h=14,color='#f8efff'}
   if charge>0 then
    f.draws[#f.draws+1]={kind='rect',x=x-5,y=y-21,w=charge,h=4,color='#d5adff'}
   end
  end end
  if s.rockWall then
   C.drawRockWall(f,s.camera,s.rockWall)
   f.rockWall=s.rockWall
  end
  if s.updraft then local d=s.updraft
   for i=0,9 do f.draws[#f.draws+1]={kind='rect',x=d.x-s.camera-35,y=d.y-i*24,w=70,h=3,color='#99e9d8'} end
  end
  f.commands=#f.draws;return f
 end
end
