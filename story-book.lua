local B={}

local function readingStand(s,q)
 local market=q.book.marketStand
 local progress=s.story.quests[market.quest]
 return progress and progress.count>=market.count and market or q.book.stand
end

local function sites(s,q,state)
 local spec=q.book
 if state.status=='complete' then
  if s.story.node==q.hub then
   local stand=readingStand(s,q)
   return {{id='read-stand',name='読書台',x=stand.x,y=stand.y}}
  end
 elseif s.story.node==spec.proof.node then
  if state.count==0 then return {spec.proof} end
  if state.count==1 then return spec.markers end
 elseif s.story.node==q.target and (state.count==2 or state.count==3) then
  return {spec.cache}
 end
 return {}
end

function B.nearby(s,q,state)
 local a=s.actors[s.active]
 if a.hp<=0 then return end
 for _,item in ipairs(sites(s,q,state)) do
  if math.abs(item.x-a.x)<54 and math.abs(item.y-a.y)<34 then return item end
 end
end

function B.interact(s,q,state,item)
 local spec=q.book
 if item.id=='read-stand' then
  s.readingQuest=s.readingQuest~=q.id and q.id or nil
 elseif item.id==spec.proof.id then
  state.count=1
  s.storyNotice='試し刷りには、二本の柱と横梁でできた石門が描かれています。'
 elseif state.count==1 then
  if item.id~=spec.match then
   s.storyNotice='これは二股の木です。試し刷りと同じ石門の印を探しましょう。'
   return
  end
  state.count=2
  s.storyNotice='試し刷りと同じ石門です。右の門から裏手に回れます。'
 elseif state.count==2 then
  s.storyNotice='火鉢のそばに宝盗団がいます。箱を取る前に退けましょう。'
 elseif state.count==3 then
  state.count=4
  s.storyNotice='新刊と版木を回収しました。港の行秋に返しましょう。'
 end
end

function B.defeat(s,q,state,e)
 if state.status~='active' or state.count~=2 then return end
 for _,id in ipairs(q.book.guards) do
  if id==e.spawnId then state.book.defeated[id]=true;e.respawn=math.huge;break end
 end
 for _,id in ipairs(q.book.guards) do if not state.book.defeated[id] then return end end
 state.count=3
 s.storyNotice='宝盗団を退けました。火鉢のそばに残った箱を回収できます。'
end

local function rect(boxes,x,y,w,h,color)
 boxes[#boxes+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
end

function B.drawSite(boxes,item,x,y)
 if item.id=='proof-sheet' then
  rect(boxes,x-12,y-12,24,12,'#e5d4a5')
  rect(boxes,x-7,y-9,14,3,'#5a675d')
  rect(boxes,x-7,y-6,3,4,'#5a675d')
  rect(boxes,x+4,y-6,3,4,'#5a675d')
 elseif item.id=='stone-arch' then
  rect(boxes,x-24,y-34,48,10,'#afb29b')
  rect(boxes,x-21,y-24,10,24,'#879784')
  rect(boxes,x+11,y-24,10,24,'#879784')
 elseif item.id=='forked-tree' then
  rect(boxes,x-4,y-30,8,30,'#834f36')
  rect(boxes,x-18,y-39,15,12,'#698653')
  rect(boxes,x+3,y-39,15,12,'#698653')
 elseif item.id=='read-stand' then
  rect(boxes,x-23,y-30,7,30,'#513c34')
  rect(boxes,x+16,y-30,7,30,'#513c34')
  rect(boxes,x-29,y-40,58,11,'#a66a44')
  rect(boxes,x-16,y-49,15,10,'#e7d3a0')
  rect(boxes,x+1,y-49,15,10,'#f9e7b5')
 else
  rect(boxes,x-24,y-27,48,27,'#51392d')
  rect(boxes,x-21,y-23,42,18,'#b07947')
  rect(boxes,x-21,y-15,42,4,'#e1ae67')
  rect(boxes,x-6,y-19,12,10,'#a55750')
  rect(boxes,x+38,y-14,22,14,'#51433a')
  rect(boxes,x+43,y-27,11,15,'#e58b4a')
 end
end

function B.observe(s,f,boxes,q,state)
 for _,item in ipairs(sites(s,q,state)) do
  B.drawSite(boxes,item,item.x-s.camera,item.y)
 end
 local item=not s.paused and B.nearby(s,q,state)
 if item then
  local label=item.name..'を調べる'
  if item.id=='read-stand' then label=s.readingQuest==q.id and '読書をやめる' or '読書台で読む'
  elseif item.id==q.book.cache.id and state.count==3 then label=item.name..'を回収する' end
  f.storyNearbyBook={id=item.id,label=label}
 end
 if state.count==1 and s.story.node==q.book.proof.node then f.storyBook={proof=true} end
 if state.status=='complete' and s.readingQuest==q.id and s.story.node==q.hub then
  local spec=q.book
  local stand=readingStand(s,q)
  if math.abs(s.actors[s.active].x-stand.x)<95 and math.abs(s.actors[s.active].y-stand.y)<34 then
   f.storyBook={title=spec.title,story=spec.story,caption=spec.caption}
  end
 end
end

return B
