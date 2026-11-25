local S={}

local function near(s,item)
 local a=s.actors[s.active]
 return a.hp>0 and math.abs(a.x-item.x)<54 and math.abs(a.y-item.y)<34
end

local function sites(s,q,state)
 local spec=q.stone
 if s.story.node==q.target and state.count>=3 then
  if state.count==4 then return {spec.mural,spec.model} end
  return {spec.mural}
 elseif state.status=='complete' and s.story.node==q.hub then
  local market=spec.marketStand
  local opened=s.story.quests[market.quest]
  return {opened and opened.count>=market.count and market or spec.stand}
 elseif state.count<3 then
  local visible={}
  for _,mark in ipairs(spec.marks) do
   if mark.node==s.story.node and not state.stone.marked[mark.id] then visible[#visible+1]=mark end
  end
  return visible
 end
 return {}
end

function S.nearby(s,q,state)
 for _,item in ipairs(sites(s,q,state)) do
  if near(s,item) then return item end
 end
end

function S.inspect(s,q,state,item)
 local spec=q.stone
 if item==spec.mural then
  s.storyNotice='壁画には、山から石を切り出し、街道を経て、港で石を組み上げる職人たちが描かれています。'
 elseif item==spec.model then
  state.count=q.goal
  s.storyNotice='山道と港を見渡す場所で、港の建物をかたどった小さな模型を見つけました。'
 elseif item.id=='model-exhibit' then
  s.storyNotice='模型の建物には、山道から届いた石を組み合わせる当時の工夫が残っています。'
 else
  state.stone.marked[item.id]=true
  state.count=state.count+1
  s.storyNotice=state.count==3 and '印がそろいました。詰所の上段から、職人の展望所へ進めます。'
                                or '鍾離に見せてもらった石と、同じ職人の印です。'
 end
end

function S.press(s,q,state,id)
 local spec=q.stone
 if state.status~='active' or state.count~=3 or s.story.node~=q.target or not near(s,spec.mural) then return end
 local known=false
 for _,tile in ipairs(spec.tiles) do if tile.id==id then known=true;break end end
 if not known then return end
 local solved=state.stone.sequence
 if spec.order[solved+1]~=id then
  state.stone.sequence=0
  s.stoneNotice='石板が元に戻りました。壁画を見て、最初の作業からやり直せます。'
  return
 end
 state.stone.sequence=solved+1
 if state.stone.sequence==#spec.order then
  state.count=4
  s.stoneNotice='石板が開きました。上段で建物模型を探しましょう。'
  s.storyNotice=s.stoneNotice
 else s.stoneNotice='石板がひとつ動きました。次の作業を選びましょう。' end
end

local function rect(draws,x,y,w,h,color)
 draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
end

local function symbol(draws,x,y)
 rect(draws,x-8,y-19,16,3,'#dfc895')
 rect(draws,x-7,y-16,3,10,'#dfc895')
 rect(draws,x+4,y-16,3,10,'#dfc895')
 rect(draws,x-7,y-10,14,3,'#dfc895')
end

local function drawSite(draws,item,x,y,opened)
 if item.id=='craft-mural' then
  rect(draws,x-52,y-72,104,72,'#7c7767')
  rect(draws,x-49,y-69,98,6,'#ada287')
  rect(draws,x-42,y-59,84,44,'#575f59')
  local ink='#dfc895'
  -- Carve a block, move it by cart, then set it into a wall.
  rect(draws,x-36,y-36,18,10,ink)
  rect(draws,x-31,y-45,3,9,ink)
  rect(draws,x-35,y-45,10,3,ink)
  rect(draws,x-9,y-42,15,11,ink)
  rect(draws,x-11,y-31,22,4,ink)
  rect(draws,x-7,y-27,4,4,ink)
  rect(draws,x+5,y-27,4,4,ink)
  rect(draws,x+17,y-30,21,5,ink)
  rect(draws,x+20,y-37,16,5,ink)
  rect(draws,x+24,y-44,10,5,ink)
  if opened then
   rect(draws,x-23,y-15,46,15,'#393f3b')
   rect(draws,x-27,y-15,6,15,'#ada287')
   rect(draws,x+21,y-15,6,15,'#ada287')
  end
 elseif item.id=='overlook-model' or item.id=='model-exhibit' then
  rect(draws,x-25,y-11,50,11,'#674d3a')
  rect(draws,x-17,y-30,34,19,'#b58059')
  rect(draws,x-21,y-35,42,6,'#346865')
  rect(draws,x-15,y-40,30,5,'#387674')
  rect(draws,x-8,y-45,16,5,'#438888')
  rect(draws,x-4,y-24,8,13,'#504334')
 else
  if item.id=='tool-mark' then
   rect(draws,x-12,y-30,26,6,'#846a49')
   rect(draws,x-2,y-25,5,25,'#aa8057')
   rect(draws,x-12,y-22,24,19,'#634e3e')
  elseif item.id=='paving-mark' then
   rect(draws,x-24,y-22,48,22,'#7b7668')
   rect(draws,x-24,y-4,48,3,'#59594f')
   rect(draws,x-22,y-20,18,3,'#aaa38a')
   rect(draws,x+8,y-13,16,2,'#5b5a51')
  else
   rect(draws,x-22,y-37,44,37,'#68695e')
   rect(draws,x-18,y-44,32,42,'#88877a')
   rect(draws,x-18,y-44,25,4,'#b1a994')
   rect(draws,x+12,y-35,5,26,'#737568')
   rect(draws,x-12,y-32,16,2,'#6d6b60')
  end
  symbol(draws,x,y)
 end
end

function S.observe(s,f,draws,q,state)
 local spec=q.stone
 for _,item in ipairs(sites(s,q,state)) do
  drawSite(draws,item,item.x-s.camera,item.y,state.count>=4)
 end
 local item=S.nearby(s,q,state)
 if not item or s.lift then return end
 if not s.paused then
  f.storyNearbyStone={id=item.id,label=item.name..(item==spec.model and 'を回収する' or 'を調べる')}
 end
 if item==spec.mural then
  f.storyStone={id=q.id,mural=true,tiles=spec.tiles,sequence=state.stone.sequence,total=#spec.order,
                solved=state.count>=4,modelTaken=state.count==q.goal,paused=s.paused,notice=s.stoneNotice}
 elseif item.id=='model-exhibit' then f.storyStone={exhibit=true} end
end

return S
