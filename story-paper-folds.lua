return function(canInspect)
 local paper={}

 local function removeFolds(shapes)
  for i=#(shapes or {}),1,-1 do
   if shapes[i].paperFold then table.remove(shapes,i) end
  end
 end

 function paper.reset(s)
  removeFolds(s.platforms)
  removeFolds(s.solids)
  s.paperChoices,s.paperGift=nil,nil
 end

 local function addShape(shapes,shape,preview)
  local copy={paperFold=true,paperPreview=preview}
  for key,value in pairs(shape) do copy[key]=value end
  shapes[#shapes+1]=copy
 end

 local function build(s,board,locked)
  removeFolds(s.platforms)
  removeFolds(s.solids)
  for i,panel in ipairs(board.panels) do
   local index=locked and panel.correct or (s.paperChoices and s.paperChoices[i]) or panel.initial
   local form=panel.forms[index]
   if form then
    for _,p in ipairs(form.platforms or {}) do addShape(s.platforms,p,not locked) end
    if form.wall then
     s.solids=s.solids or {}
     addShape(s.solids,form.wall,not locked)
    end
   end
  end
 end

 function paper.install(s,board)
  s.paperChoices=nil
  build(s,board,true)
 end

 local function nearPanel(s,board)
  for i,panel in ipairs(board.panels) do
   if canInspect(s.actors[s.active],panel) then return i,panel end
  end
 end

 function paper.adjust(s,board,command)
  local index,panel=nearPanel(s,board)
  if not panel then return false,false end
  if command=='rotate' then
   s.paperChoices=s.paperChoices or {}
   local nextChoice=((s.paperChoices[index] or panel.initial or 0)%#panel.forms)+1
   s.paperChoices[index]=nextChoice
   build(s,board,false)
   s.storyNotice=panel.forms[nextChoice].line
  elseif command=='paper_confirm' then
   for i,item in ipairs(board.panels) do
    if not s.paperChoices or s.paperChoices[i]~=item.correct then
     s.storyNotice=board.tryAgain
     return true,false
    end
   end
   return true,true
  end
  return true,false
 end

 function paper.gift(s,item,command)
  local gifts=item.paperSouvenir
  if command=='rotate' then s.paperGift=(s.paperGift or 0)%#gifts+1 end
  if command=='paper_confirm' then
   local selected=gifts[s.paperGift]
   if selected then s.paperGift=nil;return selected.id end
   s.storyNotice='Gで持ち帰る飾りを選んでください。'
  end
 end

 function paper.giftLabel(q,state)
  for _,step in ipairs(q.itinerary) do
   for _,gift in ipairs(step.paperSouvenir or {}) do
    if gift.id==state.paperSouvenir then return gift.label end
   end
  end
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 function paper.drawBook(draws,x,y,recorded)
  rect(draws,x-17,y-21,34,21,'#5b5974')
  rect(draws,x-31,y-37,62,19,'#835b87')
  rect(draws,x-27,y-40,25,15,'#f3ddba')
  rect(draws,x+2,y-44,25,15,'#e8cae1')
  rect(draws,x-1,y-43,3,21,'#a48d93')
  rect(draws,x+7,y-38,14,4,recorded and '#76a49f' or '#bb91b6')
 end
 local souvenirs={
  bird={color='#efc7df',rows={'  #    ','  ## # ',' ######','#### # ','  ##   '}},
  boat={color='#95dedc',rows={'   #   ','  ##   ','  ###  ','#######',' ##### '}},
  lantern={color='#f0c979',rows={'  ###  ',' ##### ',' ##### ',' ##### ','  ###  '}}
 }
 function paper.drawSouvenir(draws,x,y,id)
  local gift=souvenirs[id]
  if not gift then return end
  rect(draws,x-18,y-17,36,17,'#695b74')
  rect(draws,x-21,y-18,42,4,'#b48b93')
  for row,line in ipairs(gift.rows) do
   for i=1,#line do
    if line:sub(i,i)=='#' then rect(draws,x-14+(i-1)*4,y-38+(row-1)*4,4,4,gift.color) end
   end
  end
 end

 function paper.observe(s,f,draws,board,step,locked)
  for i,panel in ipairs(board.panels) do
   local x,y=panel.x-s.camera,panel.y
   if x>=-70 and x<=1030 then
    local index=locked and panel.correct or (s.paperChoices and s.paperChoices[i]) or panel.initial
    rect(draws,x-25,y-25,50,25,'#675770')
    rect(draws,x-21,y-41,42,16,panel.color)
    if index then rect(draws,x-15+10*(index-1),y-37,7,7,'#fff3c7') end
    draws[#draws+1]={kind='text',x=x,y=y-52,text=panel.name,color='#fff3c7',size=14}
   end
  end
  for _,wall in ipairs(s.solids or {}) do
   if wall.paperFold then
    local x=wall.x-s.camera
    rect(draws,x,wall.y,wall.w,wall.h,'#7d8881')
    rect(draws,x+2,wall.y+2,wall.w-4,wall.h-5,'#ced2ae')
   end
  end
  if not step or not step.paperFold or s.paused then return end
  local i,panel=nearPanel(s,board)
  if not panel then return end
  local index=(s.paperChoices and s.paperChoices[i]) or panel.initial
  local form=panel.forms[index]
  f.storyNearbyMilestone={label=panel.name..'の折り方を変える'}
  f.storyPaper={title=panel.name,choice=form and form.label or '未調整',
                line=form and form.line or panel.hint,confirm=board.confirm}
 end

 function paper.observeGift(s,f,item)
  local selected=item.paperSouvenir[s.paperGift]
  f.storyPaper={title='持ち帰る折り紙飾り',choice=selected and selected.label or '未選択',
                line=selected and selected.line,confirm='この飾りを持ち帰る'}
 end

 function paper.rescue(s,anchor)
  for i,a in ipairs(s.actors) do
   if a.y>650 then
    a.x,a.y,a.vy,a.ground=anchor.x-(i-1)*40,anchor.y,0,true
    a.dash,a.drop,a.glide,a.buffer=0,0,0,0
    if a.id==s.active then
     s.storyNotice=anchor.notice or '紙の谷から手前の足場に戻りました。'
     s.camera=math.max(0,math.min(a.x-400,s.worldwidth-960))
    end
   end
  end
 end

 return paper
end
