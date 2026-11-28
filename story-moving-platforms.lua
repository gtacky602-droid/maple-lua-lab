return function(C)
 local platforms={}

 local function cycle(spec,elapsed)
  local duration=spec.travel
  local stop=spec.hold
  local length=2*(duration+stop)
  local t=elapsed%length
  if t<stop then return spec.left,0,stop-t,0,stop+duration-t end
  if t<stop+duration then return spec.left+(spec.right-spec.left)*(t-stop)/duration,1,0,length-t,stop+duration-t end
  if t<2*stop+duration then return spec.right,0,2*stop+duration-t,length-t,0 end
  return spec.right-(spec.right-spec.left)*(t-2*stop-duration)/duration,-1,0,length-t,length+stop+duration-t
 end

 function platforms.enter(s,river)
  s.riverTurnAt=nil
  s.riverDecks=nil
  if not river then return end
  s.riverDecks={}
  for _,spec in ipairs(river.decks) do
   local x,direction,dockSeconds,left,right=cycle(spec,spec.offset or 0)
   local p={x=x,y=spec.y,w=spec.w,riverDeck=true}
   s.riverDecks[#s.riverDecks+1]={spec=spec,platform=p,direction=direction,dockSeconds=dockSeconds,left=left,right=right}
   s.platforms[#s.platforms+1]=p
  end
 end

 function platforms.move(s,dt)
  if not s.riverDecks or s.paused then return end
  local t=s.t-s.storyEnteredAt+math.max(0,math.min(dt,1/30))
  for _,entry in ipairs(s.riverDecks) do
   local spec,p=entry.spec,entry.platform
   local x,direction,dockSeconds,left,right=cycle(spec,t+(spec.offset or 0))
   if x~=p.x then
    for _,a in ipairs(s.actors) do
     if a.hp>0 and a.ground and a.y==p.y and a.x>=p.x and a.x<=p.x+p.w then
      a.x=a.x+x-p.x
     end
    end
    p.x=x
   end
   entry.direction,entry.dockSeconds=direction,dockSeconds
   entry.left,entry.right=left,right
  end
 end

 function platforms.rescue(s,river)
  if not river then return end
  for _,a in ipairs(s.actors) do
   if a.hp>0 and a.y>river.waterBottom then
    local left,right=river.banks[1],river.banks[2]
    local nearest=math.abs(a.x-left.x)<=math.abs(a.x-right.x) and left or right
    a.x,a.y,a.vy,a.ground=nearest.x,nearest.y,0,true
    a.dash,a.drop,a.glide,a.buffer,a.coyote=0,0,0,0,0
    if a.id==s.active then
     s.storyNotice='水に落ちたので、近い岸へ戻りました。'
     s.camera=math.max(0,math.min(a.x-400,math.max(0,s.worldwidth-960)))
    end
   end
  end
 end

 local function trail(draws,x,y,t)
  local direction=t<.8 and 1 or -1
  local head=t<.8 and 158*t/.8 or t<1.13 and 158 or 158-120*(t-1.13)
  for i=0,9 do
   local dx=head-direction*i*9
   draws[#draws+1]={kind='rect',x=x+dx,y=y-12+(i%3)*3,w=11,h=3,color=i%2==0 and '#8ce6dc' or '#59bfc1'}
  end
  if t>=.8 and t<1.13 then
   draws[#draws+1]={kind='text',x=x+158,y=y-36,text='向きが変わる間',size=14,color='#ffdfa1'}
  end
 end

 local function boarding(a,river,entry)
  if not a.ground or a.hp<=0 then return end
  local p=entry.platform
  if a.y==p.y and a.x>=p.x and a.x<=p.x+p.w then
   if entry.direction==0 then return {phase='landed',side=entry.left==0 and 'left' or 'right',seconds=entry.dockSeconds} end
   local side=entry.direction==1 and 'right' or 'left'
   return {phase='riding',side=side,seconds=entry[side]}
  end
  for i,bank in ipairs(river.banks) do
   if a.y==bank.y and math.abs(a.x-bank.x)<92 then
    local side=i==1 and 'left' or 'right'
    if entry[side]==0 then return {phase='board',side=side,seconds=entry.dockSeconds} end
    return {phase='wait',side=side,seconds=entry[side]}
   end
  end
 end

 function platforms.observe(s,f,layer,river,mode,profile)
  if not river then return end
  local draws=layer.draws
  f.storyRiverDecks={}
  for _,entry in ipairs(s.riverDecks or {}) do
   local spec,p=entry.spec,entry.platform
   local x=p.x+p.w/2-s.camera
   f.storyRiverDecks[#f.storyRiverDecks+1]={x=p.x,y=p.y,w=p.w,direction=entry.direction,
    atBank=entry.direction==0,dockSeconds=entry.dockSeconds}
   f.storyRiverBoarding=f.storyRiverBoarding or boarding(s.actors[s.active],river,entry)
   if x>=-115 and x<=1075 then
    C.drawFieldDisplayArt(layer,C.natlanTrialRaftArt,x,p.y+spec.drawBelow,spec.height,mode,profile,false)
   end
  end
  local turn=river.turn
  local elapsed=s.riverTurnAt and s.t-s.riverTurnAt
  if turn and elapsed and elapsed<1.9 then trail(draws,turn.x-s.camera,turn.y,elapsed) end
 end

 return platforms
end
