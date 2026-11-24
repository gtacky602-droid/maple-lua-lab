-- Inventory / main-stat prototype. No final set/substat/crit implementation claim.
return function(C,imprint,artifactSets)
 local action,step,frame,checkpoint,restore,onKill=C.action,C.step,C.frame,C.checkpoint,C.restore,C.onKill
 local oreDiscount=400
 local pendingAttackLimit=16
 local caps={[3]=12,[4]=16,[5]=20};local rarity={[3]=.6,[4]=.8,[5]=1}
 local feather={{1,0},{10,133.333333},{20,208.333333},{30,268},{40,393},{60,454.545455},{80,1250},{100,2343.75},{110,6250},{120,6250},{140,29800},{160,71400},{170,100000},{180,170000},{200,300000},{220,520000}}
 local flower={{1,80},{20,160},{40,600},{60,1800},{80,5000},{100,16000},{120,32000},{140,56000},{160,84480},{180,160000},{200,300000},{220,520000}}
 local function setup(s)
  if not s.inventory then s.inventory={items={},nextId=1,rng=731,sampleKit=false,message='通常敵1%・ボス25%の試作抽選。80個まで。'} end
  s.inventory.ground=s.inventory.ground or {}
  s.inventory.targetSet=s.inventory.targetSet or 'gladiator'
  s.inventory.combatRng=s.inventory.combatRng or 1973
  s.inventory.upgradeOre=s.inventory.upgradeOre or 0
 end
 function C.grantUpgradeOre(s,quantity)
  setup(s)
  s.inventory.upgradeOre=s.inventory.upgradeOre+quantity
 end
 local function roll(s,n)
  local bag=s.inventory;bag.rng=(bag.rng*48271)%2147483647;return bag.rng%n+1
 end
 local function equippedRole(s,item)
  if item.owner==2 and item.companionId~=(s.companion or 'amber') then return 0 end
  return item.owner
 end
 local function findItem(bag,id)
  for index,item in ipairs(bag.items) do if item.id==id then return item,index end end
 end
 local function training(s,id)
  if C.noteGrowth then C.noteGrowth(s,id) end
 end
 local function upgradeCost(item,enhance)
  return enhance*200*item.rarity^2
 end
 local function previewItem(item)
  if not item then return end
  return {id=item.id,slot=item.slot,itemLv=item.itemLv,rarity=item.rarity,setId=item.setId,
          subpair=item.subpair,enhance=item.enhance,stars=item.imprintStars or 0,stat=C.artifactStats(item)}
 end
 local function withGrowth(item,enhance,stars)
  local copy={}
  for key,value in pairs(item) do copy[key]=value end
  copy.enhance,copy.imprintStars=enhance,stars
  return copy
 end
 local function comparePreview(s,item,example)
  local equipped
  if example then equipped={slot=2,itemLv=20,rarity=3,enhance=0,setId='gladiator',subpair='atk_crit'}
  else
   for _,other in ipairs(s.inventory.items) do
    if other.slot==item.slot and equippedRole(s,other)==s.active then equipped=other;break end
   end
  end
  local starter=not example and not equipped and item.slot==1 and s.active==2 and C.starterEquipment and C.starterEquipment(s,s.companion)
  return {kind='compare',example=example,before=previewItem(equipped),after=previewItem(item),
          starter=starter and starter.flower or nil,targetSet=s.inventory.targetSet,actor=s.active}
 end
 local function upgradePreview(item,example)
  local next=math.min(caps[item.rarity],item.enhance+4)
  return {kind='upgrade',example=example,before=previewItem(item),
          after=previewItem(withGrowth(item,next,item.imprintStars)),
          cost=next>item.enhance and upgradeCost(item,next) or 0,capped=next==item.enhance}
 end
 local function imprintPreview(item,example)
  local stars=item.imprintStars or 0
  if stars>0 then
   return {kind='imprint',example=example,earned=true,
           before=previewItem(withGrowth(item,item.enhance,0)),after=previewItem(item)}
  end
  if item.enhance<caps[item.rarity] then return nil,'通常強化を上限まで進めると刻印できます。' end
  return {kind='imprint',example=example,before=previewItem(item),
          after=previewItem(withGrowth(item,item.enhance,1)),cost=imprint.costPerStar}
 end
 local function inheritancePreview(source,target,example)
  if not source or not target or source==target or source.slot~=target.slot then
   return nil,'同じ部位の異なる二品を選んでください。'
  end
  if source.owner~=0 or source.locked or target.locked then
   return nil,'継承元は未装備で、どちらの品もロック解除が必要です。'
  end
  local stars,targetStars=source.imprintStars or 0,target.imprintStars or 0
  if source.enhance>caps[target.rarity] or stars>imprint.caps[tostring(target.rarity)]
    or (stars>0 and source.enhance~=caps[target.rarity]) then
   return nil,'継承先の強化または刻印の上限に収まりません。'
  end
  if source.enhance<target.enhance or stars<targetStars or (source.enhance==target.enhance and stars==targetStars) then
   return nil,'継承先の強化を下げず、強化値か刻印を引き上げられる組み合わせを選んでください。'
  end
  local steps=source.enhance/4
  local total=upgradeCost(source,4)*steps*(steps+1)/2+imprint.costPerStar*stars*(stars+1)/2
  return {kind='inherit',example=example,source=previewItem(source),before=previewItem(target),
          after=previewItem(withGrowth(target,source.enhance,stars)),cost=math.floor(total*imprint.inheritanceRate+.5)}
 end
 local function showPreview(s,preview,error,id)
  s.artifactPreview=preview or {error=error}
  if preview then training(s,id) end
 end
 function C.partyImprint(s) return (s.actors[1].imprint or 0)+(s.actors[2].imprint or 0) end
 function C.hasImprintedArtifact(s)
  setup(s)
  for _,item in ipairs(s.inventory.items) do
   if (item.imprintStars or 0)>0 then return true end
  end
  return false
 end
 local function lineUp(s,companion)
  local traveler,partner={},{}
  local total=0
  for slot=1,5 do traveler[slot],partner[slot]=0,0 end
  for _,item in ipairs(s.inventory.items) do
   local stars=item.imprintStars or 0
   if item.owner==1 then traveler[item.slot]=stars;total=total+stars
   elseif item.owner==2 and item.companionId==companion then
    partner[item.slot]=stars;total=total+stars
   end
  end
  return {traveler=traveler,partner=partner,total=total,companion=companion}
 end
 local function anchor(points,level)
  for i=2,#points do local a,b=points[i-1],points[i]
   if level<=b[1] then local t=(level-a[1])/(b[1]-a[1]);if a[2]==0 then return b[2]*t end;return a[2]*(b[2]/a[2])^t end
  end
  return points[#points][2]
 end
 function C.artifactStats(item)
  local factor=rarity[item.rarity]*(.2+.8*item.enhance/caps[item.rarity])
  local base=item.slot==1 and anchor(flower,item.itemLv) or item.slot==2 and anchor(feather,item.itemLv) or ({[3]=25,[4]=12,[5]=30})[item.slot]
  local multipliers=item.slot<=2 and imprint.fixedMainStatMultipliers or imprint.percentMainStatMultipliers
  factor=factor*multipliers[(item.imprintStars or 0)+1]
  if item.slot<=2 then return math.floor(base*factor+.5) end
  return math.floor(base*factor*100+.5)/100
 end
 function C.artifactChoicePreview(s,choices)
  setup(s)
  local result={full=#s.inventory.items>=80,options={}}
  for _,choice in ipairs(choices) do
   local reward=choice.artifact
   if reward then
    local equipped
    for _,item in ipairs(s.inventory.items) do
     if item.slot==reward.slot and item.owner==1 then equipped=item;break end
    end
    local offered={slot=reward.slot,itemLv=reward.level,rarity=reward.rarity,enhance=0,
                   setId=reward.setId,subpair=reward.subpair}
    result.options[#result.options+1]={id=choice.id,name=choice.name,
      offered=previewItem(offered),equipped=previewItem(equipped)}
   end
  end
  if #result.options>0 then return result end
 end
 function C.refreshArtifactStats(s,keepHp)
  setup(s)
  local starter=C.starterEquipment and C.starterEquipment(s,s.companion)
  for i,a in ipairs(s.actors) do
   local hp,atk,pct,element,crit,rate,stars=0,0,0,0,0,0,0
   local sets={gladiator=0,troupe=0};local hpPct=0
   local hasFlower=false
   for _,item in ipairs(s.inventory.items) do if equippedRole(s,item)==i then
    stars=stars+(item.imprintStars or 0)
    local v=C.artifactStats(item)
    if item.slot==1 then hp=hp+v;hasFlower=true elseif item.slot==2 then atk=atk+v elseif item.slot==3 then pct=pct+v elseif item.slot==4 then element=element+v elseif item.slot==5 then crit=crit+v end
    if item.setId then sets[item.setId]=(sets[item.setId] or 0)+1 end
    if item.subpair=='atk_crit' then pct=pct+8;rate=rate+4 elseif item.subpair=='hp_crit' then hpPct=hpPct+8;rate=rate+4 end
   end end
   if sets.gladiator>=2 then pct=pct+12 end
   if (sets.tenacity or 0)>=2 then hpPct=hpPct+20 end
   a.artifactPhysicalBonus=(sets.paleFlame or 0)>=2 and .25 or 0
   a.artifactBreakBonus=(sets.deepShadow or 0)>=2 and .25 or 0
   a.artifactGaugeBonus=(sets.celestialGift or 0)>=2 and 1 or 0
   a.normalBonus=sets.gladiator>=4 and .2 or 0;a.skillBonus=sets.troupe>=2 and .12 or 0;a.troupe4=sets.troupe>=4
   a.critRate=math.min(1,rate/100);a.setCounts=sets
   if i==2 and starter and not hasFlower then hp=hp+starter.flower.hp end
   local weaponAtk=C.weaponAttack and C.weaponAttack(s,i)
   if not weaponAtk then weaponAtk=i==1 and 4 or 3+(starter and starter.weapon.atk or 0) end
   local old=a.maxhp
   a.maxhp=math.floor((140+hp)*(1+hpPct/100))
   a.hp=math.min(a.maxhp,keepHp and a.hp or math.floor(a.hp/old*a.maxhp))
   a.atk=math.floor((weaponAtk+atk)*(1+pct/100));a.elementBonus=element/100;a.critDamageBonus=crit/100
   a.imprint=stars
  end
 end
 local function properties(s,item)
  item.setId=s.inventory.targetSet
  -- Draft fixed substat pair: do not duplicate clock's ATK% main stat.
  item.subpair=item.slot==3 and 'hp_crit' or (roll(s,100)<=75 and 'atk_crit' or 'hp_crit')
  return item
 end
 C.criticalRoll=function(s,rate)
  if not rate or rate<=0 then return false end
  setup(s);local b=s.inventory;b.combatRng=(b.combatRng*48271)%2147483647
  return b.combatRng/2147483647<rate
 end
 function C.giveArtifact(s,slot,level,rank,preset)
  setup(s);local bag=s.inventory
  if #bag.items>=80 then bag.message='バッグ満杯。装備を整理してください。';return false end
  local item={id=bag.nextId,slot=slot,itemLv=level,rarity=rank,enhance=0,owner=0}
  if preset then item.setId,item.subpair=preset.setId,preset.subpair else properties(s,item) end
  bag.items[#bag.items+1]=item;bag.nextId=bag.nextId+1
  return true
 end
 function C.dropArtifact(s,slot,level,rank,x,y,preset,zone)
  setup(s);local bag=s.inventory
  local item={id=bag.nextId,slot=slot,itemLv=level,rarity=rank,enhance=0,owner=0}
  if preset then item.setId,item.subpair=preset.setId,preset.subpair else properties(s,item) end
  bag.nextId=bag.nextId+1
  bag.ground[#bag.ground+1]={item=item,x=x,y=y,zone=zone or (s.campaign and s.campaign.zone or 'field')}
 end
 C.canAttack=function(s)
  setup(s)
  if #s.inventory.ground>=pendingAttackLimit then
   s.inventory.message='未回収品が'..pendingAttackLimit..'個以上あります。回収・町で整理してから攻撃を再開します。'
   return false
  end
  return true
 end
 function C.artifactSalePrice(item) return item.itemLv*item.rarity*10 end
 C.onKill=function(s,e)
  if onKill then onKill(s,e) end
  if not s.campaign then return end
  setup(s)
  if roll(s,100)>(e.boss and 25 or 1) then return end
  local chance=roll(s,100);local delta=chance<=5 and -6 or chance<=15 and -4 or chance<=35 and -2 or chance<=65 and 0 or chance<=85 and 2 or chance<=95 and 4 or 6
  local level=e.level or 1;local r=roll(s,100);local rank
  if level<40 then rank=r<=96 and 3 or 4 elseif level<80 then rank=r<=65 and 3 or r<=99 and 4 or 5 elseif level<120 then rank=r<=25 and 3 or r<=90 and 4 or 5 elseif level<160 then rank=r<=5 and 3 or r<=70 and 4 or 5 else rank=r<=45 and 4 or 5 end
  C.dropArtifact(s,roll(s,5),math.min(220,level+20+delta),rank,e.x or 200,e.y or 480)
  s.inventory.message='聖遺物が落ちました。近づくと回収します。'
 end
 function C.action(s,key)
  setup(s);local bag=s.inventory
  local setId=string.match(key,'^target_set:(%a+)$')
  if setId then
   if s.campaign and s.campaign.zone=='town' and (setId=='gladiator' or setId=='troupe') then
    bag.targetSet=setId;bag.message='以後のドロップ対象セットを変更しました。'
    s.artifactPreview=nil;training(s,'target-set')
   end
   return
  end
  local pair=key:match('^artifact_pair_preview:(%a+)$')
  if pair then
   if s.paused or not s.campaign or s.campaign.zone~='town' or not C.isCompanion(pair) then return end
   local current=s.companion or 'amber'
   if current==pair then return end
   local before,after=lineUp(s,current),lineUp(s,pair)
   local barriers={}
   for _,target in ipairs(C.growthBarrierTargets()) do
    local function damage(total) return math.floor(100*C.barrierMultiplier(total,target.barrier)+.5) end
    barriers[#barriers+1]={id=target.id,name=target.name,barrier=target.barrier,before=damage(before.total),after=damage(after.total)}
   end
   showPreview(s,{kind='party',before=before,after=after,barriers=barriers},nil,'party-imprint-compare')
   return
  end
  local example=key:match('^artifact_example:(%a+)$')
  local transfer,sourceId,targetId=key:match('^artifact_inherit_(%a+):(%d+):(%d+)$')
  if example or transfer then
   if s.paused or not s.campaign or s.campaign.zone~='town' then return end
   if example then
    local source={slot=2,itemLv=30,rarity=5,enhance=20,imprintStars=2,owner=0,setId='gladiator',subpair='atk_crit'}
    local target={slot=2,itemLv=45,rarity=5,enhance=0,owner=0,setId='troupe',subpair='hp_crit'}
    if example=='compare' then showPreview(s,comparePreview(s,target,true),nil,'gear-compare')
    elseif example=='upgrade' then showPreview(s,upgradePreview(target,true),nil,'enhance-preview')
    elseif example=='inherit' then showPreview(s,inheritancePreview(source,target,true),nil,'inherit-preview')
    elseif example=='imprint' then
     showPreview(s,imprintPreview(withGrowth(target,caps[target.rarity],0),true),nil,'first-imprint')
    end
   else
    local source,index=findItem(bag,tonumber(sourceId))
    local target=findItem(bag,tonumber(targetId))
    local preview,error=inheritancePreview(source,target)
    if transfer=='preview' then showPreview(s,preview,error,'inherit-preview')
    elseif transfer=='confirm' then
     local open=s.artifactPreview
     if not (preview and open and open.kind=='inherit' and not open.example
       and open.source.id==source.id and open.before.id==target.id and open.cost==preview.cost) then return end
     if s.mora<preview.cost then bag.message='継承には'..preview.cost..'モラ必要です。';return end
     s.mora=s.mora-preview.cost
     target.enhance,target.imprintStars=preview.after.enhance,preview.after.stars
     table.remove(bag.items,index);s.artifactPreview=nil
     C.refreshArtifactStats(s)
     bag.message='継承を実行し、継承元の聖遺物を使い切りました。'
    end
   end
   return
  end
  if key=='artifact_recover' then
   if s.campaign and s.campaign.zone=='town' then
    for i=#bag.ground,1,-1 do if #bag.items<80 then bag.items[#bag.items+1]=bag.ground[i].item;table.remove(bag.ground,i) end end
    bag.message='未回収品を空き枠まで取り寄せました。'
   end
   return
  end
  if key=='artifact_samples' then
   if s.campaign and s.campaign.zone=='town' and not bag.sampleKit and #bag.items<=75 then
    for slot=1,5 do C.giveArtifact(s,slot,21,3) end;bag.sampleKit=true;bag.message='装備検証用の5部位を受領。正式な報酬ではありません。'
   end
   return
  end
  if key=='artifact_fill_basics' then
   if s.paused or not (s.story and s.story.active and s.campaign and s.campaign.zone=='town') then return end
   local filled={}
   local improved=false
   for slot=1,2 do
    local equipped,best,bestStat=nil,nil,-1
    for _,item in ipairs(bag.items) do
     if item.slot==slot then
      if item.owner==1 then
       equipped=item
      elseif item.owner==0 then
       local stat=C.artifactStats(item)
       if stat>bestStat then best,bestStat=item,stat end
      end
     end
    end
    if not equipped and best then
     best.owner=1
     improved=improved or best.setId==bag.targetSet
     filled[#filled+1]=slot==1 and '花' or '羽'
    end
   end
   if #filled>0 then
    s.artifactPreview=nil
    C.refreshArtifactStats(s)
    bag.message='旅人の空き枠に'..table.concat(filled,'と')..'を装備しました。'
    if improved and C.endgameGoalEvent then C.endgameGoalEvent(s,'gear') end
   end
   return
  end
  local command,id=string.match(key,'^artifact_(%a+):(%d+)$')
  if command then
   if not s.campaign or s.campaign.zone~='town' then bag.message='町で装備を変更してください。';return end
   for index,item in ipairs(bag.items) do if item.id==tonumber(id) then
    if command=='compare' or command=='preview' or command=='stampview' then
     if s.paused then return end
     if command=='compare' then showPreview(s,comparePreview(s,item),nil,'gear-compare')
     elseif command=='preview' then showPreview(s,upgradePreview(item),nil,'enhance-preview')
     else
      local preview,error=imprintPreview(item)
      showPreview(s,preview,error,'first-imprint')
     end
     return
    end
    s.artifactPreview=nil
    if command=='equip' then
     local improved=item.setId==bag.targetSet and equippedRole(s,item)~=s.active
     for _,other in ipairs(bag.items) do
      if equippedRole(s,other)==s.active and other.slot==item.slot then
       if C.artifactStats(other)>=C.artifactStats(item) then improved=false end
       other.owner,other.companionId=0,nil
      end
     end
     item.owner=s.active;item.companionId=s.active==2 and (s.companion or 'amber') or nil
     bag.message='操作中キャラに装備しました。';C.refreshArtifactStats(s)
     if improved and C.endgameGoalEvent then C.endgameGoalEvent(s,'gear') end
    elseif command=='remove' then item.owner,item.companionId=0,nil;C.refreshArtifactStats(s)
    elseif command=='lock' then item.locked=not item.locked
    elseif command=='sell' then
     if item.owner~=0 or item.locked then bag.message='装備中・ロック中の品は売却できません。'
     else local price=C.artifactSalePrice(item);table.remove(bag.items,index);s.mora=s.mora+price;bag.message=price..'モラで売却しました（試算価格）。' end
    elseif command=='imprint' then
     local nextStar=(item.imprintStars or 0)+1
     local cost=nextStar*imprint.costPerStar
     if item.enhance<caps[item.rarity] then bag.message='通常強化を上限まで進めると刻印できます。'
     elseif nextStar>imprint.caps[tostring(item.rarity)] then bag.message='刻印の上限です。'
     elseif s.mora<cost then bag.message='刻印には'..cost..'モラ必要です。'
     else
      s.mora=s.mora-cost;item.imprintStars=nextStar
      training(s,'first-imprint')
      C.refreshArtifactStats(s)
      bag.message='光界刻印を'..nextStar..'星にしました。'
     end
    elseif command=='upgrade' or command=='useore' then
     local ore=command=='useore'
     local next=item.enhance+4
     local cost=math.max(0,upgradeCost(item,next)-(ore and oreDiscount or 0))
     if next>caps[item.rarity] then bag.message='通常強化の上限です。'
     elseif ore and bag.upgradeOre<1 then bag.message='強化鉱石を持っていません。'
     elseif s.mora<cost then bag.message='強化には'..cost..'モラ必要です。'
     else
      s.mora=s.mora-math.floor(cost);item.enhance=next
      if ore then bag.upgradeOre=bag.upgradeOre-1 end
      training(s,'enhance-preview')
      C.refreshArtifactStats(s)
      bag.message=ore and '強化鉱石を1個使い、+4強化しました。' or '+4強化しました。'
     end
    end
    return
   end end
   return
  end
  action(s,key)
 end
 function C.step(s,dt,input)
  step(s,dt,input);setup(s)
  if s.artifactPreview and (not s.campaign or s.campaign.zone~='town' or
    (s.artifactPreview.actor and s.artifactPreview.actor~=s.active)) then s.artifactPreview=nil end
  if s.paused or not s.campaign then return end
  local bag=s.inventory
  for i=#bag.ground,1,-1 do local d=bag.ground[i]
   if d.zone==s.campaign.zone then
    local nearest,distance=nil,1e9
    for _,a in ipairs(s.actors) do local dist=math.sqrt((a.x-d.x)^2+(a.y-d.y)^2);if a.hp>0 and dist<distance then nearest=a;distance=dist end end
    if nearest and distance<160 and #bag.items<80 then
     if distance<24 then bag.items[#bag.items+1]=d.item;table.remove(bag.ground,i);bag.message='聖遺物を回収しました。'
     else local rate=math.min(1,420*dt/distance);d.x=d.x+(nearest.x-d.x)*rate;d.y=d.y+(nearest.y-d.y)*rate end
    elseif distance<160 and #bag.items>=80 then bag.message='満杯のため地面に保留。町で売却後、未回収品を取り寄せられます。' end
   end
  end
 end
 function C.frame(s,mode,profile)
  setup(s);local f=frame(s,mode,profile);f.inventory=s.inventory;f.upgradeOreDiscount=oreDiscount
  f.artifactSets=artifactSets
  f.artifactPreview=s.campaign and s.campaign.zone=='town' and s.artifactPreview or nil
  f.imprintGrowth={total=C.partyImprint(s),byActor={s.actors[1].imprint or 0,s.actors[2].imprint or 0},
   caps=imprint.caps,costPerStar=imprint.costPerStar}
  f.artifactAttackBlocked=#s.inventory.ground>=pendingAttackLimit
  local starter=C.starterEquipment and C.starterEquipment(s,s.companion)
  if starter then
   local useFlower=true
   for _,item in ipairs(s.inventory.items) do
    if equippedRole(s,item)==2 and item.slot==1 then useFlower=false;break end
   end
   f.starterEquipment={weapon=starter.weapon,flower=starter.flower,useFlower=useFlower}
  end
  for _,d in ipairs(s.inventory.ground) do if s.campaign and d.zone==s.campaign.zone then
   f.draws[#f.draws+1]={kind='rect',x=d.x-s.camera-7,y=d.y-16,w=14,h=14,color=d.item.rarity==5 and '#ffd46b' or d.item.rarity==4 and '#c597fa' or '#87c9ff'}
  end end
  f.commands=#f.draws;return f
 end
 function C.checkpoint(s)
  setup(s);local d=checkpoint(s);if d then d.inventory=s.inventory end;return d
 end
 function C.restore(d,density)
  local s=restore(d,density);setup(s)
  s.companion=d.companion or 'amber'
  if d.inventory then
   s.inventory=d.inventory
   for _,item in ipairs(s.inventory.items) do
    if item.owner==2 and not item.companionId then item.companionId=s.companion end
   end
   C.refreshArtifactStats(s)
  end
  return s
 end
end
