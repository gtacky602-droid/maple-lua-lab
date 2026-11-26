return function(C,canInspect)
 local magic={}
 local lines={
  wheel='箱が舞台裏を進んでいます。',
  wait='リネットの合図灯が点くのを待ちます。',
  early='合図の前です。灯りが点くまで待てます。',
  curtain='合図 ｜ 二重の幕を開ける',
  light='合図 ｜ 逆光を切り替える',
  play='幕の向こうで演目が始まりました。',
  reveal='幕を抜けたのは、金色の折り鳥でした。',
 }

 local function chapterReady(s)
  local chapter=s.story.quests['fontaine-grand-finale']
  return chapter and chapter.count>=6
 end

 local function chapterElapsed(s,spec)
  if not s.theaterPerformedAt then return end
  local elapsed=s.t-s.theaterPerformedAt-spec.chapterLead
  if elapsed>=0 and elapsed<spec.duration then return elapsed end
 end

 function magic.start(s,q,state,step)
  local cue=step.magicCue
  local run=s.lyneyRun
  if not run then
   run={kind=cue,entered=s.t}
   if cue~='support' then run.started=s.t end
   s.lyneyRun=run
   return
  end
  if cue~='support' or run.kind~=cue or run.started then return end
  if s.t-run.entered<q.pocketMagic.cueDelay then run.early=true;return end
  if state.storyChoice then run.started=s.t end
 end

 function magic.replay(s,scene,q,state)
  if not scene or not state or state.status~='complete' or not state.storyChoice or not scene.desk
      or not canInspect(s.actors[s.active],scene.desk) then return false end
  if scene.role=='finale' then
   if not chapterReady(s) then return false end
   if chapterElapsed(s,q.pocketMagic) then return true end
  end
  if not s.lyneyRun then s.lyneyRun={kind='replay',started=s.t} end
  return true
 end

 function magic.step(s,q,state)
  local run=s.lyneyRun
  if not (run and run.started) then return end
  local spec=q.pocketMagic
  local duration=run.kind=='wheel' and spec.wheelTime or spec.duration
  if s.t-run.started<duration then return end
  s.lyneyRun=nil
  local step=state and state.status=='active' and q.itinerary[state.count+1]
  if step and step.magicCue==run.kind then return step end
  s.storyNotice='金色の折り鳥を見送りました。'
 end

 local function art(layer,s,sprite,x,y,height,mode,profile,flip)
  x=x-s.camera
  local half=height*sprite.box[3]/sprite.box[4]/2
  if x+half>=0 and x-half<=960 then
   C.drawFieldDisplayArt(layer,sprite,x,y,height,mode,profile,flip)
  end
 end

 local function box(draws,s,x,y,w,h,color)
  x=x-s.camera
  if x+w>=0 and x<=960 then draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color} end
 end

 local function label(draws,s,x,y,text,color)
  x=x-s.camera
  if x>=-40 and x<=1000 then
   draws[#draws+1]={kind='text',x=x,y=y,text=text,color=color or '#ffeeae',size=14}
  end
 end

 function magic.choice(layer,s,option,mode,profile)
  local sprite=option.id=='curtain' and C.furinaCueArt.curtain or C.furinaCueArt.lamp
  art(layer,s,sprite,option.x,option.y,74,mode,profile,false)
 end

 local function sceneStage(layer,s,scene,spec,variant,elapsed,mode,profile)
  local draws=layer.draws
  local showing=elapsed and elapsed>=spec.reveal
  local x,y=scene.x,scene.y
  if variant=='light' then
   art(layer,s,C.lyneyMagicArt.screen,x,y,151,mode,profile,false)
   if elapsed then
    local lit=showing and '#fff1ac5c' or '#8cb8b464'
    box(draws,s,x-52,y-137,104,110,lit)
    if not showing and elapsed>.35 then
     box(draws,s,x-22,y-86,39,25,'#20334a')
     box(draws,s,x-7,y-105,14,19,'#20334a')
    end
   end
  else
   local rise=elapsed and math.min(1,elapsed/.8)*100 or 0
   art(layer,s,C.furinaCueArt.curtain,x-30,y-rise,154,mode,profile,false)
   if variant=='curtain' then
    local rearRise=elapsed and math.min(1,math.max(0,elapsed-.52)/.6)*97 or 0
    art(layer,s,C.furinaCueArt.curtain,x+34,y-rearRise,116,mode,profile,true)
   end
  end
  if showing then
   local flow=math.min(1,(elapsed-spec.reveal)/(spec.duration-spec.reveal))
   art(layer,s,C.lyneyMagicArt.birds,x-42+flow*160,y-106-flow*107,114,mode,profile,false)
   label(draws,s,x+48,y-251,'金色の折り鳥')
  end
  return showing==true
 end

 function magic.observe(f,s,layer,scene,q,state,mode,profile)
  local draws=layer.draws
  if not state then return end
  local spec=q.pocketMagic
  local wings=scene.role=='wings'
  if scene.role=='finale' and (state.status~='complete' or not state.storyChoice or not chapterReady(s)) then return end
  local run=s.lyneyRun
  local elapsed=run and run.started and s.t-run.started
  local chapter=false
  if scene.role=='finale' and not run then
   elapsed=chapterElapsed(s,spec)
   chapter=elapsed~=nil
  end

  if wings then
   local x=state.count>=4 and spec.cartStop or spec.cartFrom
   if run and run.kind=='wheel' and elapsed then
    x=spec.cartFrom+(spec.cartStop-spec.cartFrom)*math.min(1,elapsed/spec.wheelTime)
   end
   local sprite=state.count>=4 and C.lyneyMagicArt.broken or C.lyneyMagicArt.cart
   box(draws,s,spec.cartFrom-43,477,spec.cartStop-spec.cartFrom+86,3,'#b6a98c')
   art(layer,s,sprite,x,480,88,mode,profile,false)
   if state.count>=4 then label(draws,s,x,378,'車輪故障・使用中止') end
   if state.count<=2 then
    label(draws,s,553,356,'客席から見えない通路')
   end
   if state.count>=5 and state.storyChoice then
    magic.choice(layer,s,{id=state.storyChoice,x=1179,y=480},mode,profile)
   end
  elseif scene.desk then
   local desk=scene.desk
   art(layer,s,C.furinaCueArt.console,desk.x,desk.y,66,mode,profile,false)
   if state.status=='complete' then
    label(draws,s,desk.x,desk.y-80,scene.role=='finale' and '追加演目' or '客席から再演')
    if not run and not chapter and not s.paused and canInspect(s.actors[s.active],desk) then
     f.storyNearbyMilestone={label=scene.role=='finale' and '主舞台の追加演目を見る' or '客席からもう一度見る'}
    end
   end
  end

  local birds=false
  local runningShow=chapter or (run and run.started and run.kind~='wheel')
  if (not wings or state.count>=5) and (scene.role~='finale' or runningShow) then
   birds=sceneStage(layer,s,scene,spec,state.storyChoice,runningShow and elapsed,mode,profile)
  end
  local phase,note
  if run and run.kind=='wheel' then phase,note='wheel',lines.wheel
  elseif run and not run.started then
   local ready=s.t-run.entered>=spec.cueDelay
   local console=q.itinerary[state.count+1]
   box(draws,s,console.x-14,console.y-119,28,20,'#594137')
   box(draws,s,console.x-9,console.y-114,18,10,ready and '#a4e8ae' or '#c09361')
   label(draws,s,console.x,console.y-128,ready and '合図' or '待機')
   phase=ready and 'cue' or 'wait'
   note=ready and lines[state.storyChoice] or (run.early and lines.early or lines.wait)
   if not s.paused then
    f.storyNearbyMilestone={label=ready and (state.storyChoice=='curtain' and '合図に合わせて幕を開ける'
                          or '合図に合わせて逆光を切り替える') or '合図を待つ'}
   end
  elseif runningShow then phase,note=birds and 'reveal' or 'show',birds and lines.reveal or lines.play
  else
   phase='idle'
   if scene.role~='finale' then note=s.storyNotice end
  end
  f.storyLyneyMagic={role=scene.role,phase=phase,variant=state.storyChoice,cartVisible=wings,
                     birds=birds,chapter=chapter,message=note}
 end

 return magic
end
