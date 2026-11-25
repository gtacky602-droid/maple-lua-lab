return function(C,canInspect)
 local rumor={}
 local display={
  glint={text='光る石',witness='boatkeeper',height=84},
  little={text='月のような石',witness='courier',height=82},
  stolen={text='月から取った石',witness='painter',height=83},
 }

 local function title(q,state)
  if not state.storyChoice then return end
  for _,option in ipairs(q.itinerary[q.goal].choices) do
   if option.id==state.storyChoice then return option.name end
  end
 end

 local function caption(draws,x,y,text,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,color=color,size=14}
 end

 local function art(layer,key,x,y,height,mode,profile)
  C.drawFieldDisplayArt(layer,C.rumorArt[key],x,y,height,mode,profile,false)
 end

 function rumor.read(s,q,state)
  if not state then return false end
  local a=s.actors[s.active]
  if state.status=='complete' and canInspect(a,q.rumorNotice) then
   s.storyNotice='冒険談『'..title(q,state)..'』。月明かりを返したのは、波止場で拾った小さな石。'
   return true
  end
  for index,step in ipairs(q.itinerary) do
   if index>state.count then break end
   if step.rumorBoard and canInspect(a,step) then
    s.storyNotice=step.notice
    return true
   end
  end
  return false
 end

 function rumor.observe(s,f,layer,q,state,mode,profile)
  local draws=layer.draws
  if not state then return end
  local a=s.actors[s.active]
  local published=state.status=='complete' and title(q,state) or nil
  local message
  local heard={}
  for index,step in ipairs(q.itinerary) do
   if step.rumorBoard and index<=state.count+1 then
    local x=step.x-s.camera
    local read=index<=state.count
    local board=display[step.rumorBoard]
    if read then heard[#heard+1]=board.text end
    if x>=-116 and x<=1076 then
     art(layer,board.witness,x-52,step.y,board.height,mode,profile)
     art(layer,step.rumorBoard,x+24,step.y,88,mode,profile)
     caption(draws,x-52,step.y-103,step.name,'#ffe5ac')
     if read then caption(draws,x+40,step.y-119,board.text,'#c6f9df') end
    end
    if read and not s.paused and canInspect(a,step) then
     f.storyNearbyMilestone={label=step.name..'の話を聞き直す'}
     message=step.notice
    end
   end
  end
  if published then
   local notice=q.rumorNotice
   local x=notice.x-s.camera
   if x>=-120 and x<=1080 then
    art(layer,'little',x,notice.y,112,mode,profile)
    caption(draws,x,notice.y-135,'冒険談『'..published..'』','#ffdf97')
   end
   if not s.paused and canInspect(a,notice) then
    f.storyNearbyMilestone={label='冒険談『'..published..'』を読む'}
    message='ネフェルの掲示 ｜ '..published
   end
  end
  if not message and #heard>0 then message=table.concat(heard,' → ') end
  f.storyRumor={heard=#heard,published=published,message=message}
 end

 local harborDesk={x=710,y=390}
 local pages={
  {'nod-first-treasure','最初の聞き込み','月映しの浅瀬で','証言を追って海岸へ。反射板を合わせると、水面に足場が現れた。','nod-moon-shallows','rumorArt','glint'},
  {'nod-moon-crossroads','岩窟への道','箱の下に見えた脚','林と海岸の道は入江で合流する。','nod-box-inlet','patrolArt','lantern'},
  {'nod-moon-vault-quest','歩く宝箱','月殻の大ヤドカニ','動いていたのは金属箱を背にした大ヤドカニ。探検家が残した素材庫は、その先の岩窟にあった。','nod-moon-vault','moonCrabArt','idle'},
  {'columbina-coast-detour','海辺の寄り道','コロンビーナと休んだ席','海を眺める腰掛けに、夜店で選んだ品が残っている。','nod-far-sea-bench','coastalGifts','chime'},
  {'nod-treasure-appraisal','工房の小灯り','アイノとイネファの仕分け','部品に向かない月形板にも、灯りを飾る使い道が見つかった。','nod-appraisal-workshop','appraisalArt','lamp'},
  {'nod-moon-rumor','波止場の冒険談','ネフェルの掲示','舟守、運び屋、絵描きと伝わるうちに、光る小石は「月から取った石」になった。反射板を向けると、光ったのは石の縁だけだった。','nod-rumor-quay','rumorArt','little'},
  {'nod-moon-bloom','月下の花見','ラウマと見つけた席','前列には先客の動物たち。岩棚の上から、月花の内側の金色が見えた。','nod-bloom-grove','bloomArt','overhead'},
  {'nod-lantern-patrol','灯台守の茶卓','フリンズと夜道を一周','高台を経由して曲がり角の安全を確かめた。帰ると小屋には温かいお茶と焼き菓子があった。','nod-patrol-cabin','patrolArt','tea'},
 }

 local function chosen(q,state)
  if not state.storyChoice then return end
  for _,step in ipairs(q.itinerary) do
   for _,choice in ipairs(step.choices or {}) do
    if choice.id==state.storyChoice then return choice.name end
   end
  end
 end

 function rumor.harbor(s,f,layer,quests,mode,profile)
  local first=s.story.quests['nod-first-treasure']
  if not first or first.status~='complete' then return end
  local x=harborDesk.x-s.camera
  if x< -110 or x>1070 then return end
  C.drawFieldDisplayArt(layer,C.rumorArt.glint,x,390,77,mode,profile,false)
  C.drawFieldDisplayArt(layer,C.patrolArt.lantern,x-77,390,54,mode,profile,false)
  C.drawFieldDisplayArt(layer,C.patrolArt.lantern,x+77,390,54,mode,profile,false)
  caption(layer.draws,x,290,'港の旅日誌','#ffedc2')
  if not canInspect(s.actors[s.active],harborDesk) then return end
  local entries={}
  for _,page in ipairs(pages) do
   local record=s.story.quests[page[1]]
   if record and record.status=='complete' then
    local detail=chosen(quests[page[1]],record)
    local image=C[page[6]][page[7]]
    local headline=page[3]
    if page[1]=='nod-moon-crossroads' then
     local walked={}
     for _,path in ipairs(quests[page[1]].paths) do
      local saved=record.pathProgress and record.pathProgress[path.id]
      if saved and saved.count>=#path.steps then walked[#walked+1]=path.id=='wood' and '林の迂回路' or '海岸の旧道' end
     end
     if #walked>0 then detail='通った道　'..table.concat(walked,'・') end
    elseif page[1]=='columbina-coast-detour' then
     image=C.coastalGifts[record.storyChoice] or image
    elseif page[1]=='nod-moon-rumor' and detail then
     headline,detail=detail,nil
    end
    entries[#entries+1]={id=page[1],tab=page[2],title=headline,text=page[4],choice=detail,
       node=page[5],source=image.source,box=image.box}
   end
  end
  f.storyHarborBook=entries
 end

 return rumor
end
