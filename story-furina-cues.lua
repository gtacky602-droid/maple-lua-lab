return function(C,canInspect)
 local rehearsal={}
 local sequence={'curtain','lamp','wave'}
 local labels={curtain='幕を上げる',lamp='照明をつける',wave='波を出す',pair='光と幕を合わせる'}
 local quiet='フリーナ「この静けさも、舞台の一部なんだ。」'

 local function current(s,q,state)
  local step=state and state.status=='active' and q.itinerary[state.count+1]
  if step and step.rehearsalCue and s.story.node==step.node
      and canInspect(s.actors[s.active],step) then return step end
 end

 function rehearsal.open(s,step)
  s.furinaRun={round=step.rehearsalCue,next=1,started=s.t}
 end

 local function status(s,spec,run)
  if run.round==1 then
   local cue=sequence[run.next]
   return cue,'合図 ｜ '..labels[cue],true
  end
  if not run.curtainAt then
   if s.t-run.started<spec.quietSeconds then
    return 'pair',run.early and 'まだ台詞のあとです。一拍待ちましょう。' or quiet,false
   end
   return 'pair','合図 ｜ 光と幕を同時に動かす',true
  end
  if s.t-run.curtainAt<spec.waveDelay then
   return 'wave',run.early and '波は次の合図。光と幕はそろっています。' or '光と幕がそろいました。',false
  end
  return 'wave','合図 ｜ 波を出す',true
 end

 function rehearsal.action(s,q,state,command)
  if command=='close' then s.furinaRun=nil;return end
  local run=s.furinaRun
  if s.paused or not run then return end
  local step=current(s,q,state)
  if not step or step.rehearsalCue~=run.round then return end
  local cue,_,ready=status(s,q.rehearsal,run)
  if command~='next' and command~=cue then return end
  if not ready then run.early=true;return end
  run.early=nil
  if cue=='curtain' or cue=='pair' then run.curtainAt=s.t end
  if cue=='lamp' or cue=='pair' then run.lamp=true end
  if cue=='wave' then
   s.furinaRun=nil
   return step
  end
  run.next=run.next+1
 end

 local function art(layer,s,sprite,placement,height,mode,profile,rise)
  local x=placement.x-s.camera
  local half=height*sprite.box[3]/sprite.box[4]/2
  if x+half>=0 and x-half<=960 then
   C.drawFieldDisplayArt(layer,sprite,x,placement.y-(rise or 0),height,mode,profile,false)
  end
 end

 local function text(draws,s,place,y,label)
  local x=place.x-s.camera
  if x>=-50 and x<=1010 then
   draws[#draws+1]={kind='text',x=x,y=y,text=label,size=14,color='#fff0b9'}
  end
 end

 function rehearsal.observe(f,s,layer,q,state,mode,profile)
  local draws=layer.draws
  if not state then return end
  local spec,run=q.rehearsal,s.furinaRun
  local done=state.count>=2 and not run
  local raised=done and 1 or (run and run.curtainAt and math.min(1,(s.t-run.curtainAt)/.7)) or 0
  local lit=done or run and run.lamp==true or false
  if lit then
   local x=spec.lamp.x-s.camera
   if x>=-200 and x<=1050 then
    draws[#draws+1]={kind='rect',x=x-5,y=326,w=238,h=107,color='#ffe4a330'}
    draws[#draws+1]={kind='rect',x=x+28,y=345,w=193,h=69,color='#ffe8ac38'}
   end
  end
  art(layer,s,C.furinaCueArt.console,spec.console,83,mode,profile)
  art(layer,s,C.furinaCueArt.lamp,spec.lamp,89,mode,profile)
  art(layer,s,C.furinaCueArt.curtain,spec.curtain,170,mode,profile,raised*131)
  art(layer,s,C.colleiGuideArt.guest,spec.crew,91,mode,profile)
  text(draws,s,spec.crew,spec.crew.y-104,'舞台係')
  if done then art(layer,s,C.stageWaveArt,spec.wave,113,mode,profile) end
  if state.count>=3 then text(draws,s,spec.wave,spec.wave.y-127,'拍手は、裏方のみんなへ') end
  f.storyFurinaRehearsal={curtain=raised>0 or (run and run.curtainAt~=nil) or false,
                         light=lit,wave=done,message=s.storyNotice}
  if run and current(s,q,state) then
   local cue,message,ready=status(s,spec,run)
   local view=f.storyFurinaRehearsal
   view.open,view.round,view.cue,view.ready,view.message=true,run.round,cue,ready,message
   view.paused=s.paused
   if not s.paused and not f.storyNearbyMilestone then
    f.storyNearbyMilestone={label=labels[cue]}
   end
  end
 end

 return rehearsal
end
