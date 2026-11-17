return function(C,data,shell,core,farka,poses,pyro,electroShell,electroCore,geo)
 local function draw(f,assetData,x,y,h,mode,profile,flip)
  local w=h*assetData.box[3]/assetData.box[4];local anchor=assetData.anchorX or .5;local left=x-(flip and (1-anchor) or anchor)*w
  if mode=='rect' then
   local asset=assetData.profiles[profile] or assetData.profiles.legacy
   for _,r in ipairs(asset.runs) do f.draws[#f.draws+1]={kind='rect',x=left+(flip and (asset.width-r[1]-r[3]) or r[1])*w/asset.width,y=y-h+r[2]*h/asset.height,w=r[3]*w/asset.width+.05,h=r[4]*h/asset.height+.05,color=r[5]} end
  else f.draws[#f.draws+1]={kind='boss_sprite',source=assetData.source,anchorX=anchor,flip=not not flip,x=x,y=y,w=w,h=h,box=assetData.box} end
 end
 function C.drawRegisvineArt(f,b,mode,profile) draw(f,data,b.x,480,b.phase=='down' and 100 or 200,mode,profile) end
 function C.drawPyroRegisvineArt(f,b,mode,profile) draw(f,pyro,b.x,480,b.phase=='down' and 100 or 200,mode,profile) end
 function C.drawFarkaArt(f,b,mode,profile)
  local index=({charge_warning=1,charge=2,sweep_warning=1,followup_warning=1,recover=4})[b.phase]
  if (b.slashUntil or 0)>0 then index=3 end
  local asset=index and poses[index] or farka;local h=index and asset.box[4]*110/poses[4].box[4] or 110
  draw(f,asset,b.x,480,h,mode,profile,(b.facing or -1)>0)
 end
 function C.drawAnemoPart(f,part,x,y,h,mode,profile) draw(f,part=='shell' and shell or core,x,y,h,mode,profile) end
 function C.drawElectroPart(f,part,x,y,h,mode,profile) draw(f,part=='shell' and electroShell or electroCore,x,y,h,mode,profile) end
 function C.drawOceanidPart(f,part,x,y,h,mode,profile,flip)
  if C.oceanidArt and C.oceanidArt[part] then draw(f,C.oceanidArt[part],x,y,h,mode,profile,flip);return true end
 end
 function C.drawPrimoArt(f,b,mode,profile) draw(f,C.primoArt,b.x,480,140,mode,profile,(b.facing or -1)>0) end
 function C.drawMaguuArt(f,b,mode,profile)
  local stance=b.phase=='iai_warning' or b.phase=='sweep_warning' or b.phase=='combo_warning'
  local slash=(b.slashTime or 0)>0
  draw(f,slash and C.maguuSlashArt or stance and C.maguuStanceArt or C.maguuArt,b.x,480,slash and 140 or stance and 130 or 150,mode,profile,(b.facing or -1)>0)
 end
 function C.drawMaguuMask(f,x,y,h,facing,mode,profile) draw(f,C.maguuMaskArt,x,y,h,mode,profile,(facing or -1)>0) end
 function C.drawGeoPart(f,part,x,y,h,mode,profile) draw(f,geo[part],x,y,h,mode,profile) end
 function C.drawThunderArt(f,b,mode,profile) draw(f,C.thunderArt,b.x,465,150,mode,profile,false) end
 function C.drawCompanionArt(f,s,a,mode,profile) draw(f,C.companionArt[s.companion],a.x-s.camera,a.y,s.companion=='kachina' and 76 or 88,mode,profile,a.dir<0) end
 function C.drawEnemyIdleArt(f,s,e,mode,profile) local layout=C.enemyArtLayout[e.art];draw(f,C.enemyIdleArt[e.art],e.x-s.camera,e.y-layout.hover,layout.height,mode,profile,false) end
 function C.drawAmberArt(f,s,a,mode,profile,art) draw(f,art,a.x-s.camera,a.y,88,mode,profile,a.dir<0) end
 function C.drawTravelerIdleArt(f,s,a,mode,profile) draw(f,C.travelerIdleArt,a.x-s.camera,a.y,88,mode,profile,a.dir<0) end
 function C.drawArrayArt(f,b,mode,profile)
  draw(f,C.arrayArt,b.x,b.phase=='rocket' and 280 or b.phase=='down' and 480 or 465,b.phase=='down' and 90 or b.phase=='split' and 75 or 140,mode,profile,false)
 end
 function C.drawArrayPartArt(f,e,mode,profile)
  draw(f,C.arrayPartArt[e.part],e.x,480,({72,84,70,95})[e.part],mode,profile,(e.facing or -1)>0)
 end
end
