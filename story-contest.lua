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

 -- Revisit the same physical props that the side quests use. Only the dialogue is new.
 function contest.revisits(quests,nodes)
  local stops={}
  local function stop(q,node,point,line)
   q.ayakaRevisit={node=node,name=point.name}
   stops[node]={quest=q.id,point=point,line=line}
  end
  local bridge=quests['ayaka-join']
  stop(bridge,bridge.target,bridge.sights.bridge,function(state)
   if not state.sights then return end
   for _,place in ipairs(bridge.sights.places) do
    if place.id==state.sights.favorite then
     return '絵図の「'..place.name..'」、覚えていますか？　ここであなたが選んでくださった景色です。'
    end
   end
  end)
  local fireworks=quests['ina-window-fireworks']
  stop(fireworks,fireworks.target,fireworks.itinerary[fireworks.goal],function(state)
   local design=state.fireworkDesign
   if design then
    local color,shape
    for _,v in ipairs(fireworks.fireworks.colors) do if v.id==design.color then color=v.label end end
    for _,v in ipairs(fireworks.fireworks.shapes) do if v.id==design.shape then shape=v.label end end
    if color and shape then return 'あの窓からも見えたでしょうか。'..color..'の花火が、'..shape..'の形に開くところ。' end
   end
   return 'あの日は、花火より先に向こうの窓を見てしまいました。ふふ、あなたもですか？'
  end)
  local sayu=quests['ina-sayu-quiet-route']
  local hatch=sayu.itinerary[sayu.goal-1]
  stop(sayu,hatch.node,hatch,function()
   return '早柚さんがここにすっと消えて、向こうで柵が開いて……。私たちが通れる道まで考えてくれていたのですね。'
  end)
  local itto=quests['ina-itto-three-games']
  local games=nodes[itto.target].ittoGames
  stop(itto,itto.target,{x=games.prizeX,y=games.bell.y,name='競技広場の景品台'},function(state)
   local relay=state.ittoContest and state.ittoContest.last and state.ittoContest.last[3]
   if relay and relay.player>relay.rival then
    return '最後の競走、あなたの組の子が真っ先に振り返ったの、見えました？　応援の声がちゃんと届いていましたね。'
   end
   return '景品を受け取った子たち、一斗さんの笛をもう一度鳴らそうとしていましたね。次は私も走ってみたいです。'
  end)
  local tea=quests['ina-walking-teahouse']
  stop(tea,tea.target,tea.itinerary[tea.goal],function()
   return '今日はここで一杯いただきませんか？　車輪の跡を追わずに、このお茶を飲みに来られるのはうれしいですね。'
  end)
  return function(s)
   local here=stops[s.story.node]
   if not here or s.companion~='ayaka' or s.actors[2].hp<=0 or s.ittoRound or s.fireworkShow then return end
   local actor=s.actors[s.active]
   local state=s.story.quests[here.quest]
   if state and state.status=='complete' and actor.hp>0 and math.abs(actor.x-here.point.x)<80
      and math.abs(actor.y-here.point.y)<34 then return here.line(state) end
  end
 end

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
  if s.story.node==spec.cape and state.count>=4 and math.abs(a.x-spec.overlookX)<58 then
   return 'overlook',s.contestVista and '眺望を閉じる' or '海と町の灯りを眺める'
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
   s.contestVista=not s.contestVista
   if state.count==4 then
    state.count=5
    s.storyNotice='綾華「海に町の灯りが映っています。親分が見せたかったのは、この景色だったのですね。」'
   end
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

 local function greeting(s,q)
  local a=s.actors[s.active]
  local dx=math.abs(a.x-(q.contest.overlookX+88))
  if a.hp<=0 or dx>235 or math.abs(a.y-480)>100 then s.chiefGreetingAt=nil
  elseif dx<155 and math.abs(a.y-480)<48 and not s.chiefGreetingAt then s.chiefGreetingAt=s.t end
 end

 function contest.step(s,q,state)
  if state and state.status=='complete' and not s.paused and s.story.node==q.contest.cape then greeting(s,q) end
  if s.contestVista then
   local a=s.actors[s.active]
   if s.story.node~=q.contest.cape or math.abs(a.x-q.contest.overlookX)>=58 or math.abs(a.y-480)>=34 or a.hp<=0 then s.contestVista=nil end
  end
  if not state or s.paused or s.story.node~=q.target then return end
  local stage=phase(s,state)
  local enemy=s.enemies[1]
  if (stage==1 or stage==3) and enemy and enemy.hp<=0 then
   local replay=s.contestReplay~=nil
   advance(s,q,state)
   if stage==3 then
    s.storyNotice=replay and '再戦はここまで。親分は笑ってお辞儀をしました。'
     or '化け力が尽き、親分は尻もち。笑い声とともに葉の幕が開きました。'
    return not replay
   end
  end
 end

 local function rect(boxes,x,y,w,h,color)
  boxes[#boxes+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color}
 end

 -- Motifs are grounded at the bottom centre. The field and comparison use the same runs.
 contest.motifs={
  lantern={
   {-31,-6,62,6,'#292132'},{-26,-15,52,9,'#634050'},{-23,-53,46,38,'#351f36'},
   {-19,-50,38,32,'#de8755'},{-15,-48,30,25,'#ffc775'},{-18,-44,3,17,'#efab68'},
   {-3,-47,6,8,'#ffe5a0'},{-13,-41,10,4,'#925052'},{3,-41,10,4,'#925052'},
   {-9,-40,5,7,'#392536'},{4,-40,5,7,'#392536'},{-3,-33,6,3,'#795041'},
   {-20,-22,40,6,'#9d4b46'},{-14,-20,28,2,'#f4c67e'},{-33,-58,66,6,'#35293b'},
   {-28,-64,56,7,'#635067'},{-22,-69,44,5,'#8b666c'},{-8,-74,16,5,'#a27d6e'},
   {-4,-78,8,5,'#bb956a'},{-32,-61,7,4,'#bc936d'},{25,-61,7,4,'#bc936d'},
   {-27,-51,2,15,'#a95550'},{25,-51,2,15,'#a95550'},{-29,-37,6,6,'#cf7359'},{23,-37,6,6,'#cf7359'},
   {-23,-63,15,2,'#a07a7b'},{6,-57,19,2,'#897282'},
   {-17,-49,2,25,'#b55e48'},{14,-49,2,25,'#ad5b49'},{-13,-26,25,1,'#eaab64'},
   {-20,-12,40,2,'#95675e'},{-23,-4,46,1,'#715160'},
   {0,-78,12,3,'#63764f'},{4,-82,12,5,'#91aa69'},{11,-84,8,4,'#b4c987'}
  },
  split={{8,-49,3,7,'#67434a'},{5,-44,4,4,'#67434a'},{3,-41,3,4,'#67434a'}},
  water={{-52,-14,104,14,'#317286'},{-44,-11,88,2,'#80a4a5'},
   {-21,-8,42,6,'#9e656b'},{-16,-7,32,3,'#cf9279'},{-29,-3,16,1,'#86b9b8'},
   {-48,-6,10,2,'#629da6'},{19,-10,17,1,'#9fc7c0'},{-7,-6,4,2,'#785866'},
   {4,-6,4,2,'#785866'},{-17,-3,31,1,'#82ada9'}},
  tail={{21,-5,17,4,'#422a4c'},{34,-8,8,6,'#422a4c'},{39,-12,8,7,'#684856'},
   {42,-15,7,6,'#d8af8a'},{38,-7,5,2,'#8e6967'},{29,-4,8,1,'#79a9af'}},
  curtain={{-19,-90,38,90,'#243b35'}}
 }
 for i=0,6 do
  local leaves=contest.motifs.curtain
  leaves[#leaves+1]={-16+i%2*4,-87+12*i,15,10,'#4b6951'}
  leaves[#leaves+1]={2-i%2*4,-85+12*i,14,9,'#607451'}
 end

 function contest.arrange(spec,stage,bossX,gateX,emit)
  if gateX then emit('curtain',gateX,480,1) end
  if stage==2 then
   for i,x in ipairs(spec.decoys) do
    emit('lantern',x,464,1)
    emit('water',x,480,1)
    if i==spec.answer then emit('tail',x,480,1) end
   end
  elseif stage==0 or stage==1 or stage==3 then
   local scale=stage==3 and 1.4 or 1.65
   emit('lantern',bossX,480,scale)
   if stage==3 then emit('split',bossX,480,scale) end
  end
 end

 local function sign(boxes,x)
  rect(boxes,x+3,454,13,6,'#674452')
  rect(boxes,x+13,450,6,8,'#96675b')
  rect(boxes,x+16,447,5,5,'#dab68a')
  rect(boxes,x-3,446,6,34,'#674442')
  rect(boxes,x-28,431,45,18,'#4e3742')
  rect(boxes,x+17,435,10,10,'#765053')
  rect(boxes,x-24,434,42,11,'#dc9f71')
  rect(boxes,x-18,438,29,3,'#6e4953')
 end



 local function greetAtCape(s,f,boxes,x,mode,profile)
  local age=s.chiefGreetingAt and s.t-s.chiefGreetingAt or -1
  local phase=age<0 and 'lantern' or age<.45 and 'sway' or age<1.3 and 'unmask' or 'rest'
  if x>=-65 and x<=1025 then
   if phase=='lantern' or phase=='sway' then
    local sway=phase=='sway' and math.sin(age*22)*3 or 0
    for _,r in ipairs(contest.motifs.lantern) do
     rect(boxes,x+r[1]+sway*(-r[2]/84),480+r[2],r[3],r[4],r[5])
    end
    for _,r in ipairs(contest.motifs.tail) do rect(boxes,x+r[1]-.5*sway,479+r[2],r[3],r[4],r[5]) end
   else
    local t=math.min(1,(age-.45)/.85)
    local hop=math.sin(t*math.pi)*16
    local layer={draws=boxes}
    if mode=='rect' and s.packRectArt then
     f.rectBatches=f.rectBatches or {}
     layer.rectIndex,layer.rectBatches={},f.rectBatches
    end
    C.drawDanukiArt(layer,x,480-hop,mode,profile)
    if phase=='unmask' then
     local leafX=x+t*35
     local leafY=421-22*math.sin(t*math.pi)+t*41
     rect(boxes,leafX,leafY,10,4,'#708947')
     rect(boxes,leafX+5,leafY-3,8,4,'#adbb72')
    end
   end
  end
  return phase
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
   local x=spec.overlookX+88-c
   local pose
   if state.status=='complete' then pose=greetAtCape(s,f,boxes,x,mode,profile)
   else C.drawDanukiArt({draws=boxes},x,480,mode,profile) end
   local message='潮見の岬 ｜ 海と町の灯り'
   if pose=='sway' then message='道標のとなりで、灯籠のしっぽが揺れた。'
   elseif pose=='unmask' then message='親分はひょいと葉を放して、こちらに素顔を見せた。' end
   f.storyContest={stage=stage,vista=s.contestVista,greeting=pose,message=message}
   return
  end
  if s.story.node~=q.target then return end
  local gateX
  if state.count<4 then
   for _,edge in ipairs(node.exits) do
    if edge.to==spec.cape then gateX=edge.x;break end
   end
  end
  local enemy=s.enemies[1]
  contest.arrange(spec,stage,enemy and enemy.x or spec.bossX,gateX,function(key,wx,y,scale)
   local x=wx-c
   for _,r in ipairs(contest.motifs[key]) do
    rect(boxes,x+r[1]*scale,y+r[2]*scale,r[3]*scale,r[4]*scale,r[5])
   end
  end)
  local message=messages[stage] or (state.status=='complete' and '海への道は開いています。親分に再戦を申し込めます。'
   or '離島の綾華に勝負と岬のことを報告しましょう。')
  if stage==2 then

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

    if e.warning>0 then
     rect(boxes,x-59,411,10,6,'#cee489')
     rect(boxes,x+49,399,10,6,'#cee489')
    end
    message=message..' '..e.hp..' / '..e.maxhp
   end
  else
   C.drawDanukiArt({draws=boxes},spec.hostX-c,480,mode,profile)
   if stage~=0 then sign(boxes,1190-c) end
  end
  f.storyContest={stage=stage,replay=s.contestReplay~=nil,message=message}
 end

 return contest
end
