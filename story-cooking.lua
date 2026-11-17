-- Ingredients are quest counters. Prepared meals share a small provision stock.
local M={}

function M.new()
 return {gathered={},meals=0}
end

local function near(s,item)
 local a=s.actors[s.active]
 return a.hp>0 and math.abs(a.x-item.x)<55 and math.abs(a.y-item.y)<34
end

local function stall(s,q)
 local market=q.cooking.marketStall
 local progress=s.story.quests[market.quest]
 return progress and progress.count>=market.count and market or q.cooking.stall
end

local function nearStall(s,q)
 return s.story.node==q.hub and near(s,stall(s,q))
end

local function flavorById(q,id)
 for _,flavor in ipairs(q.cooking.flavors) do
  if flavor.id==id then return flavor end
 end
end

function M.nearbyIngredient(s,q,state)
 if state.status~='active' or state.count>=q.goal-1 then return end
 for _,item in ipairs(q.cooking.ingredients) do
  if item.node==s.story.node and not state.cooking.gathered[item.id] and near(s,item) then return item end
 end
end

function M.gather(s,q,state,item)
 state.cooking.gathered[item.id]=true
 state.count=state.count+1
 s.storyNotice=item.name..'を集めました。'
 if state.count==q.goal-1 then
  s.storyNotice='食材がそろいました。港の屋台で香菱と料理を試作しましょう。'
 end
end

function M.action(s,q,state,command,flavorId,healActor)
 local spec,stock=q.cooking,state.cooking
 if command=='cook' then
  if state.status~='active' or state.count~=q.goal-1 or not nearStall(s,q) then return end
  local flavor=flavorById(q,flavorId)
  if not flavor then return end
  stock.flavor=flavor.id
  state.count=q.goal
  s.storyNotice='片手で食べられる「'..flavor.name..'」ができました。香菱に報告しましょう。'
  return
 end
 if state.status~='complete' then return end
 if command=='buy_meal' and nearStall(s,q) and stock.meals<spec.capacity and s.mora>=spec.price then
  s.mora=s.mora-spec.price
  stock.meals=stock.meals+1
 elseif command=='eat_meal' and stock.meals>0 then
  local a=s.actors[s.active]
  if a.hp<=0 or a.hp>=a.maxhp then return end
  local hp=a.hp
  healActor(s,a,spec.heal)
  stock.meals=stock.meals-1
  s.storyNotice='山海包みを食べて、操作中のキャラのHPが'..(a.hp-hp)..'回復しました。'
 end
end

local function rect(boxes,x,y,w,h,color)
 boxes[#boxes+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
end

local function drawIngredient(boxes,item,x,y)
 if item.id=='fish' then
  rect(boxes,x-15,y-6,30,4,'#428688')
  rect(boxes,x-11,y-13,16,7,'#b8dfe1')
  rect(boxes,x+6,y-16,5,10,'#7cb7bf')
  rect(boxes,x-9,y-12,2,2,'#203b4e')
 elseif item.id=='herb' then
  rect(boxes,x-2,y-19,4,19,'#52613b')
  rect(boxes,x-12,y-13,11,5,'#90b969')
  rect(boxes,x+2,y-21,10,6,'#bad884')
 else
  rect(boxes,x-2,y-13,4,13,'#caad86')
  rect(boxes,x-10,y-17,20,7,'#9a6349')
  rect(boxes,x-6,y-20,12,4,'#c87b54')
 end
end

function M.observe(s,f,boxes,q,state)
 local spec,stock=q.cooking,state.cooking
 if state.status=='active' then
  for _,item in ipairs(spec.ingredients) do
   if item.node==s.story.node and not stock.gathered[item.id] then
    drawIngredient(boxes,item,item.x-s.camera,item.y)
   end
  end
  local nearby=not s.paused and M.nearbyIngredient(s,q,state)
  if nearby then f.storyNearbyIngredient={id=nearby.id,name=nearby.name} end
 end
 local flavor=flavorById(q,stock.flavor)
 if flavor and s.story.node==q.hub then
  local item=stall(s,q)
  local x,y=item.x-s.camera,item.y
  rect(boxes,x+32,y-43,5,43,'#5a412e')
  rect(boxes,x+35,y-43,26,18,flavor.color)
  rect(boxes,x+42,y-39,11,9,'#f5c389')
  rect(boxes,x+46,y-39,3,9,'#e4a361')
 end
 local byStall=nearStall(s,q)
 local a=s.actors[s.active]
 if state.status=='complete' and (byStall or stock.meals>0) then
  f.storyCooking={quest=q.id,meal=flavor.name,stock=stock.meals,capacity=spec.capacity,heal=spec.heal,
   price=byStall and spec.price or nil,canBuy=byStall and not s.paused and stock.meals<spec.capacity and s.mora>=spec.price,
   canEat=not s.paused and not s.lift and stock.meals>0 and a.hp>0 and a.hp<a.maxhp}
 elseif byStall and state.count>=q.goal-1 then
  f.storyCooking={quest=q.id,choosing=not flavor,flavors=spec.flavors,meal=flavor and flavor.name,paused=s.paused}
 end
end

return M
