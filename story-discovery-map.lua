return function(C,canInspect)
 local discoveries={}

 local function known(s,state,card)
  if not card.evidence then return state.discoveryDew==true end
  local evidence=s.story.quests[card.evidence.quest]
  return evidence and evidence.count>=card.evidence.count or false
 end

 local function counts(draft)
  local selected,described=0,0
  for _,method in pairs(draft or {}) do
   selected=selected+1
   if method~='' then described=described+1 end
  end
  return selected,described
 end

 function discoveries.open(s)
  s.nahidaMapOpen=true
 end

 function discoveries.collect(s,q,state)
  if not state or state.count<1 then return false end
  local site=q.discoveryMap.site
  local actor=s.actors[s.active]
  if s.story.node==site.node and canInspect(actor,site) then
   if state.status=='active' and state.count<q.goal then state.discoveryDew=true end
   s.storyNotice='根の段にある葉に、森の色を映した朝露が残っていました。'
   return true
  end
  if s.story.node==q.hub and state.count==q.goal and canInspect(actor,q.itinerary[2]) then
   discoveries.open(s)
   return true
  end
  return false
 end

 function discoveries.action(s,q,state,key)
  if key=='story_discovery_close' then s.nahidaMapOpen=nil;return end
  if not s.nahidaMapOpen or s.paused or not state or state.status~='active' then return end
  local step=q.itinerary[state.count+1]
  if not step or not step.discoveryBoard or step.node~=s.story.node
      or not canInspect(s.actors[s.active],step) then return end

  local draft=state.discoveryDraft or {}
  local selected,described=counts(draft)
  if key=='story_discovery_confirm' then
   if described==3 then s.nahidaMapOpen=nil;return step end
   return
  end

  local pick=key:match('^story_discovery_pick:(%a+)$')
  local target,method=key:match('^story_discovery_method:(%a+):(%a+)$')
  for _,card in ipairs(q.discoveryMap.cards) do
   if card.id==pick and known(s,state,card) then
    if draft[pick]~=nil then draft[pick]=nil
    elseif selected<3 then draft[pick]='' end
    state.discoveryDraft=next(draft) and draft or nil
    return
   elseif card.id==target and draft[target]~=nil then
    for _,choice in ipairs(card.methods) do
     if choice.id==method then draft[target]=method;return end
    end
   end
  end
 end

 local function display(f,s,sprite,prop,height,mode,profile)
  local x=prop.x-s.camera
  local halfWidth=height*sprite.box[3]/sprite.box[4]/2
  if x+halfWidth>=0 and x-halfWidth<=960 then
   C.drawFieldDisplayArt(f,sprite,x,prop.y,height,mode,profile,false)
  end
 end

 local function hint(f,s,prop,label)
  if not f.storyNearbyMilestone and not s.paused and canInspect(s.actors[s.active],prop) then
   f.storyNearbyMilestone={label=label}
  end
 end

 function discoveries.observe(f,s,q,state,mode,profile)
  if not state then return end
  local site=q.discoveryMap.site
  if s.story.node==site.node then
   display(f,s,C.nahidaMapArt.dew,site,57,mode,profile)
   hint(f,s,site,'葉の上の朝露を調べる')
   f.storyNahidaDiscovery={message=s.storyNotice or '根の段に跳び上がって、葉を調べましょう。'}
   return
  end

  local board=q.itinerary[2]
  display(f,s,C.nahidaMapArt.board,board,105,mode,profile)
  local readOnly=state.count==q.goal
  local posted=state.status=='complete'
  if posted then
   display(f,s,C.colleiGuideArt.guest,{x=1130,y=board.y},98,mode,profile)
  end
  if readOnly then
   hint(f,s,board,posted and '広場に掲示した絵地図を読む' or '記録した絵地図を読む')
  end
  if canInspect(s.actors[s.active],board) then
   f.storyNahidaDiscovery={message=s.storyNotice}
  end
  if not s.nahidaMapOpen or s.paused then return end

  local draft=state.discoveryDraft or {}
  local selected,described=counts(draft)
  local cards={}
  for _,card in ipairs(q.discoveryMap.cards) do
   if not readOnly or draft[card.id]~=nil then
    local sprite=C.nahidaMapArt[card.id]
    cards[#cards+1]={id=card.id,label=card.label,where=card.where,x=card.x,y=card.y,
       hint=card.hint,known=known(s,state,card),methods=card.methods,method=draft[card.id],
       source=sprite.source,box=sprite.box}
   end
  end
  f.storyDiscoveryMap={cards=cards,selected=selected,described=described,ready=described==3,
                       readOnly=readOnly,posted=posted}
 end

 return discoveries
end
