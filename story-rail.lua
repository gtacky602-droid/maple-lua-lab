-- The quest count records completed trips and the keeper's defeat. In-flight
-- motion belongs to the current visit; re-entering starts at the last station.
local R={}

local function interaction(s,q,state)
 if not state or state.status~='active' or s.railTrip then return end
 local spec=q.rail
 local item=state.count==0 and spec.release or state.count==2 and spec.dispatch
 if not item then return end
 local a=s.actors[s.active]
 if a.hp>0 and math.abs(a.x-item.x)<54 and math.abs(a.y-item.y)<34 then return item end
end

function R.start(s,q,state)
 local item=interaction(s,q,state)
 if not item then return end
 local spec=q.rail
 local release=item==spec.release
 s.railTrip={from=release and spec.startX or spec.dispatch.x,to=release and spec.dispatch.x or spec.exitX,
             elapsed=0,seconds=spec.seconds[release and 1 or 2],release=release}
 s.storyNotice=release and '留め具が外れ、荷車が線路を走り出しました。' or '荷車が港へ向かっています。'
end

function R.step(s,dt,state)
 local trip=s.railTrip
 if not trip or s.paused then return end
 trip.elapsed=trip.elapsed+dt
 if trip.elapsed+1e-8<trip.seconds then return end
 s.railTrip=nil
 state.count=state.count+1
 s.storyNotice=trip.release and '荷車が分岐に着き、足場が下りました。奥の扉から石切り場の番人が現れました。'
                            or '荷車が港に着きました。市場への帰り道から北斗のところへ戻りましょう。'
 return trip.release
end

local function draw(boxes,x,y,w,h,color)
 boxes[#boxes+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
end

function R.drawCart(boxes,x,y)
 draw(boxes,x-32,y-39,64,28,'#422c23')
 draw(boxes,x-29,y-36,58,19,'#b97b49')
 draw(boxes,x-28,y-27,56,5,'#e4a762')
 draw(boxes,x-20,y-49,18,13,'#ba8260')
 draw(boxes,x+3,y-45,16,9,'#71a2a0')
 for _,offset in ipairs({-22,14}) do
  draw(boxes,x+offset,y-13,12,13,'#3e3330')
  draw(boxes,x+offset+4,y-9,4,5,'#bf9e6b')
 end
end

-- The handle stays above the parked cart so the control remains visible.
function R.drawSwitch(boxes,cartX,y,ready,thrown)
 local x=cartX-38
 if x+16<0 or x-16>960 then return end
 draw(boxes,x-12,y-6,24,6,'#554437')
 draw(boxes,x-4,y-57,8,51,'#64544b')
 draw(boxes,x-3,y-56,3,48,'#c79a62')
 local dir=thrown and 1 or -1
 for i=1,3 do draw(boxes,x+dir*i*3-2,y-56-i*4,5,6,'#d6b47a') end
 draw(boxes,x+dir*11-5,y-76,10,9,ready and '#f2c85c' or '#a67a59')
 draw(boxes,x-3,y-57,6,6,'#e5ce97')
end

function R.drawLatch(boxes,x,y)
 draw(boxes,x-7,y-25,14,25,'#5b4736')
 draw(boxes,x-11,y-29,22,7,'#eac571')
end

local function market(boxes,x,y,color,goods)
 draw(boxes,x-39,y-70,78,9,'#513831')
 draw(boxes,x-34,y-69,5,69,'#5d3b2c')
 draw(boxes,x+29,y-69,5,69,'#5d3b2c')
 draw(boxes,x-37,y-66,74,11,color)
 draw(boxes,x-39,y-55,78,5,'#f2d498')
 draw(boxes,x-36,y-25,72,20,'#8e5c3a')
 draw(boxes,x-38,y-28,76,5,'#d39b66')
 for _,item in ipairs(goods) do draw(boxes,x+item[1],y-28-item[2],item[3],item[2],item[4]) end
end

function R.observe(s,f,boxes,q,state)
 if s.story.node==q.hub then
  if not state or state.count<q.goal then return end
  f.storyMarketOpen=true
  local c=s.camera
  market(boxes,810-c,480,'#2e8382',{{-25,14,16,'#8bc6c3'},{-4,9,8,'#f6dfbf'},{10,9,8,'#e6c293'}})
  market(boxes,925-c,480,'#ae5543',{{-21,7,19,'#f2b254'},{6,13,17,'#553b2d'},{10,20,3,'#c9d6c7'}})
  market(boxes,1120-c,480,'#316d6a',{{-22,8,42,'#ca744e'},{-15,14,35,'#79accc'},{-7,20,27,'#eed288'}})
  R.drawCart(boxes,995-c,480)
  return
 end
 if s.story.node~=q.target or not state then return end
 local spec=q.rail
 local trip=s.railTrip
 local x=state.count==0 and spec.startX or spec.dispatch.x
 if trip then
  x=trip.from+(trip.to-trip.from)*math.min(1,trip.elapsed/trip.seconds)
  f.storyRailTransit={release=trip.release}
 end
 local c=s.camera
 draw(boxes,spec.startX-45-c,477,spec.exitX-spec.startX+75,3,'#9b8461')
 local first=spec.startX-40
 local visibleFirst=first+40*math.max(0,math.ceil((c-6-first)/40))
 for tie=visibleFirst,math.min(spec.exitX+20,c+960),40 do draw(boxes,tie-c,472,6,8,'#594336') end
 if state.count<q.goal then R.drawCart(boxes,x-c,480);f.storyCartX=x end
 local thrown=state.count>=q.goal or (trip and not trip.release)
 R.drawSwitch(boxes,spec.dispatch.x-c,spec.dispatch.y,state.count==2 and not trip,thrown)
 if state.count==0 then
  local latch=spec.release
  R.drawLatch(boxes,latch.x-c,latch.y)
 end
 if not s.paused then
  local item=interaction(s,q,state)
  if item then f.storyNearbyClue={id=item.id,label=item.label} end
 end
end

return R
