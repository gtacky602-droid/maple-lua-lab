return function(C)
 local detour={}
 local restCues={
  biscuit={notes={72,76},label='焼き菓子を分ける'},
  chime={notes={72,76,79},label='海辺の風鈴'},
  tea={notes={76,72},label='香草茶でひと休み'},
 }

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function position(s,x)
  return x-s.camera
 end

 function detour.drawGift(layer,x,y,id,mode,profile)
  local draws=layer.draws
  rect(draws,x-30,y-25,60,10,'#674d52')
  rect(draws,x-28,y-25,56,3,'#a98260')
  rect(draws,x-24,y-15,4,15,'#594451')
  rect(draws,x+20,y-15,4,15,'#594451')
  C.drawFieldDisplayArt(layer,C.coastalGifts[id],x,y-25,35,mode,profile,false)
 end

 function detour.rest(s,q,state,emitCue)
  local gift=state.storyChoice
  s.storyNotice=q.detourLines[gift]
  for _,actor in ipairs(s.actors) do
   if actor.hp>0 then actor.hp=actor.maxhp end
  end
  local cue=restCues[gift]
  emitCue(s,'resonance',cue.notes,cue.label)
 end

 function detour.observe(s,f,layer,scene,q,mode,profile)
  local draws=layer.draws
  local state=s.story.quests[q.id]
  if scene.meeting then
   local main=s.story.quests[q.opensAfter]
   if not main or main.count<scene.meeting then return end
  elseif not state or state.count<scene.count then return end
  local x=position(s,scene.x)
  if x < -150 or x > 1110 then return end
  if s.companion~='columbina' and (not state or state.status~='complete') then
   C.drawCompanionArt(layer,s,{x=scene.x,y=scene.y,dir=-1},mode,profile,'columbina')
   draws[#draws+1]={kind='text',x=x,y=scene.y-115,text='コロンビーナ',size=14,color='#e6dfff'}
  end
  if scene.bench then
   local seat=scene.bench
   local bx,by=position(s,seat.x),seat.y
   rect(draws,bx-60,by-20,120,10,'#685054')
   rect(draws,bx-60,by-23,120,5,'#c5a07c')
   rect(draws,bx-48,by-11,9,11,'#52394c')
   rect(draws,bx+39,by-11,9,11,'#52394c')
   local id=state.storyChoice
   local art=C.coastalGifts[id]
   if not art then return end
   local hanging=id=='chime'
   local gx,gy=bx+47,by-23
   if hanging then
    rect(draws,bx+66,by-76,5,76,'#6e585b')
    rect(draws,bx+36,by-76,35,5,'#b49371')
    gx,gy=bx+44+math.floor(math.sin((s.t-s.storyEnteredAt)*2.1)*3),by-37
   end
   C.drawFieldDisplayArt(layer,art,gx,gy,35,mode,profile,false)
   f.coastDetourRest={gift=id,rested=state.count>=4}
  end
 end

 return detour
end
