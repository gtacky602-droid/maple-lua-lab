return function(C)
 local action,frame,checkpoint,restore=C.action,C.frame,C.checkpoint,C.restore

 local function canEdit(s)
  return not s.paused and not s.growthTrial and s.campaign and s.campaign.zone=='town'
 end

 local function store(s,slot)
  local companion=s.companion or 'amber'
  local traveler,partner={0,0,0,0,0},{0,0,0,0,0}
  for _,item in ipairs(s.inventory.items) do
   if item.owner==1 then traveler[item.slot]=item.id
   elseif item.owner==2 and item.companionId==companion then partner[item.slot]=item.id end
  end
  s.partyPresets=s.partyPresets or {}
  s.partyPresets[slot]={companion=companion,traveler=traveler,partner=partner,
   loadout=C.copySkillLoadout(s.loadout)}
  s.partyPresetMessage='枠'..slot..'に現在の編成を登録しました。'
 end

 local function apply(s,slot)
  local record=s.partyPresets and s.partyPresets[slot]
  if not record then return 'この枠には編成が登録されていません。' end
  local skills,reason=C.copySkillLoadout(record.loadout)
  if not skills then return reason end
  if not C.isCompanion(record.companion) then return '同行者を選べません。' end

  local byId={}
  for _,item in ipairs(s.inventory.items) do byId[item.id]=item end
  local owners={}
  for actor,gear in ipairs({record.traveler,record.partner}) do
   for part,id in ipairs(gear) do
    if id~=0 then
     local item=byId[id]
     if not item then return '登録した聖遺物 #'..id..' がバッグに見つかりません。' end
     if item.slot~=part or owners[id] then return '登録した聖遺物の装備先が不正です。' end
     owners[id]=actor
    end
   end
  end

  local switched=(s.companion or 'amber')~=record.companion
  local previous=s.companionRest and s.companionRest[record.companion]
  if switched then
   action(s,'companion:'..record.companion)
   if s.companion~=record.companion then return '同行者を切り替えられません。' end
  end
  for _,item in ipairs(s.inventory.items) do
   local owner=owners[item.id]
   if owner then
    item.owner=owner
    item.companionId=owner==2 and record.companion or nil
   elseif item.owner==1 or (item.owner==2 and item.companionId==record.companion) then
    item.owner,item.companionId=0,nil
   end
  end
  C.refreshArtifactStats(s,true)
  if switched then
   local partner=s.actors[2]
   partner.hp=math.min(partner.maxhp,previous and previous.hp or partner.maxhp)
  end
  s.loadout,s.macro,s.artifactPreview=skills,nil,nil
  return '枠'..slot..'の編成を適用しました。'
 end

 function C.action(s,key)
  local verb,slot=key:match('^party_preset_(%a+):([123])$')
  if verb~='store' and verb~='apply' then return action(s,key) end
  if not canEdit(s) then s.partyPresetMessage='町で編成プリセットを操作してください。';return end
  if verb=='store' then store(s,slot) else s.partyPresetMessage=apply(s,slot) end
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  f.partyPresets=s.partyPresets
  f.partyPresetsEditable=not not canEdit(s)
  f.partyPresetMessage=s.partyPresetMessage
  return f
 end

 function C.checkpoint(s)
  local d=checkpoint(s)
  if d then d.partyPresets=s.partyPresets end
  return d
 end

 function C.restore(d,density)
  local s=restore(d,density)
  s.partyPresets=d.partyPresets
  return s
 end
end
