return function(C)
 local maguu={}
 local U=88
 local function aim(b,c,a)
  c.dir=a.x<b.x and -1 or 1
  b.facing=c.dir
 end
 function maguu.begin(b,spec,m,a)
  local c={move=m,tick=0,seen={{},{}},origin=b.x}
  aim(b,c,a)
  return c
 end
 function maguu.cancel() end
 local function mask(c,t)
  return c.origin+c.dir*U*(.5+math.max(0,t-90)*3/60)
 end
 local function band(b,c)
  local m=c.move
  local x=b.x+c.dir*m.near*U
  local y=b.x+c.dir*m.far*U
  return math.min(x,y),math.max(x,y),b.y-m.high*U,b.y-m.low*U
 end
 function maguu.tick(s,b,spec,c,a)
  local m,t=c.move,c.tick+1
  c.tick=t
  if a and t<=m.lock then aim(b,c,a) end
  if m.mask then
   if t>=90 and t<144 then
    local x,prev=mask(c,t),mask(c,t-1)
    C.hitFieldArea(s,b,c.seen[1],math.min(x,prev)-.35*U,math.max(x,prev)+.35*U,b.y-U,m.damage,b.y-.2*U)
   end
  else
   for i,w in ipairs(m.active) do
    if t>=w[1] and t<w[2] then
     local l,r,top,bottom=band(b,c)
     C.hitFieldArea(s,b,c.seen[i],l,r,top,m.damage,bottom)
    end
   end
  end
  return t>=m.total
 end
 function maguu.label(b,c)
  if c and c.tick>=c.move.recover then return '納刀・息継ぎ' end
 end
 function maguu.draw(f,s,b,spec,c,mode,profile)
  local x=b.x-s.camera
  local pose={x=x,facing=b.facing}
  if c and c.tick<c.move.recover then
   pose.phase='iai_warning'
   local m,t=c.move,c.tick
   if m.mask then
    if t>=m.lock and t<144 then C.drawMaguuMask(f,mask(c,t)-s.camera,b.y-.2*U,70,c.dir,mode,profile) end
   elseif t>=m.lock then
    local w=m.active[t>=112 and m.active[2] and 2 or 1]
    if t<w[2] then
     local l,r,top,bottom=band(b,c)
     local active=t>=w[1]
     pose.slashTime=active and 1 or 0
     f.draws[#f.draws+1]={kind='rect',x=l-s.camera,y=bottom-3,w=r-l,h=3,color=active and '#d6fff9' or '#efb678'}
     if active then f.draws[#f.draws+1]={kind='rect',x=l-s.camera,y=top+16,w=r-l,h=6,color='#b1f4ea'} end
    end
   end
  end
  C.drawMaguuArt(f,pose,mode,profile)
 end
 return maguu
end
