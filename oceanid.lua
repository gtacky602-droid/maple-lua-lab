-- Deterministic 2D lab adaptation. Positions, HP and timings are provisional.
return function(C)
 local action,step,frame=C.action,C.step,C.frame
 local groups={{'boar'},{'crane'},{'mallard','ferret'},{'crab','raptor'},{'frog','finch'}}
 local counts={boar=2,crane=3,mallard=2,ferret=2,crab=2,raptor=3,frog=1,finch=1}
 local weakness={boar='pyro',ferret='pyro',crane='electro',raptor='electro',crab='cryo',mallard='cryo',frog='geo',finch='geo'}
 local names={boar='イノシシ',crane='ツル',mallard='アヒル',ferret='リス',crab='カニ',raptor='タカ',frog='カエル',finch='スズメ'}
 local radii={mallard=85,ferret=75,raptor=65,frog=110,finch=110}
 local function clamp(x,a,b) return math.max(a,math.min(b,x)) end
 local function clearShots(s,b)
  for i=#(s.projectiles or {}),1,-1 do if s.projectiles[i].source==b.id then table.remove(s.projectiles,i) end end
 end
 local function area(s,b,x,r,damage)
  for _,a in ipairs(s.actors) do if math.abs(a.x-x)<r and a.y>410 then C.damageActor(s,a,damage,b,false,true) end end
 end
 local function spawn(s,b)
  s.enemies={b};b.wave=b.wave+1;b.phase='mimics';b.elapsed=0;b.timer=0
  local total=0;for _,kind in ipairs(groups[b.wave]) do total=total+counts[kind] end
  local index=0
  for _,kind in ipairs(groups[b.wave]) do for n=1,counts[kind] do
   index=index+1;local x=180+index*600/(total+1);local hp=(kind=='frog' or kind=='finch') and 100 or 40
   local e={id=99051000+b.wave*10+index,x=x,home=x,y=kind=='raptor' and 350 or 480,hp=hp,maxhp=hp,kind=1,custom=true,noRewards=true,respawn=1e9,cd=1+n*.4,warning=0,mimic=kind,immune='hydro',flying=kind=='raptor',state='ready',clock=1+n*.4,cycle=0,resist={pyro=.15,cryo=.15,geo=.15,electro=.15,anemo=.15,dendro=.15}}
   e.resist[weakness[kind]]=-.4;s.enemies[#s.enemies+1]=e
  end end
  b.total=total;b.remaining=total
 end
 function C.action(s,key)
  if key=='boss_oceanid' then
   if s.paused then return end
   action(s,'campaign');action(s,'town');s.campaign.zone='oceanid';s.worldwidth=960;s.platforms={{x=0,y=480,w=960}}
   s.campaign.message='純水精霊：本体ではなく水の幻形を倒す。水は無効。5波固定・試作素材の検証版。'
   local b={id=20050101,x=480,home=480,y=220,hp=500,maxhp=500,kind=1,boss=true,custom=true,invulnerable=true,respawn=1e9,cd=999,warning=0,wave=0,phase='summon',timer=2,bombs={},sunk={},remaining=0}
   s.enemies={b};s.oceanid=b;return
  end
  action(s,key);if not s.campaign or s.campaign.zone~='oceanid' then s.oceanid=nil end
 end
 function C.step(s,dt,input)
  local b=s.oceanid;if not b then return step(s,dt,input) end;if s.paused then return end
  dt=clamp(dt,0,1/30)
  if b.hp>0 then
   b.timer=b.timer-dt
   if b.phase=='summon' and b.timer<=0 then spawn(s,b)
   elseif b.phase=='sink_warning' and b.timer<=0 then
    for _,index in ipairs(b.sinkTargets) do b.sunk[index]=true end;b.sinkTargets=nil;b.phase='summon';b.timer=2
   end
   for i=#b.bombs,1,-1 do
    local bomb=b.bombs[i];bomb.timer=bomb.timer-dt
    if bomb.timer<=0 then area(s,b,bomb.x,170,30);table.remove(b.bombs,i) end
   end
   if b.phase=='mimics' then
    b.elapsed=b.elapsed+dt;local alive=0
    for _,e in ipairs(s.enemies) do if e.mimic then
     if e.hp<=0 then
      if not e.counted then e.counted=true
       if e.mimic=='frog' or e.mimic=='finch' then b.bombs[#b.bombs+1]={x=e.x,timer=2} end
      end
     else
      alive=alive+1;e.aura={element='hydro',expires=s.t+2,owner=0}
      local kind=e.mimic;local a=s.actors[s.active];local delta=a.x-e.x;local dir=delta>=0 and 1 or -1
      local rate=C.enemyRate(e);local disabled=(e.frozen or 0)>0
      if not disabled then
       e.clock=e.clock-dt*rate
       if kind=='boar' or kind=='ferret' then e.hp=math.min(e.maxhp,e.hp+dt) end
       if e.state=='ready' then
        if (e.root or 0)<=0 then
         local speed=kind=='crane' and (math.abs(delta)<180 and -65 or 0) or kind=='crab' and math.sin(s.t*2+e.id)*80 or (kind=='raptor' and 45 or 60)
         if math.abs(delta)>45 or kind=='crane' or kind=='crab' then e.x=clamp(e.x+dir*speed*dt*rate,30,930) end
        end
        if e.clock<=0 then
         e.state='warning';e.clock=.85;e.origin=e.x;e.target=clamp(a.x,e.x-325,e.x+325);e.target=clamp(e.target,30,930);e.targetY=a.y-30;e.cycle=e.cycle+1
         if kind=='crane' or kind=='crab' then e.target=a.x;e.aim=math.atan(e.targetY-(e.y-30),e.target-e.x) end
        end
       elseif e.state=='warning' and e.clock<=0 then
        if kind=='crane' or kind=='crab' then
         C.spawnEnemyProjectile(s,e.x,e.y-30,s.active,e.aim,{source=b.id,speed=kind=='crane' and 290 or 210,damage=kind=='crane' and 18 or 10,life=5,homingTime=0,color='#6acff5'})
         e.state='ready';e.clock=kind=='crane' and 3 or 1.2
        elseif kind=='mallard' then area(s,b,e.x,85,12);e.state='ready';e.clock=.9
        elseif kind=='ferret' then area(s,b,e.x,75,14);e.state='ready';e.clock=1.6
        else e.state='strike';e.clock=.5;e.origin=e.x;e.struck={} end
       elseif e.state=='strike' then
        local old=e.x;local progress=clamp(1-e.clock/.5,0,1)
        e.x=e.origin+(e.target-e.origin)*progress
        if kind=='boar' then
         for _,actor in ipairs(s.actors) do if not e.struck[actor.id] and actor.y>410 and actor.x>=math.min(old,e.x)-45 and actor.x<=math.max(old,e.x)+45 then C.damageActor(s,actor,18,e,true,true);e.struck[actor.id]=true end end
        else e.y=kind=='raptor' and (350+130*progress) or (480-math.sin(progress*math.pi)*110) end
        if e.clock<=0 then
         if kind~='boar' then area(s,b,e.x,radii[kind],20);e.splashUntil=s.t+.25 end
         e.y=480;e.state='recover';e.clock=.4
        end
       elseif e.state=='recover' then
        if kind=='raptor' then e.y=350+130*clamp(e.clock/.4,0,1) end
        if e.clock<=0 then e.y=kind=='raptor' and 350 or 480;e.state='ready';e.clock=2.1 end
       end
      end
     end
    end end
    b.remaining=alive
    if alive==0 and #b.bombs==0 then
     clearShots(s,b)
     if b.wave==5 then C.defeatEnemy(s,b,s.active);b.respawn=1e9;b.phase='defeated';b.sunk={};b.whirlpool=nil
     else b.hp=500-b.wave*100;b.phase='summon';b.timer=2
      if b.wave==2 or b.wave==4 then b.phase='sink_warning';b.timer=2;b.sinkTargets=b.wave==2 and {1,9} or {2,8} end
     end
    elseif b.elapsed>=45 then
     -- Soft enrage is a 2D draft: tracked warning followed by a ground burst.
     if not b.whirlpool then b.whirlpool={x=s.actors[s.active].x,timer=2} end
     b.whirlpool.x=s.actors[s.active].x;b.whirlpool.timer=b.whirlpool.timer-dt
     if b.whirlpool.timer<=0 then area(s,b,b.whirlpool.x,100,35);b.whirlpool=nil;b.elapsed=35 end
    end
   else b.whirlpool=nil end
   for index in pairs(b.sunk) do area(s,b,(index-.5)*960/9,960/18,8) end
  end
  step(s,dt,input)
  if not s.campaign or s.campaign.zone~='oceanid' then s.oceanid=nil;return end
  for _,a in ipairs(s.actors) do a.x=clamp(a.x,20,940) end;s.camera=0
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local b=s.oceanid;if not b then return f end
  f.location='純水精霊・2Dアレンジ試作'
  f.boss={name='純水精霊（試作素材）',hp=b.hp,maxhp=500,phase=b.phase,timer=b.timer,wave=b.wave,remaining=b.remaining,label=b.phase=='defeated' and '撃破' or ('幻形 '..b.wave..'/5波・残り'..b.remaining..'体／水無効')}
  f.boss.mimics={}
  local function rect(x,y,w,h,color) f.draws[#f.draws+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color} end
  local function text(x,y,value) f.draws[#f.draws+1]={kind='text',x=x,y=y,text=value,color='#d4f6ff',size=14} end
  if b.hp>0 then C.drawOceanidPart(f,'host',b.x,240,128,mode,profile) end
  for _,e in ipairs(s.enemies) do if e.mimic and e.hp>0 then
   f.boss.mimics[#f.boss.mimics+1]={kind=e.mimic,x=e.x,y=e.y,state=e.state,target=e.target,radius=radii[e.mimic]}
   local h=({crane=64,crab=42,raptor=58,frog=68,finch=68})[e.mimic] or 52
   if not C.drawOceanidPart(f,e.mimic,e.x,e.y,h,mode,profile,s.actors[s.active].x>e.x) then rect(e.x-22,e.y-38,44,38,'#4db6e4');rect(e.x-13,e.y-48,26,16,'#a5ebff') end;rect(e.x-22,e.y-h-8,44*e.hp/e.maxhp,4,'#82f3e1');text(e.x-24,e.y-h-16,names[e.mimic])
   if (e.splashUntil or 0)>s.t then rect(e.x-radii[e.mimic],462,2*radii[e.mimic],18,'#8eeaff') end
   if e.state=='warning' or e.state=='strike' then
    local x=(e.mimic=='mallard' or e.mimic=='ferret') and e.x or e.target
    if e.mimic=='boar' then rect(math.min(e.origin,e.target)-45,472,math.abs(e.target-e.origin)+90,8,'#ff8b7b')
    elseif e.mimic=='crane' or e.mimic=='crab' then
     local angle=e.aim or 0
     for distance=15,300,15 do rect(e.x+math.cos(angle)*distance-2,e.y-30+math.sin(angle)*distance-2,4,4,'#ff8b7b') end
    else local r=radii[e.mimic];rect(x-r,472,r*2,8,'#ff8b7b') end
   end
  end end
  for _,bomb in ipairs(b.bombs) do rect(bomb.x-170,470,340,10,'#ff8b7b');rect(bomb.x-15,420,30,40,'#86e6ff') end
  for index in pairs(b.sunk) do rect((index-1)*960/9,472,960/9,12,'#23669e') end
  for _,index in ipairs(b.sinkTargets or {}) do rect((index-1)*960/9,470,960/9,10,'#ff8b7b') end
  if b.whirlpool then rect(b.whirlpool.x-100,460,200,20,'#539de6') end
  f.commands=#f.draws;return f
 end
end
