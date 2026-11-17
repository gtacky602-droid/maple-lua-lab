return function(C)
 local cave={}
 local fallDuration=.58
 local objectives={
  [0]='入口でベネットから洞窟の話を聞こう。',
  [1]='落石を避け、上段にある宝箱を開けよう。',
  [2]='宝箱は空っぽだった。来た道を引き返そう。',
  [3]='崩れた床の下に、光る鉱石が見える。',
  [4]='旧道への抜け道が開いた。城門広場のベネットに報告しよう。'
 }

 local function near(s,item)
  local actor=s.actors[s.active]
  return actor.hp>0 and math.abs(actor.x-item.x)<56 and math.abs(actor.y-item.y)<30
 end

 local function site(s,q,state)
  if not state or state.status~='active' or s.paused or s.caveFall then return end
  local spec=q.cave
  if s.story.node==q.target then
   if state.count==0 then return spec.guide end
   if state.count==1 then return spec.chest end
  elseif s.story.node==spec.depth and state.count==3 then
   return spec.ore
  end
 end

 function cave.interact(s,q,state)
  local item=site(s,q,state)
  if not item or not near(s,item) then return false end
  if item==q.cave.guide then
   s.caveNotice='ベネット「ひびのある岩の下で止まるなよ。先に石が落ちたら、次までじゅうぶん間がある！」'
  elseif item==q.cave.chest then
   s.caveNotice='箱の中は空だった。ベネット「来た道を戻ろう。床の細いひびに気をつけて！」'
  else
   C.grantUpgradeOre(s,item.quantity)
   s.caveNotice='強化鉱石を拾った。風が通る穴を抜けると、旧道の下段につながっている。'
  end
  state.count=state.count+1
  return true
 end

 function cave.removeBrittle(s,spec)
  local ledge=spec.brittle
  for i,p in ipairs(s.platforms) do
   if p.x==ledge.x and p.y==ledge.y and p.w==ledge.w then table.remove(s.platforms,i);return end
  end
 end

 local function rockPhase(s,rock)
  return s.t%rock.period
 end

 function cave.update(s,q,state)
  if not state or s.paused or s.story.node~=q.target or state.status~='active' then return end
  local spec=q.cave
  local a=s.actors[s.active]
  if a.hp<=0 then return end
  if state.count==1 then
   local rock=spec.rockfall
   local phase=rockPhase(s,rock)
   local cycle=math.floor(s.t/rock.period)
   if phase>=1.6 and phase<1.85 and s.caveRockHit~=cycle and a.y>=260 and a.y<=400 and math.abs(a.x-rock.x)<rock.radius then
    s.caveRockHit=cycle
    C.damageActor(s,a,rock.damage,rock,false,true)
   end
  elseif state.count==2 then
   local ledge=spec.brittle
   if a.ground and a.y==ledge.y and a.x>ledge.x+16 and a.x<ledge.x+ledge.w-16 then
    cave.removeBrittle(s,spec)
    state.count=3
    a.ground=false;a.walk=0
    s.caveFall={elapsed=0,y=a.y}
    s.caveNotice='足元の岩が崩れた！'
   end
  end
 end

 function cave.stepFall(s,dt)
  local fall=s.caveFall
  if s.paused then return false end
  s.t=s.t+dt
  fall.elapsed=math.min(fallDuration,fall.elapsed+dt)
  local a=s.actors[s.active]
  a.y=fall.y+(480-fall.y)*(fall.elapsed/fallDuration)^2
  return fall.elapsed>=fallDuration
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color}
 end

 local function label(draws,x,y,text)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,size=15,color='#ffedb1'}
 end

 local function chest(draws,item,camera,opened)
  local x,y=item.x-camera,item.y
  rect(draws,x-19,y-22,38,22,'#764a32')
  rect(draws,x-19,y-22,38,5,'#ce954f')
  rect(draws,x-16,y-(opened and 37 or 28),32,8,'#ae7244')
  rect(draws,x-3,y-19,6,8,'#ffcd6a')
 end

 function cave.observe(s,f,draws,q,state,mode,profile)
  if not state then return end
  local spec=q.cave
  local upper=s.story.node==q.target
  if not upper and s.story.node~=spec.depth then return end
  local camera,n=s.camera,state.count
  if upper then
   local guide=spec.guide
   if n<=2 and guide.x-camera>=-60 then
    C.drawBennettArt({draws=draws},guide.x-camera,guide.y,mode,profile)
    label(draws,guide.x-camera,guide.y-87,'ベネット')
   end
   chest(draws,spec.chest,camera,n>=2)
   local rock=spec.rockfall
   if n==1 then
    local phase,x=rockPhase(s,rock),rock.x-camera
    if phase>=.78 and phase<1.85 then
     rect(draws,x-rock.radius,394,rock.radius*2,6,'#dc9753')
     local y=phase<1.25 and 144 or math.min(370,144+490*(phase-1.25))
     rect(draws,x-10,y,20,15,'#a77b6c')
     rect(draws,x-6,y-5,12,6,'#c8a489')
    end
   end
   local ledge=spec.brittle
   if n<3 then
    for i=1,4 do
     local x=ledge.x-camera+i*39
     rect(draws,x,ledge.y+3,3,8,'#615e68')
     rect(draws,x+3,ledge.y+8,6,2,'#615e68')
    end
   elseif s.caveFall then
    local progress=s.caveFall.elapsed/fallDuration
    for i=1,6 do
     rect(draws,ledge.x-camera+i*29+(i-3)*16*progress,ledge.y+9+progress^2*(i*7+38),14,9,'#96776b')
    end
   end
  elseif n==3 then
   local guideX=spec.landing.x+42-camera
   C.drawBennettArt({draws=draws},guideX,480,mode,profile)
   label(draws,guideX,393,'ベネット')
   local x=spec.ore.x-camera
   rect(draws,x-26,468,52,12,'#526266')
   rect(draws,x-18,452,10,18,'#6cb39d')
   rect(draws,x-4,440,13,30,'#a6e1cd')
   rect(draws,x+12,453,13,18,'#73b5af')
   label(draws,x,427,'強化鉱石')
  end
  local item=site(s,q,state)
  if item and near(s,item) then f.storyNearbyCave={label=item.label} end
  local message=s.caveNotice or (state.status=='complete' and '風裂き洞窟の鉱脈と、旧道への近道を利用できます。') or objectives[n]
  f.storyCave={stage=n,falling=s.caveFall~=nil,message=message}
 end
 return cave
end
