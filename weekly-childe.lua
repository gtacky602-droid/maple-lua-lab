return function(C)
 local controller={}
 local colors={hydro='#71bffe',electro='#b595f2'}
 local forms={'水弓','邪眼','魔王武装'}
 local avoid=C.aiAvoidTarget
 local function clamp(x,lo,hi) return math.max(lo,math.min(x,hi)) end
 local function mix(a,b,t) return a+(b-a)*t end
 local function live(s)
  local a=s.actors[s.active]
  if a and a.hp>0 then return a end
  for _,other in ipairs(s.actors) do if other.hp>0 then return other end end
 end
 local function body(e,x,y)
  e.x,e.y=x,y;e.hitTop=y-e.drawHeight;e.hitBottom=y
 end
 local function box(x,width,y,height)
  return {lo=x-width/2,hi=x+width/2,y=y,height=height}
 end
 local function slash(c,reach,back)
  local a=c.origin+c.dir*reach
  local b=c.origin-c.dir*(back or -22)
  return {lo=math.min(a,b),hi=math.max(a,b),y=c.floor,height=103}
 end
 local function lane(c,a,b)
  return {lo=math.min(a,b)-25,hi=math.max(a,b)+25,y=c.floor,height=63}
 end
 local function remove(s,w)
  for i=#s.enemies,1,-1 do if s.enemies[i]==w.primary then table.remove(s.enemies,i) end end
 end
 local function log(s,w,key,actor,value)
  for _,party in ipairs(s.parties or {s}) do
   C.combatEvent(party,'childe:'..key,actor or 0,w.primary.id,value)
  end
 end
 local function owner(s,a) return s.actorOwners and s.actorOwners[a] or s end
 local function clearMark(s,w)
  if not w.marks[s] then return end
  w.marks[s]=nil;w.cleanseUntil[s]=s.t+.2
  local c=w.cast
  if c and c.id=='WC10' and c.target==s and not c.cleansed then
   c.cleansed=c.tick<c.move.locks[1] and 'before' or 'after'
  end
  log(s,w,'cleanse',s.active)
 end
 local function markedActor(s,w,element)
  for _,party in ipairs(s.parties or {s}) do
   local a=party.actors[party.active]
   if a.hp>0 and w.marks[party]==element then return a end
  end
 end
 local function castTarget(s,c)
  local party=c.target;local a=party.actors[party.active]
  if a.hp>0 and (not s.actorOwners or s.actorOwners[a]==party) then return a end
 end
 local function threshold(spec,form)
  local rest=0
  for i=form+1,#spec.phaseHp do rest=rest+spec.phaseHp[i] end
  return rest
 end
 local function shift(s,w,spec)
  local e=w.primary
  w.cast=nil;w.phase='transition'
  for party in pairs(w.marks) do clearMark(party,w) end
  w.shift={tick=0,timing=spec.transitions[w.form],next=w.form+1}
  e.invulnerable=true;e.aura=nil;e.applicationClocks=nil;e.burning=nil
  body(e,spec.center,spec.floorY)
  log(s,w,'WC14',0,w.form+1)
 end
 local function contact(s,w,spec,cast,mult,color,element)
  local e,c=w.primary,w.cast
  if w.shift or e.hp<=0 then return false end
  local resist=C.enemyResistance(cast,e,element)
  if resist>=1 then return false end
  if c and c.id=='WC06' and c.tick>=48 and c.tick<120 then
   local guardFront=(cast.x-e.x)*c.dir>-10
   if guardFront then
    mult=mult*spec.guardFactor
    local now=s.coop and s.coop.weeklySlot==w and s.coop.time or s.t
    local fresh=cast.startedAt and s.t-cast.startedAt<=now-c.guardAt+1e-8
    if not c.counter and not cast.reaction and not cast.growthAI and s.growthAIActor~=cast.id
        and not s.auto and cast.id==s.active and fresh then
     c.counter=true;log(s,w,'guard-reserved',cast.id)
    end
   end
  end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,resist)
  local barrier=threshold(spec,w.form)
  n=math.min(n,e.hp-barrier)
  if n<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+n
  C.combatNumber(s,e,critical and tostring(n)..'!' or n,color)
  C.combatEvent(s,'hit',cast.id,e.id,n)
  local event=s.events[#s.events];event.element=element;event.critical=not not critical;event.reaction=cast.reaction or false
  if s.coop then C.coopContact(s,e,cast.id) end
  if e.hp==n then C.defeatEnemy(s,e,cast.id)
  else
   e.hp=e.hp-n
   if e.hp==barrier then shift(s,w,spec)
   elseif C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  end
  return true
 end
 function controller.spawn(s,w,spec)
  w.form,w.index,w.rest=1,1,spec.noticeTicks
  w.remainder=0;w.shift=nil
  w.marks=setmetatable({},{__mode='k'});w.cleanseUntil=setmetatable({},{__mode='k'})
  local e=w.primary
  e.drawHeight=112;e.dir=-1;e.invulnerable=false;e.underground=false
  body(e,spec.center,spec.floorY)
  e.onCastContact=function(state,cast,_,mult,color,element)
   return contact(state,w,spec,cast,mult,color,element)
  end
 end
 function controller.attach(s,w)
  remove(s,w);s.enemies[#s.enemies+1]=w.primary
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  remove(s,w);w.cast=nil;w.shift=nil;w.primary.underground=true
  w.marks=setmetatable({},{__mode='k'});w.cleanseUntil=setmetatable({},{__mode='k'})
 end

 local function targetFloor(s,a,floor)
  if a then
   for _,p in ipairs(s.platforms) do
    if a.x>=p.x and a.x<=p.x+p.w and math.abs(a.y-p.y)<6 then return p.y,p.x,p.x+p.w end
   end
  end
  return floor,75,885
 end
 local function points(x,offsets,left,right)
  local list={}
  for _,delta in ipairs(offsets) do list[#list+1]=clamp(x+delta,left,right) end
  return list
 end
 local function dropX(x) return clamp(x,126,834) end
 local function locate(s,w,spec,c,lockIndex,tracking)
  local e=w.primary
  local a
  if c.target then
   a=castTarget(s,c)
   if not a then return end
  else a=live(s) end
  local x=a and a.x or spec.center
  if lockIndex==1 or c.id=='WC09' then
   c.origin=e.x;c.dir=x>=e.x and 1 or -1
   if not tracking then e.dir=c.dir end
  end
  if c.id=='WC02' then
   local y,left,right=targetFloor(s,a,c.floor)
   c.rainY=y;c.points=points(x,{-128,-43,43,128},left+22,right-22)
  elseif c.id=='WC05' then
   c.emerge=clamp(c.origin-c.dir*144,155,805)
   c.land=clamp(x,165,795)
  elseif c.id=='WC08' then
   c.finish=clamp(c.origin+c.dir*math.min(176,math.max(0,math.abs(x-c.origin)-52)),94,866)
  elseif c.id=='WC09' then
   local goal=clamp(c.origin+c.dir*245,94,866)
   c.segments[lockIndex]={start=c.origin,finish=goal}
  elseif c.id=='WC10' then
   c.land=dropX(x)
  elseif c.id=='WC11' and lockIndex==1 then
   c.finish=clamp(c.origin+c.dir*220,110,850)
  elseif c.id=='WC12' and lockIndex==2 then
   c.points=points(x,{-150,-46,46,150},106,854)
  end
 end
 local function start(s,w,spec,id,a,target)
  local move=spec.moves[id];local e=w.primary
  local c={id=id,move=move,tick=0,floor=spec.floorY,origin=e.x,dir=e.dir,target=target,
   recovery=move.recovery,total=move.total,arrows={},hits={},segments={},guardAt=s.t}
  c.spin=id=='WC04' and math.abs(a.x-e.x)<70
  locate(s,w,spec,c,1,false)
  if id=='WC12' then locate(s,w,spec,c,2,true) end
  w.cast=c;w.phase='tell'
  log(s,w,id,0,w.form)
 end
 local function choose(s,w,spec,a)
  local order=spec.orders[w.form]
  for _=1,#order do
   local id=order[w.index];w.index=w.index%#order+1
   local element=(id=='WC02' or id=='WC05') and 'hydro' or id=='WC10' and 'electro'
   local target=element and markedActor(s,w,element)
   if not element or target then
    start(s,w,spec,id,target or a,target and owner(s,target))
    return
   end
  end
 end
 local function hurt(s,w,c,index,a,element,amount)
  local hit=c.hits[index]
  if not hit then hit={};c.hits[index]=hit end
  if hit[a] then return end
  hit[a]=true
  local party=owner(s,a)
  local damage=C.damageActor(party,a,amount,{id=w.primary.id,x=w.primary.x,damageElement=element},true,true)
  if c.id=='WC10' then
   c.dropDamage=c.dropDamage or {}
   c.dropDamage[a]=damage
  end
  if damage>0 then
   log(party,w,c.id..':hit',a.id,index)
   if a.id==party.active then
    w.marks[party]=element;log(party,w,'mark:'..element,a.id)
   end
  end
 end
 local function contains(shape,a)
  return a.hp>0 and a.x+9>=shape.lo and a.x-9<=shape.hi
    and a.y<=shape.y+5 and a.y>shape.y-shape.height
 end
 local function wave(s,w,c,index,shape,element)
  for _,a in ipairs(s.actors) do if contains(shape,a) then hurt(s,w,c,index,a,element,c.move.damage) end end
 end
 local function shapeFor(c,index,previewX)
  local id=c.id
  if id=='WC02' then return box(c.points[index],79,c.rainY,106)
  elseif id=='WC04' then return index==2 and c.spin and box(c.origin,220,c.floor,106) or slash(c,141)
  elseif id=='WC05' then return box(index==1 and c.emerge or c.land,index==1 and 176 or 212,c.floor,142)
  elseif id=='WC06' then return slash(c,196,30)
  elseif id=='WC07' then return slash(c,index==1 and 141 or 155)
  elseif id=='WC08' then
   return index==5 and box(c.finish,229,c.floor,106)
     or slash({floor=c.floor,origin=c.finish,dir=c.dir},index==4 and 194 or 141)
  elseif id=='WC09' then local p=c.segments[index];return p and lane(c,p.start,p.finish)
  elseif id=='WC10' then return box(previewX or c.land,158,c.floor,114)
  elseif id=='WC11' then return lane(c,c.origin,c.finish)
  elseif id=='WC12' then return index==1 and slash(c,194) or box(c.points[index-3],62,c.floor,132)
  end
 end
 local function spawnArrow(c,index,now)
  local low=c.id=='WC03'
  c.arrows[#c.arrows+1]={x=c.origin+c.dir*28,y=c.floor-(low and 26 or 79),radius=low and 22 or 11,
   speed=(c.id=='WC01' and 7 or 6)*88/60,endTick=now+(low and 72 or 60),index=index}
 end
 local function moveArrows(s,w,c,t)
  for index=#c.arrows,1,-1 do
   local p=c.arrows[index]
   if t>=p.endTick or p.x<0 or p.x>960 then table.remove(c.arrows,index)
   else
    local x=p.x+c.dir*p.speed
    for _,a in ipairs(s.actors) do
     if a.hp>0 and a.x+9>=math.min(x,p.x)-p.radius and a.x-9<=math.max(x,p.x)+p.radius
       and a.y-8>=p.y-p.radius and a.y-82<=p.y+p.radius then
      hurt(s,w,c,p.index,a,'hydro',c.move.damage)
      if c.id~='WC03' then table.remove(c.arrows,index);break end
     end
    end
    p.x=x
   end
  end
 end
 local function phaseTick(s,w,spec)
  local e=w.primary;local a=live(s)
  for _,party in ipairs(s.parties or {s}) do
   local current=party.actors[party.active]
   if current.hp>0 and (current.x<=spec.edge or current.x>=960-spec.edge) then clearMark(party,w) end
  end
  if w.shift then
   local sh=w.shift
   sh.tick=sh.tick+1
   if sh.tick==sh.timing.swap then
    w.form=sh.next;e.drawHeight=w.form==3 and 144 or 112
    body(e,e.x,e.y)
   end
   if sh.tick>=sh.timing.total then
    w.shift=nil;e.invulnerable=false;w.index=1;w.rest=0;w.phase='available'
   end
   return
  end
  if not a then return end
  if not w.cast then
   w.rest=w.rest-1
   local dx=a.x-e.x
   if math.abs(dx)>spec.directionApproach and w.form~=1 then
    e.dir=dx>0 and 1 or -1
    body(e,clamp(e.x+e.dir*3,74,886),spec.floorY)
   end
   if w.rest<=0 then choose(s,w,spec,a) end
   return
  end
  local c=w.cast;c.tick=c.tick+1;local t=c.tick
  local id=c.id
  if id=='WC10' and t<=84 and not c.cancelled and
      (w.marks[c.target]~='electro' or not castTarget(s,c)) then
   c.cancelled=true;c.total=spec.branches.cleansed.total;c.recovery=spec.branches.cleansed.recovery
   log(s,w,'drop-cancelled',c.target.active)
  end
  if id=='WC06' then
   if t==48 then c.guardAt=s.t end
   if t==120 and not c.counter then c.total=spec.branches.unguarded.total;c.recovery=spec.branches.unguarded.recovery end
  elseif id=='WC09' then
   if t==96 or t==192 then locate(s,w,spec,c,t==96 and 2 or 3,true) end
  end
  for i,lock in ipairs(c.move.locks) do
   if t==lock and not c.cancelled then locate(s,w,spec,c,i,false);log(s,w,id..':lock',0,i) end
  end
  if id=='WC08' and t>=60 and t<=84 then body(e,mix(c.origin,c.finish,(t-60)/24),c.floor) end
  if id=='WC10' and not c.cancelled and t>=90 and t<=144 then
   local q=clamp((t-90)/54,0,1)
   body(e,mix(c.origin,c.land,q),c.floor-math.sin(math.pi*q)*135)
  end
  w.phase=t>=c.recovery and 'recovery' or 'tell'
  for i,window in ipairs(c.move.windows) do
   if t>=window[1] and t<window[2] and not c.cancelled and (id~='WC06' or c.counter) then
    w.phase='active'
    if window[3]=='spawn' then spawnArrow(c,i,t)
    else
     local shape=shapeFor(c,i)
     if id=='WC09' then
      local p=c.segments[i];local q=(t-window[1]+1)/(window[2]-window[1])
      local x=mix(p.start,p.finish,q)
      shape=lane(c,e.x,x);body(e,x,c.floor)
     elseif id=='WC11' then
      local q=(t-window[1])/(window[2]-window[1]-1)
      c.ring=mix(c.origin,c.finish,i==1 and q or 1-q)
      shape=box(c.ring,76,c.floor,105)
     end
     local electric=(w.form==2) or id=='WC07' or id=='WC09' or id=='WC10' or id=='WC11' or (id=='WC12' and i>3)
     if shape then wave(s,w,c,i,shape,electric and 'electro' or 'hydro') end
    end
   end
  end
  if id=='WC11' and (t==96 or t==192) then c.ring=nil end
  moveArrows(s,w,c,t)
  if t>=c.total then w.cast=nil;w.phase='available';w.rest=spec.restTicks end
 end
 function controller.prepare() end
 function controller.finish(s,w,spec,dt)
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 do
   w.remainder=w.remainder-1
   phaseTick(s,w,spec)
  end
 end

 local function warnings(c,previewX)
  local list={}
  if c.cancelled or c.tick>=c.recovery then return list end
  for i,win in ipairs(c.move.windows) do
   if win[3]=='damage' and c.tick<win[2] then
    local show=true
    if c.id=='WC06' then show=c.counter and c.tick>=120
    elseif c.id=='WC09' then show=c.tick>=(i-1)*96
    elseif c.id=='WC11' then show=i==1 or c.tick>=108
    elseif c.id=='WC12' and i>3 then show=c.tick>=186
    elseif c.id=='WC08' and i>=4 then show=c.tick>=(i==4 and 162 or 204)
    elseif c.id=='WC04' and i==2 and c.spin then show=c.tick>=66 end
    local shape=show and shapeFor(c,i,previewX)
    if shape then list[#list+1]={shape=shape,active=c.tick>=win[1],at=win[1]} end
   end
  end
  return list
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='childe' and w.cast then
   for _,warn in ipairs(warnings(w.cast)) do
    local hit=warn.shape
    if warn.at-w.cast.tick<=36 and contains(hit,a) then
     local left,right=clamp(hit.lo-34,30,930),clamp(hit.hi+34,30,930)
     if left<hit.lo and (right<=hit.hi or a.x-left<right-a.x) then return left end
     if right>hit.hi then return right end
    end
   end
  end
  if avoid then return avoid(s,a) end
 end

 function controller.observe(f,s,w,spec,mode,profile)
  local e,c=w.primary,w.cast
  local bed=f.weeklyBoss
  bed.form,bed.formName=w.form,forms[w.form]
  bed.x,bed.y,bed.damageable=e.x,e.y,e.hp>0 and not e.invulnerable
  bed.phaseHp={}
  for i,hp in ipairs(spec.phaseHp) do
   bed.phaseHp[i]={max=hp,hp=clamp(e.hp-threshold(spec,i),0,hp)}
  end
  bed.mark=w.marks[s]
  bed.move=w.shift and 'WC14' or c and c.id or nil
  bed.moveTick=w.shift and w.shift.tick or c and c.tick or nil
  bed.label=w.shift and (w.shift.timing.title..'・変身中') or c and
   (c.cancelled and '落撃中止・反撃の隙' or c.tick>=c.recovery and '反撃の隙' or c.move.title) or '構え'
  local previewX
  if c and c.id=='WC10' then
   local tracking=c.tick<c.move.locks[1]
   local target=tracking and not c.cancelled and castTarget(s,c)
   if target then previewX=dropX(target.x) end
   local active,close=c.move.windows[1][1],c.move.windows[1][2]
   local damage=c.dropDamage and c.dropDamage[s.actors[s.active]]
   bed.riptideDrop={
    phase=c.cancelled and 'cancelled' or tracking and 'tracking' or c.tick>=active and 'landed' or 'locked',
    x=not c.cancelled and (previewX or c.land) or nil,
    targeted=c.target==s,cleansed=c.cleansed,
    damage=damage or not c.cancelled and c.tick>=close and 0 or nil,
    recovery=c.tick>=c.recovery and c.total-c.tick or nil
   }
  end
  local function rect(x,y,ww,h,color)
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=ww,h=h,color=color}
  end
  local function text(x,y,value,color)
   f.draws[#f.draws+1]={kind='text',x=x-s.camera,y=y,text=value,color=color,size=14}
  end
  local edgeColor=(w.cleanseUntil[s] or 0)>s.t and '#fff5cd' or '#caaf69'
  for _,x in ipairs({spec.edge,960-spec.edge}) do
   rect(x-6,410,12,69,'#55463b');rect(x-2,409,4,69,edgeColor)
   text(x,400,'解除',edgeColor)
  end
  if e.hp<=0 then return end
  local ink=(w.form>1 and '#b595f2' or '#71bffe')
  if c then
   for _,warn in ipairs(warnings(c,previewX)) do local b=warn.shape
    rect(b.lo,b.y-6,b.hi-b.lo,6,'#352942')
    rect(b.lo+3,b.y-4,math.max(1,b.hi-b.lo-6),3,warn.active and '#fa8d72' or '#ffe5ac')
   end
   if c.id=='WC01' or c.id=='WC03' then
    if c.tick<60 then
     local x=c.dir==1 and c.origin or 0;local width=c.dir==1 and 960-c.origin or c.origin
     rect(x,c.floor-(c.id=='WC03' and 26 or 79),width,2,'#f9deb2')
    end
   end
   for _,p in ipairs(c.arrows) do
    rect(p.x-p.radius,p.y-4,2*p.radius,8,'#2378bc')
    rect(p.x-p.radius,p.y-2,2*p.radius,3,'#eaf8ff')
   end
   if c.id=='WC06' and c.tick>=48 and c.tick<120 then rect(e.x+e.dir*49-4,e.y-103,8,89,ink) end
   if c.id=='WC05' and c.tick>=120 and c.tick<216 then
    local q=clamp((c.tick-120)/84,0,1)
    local x,y=mix(c.emerge,c.land,q),c.floor-30-math.sin(math.pi*q)*188
    local dir=c.land>=c.emerge and 1 or -1
    rect(x-70,y-21,140,35,'#297eac');rect(x-51,y-28,100,21,'#63cffa')
    rect(x-62,y+9,107,10,'#c5f1fa');rect(x-dir*80-11,y-34,22,19,'#54b9e8')
    rect(x+dir*52-3,y-9,6,5,'#e8f6ff')
   end
   if c.ring then
    rect(c.ring-37,e.y-61,74,9,'#b595f2');rect(c.ring-20,e.y-78,40,11,'#e4dbff')
   end
  end
  C.drawFieldDisplayArt(f,C.childeWeeklyArt[w.form==3 and 'foul' or 'human'],e.x-s.camera,e.y,e.drawHeight,mode,profile,e.dir>0)
  if w.form==2 then
   rect(e.x-34,e.y-82,68,2,'#6b4b99')
   rect(e.x+e.dir*35-11,e.y-57,22,5,'#d9bdff')
   rect(e.x-e.dir*26-10,e.y-51,20,4,'#a889e7')
  elseif c and (c.id=='WC01' or c.id=='WC02' or c.id=='WC03' or c.id=='WC05') then
   local x=e.x+e.dir*32
   rect(x-3,e.y-93,6,48,'#3a9fcf');rect(x+e.dir*6-4,e.y-84,8,29,'#b9ebff')
  elseif w.form==3 then rect(e.x+e.dir*51-18,e.y-77,36,5,ink) end
  if w.shift then text(e.x,e.y-151,w.shift.timing.title,'#eee2ff') end
  local function drawMark(party)
   local mark=w.marks[party];local a=party.actors[party.active]
   if mark and a.hp>0 then
    local offset=party==s and 98 or 132
    text(a.x,a.y-offset,mark=='hydro' and '◆ 水断流' or 'ϟ 雷断流',colors[mark])
   end
  end
  drawMark(s)
  if s.coop and s.coop.weeklySlot==w then
   for _,member in ipairs(s.coop.members) do
    if member.online and member.state~=s and C.sharesCoopField(member.state) then drawMark(member.state) end
   end
  end
 end
 return controller
end
