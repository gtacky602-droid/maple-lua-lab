return function(C)
 local checkpoint,restore=C.checkpoint,C.restore

 local function cooldowns(timers,elapsed)
  local remaining={}
  for key,seconds in pairs(timers) do
   if seconds>elapsed then remaining[key]=seconds-elapsed end
  end
  return remaining
 end

 function C.checkpoint(s)
  local d=checkpoint(s)
  if not d then return end
  local traveler,companion=s.actors[1],s.actors[2]
  local companionHp=s.travelerTrial and s.travelerTrial.allyHp or companion.hp
  local reserve={}
  for id,stored in pairs(s.companionRest or {}) do
   reserve[id]={hp=stored.hp,cooldowns=cooldowns(stored.cd,s.t-stored.time)}
  end
  d.partyCombat={
   traveler={hp=traveler.hp,cooldowns=cooldowns(traveler.cd,0)},
   companion={hp=companionHp,cooldowns=cooldowns(companion.cd,0)},
   reserve=reserve,swap=s.swap,
  }
  return d
 end

 function C.restore(d,density)
  local s=restore(d,density)
  local party=d.partyCombat
  if not party then return s end
  -- Apply saved HP after the town entry and equipment have set each actor's max HP.
  for i,record in ipairs({party.traveler,party.companion}) do
   local actor=s.actors[i]
   actor.hp=math.min(actor.maxhp,record.hp)
   actor.cd=cooldowns(record.cooldowns,0)
  end
  if s.actors[s.active].hp<=0 and s.actors[3-s.active].hp>0 then s.active=3-s.active end
  s.swap=party.swap
  s.companionRest={}
  for id,record in pairs(party.reserve) do
   s.companionRest[id]={hp=record.hp,cd=cooldowns(record.cooldowns,0),lock=0,time=s.t}
  end
  s.campaign.message='拠点から再開。旅人と同行者のHP・残りCTを引き継ぎました。'
  return s
 end
end
