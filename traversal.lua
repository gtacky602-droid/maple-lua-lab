return function(C)
 local new,action,attack,step,frame=C.new,C.action,C.attack,C.step,C.frame
 C.skillDefinitions.SK48={range=65,targets=5,mult=.8,hits=5,ct=18,lock=.3,interval=1.2,delay=1.2,color='#b5e5f3',element='fusion',damageElements={'hydro','cryo'},applicationElement='cryo',follow=true,radial=true,contactBudget=5}
 local function nodes(s)
  local zone=s.campaign and s.campaign.zone or 'lab'
  s.grappleNodes=(zone=='lab' or zone=='town' or zone=='field') and {{id=1,x=420,y=340,allowed=true},{id=2,x=1260,y=340,allowed=true},{id=3,x=2240,y=340,allowed=true}} or {}
  s.selectedGrapple=1
 end
 local function clear(s) for _,a in ipairs(s.actors) do a.grapple=nil;a.iceRun=0 end end
 function C.new(density) local s=new(density);nodes(s);return s end
 function C.pathClear(s,a,x,y)
  local dx,dy=x-a.x,y-a.y;local steps=math.max(1,math.ceil(math.sqrt(dx*dx+dy*dy)/8))
  for i=1,steps do local px,py=a.x+dx*i/steps,a.y+dy*i/steps
   for _,w in ipairs(s.solids or {}) do if px+12>w.x and px-12<w.x+w.w and py>w.y and py-50<w.y+w.h then return false end end
  end
  return true
 end
 function C.attack(s,a,key)
  if key=='SK46' then
   if a.id~=1 or s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 then return false end
   local node=(s.grappleNodes or {})[s.selectedGrapple or 1]
   if not node or not node.allowed or node.locked or (node.requiredQuest and (not s.campaign or s.campaign.quest~=node.requiredQuest)) then return false end
   local distance=math.sqrt((node.x-a.x)^2+(node.y-a.y)^2)
   if distance<10 or distance>420 or not C.pathClear(s,a,node.x,node.y) then return false end
   a.grapple={x=node.x,y=node.y};a.ground=false;a.vy=0;a.lock=distance/600;a.cd[key]=12
   return true
  end
  local ok=attack(s,a,key);if ok and key=='SK48' then a.iceRun=6 end;return ok
 end
 function C.moveActorOverride(s,a,dt)
  local g=a.grapple;if not g then return false end
  local dx,dy=g.x-a.x,g.y-a.y;local d=math.sqrt(dx*dx+dy*dy);local t=d>0 and math.min(1,600*dt/d) or 1
  local x,y=a.x+dx*t,a.y+dy*t
  if not C.pathClear(s,a,x,y) then a.grapple=nil;a.lock=0;return false end
  a.x=x;a.y=y;a.vy=0;a.walk=0;a.ground=false
  if t==1 then a.grapple=nil;a.lock=0;for _,p in ipairs(s.platforms) do if x>=p.x and x<=p.x+p.w and math.abs(y-p.y)<1 then a.ground=true;break end end end
  return true
 end
 function C.action(s,key)
  if key=='grapple_next' then s.selectedGrapple=(s.selectedGrapple or 0)%math.max(1,#(s.grappleNodes or {}))+1;return end
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then clear(s);nodes(s)
  elseif key=='swap' or key=='dodge' then for _,a in ipairs(s.actors) do a.grapple=nil end end
 end
 function C.step(s,dt,input)
  if s.paused then return step(s,dt,input) end
  dt=math.max(0,math.min(dt,1/30))
  for _,a in ipairs(s.actors) do a.iceRun=math.max(0,(a.iceRun or 0)-dt);if a.hp<=0 then a.grapple=nil;a.iceRun=0 end end
  local returns=s.returns;step(s,dt,input);if s.returns~=returns then clear(s);nodes(s) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);f.grappleNodes=s.grappleNodes or {};f.selectedGrapple=s.selectedGrapple
  if s.toyDive then
   f.grappleNodes={}
   f.selectedGrapple=nil
   return f
  end
  for i,n in ipairs(s.grappleNodes or {}) do
   f.draws[#f.draws+1]={kind='rect',x=n.x-s.camera-8,y=n.y-12,w=16,h=12,color=i==s.selectedGrapple and '#d8f5ab' or '#79a794'}
   f.draws[#f.draws+1]={kind='text',x=n.x-s.camera,y=n.y-20,text='結節点 '..i,color='#d8f5ab',size=12}
  end
  for _,a in ipairs(s.actors) do if (a.iceRun or 0)>0 then f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera-30,y=a.y-4,w=60,h=4,color='#b5e5f3'} end end
  f.commands=#f.draws;return f
 end
end
