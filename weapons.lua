return function(C,config)
 local action,frame,checkpoint,restore=C.action,C.frame,C.checkpoint,C.restore
 local items,starters,rewards={},{},{}
 local rules=config.enhancement
 for _,item in ipairs(config.items) do
  items[item.id]=item
  if item.bound then starters[item.bound]=item.id end
  if item.quest then rewards[item.quest]=item end
 end

 local function owned(s,item)
  if not item then return false end
  if not item.quest then return true end
  local quest=s.story and s.story.quests[item.quest]
  return quest and (quest.status=='complete' or (quest.cycles or 0)>0)
 end

 local function canEdit(s)
  return s.story and s.story.active and s.campaign.zone=='town' and not s.paused and not s.growthTrial
 end

 local function setup(s)
  s.weapons=s.weapons or {upgrades={},equipped={}}
  return s.weapons
 end

 local function compatible(owner,item)
  return item and config.types[owner]==item.type and (not item.bound or item.bound==owner)
 end

 local function tier(s,id)
  return s.weapons and s.weapons.upgrades[id] or 0
 end

 local function attackValue(item,level)
  return math.floor(item.atk*(10000+rules.linearBasisPoints*level+rules.quadraticBasisPoints*level*level)/10000+.5)
 end

 local function equippedBy(s,id)
  if s.weapons then
   for owner,value in pairs(s.weapons.equipped) do if value==id then return owner end end
  end
  local owner=items[id].bound
  if owner and C.equippedWeapon(s,owner)==id then return owner end
 end

 function C.equippedWeapon(s,owner)
  local id=s.weapons and s.weapons.equipped[owner] or starters[owner]
  if owned(s,items[id]) then return id end
 end

 function C.weaponAttack(s,actor)
  if not (s.story and s.story.active or s.endgameRun) then return end
  local owner=actor==1 and 'traveler' or (s.companion or 'amber')
  local id=C.equippedWeapon(s,owner)
  if id then return attackValue(items[id],tier(s,id)) end
 end

 function C.canEquipWeapon(s,owner,id)
  return id=='' or (compatible(owner,items[id]) and owned(s,items[id]))
 end

 function C.setEquippedWeapon(s,owner,id)
  local state=setup(s)
  local previous=id~='' and equippedBy(s,id)
  if previous and previous~=owner then state.equipped[previous]=nil end
  state.equipped[owner]=(id~='' and id~=starters[owner]) and id or nil
 end

 function C.noteWeaponReward(s,id)
  if not rewards[id] then return end
  s.weaponNotice='「'..rewards[id].name..'」を入手しました。'
  C.refreshArtifactStats(s,true)
 end

 function C.action(s,key)
  local target,id=key:match('^weapon_equip:(%a+):([%w%-]+)$')
  local upgrade=key:match('^weapon_upgrade:([%w%-]+)$')
  if not id and not upgrade then return action(s,key) end
  if not canEdit(s) then s.weaponNotice='町で武器を変更・強化してください。';return end
  local item=items[id or upgrade]
  if not owned(s,item) then s.weaponNotice='まだ入手していない武器です。';return end
  if id then
   if target~='traveler' and target~='partner' then return end
   local owner=target=='traveler' and 'traveler' or (s.companion or 'amber')
   if not C.canEquipWeapon(s,owner,id) then s.weaponNotice='このキャラの武器種には装備できません。';return end
   C.setEquippedWeapon(s,owner,id)
   s.weaponNotice='「'..item.name..'」を装備しました。'
  else
   local level=tier(s,upgrade)
   if level>=rules.cap then s.weaponNotice='この武器は強化上限です。';return end
   local cost=item.upgradeMora*(level+1)
   if s.mora<cost then s.weaponNotice='強化には'..cost..'モラ必要です。';return end
   local state=setup(s)
   s.mora=s.mora-cost
   state.upgrades[upgrade]=level+1
   s.weaponNotice='「'..item.name..'」を+'..(level+1)..'に強化しました。'
  end
  C.refreshArtifactStats(s,true)
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  if not s.story or not s.story.active then return f end
  local companion=s.companion or 'amber'
  local view={editable=not not canEdit(s),notice=s.weaponNotice,companion=companion,options={},
   traveler=C.equippedWeapon(s,'traveler'),partner=C.equippedWeapon(s,companion)}
  for _,item in ipairs(config.items) do
   local traveler,partner=compatible('traveler',item),compatible(companion,item)
   if traveler or partner then
    local level=tier(s,item.id)
    local cost=level<rules.cap and item.upgradeMora*(level+1) or nil
    view.options[#view.options+1]={id=item.id,name=item.name,type=item.type,quest=item.quest,
     questName=item.questName,owned=not not owned(s,item),level=level,atk=attackValue(item,level),
     nextAtk=cost and attackValue(item,level+1),cost=cost,traveler=traveler or false,partner=partner or false,
     equippedTo=equippedBy(s,item.id)}
   end
  end
  f.weaponView=view
  return f
 end

 function C.checkpoint(s)
  local d=checkpoint(s)
  if d then d.weapons=s.weapons end
  return d
 end

 function C.restore(d,density)
  local s=restore(d,density)
  if d.weapons then
   s.weapons=d.weapons
   C.refreshArtifactStats(s,true)
  end
  return s
 end
end
