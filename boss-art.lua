return function(C,data,shell,core,farka,poses,pyro,electroShell,electroCore,geo)
 local function draw(f,assetData,x,y,h,mode,profile,flip,palette,tint,opacity)
  local w=h*assetData.box[3]/assetData.box[4];local anchor=assetData.anchorX or .5;local left=x-(flip and (1-anchor) or anchor)*w
  if mode=='rect' then
   local asset=assetData.profiles[profile] or assetData.profiles.legacy
   for _,r in ipairs(asset.runs) do f.draws[#f.draws+1]={kind='rect',x=left+(flip and (asset.width-r[1]-r[3]) or r[1])*w/asset.width,y=y-h+r[2]*h/asset.height,w=r[3]*w/asset.width+.05,h=r[4]*h/asset.height+.05,color=palette and palette[r[5]] or r[5],opacity=opacity} end
  else f.draws[#f.draws+1]={kind='boss_sprite',source=assetData.source,anchorX=anchor,flip=not not flip,x=x,y=y,w=w,h=h,box=assetData.box,tint=tint,opacity=opacity} end
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
 function C.drawPrimoFieldArt(f,b,x,pose,height,mode,profile,palette)
  draw(f,C.primoFieldArt[pose],x,b.y,height,mode,profile,b.facing>0,palette,b.tint)
 end
 function C.drawMaguuArt(f,b,mode,profile)
  local stance=b.phase=='iai_warning' or b.phase=='sweep_warning' or b.phase=='combo_warning'
  local slash=(b.slashTime or 0)>0
  draw(f,slash and C.maguuSlashArt or stance and C.maguuStanceArt or C.maguuArt,b.x,480,slash and 140 or stance and 130 or 150,mode,profile,(b.facing or -1)>0)
 end
 function C.drawMaguuMask(f,x,y,h,facing,mode,profile) draw(f,C.maguuMaskArt,x,y,h,mode,profile,(facing or -1)>0) end
 function C.drawGeoPart(f,part,x,y,h,mode,profile) draw(f,geo[part],x,y,h,mode,profile) end
 function C.drawThunderArt(f,b,mode,profile) draw(f,C.thunderArt,b.x,465,150,mode,profile,false) end
 function C.drawCryoHypostasisFieldArt(f,x,y,pose,mode,profile)
  local art=C.cryoHypostasisFieldArt[pose]
  local bottom=y-(pose=='wheel' and 2 or 13)
  draw(f,art,x,bottom,art.profiles.legacy.height,mode,profile,false)
 end
 function C.drawPyroHypostasisFieldArt(f,x,y,pose,mode,profile,dir)
  local art=C.pyroHypostasisFieldArt[pose]
  local bottom=y-(pose=='boar' and 3 or 13)
  draw(f,art,x,bottom,art.profiles.legacy.height,mode,profile,(pose=='boar' or pose=='snake') and dir==1)
 end
 function C.drawHydroHypostasisFieldArt(f,x,y,pose,mode,profile,dir)
  local art=C.hydroHypostasisFieldArt[pose]
  draw(f,art,x,y-15,art.profiles.legacy.height,mode,profile,(pose=='dolphin' or pose=='ray') and dir==1)
 end
 local wolflordPoseOffsets={idle=36,ram=44,tail=-8,jaw=14,recover=34,skull=0}
 function C.drawWolflordFieldArt(f,x,y,pose,mode,profile,dir)
  local art=C.wolflordFieldArt[pose]
  draw(f,art,x,y-wolflordPoseOffsets[pose],art.profiles.legacy.height,mode,profile,dir>0)
 end
 local ruinSerpentPoseOffsets={idle=8,roll=11,dive=0,emerge=0,bombs=8,drill=0}
 function C.drawRuinSerpentFieldArt(f,x,y,pose,scale,mode,profile,flip)
  local art=C.ruinSerpentFieldArt[pose]
  draw(f,art,x,y-ruinSerpentPoseOffsets[pose]*scale,art.profiles.legacy.height*scale,mode,profile,flip)
 end
 function C.drawBathysmalFieldArt(f,x,y,index,pose,mode,profile,flip)
  local art=(index==1 and C.rimebiterFieldArt or C.bolteaterFieldArt)[pose]
  local h=pose=='idle' and 110 or art.profiles.legacy.height
  draw(f,art,x,y,h,mode,profile,flip)
 end
 function C.drawAeonblightFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.aeonblightFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 144 or art.profiles.legacy.height,mode,profile,flip)
 end
 local dendroOffsets={idle=14,vine=14,ball=8,core=13}
 function C.drawDendroHypostasisFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.dendroHypostasisFieldArt[pose]
  local h=pose=='idle' and 108 or art.profiles.legacy.height
  draw(f,art,x,y-dendroOffsets[pose],h,mode,profile,flip)
 end
 local asimonOffsets={idle=8,ray=5,pillars=5,cloak=3,recover=1}
 function C.drawAsimonFieldArt(f,x,y,pose,mode,profile,flip,opacity)
  local art=C.asimonFieldArt[pose]
  local h=pose=='idle' and 120 or art.profiles.legacy.height
  draw(f,art,x,y-asimonOffsets[pose],h,mode,profile,flip,nil,nil,opacity)
 end
 local wenutOffsets={idle=6,sweep=21,stream=0,dive=16,emerge=0,orb=0}
 function C.drawWenutFieldArt(f,x,y,pose,scale,mode,profile,flip)
  local art=C.wenutFieldArt[pose]
  draw(f,art,x,y-wenutOffsets[pose]*scale,art.profiles.legacy.height*scale,mode,profile,flip)
 end
 function C.drawBaptistFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.baptistFieldArt[pose]
  local height=pose=='idle' and 146 or art.profiles.legacy.height
  draw(f,art,x,y-22,height,mode,profile,flip)
 end
 function C.drawEmperorFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.emperorFieldArt[pose]
  draw(f,art,x,y,art.profiles.legacy.height,mode,profile,flip)
 end
 local seahorseOffsets={idle=12,sweep=7,charge=12,dive=8,dim=2}
 function C.drawSeahorseFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.seahorseFieldArt[pose]
  local height=pose=='idle' and 145 or art.profiles.legacy.height
  draw(f,art,x,y-seahorseOffsets[pose],height,mode,profile,flip)
 end
 function C.drawGeneratorFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.generatorFieldArt[pose]
  draw(f,art,x,y-10,pose=='idle' and 141 or art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawTulpaFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.tulpaFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 155 or art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawIcewindFieldArt(f,x,y,element,pose,mode,profile,flip)
  local anemo=element=='anemo'
  local art=(anemo and C.coppeliaFieldArt or C.coppeliusFieldArt)[pose]
  draw(f,art,x,y-(anemo and 9 or 0),art.profiles.legacy.height,mode,profile,flip==anemo)
 end
 function C.drawLegatusFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.legatusFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 155 or art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawSuanniFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.suanniFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 154 or art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawQucusaurFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.qucusaurFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 156 or art.profiles.legacy.height,mode,profile,flip~=(pose=='idle'))
 end
 function C.drawYumkaFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.yumkaFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 162 or art.profiles.legacy.height,mode,profile,flip~=(pose=='idle'))
 end
 function C.drawConfigDeviceFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.configDeviceFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 156 or art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawPapillaFieldArt(f,x,y,pose,height,mode,profile,flip)
  draw(f,C.papillaFieldArt[pose],x,y,height,mode,profile,flip)
 end
 function C.drawLavaDragonFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.lavaDragonFieldArt[pose]
  draw(f,art,x,y,art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawOverseerFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.overseerFieldArt[pose]
  draw(f,art,x,y,pose=='idle' and 172 or art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawKnuckleDuckFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.knuckleDuckFieldArt[pose]
  draw(f,art,x,y,art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawBattleshipFieldArt(f,x,y,pose,mode,profile,flip)
  local art=C.battleshipFieldArt[pose]
  draw(f,art,x,y,art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawThunderFieldArt(f,x,y,h,mode,profile,pose,dir)
  draw(f,pose and C.thunderFieldArt[pose] or C.thunderArt,x,y,h,mode,profile,pose=='dash' and dir>0)
 end
 function C.drawCompanionArt(f,s,a,mode,profile,id)
  local art=C.companionArt[id or s.companion]
  local left=a.dir<0 and art.left
  draw(f,left or art,a.x-s.camera,a.y,art.height,mode,profile,a.dir<0 and not left)
 end
 function C.drawEnemyIdleArt(f,s,e,mode,profile) local layout=C.enemyArtLayout[e.art];draw(f,C.enemyIdleArt[e.art],e.x-s.camera,e.y-layout.hover,layout.height,mode,profile,false) end
 function C.drawDanukiArt(f,x,y,mode,profile) draw(f,C.danukiArt,x,y,56,mode,profile,false) end
 function C.drawFieldRegisvine(f,data,x,y,h,flip,pose,mode,profile)
  local art=data[pose]
  draw(f,art,x,y,pose=='idle' and h or art.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawJadeplumeArt(f,x,y,h,flip,pose,mode,profile)
  local art=C.jadeplumeArt[pose] or C.jadeplumeArt.idle
  local height=art.profiles.legacy.height
  draw(f,art,x,y,height*h/C.jadeplumeArt.idle.profiles.legacy.height,mode,profile,flip)
 end
 function C.drawBennettArt(f,x,y,mode,profile)
  draw(f,C.bennettArt,x,y,C.bennettArt.profiles.legacy.height,mode,profile)
 end
 function C.drawNoelleArt(f,x,y,seated,mode,profile)
  local art=C.noelleArt[seated and 'seated' or 'standing']
  draw(f,art,x,y,art.profiles.legacy.height,mode,profile)
 end
 function C.drawAmberArt(f,s,a,mode,profile,art) draw(f,art,a.x-s.camera,a.y,88,mode,profile,a.dir<0) end
 function C.drawTravelerIdleArt(f,s,a,mode,profile) draw(f,C.travelerIdleArt[a.dir<0 and 'left' or 'right'],a.x-s.camera,a.y,88,mode,profile) end
 function C.drawTravelerRunArt(f,s,a,mode,profile)
  local frames=C.travelerRunArt[a.dir<0 and 'left' or 'right']
  local phase=a.ground and math.floor((a.runDistance or 0)/16)%#frames or 0
  local art=frames[phase+1]
  -- The generated frames share a 100px scale, with small height changes during the stride.
  local h=phase==0 and 88 or 88*art.box[4]/100
  draw(f,art,a.x-s.camera,a.y,h,mode,profile,false)
  if mode~='rect' and a.light>0 then f.draws[#f.draws].glow=true end
 end
 function C.drawArrayArt(f,b,mode,profile)
  draw(f,C.arrayArt,b.x,b.phase=='rocket' and 280 or b.phase=='down' and 480 or 465,b.phase=='down' and 90 or b.phase=='split' and 75 or 140,mode,profile,false)
 end
 function C.drawArrayPartArt(f,e,mode,profile)
  draw(f,C.arrayPartArt[e.part],e.x,480,({72,84,70,95})[e.part],mode,profile,(e.facing or -1)>0)
 end
 function C.drawArrayFieldArt(f,x,y,style,mode,profile,facing)
  local pose=C.arrayFieldArt[style]
  draw(f,pose,x,y,pose.profiles.legacy.height,mode,profile,style=='blade' and facing>0)
 end
end
