return function(C)
 local contest={}
 local messages={
  [0]='化け狸の親分が勝負を待っています。',
  [1]='千化け大灯籠 ｜ 化け術の外殻',
  [2]='戦闘はひと休み。水面に映る三つの影を見比べよう。',
  [3]='千化け大灯籠 ｜ 残りの化け力',
  [4]='勝負あり。葉の向こうに、海へ続く明かりが見えます。'
 }
 local names={'左','中央','右'}

 local function phase(s,state)
  return s.contestReplay or (state.status=='active' and state.count) or 5
 end

 function contest.populate(s,q,state)
  if not state then return end
  local stage=phase(s,state)
  if stage~=1 and stage~=3 then s.enemies={};return end
  local spec=q.contest
  local hp=stage==1 and spec.shellHP or spec.finalHP
  local x=spec.bossX
  -- Reuse the ordinary enemy warning and close-range attack.
  s.enemies={{id=stage,x=x,home=x,y=480,hp=hp,maxhp=hp,respawn=0,cd=1.8,warning=0,
   kind=1,boss=true,noRewards=true,patrolMin=x,patrolMax=x,storyDrawn=true,drawHeight=144}}
 end

 local function advance(s,q,state)
  if s.contestReplay then
   local nextStage=s.contestReplay+1
   s.contestReplay=nextStage<4 and nextStage or nil
  else state.count=state.count+1 end
  s.contestFlash=nil
  contest.populate(s,q,state)
 end

 local function nearby(s,q,state)
  if not state or not s.story.active or s.paused then return end
  local a=s.actors[s.active]
  if a.hp<=0 or math.abs(a.y-480)>=34 then return end
  local spec=q.contest
  local stage=phase(s,state)
  if s.story.node==spec.cape and stage==4 and math.abs(a.x-spec.overlookX)<58 then
   return 'overlook','海と町の灯りを眺める'
  end
  if s.story.node~=q.target then return end
  if math.abs(a.x-spec.hostX)<55 then
   if stage==0 then return 'start','親分に勝負を申し込む' end
   if state.status=='complete' and not s.contestReplay then return 'replay','親分に再戦を申し込む' end
  end
  if stage==2 then
   for i,x in ipairs(spec.decoys) do
    if math.abs(a.x-x)<55 then return i,names[i]..'の灯籠を調べる' end
   end
  end
 end

 function contest.interact(s,q,state)
  local item=nearby(s,q,state)
  if not item then return false end
  if item=='overlook' then
   state.count=5
   s.storyNotice='綾華「海に町の灯りが映っています。親分が見せたかったのは、この景色だったのですね。」'
  elseif item=='replay' then
   s.storyNotice='親分が飛び跳ねて、再戦を受けてくれました。'
   s.contestReplay=1
   s.contestFlash=nil
   contest.populate(s,q,state)
  elseif item=='start' then
   s.storyNotice='綾華「最後までお付き合いしましょう。ただし、勝負は真剣に。」'
   advance(s,q,state)
  elseif item==q.contest.answer then
   s.storyNotice='水面のしっぽで本物を見破りました。'
   advance(s,q,state)
  else
   s.contestFlash={x=q.contest.decoys[item],at=s.t}
  end
  return true
 end

 function contest.step(s,q,state)
  if not state or s.paused or s.story.node~=q.target then return end
  local stage=phase(s,state)
  local enemy=s.enemies[1]
  if (stage==1 or stage==3) and enemy and enemy.hp<=0 then
   local replay=s.contestReplay~=nil
   advance(s,q,state)
   if stage==3 then
    s.storyNotice=replay and '再戦はここまで。親分は笑ってお辞儀をしました。'
     or '化け力が尽き、親分は尻もち。笑い声とともに葉の幕が開きました。'
   end
  end
 end

 local function rect(boxes,x,y,w,h,color)
  boxes[#boxes+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color}
 end

 local function lantern(boxes,x,y,k)
  local function pixel(dx,dy,w,h,color) rect(boxes,x+dx*k,y+dy*k,w*k,h*k,color) end
  pixel(-31,-6,62,6,'#292132')
  pixel(-26,-15,52,9,'#634050')
  pixel(-22,-53,44,38,'#351f36')
  pixel(-18,-49,36,29,'#de8755')
  pixel(-14,-47,28,23,'#ffc775')
  pixel(-9,-42,5,8,'#392536')
  pixel(4,-42,5,8,'#392536')
  pixel(-3,-33,6,3,'#795041')
  pixel(-20,-22,40,6,'#9d4b46')
  pixel(-33,-58,66,6,'#35293b')
  pixel(-28,-64,56,7,'#635067')
  pixel(-22,-69,44,5,'#8b666c')
  pixel(-8,-74,16,5,'#a27d6e')
  pixel(-4,-78,8,5,'#bb956a')
 end

 local function sign(boxes,x)
  rect(boxes,x-3,446,6,34,'#674442')
  rect(boxes,x-28,431,45,18,'#4e3742')
  rect(boxes,x+17,435,10,10,'#765053')
  rect(boxes,x-24,434,42,11,'#dc9f71')
  rect(boxes,x-18,438,29,3,'#6e4953')
 end

 local function leafCurtain(boxes,x)
  rect(boxes,x-19,390,38,90,'#243b35')
  for i=0,6 do
   local y=393+12*i
   rect(boxes,x-16+i%2*4,y,15,10,'#4b6951')
   rect(boxes,x+2-i%2*4,y+2,14,9,'#607451')
  end
 end

 function contest.observe(s,f,boxes,node,q,state,mode,profile)
  if not state then return end
  local spec=q.contest
  local c=s.camera
  local stage=phase(s,state)
  local item,label=nearby(s,q,state)
  if item then f.storyNearbyContest={label=label} end
  if s.story.node==spec.cape then
   sign(boxes,spec.overlookX-c)
   C.drawDanukiArt({draws=boxes},spec.overlookX+88-c,480,mode,profile)
   f.storyContest={stage=stage,message='潮見の岬 ｜ 海と町の灯り'}
   return
  end
  if s.story.node~=q.target then return end
  if state.count<4 then
   for _,edge in ipairs(node.exits) do
    if edge.to==spec.cape then leafCurtain(boxes,edge.x-c);break end
   end
  end
  local message=messages[stage] or (state.status=='complete' and '海への道は開いています。親分に再戦を申し込めます。'
   or '離島の綾華に勝負と岬のことを報告しましょう。')
  if stage==2 then
   for i,worldX in ipairs(spec.decoys) do
    local x=worldX-c
    lantern(boxes,x,464,1)
    rect(boxes,x-52,466,104,14,'#317286')
    rect(boxes,x-44,469,88,2,'#80a4a5')
    rect(boxes,x-21,472,42,6,'#9e656b')
    if i==spec.answer then
     rect(boxes,x+22,475,18,4,'#422a4c')
     rect(boxes,x+36,471,8,6,'#422a4c')
     rect(boxes,x+40,467,8,6,'#d8af8a')
    end
   end
   local flash=s.contestFlash
   if flash and s.t-flash.at<1.8 then
    message='紙吹雪が舞いました。ほかの灯籠を調べられます。'
    local age=s.t-flash.at
    for i=-3,3 do
     rect(boxes,flash.x-c+i*(8+12*age),412+age*30+math.abs(i)*5,5,4,
      i%2==0 and '#ffd58f' or '#bc81b3')
    end
   end
  elseif stage==1 or stage==3 then
   local e=s.enemies[1]
   if e then
    local x=e.x-c
    lantern(boxes,x,480,stage==1 and 1.65 or 1.4)
    if e.warning>0 then
     rect(boxes,x-59,411,10,6,'#cee489')
     rect(boxes,x+49,399,10,6,'#cee489')
    end
    message=message..' '..e.hp..' / '..e.maxhp
   end
  else
   C.drawDanukiArt({draws=boxes},spec.hostX-c,480,mode,profile)
   if stage==0 then lantern(boxes,spec.bossX-c,480,1.65) else sign(boxes,1190-c) end
  end
  f.storyContest={stage=stage,replay=s.contestReplay~=nil,message=message}
 end

 return contest
end
