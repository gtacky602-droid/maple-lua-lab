return function(C)
 local rest={}
 local directions={
  [0]='先に休憩所の魔物を退けよう。',
  [1]='低い足場にある板を拾おう。',
  [2]='ベンチのそばの落ち葉を掃こう。',
  [3]='ベンチを直したノエルに声をかけよう。',
  [4]='ノエルの分の椅子を置こう。',
  [5]='街道脇の休憩所 ｜ お茶で操作中のキャラのHPが回復する'
 }

 function rest.defeat(s,q,state,enemy)
  if state.status~='active' or state.count~=0 then return end
  for _,id in ipairs(q.rest.guards) do
   if enemy.spawnId==id then
    state.rest.defeated[id]=true
    enemy.respawn=math.huge
    break
   end
  end
  for _,id in ipairs(q.rest.guards) do if not state.rest.defeated[id] then return end end
  state.count=1
  s.restNotice='魔物を退けました。低い足場の上に、ベンチを修理できそうな板があります。'
 end

 local function nearby(s,q,state)
  if not state or s.story.node~=q.target or s.paused then return end
  local a=s.actors[s.active]
  if a.hp<=0 then return end
  local spec=q.rest
  local sites={spec.planks,spec.leaves,spec.bench,spec.chair,spec.tea}
  local item=sites[state.count]
  if item and math.abs(a.x-item.x)<55 and math.abs(a.y-item.y)<32 then return item end
 end

 function rest.interact(s,q,state)
  local item=nearby(s,q,state)
  if not item then return false end
  if item==q.rest.tea then
   local actor=s.actors[s.active]
   local hp=actor.hp
   C.healActor(s,actor,item.heal)
   local amount=actor.hp-hp
   s.restNotice=amount>0 and 'お茶を飲んで、HPが'..math.floor(amount)..'回復しました。' or '温かいお茶でひと休みしました。'
   return true
  end
  state.count=state.count+1
  if item==q.rest.planks then
   s.restNotice='板をノエルに渡しました。ベンチのそばを掃除しましょう。'
  elseif item==q.rest.leaves then
   s.restNotice='落ち葉が片付き、ノエルがベンチを直してくれました。'
  elseif item==q.rest.bench then
   s.restNotice='ノエルがお茶を運んでいます。座る場所が一つ足りません。'
  else
   s.restNotice='ノエル「私の分まで……？ では、少しだけご一緒させてください」'
  end
  return true
 end

 local function rect(boxes,x,y,w,h,color)
  boxes[#boxes+1]={kind='rect',x=math.floor(x),y=y,w=w,h=h,color=color}
 end

 local function bench(boxes,x,ready)
  if ready then
   rect(boxes,x-76,441,105,14,'#875a45')
   rect(boxes,x-76,441,105,4,'#d4a76b')
   rect(boxes,x-77,459,108,9,'#b78454')
   rect(boxes,x-70,468,8,12,'#654536')
   rect(boxes,x+16,468,8,12,'#654536')
  else
   rect(boxes,x-69,468,88,7,'#715344')
   rect(boxes,x-52,445,16,23,'#7f6851')
   rect(boxes,x+13,464,15,16,'#765444')
  end
 end

 local function tea(boxes,x)
  rect(boxes,x-24,449,48,6,'#ce9d64')
  rect(boxes,x-17,455,6,25,'#714c39')
  rect(boxes,x+13,455,6,25,'#714c39')
  rect(boxes,x-15,439,13,10,'#e8e3c6')
  rect(boxes,x+5,442,8,7,'#eacfb8')
  rect(boxes,x+14,443,3,4,'#eacfb8')
 end

 function rest.observe(s,f,layer,q,state,mode,profile)
  local boxes=layer.draws
  if not state or s.story.node~=q.target then return end
  local c=s.camera
  local spec=q.rest
  local count=state.count
  bench(boxes,spec.bench.x-c,count>=3)
  if count<=1 then
   for i=0,2 do rect(boxes,spec.planks.x-c-17+i*3,spec.planks.y-7-i*5,37,5,'#b9905d') end
  end
  if count<=2 then
   for i=-3,3 do rect(boxes,spec.leaves.x-c+i*8,475-i%3*3,7,4,i%2==0 and '#c28c42' or '#a36b3b') end
  end
  if count>=4 then tea(boxes,spec.tea.x-c) end
  if count>=5 then
   local x=spec.chair.x-c
   rect(boxes,x+28,438,7,42,'#805440')
   rect(boxes,x+19,439,16,11,'#a77754')
   rect(boxes,x+20,439,15,3,'#d2a16c')
   rect(boxes,x-4,456,39,6,'#bd8b5b')
   rect(boxes,x-3,462,6,18,'#714c3b')
  end
  local noelleX=count>=5 and spec.chair.x or spec.bench.x+50
  C.drawNoelleArt(layer,noelleX-c,480,count>=5,mode,profile)
  boxes[#boxes+1]={kind='text',x=noelleX-c,y=count>=5 and 390 or 385,text='ノエル',size=14,color='#fff0bd'}
  local item=nearby(s,q,state)
  if item then f.storyNearbyRest={label=item.label} end
  f.storyRest={stage=count,ready=count>=5,message=s.restNotice or directions[count]}
 end

 return rest
end
