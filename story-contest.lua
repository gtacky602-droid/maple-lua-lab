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

 function contest.step(s,q,state)
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
   f.storyContest={stage=stage,vista=s.contestVista,message='潮見の岬 ｜ 海と町の灯り'}
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
