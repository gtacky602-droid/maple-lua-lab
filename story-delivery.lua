-- Local quest packages are counters, independent of gear and character controls.
local D={}

function D.new()
 return {guardCleared=false,recovered=false,delivered={}}
end

local function nearby(actor,item)
 return actor.hp>0 and math.abs(actor.x-item.x)<60 and math.abs(actor.y-item.y)<34
end

local function stall(s,q)
 if s.story.node~=q.hub then return nil end
 local actor=s.actors[s.active]
 for _,package in ipairs(q.delivery.packages) do
  if nearby(actor,package) then return package end
 end
end

function D.carried(q,state,package)
 return not state.delivered[package.id] and (package.id~=q.delivery.cache.id or state.recovered)
end

function D.recover(s,q,state)
 if s.story.node~=q.target or state.recovered then return end
 local cache=q.delivery.cache
 if not nearby(s.actors[s.active],cache) then s.storyNotice='荷箱のそばへ移動してください。';return end
 if not state.guardCleared then s.storyNotice='先に仮置き場の見張りを倒してください。';return end
 state.recovered=true
 s.storyNotice=cache.name..'を回収しました。港へ届けましょう。'
end

local function reject(s,destination,message)
 s.storyNotice=message
 s.storyDeliveryNotice={id=destination.id,text=message}
end

function D.deliver(s,q,state,id)
 local destination=stall(s,q)
 if not destination then s.storyNotice='届け先の店先まで移動してください。';return end
 if state.delivered[destination.id] then return end
 for _,package in ipairs(q.delivery.packages) do
  if package.id==id and D.carried(q,state,package) then
   if package.id~=destination.id then reject(s,destination,'荷札と届け先をもう一度確かめてください。');return end
   state.delivered[id]=true
   s.storyDeliveryNotice=nil
   s.story.quests[q.id].count=s.story.quests[q.id].count+1
   s.storyNotice=destination.stall..'に荷物を届けました。'
   return
  end
 end
 reject(s,destination,'その荷物は手元にありません。')
end

local function draw(boxes,x,y,w,h,color)
 boxes[#boxes+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
end

function D.observe(s,f,boxes,q,state)
 local actor=s.actors[s.active]
 if s.story.node==q.target and state and not state.recovered then
  local cache=q.delivery.cache
  local x,y=cache.x-s.camera,cache.y
  draw(boxes,x-15,y-24,30,24,'#5b3f2c')
  draw(boxes,x-12,y-21,24,18,'#c48a56')
  draw(boxes,x-2,y-21,4,18,'#f1d58e')
  if state.guardCleared and not s.paused and nearby(actor,cache) then f.storyNearbyParcel={name=cache.name} end
 elseif s.story.node==q.hub then
  local destination=stall(s,q)
  f.storyShopStock={}
  for _,package in ipairs(q.delivery.packages) do
   local x,y=package.x-s.camera,package.y
   local stocked=state and state.delivered[package.id] or false
   f.storyShopStock[package.id]=stocked
   draw(boxes,x-27,y-32,54,32,'#62432e')
   draw(boxes,x-24,y-27,48,21,'#916749')
   draw(boxes,x-28,y-32,56,4,package.color)
   if stocked then
    draw(boxes,x-16,y-43,13,11,package.color)
    draw(boxes,x+4,y-40,12,8,'#f3d2a1')
   end
  end
  if not s.paused and destination and state then
   local options={}
   if not state.delivered[destination.id] then
    for _,package in ipairs(q.delivery.packages) do
     if D.carried(q,state,package) then options[#options+1]={id=package.id,label=package.label} end
    end
   end
   local notice=s.storyDeliveryNotice
   f.storyDelivery={quest=q.id,stall=destination.stall,hint=destination.hint,stocked=state.delivered[destination.id] or false,
                    options=options,feedback=notice and notice.id==destination.id and notice.text or nil}
  end
 end
end

return D
