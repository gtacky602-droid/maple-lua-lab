return function(C)
 local L={}

 local function near(s,item)
  local a=s.actors[s.active]
  return a.hp>0 and math.abs(a.x-item.x)<55 and math.abs(a.y-item.y)<34
 end

 local function sites(s,q,state)
  local spec=q.lantern
  if state.status~='active' then return {} end
  if state.count==0 and s.story.node==q.hub then return {spec.scene} end
  if state.count>=1 and state.count<=3 and s.story.node==spec.trail then
   local seen={}
   for _,clue in ipairs(spec.clues) do
    if not state.lantern.inspected[clue.id] then seen[#seen+1]=clue end
   end
   return seen
  end
  if s.story.node==q.target then
   if state.count==4 then return spec.lanterns end
   if state.count==5 then return {spec.guest} end
  end
  return {}
 end

 function L.nearby(s,q,state)
  for _,item in ipairs(sites(s,q,state)) do if near(s,item) then return item end end
 end

 function L.inspect(s,q,state,item)
  if state.count==0 then
   state.count=1
   s.storyNotice='綾華「……今、動きましたよね？ 城下の広場から、小径へ追ってみましょう。」'
  elseif state.count<=3 then
   state.lantern.inspected[item.id]=true
   state.count=state.count+1
   s.storyNotice=item.line
  elseif state.count==4 then
   if not item.leaf then
    s.storyNotice='火は揺れていますが、葉っぱは見当たりません。'
    return
   end
   state.count=5
   s.danukiDanceAt=s.t
   s.storyNotice='葉っぱがくるりと回り、灯籠が化け狸に戻りました。'
  elseif state.count==5 then
   state.count=q.goal
   s.storyNotice='狸が踊りながら、「鳥居・大灯籠・海」を描いた紙を渡してくれました。'
  end
 end

 function L.step(s,q,state,dt)
  if s.paused or s.story.node~=q.hub or state.status~='active' or state.count~=0 then return end
  local a=s.actors[s.active]
  local x=s.portLanternX or q.lantern.scene.startX
  local dx=x-a.x
  if a.hp>0 and a.y>445 and math.abs(a.x-q.lantern.scene.x)<220 and dx*a.dir<0 then
   local distance=math.min(math.max(0,math.abs(dx)-76),dt*44)
   s.portLanternX=x+(dx<0 and distance or -distance)
  end
 end

 local function rect(boxes,x,y,w,h,color)
  boxes[#boxes+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function drawLantern(boxes,x,y)
  rect(boxes,x-15,y-40,30,37,'#594544')
  rect(boxes,x-11,y-36,22,28,'#c07b55')
  rect(boxes,x-8,y-32,16,18,'#f6cf81')
  rect(boxes,x-2,y-32,4,18,'#ffdf9a')
  rect(boxes,x-18,y-44,36,5,'#4b3e43')
  rect(boxes,x-17,y-4,34,4,'#4b3e43')
 end

 local function drawClue(boxes,item,x,y,t)
  if item.id=='box-leaf' then
   rect(boxes,x-16,y-18,32,18,'#79563d')
   rect(boxes,x-13,y-14,26,4,'#bc915b')
   rect(boxes,x+2,y-24,13,6,'#8fc074')
  elseif item.id=='stone-shadow' then
   rect(boxes,x-15,y-28,23,28,'#6b6872')
   rect(boxes,x-11,y-38,14,11,'#92909b')
   rect(boxes,x+7+math.sin(t*4)*5,y-4,20,4,'#423f58')
  else
   rect(boxes,x-12,y-7,8,7,'#aa7958')
   rect(boxes,x,y-11,9,10,'#c79666')
   rect(boxes,x+11,y-5,6,5,'#bf8d58')
  end
 end

 function L.observe(s,f,boxes,q,state,mode,profile)
  local spec=q.lantern
  local item=not s.paused and L.nearby(s,q,state)
  if item then
   local label=item.name and item.name..'を調べる' or '綾華に話しかける'
   if item==spec.guest then label='化け狸から絵を受け取る' end
   f.storyNearbyLantern={id=item.id,label=label}
  end
  local c=s.camera
  if s.story.node==q.hub and state.count==0 then
   local scene=spec.scene
   local x=s.portLanternX or scene.startX
   drawLantern(boxes,x-c,scene.y)
   f.storyPortLanternX=x
   if s.companion~='ayaka' then
    C.drawCompanionArt({draws=boxes},s,{x=scene.guideX,y=scene.y,dir=-1},mode,profile,'ayaka')
    boxes[#boxes+1]={kind='text',x=scene.guideX-c,y=scene.y-94,text='綾華',size=14,color='#ffe7a2'}
   end
  elseif s.story.node==spec.trail then
   for _,clue in ipairs(sites(s,q,state)) do drawClue(boxes,clue,clue.x-c,clue.y,s.t) end
  elseif s.story.node==q.target and state.count>=4 then
   for _,prop in ipairs(spec.lanterns) do
    if not prop.leaf or state.count==4 then drawLantern(boxes,prop.x-c,prop.y) end
    if prop.leaf and state.count==4 then
     local t=s.t%1.4/1.4
     rect(boxes,prop.x-c+13+math.sin(t*6)*3,prop.y-35+t*32,10,5,'#96c86b')
    end
   end
   if state.count>=5 then
    local guest=spec.guest
    local beat=s.danukiDanceAt and math.max(0,2.6-(s.t-s.danukiDanceAt))
    local bob=beat and beat>0 and math.abs(math.sin(beat*8))*8 or 0
    C.drawDanukiArt({draws=boxes},guest.x-c,guest.y-bob,mode,profile)
    f.storyDanuki={x=guest.x,y=guest.y-bob}
   end
  end
  if state.count==q.goal then f.storyLanternNote={smile=state.status=='complete'} end
 end

 return L
end
