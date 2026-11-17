return function(C)
 function C.fieldRegisvine(art,poseFor)
  local behavior={}

  function behavior.spawn(boss,spec)
   boss.coreHits=spec.core.hits
   boss.down=0;boss.rise=0;boss.rearm=0
   boss.hitBottom=boss.y-(spec.core.hurtboxClearance or 0)
  end

  function behavior.onHit(cast,boss,spec)
   if boss.coreHits<=0 or cast.reaction or
      math.abs(cast.x-boss.x)>94 or math.abs(cast.y-spec.floorY)>38 then return end
   -- Each pulse in a multi-hit cast carries the same per-boss record.
   cast.fieldNucleusHits=cast.fieldNucleusHits or {}
   if cast.fieldNucleusHits[boss.id] then return end
   cast.fieldNucleusHits[boss.id]=true
   boss.coreHits=boss.coreHits-1
  end

  function behavior.updateHeight(boss,spec,cast)
   local pose=poseFor(boss,cast)
   boss.drawHeight=pose=='idle' and spec.artHeight or art[pose].profiles.legacy.height
   boss.hitTop=boss.y-boss.drawHeight
  end

  function behavior.preempt(boss,spec,slot)
   if boss.down>0 then
    boss.down=boss.down-1
    if boss.down==0 then boss.rise=spec.core.rise;boss.rearm=spec.core.rearm end
    behavior.updateHeight(boss,spec,nil)
    return true
   end
   if boss.rearm>0 then
    boss.rearm=boss.rearm-1
    if boss.rearm==0 then boss.coreHits=spec.core.hits end
   end
   if boss.rise>0 then
    boss.rise=boss.rise-1
    behavior.updateHeight(boss,spec,nil)
    return true
   end
   behavior.updateHeight(boss,spec,slot.cast)
   if boss.coreHits>0 or boss.rearm>0 then return false end
   local cast=slot.cast
   if cast and not spec.core.interrupt then
    local move=cast.move
    local active=move.active[#move.active]
    local lastShot=move.shotTicks and move.shotTicks[#move.shotTicks]+move.shotLife or 0
    if cast.tick<math.max(active and active[2] or 0,lastShot)-1 then return false end
   end
   slot.cast=nil;slot.delay=0
   boss.down=spec.core.down;behavior.updateHeight(boss,spec,nil)
   return true
  end

  function behavior.label(boss)
   if boss.down>0 then return '核を破壊・ダウン' end
   if boss.rise>0 then return '起き上がり' end
  end

  return behavior
 end
end
