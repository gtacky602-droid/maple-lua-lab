-- Inventory / main-stat prototype. No final set/substat/crit implementation claim.
return function(C)
 local action,step,frame,checkpoint,restore=C.action,C.step,C.frame,C.checkpoint,C.restore
 local caps={[3]=12,[4]=16,[5]=20};local rarity={[3]=.6,[4]=.8,[5]=1}
 local feather={{1,0},{10,133.333333},{20,208.333333},{30,268},{40,393},{60,454.545455},{80,1250},{100,2343.75},{110,6250},{120,6250},{140,29800},{160,71400},{170,100000},{180,170000},{200,300000},{220,520000}}
 local flower={{1,80},{20,160},{40,600},{60,1800},{80,5000},{100,16000},{120,32000},{140,56000},{160,84480},{180,160000},{200,300000},{220,520000}}
 local function setup(s)
  if not s.inventory then s.inventory={items={},nextId=1,rng=731,sampleKit=false,message='通常敵1%・ボス25%の試作抽選。80個まで。'} end
  s.inventory.ground=s.inventory.ground or {}
  s.inventory.targetSet=s.inventory.targetSet or 'gladiator'
  s.inventory.combatRng=s.inventory.combatRng or 1973
 end
 local function roll(s,n)
  local bag=s.inventory;bag.rng=(bag.rng*48271)%2147483647;return bag.rng%n+1
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
  if item.slot<=2 then return math.floor(base*factor+.5) end
  return math.floor(base*factor*100+.5)/100
 end
 function C.refreshArtifactStats(s,keepHp)
  setup(s)
  local starter=C.starterEquipment and C.starterEquipment(s,s.companion)
  for i,a in ipairs(s.actors) do
   local hp,atk,pct,element,crit,rate=0,0,0,0,0,0
   local sets={gladiator=0,troupe=0};local hpPct=0
   local hasFlower=false
   for _,item in ipairs(s.inventory.items) do if item.owner==i then
    local v=C.artifactStats(item)
    if item.slot==1 then hp=hp+v;hasFlower=true elseif item.slot==2 then atk=atk+v elseif item.slot==3 then pct=pct+v elseif item.slot==4 then element=element+v elseif item.slot==5 then crit=crit+v end
    if item.setId then sets[item.setId]=sets[item.setId]+1 end
    if item.subpair=='atk_crit' then pct=pct+8;rate=rate+4 elseif item.subpair=='hp_crit' then hpPct=hpPct+8;rate=rate+4 end
   end end
   if sets.gladiator>=2 then pct=pct+12 end
   a.normalBonus=sets.gladiator>=4 and .2 or 0;a.skillBonus=sets.troupe>=2 and .12 or 0;a.troupe4=sets.troupe>=4
   a.critRate=math.min(1,rate/100);a.setCounts=sets
   if i==2 and starter then
    atk=atk+starter.weapon.atk
    if not hasFlower then hp=hp+starter.flower.hp end
   end
   local old=a.maxhp
   a.maxhp=math.floor((140+hp)*(1+hpPct/100))
   a.hp=math.min(a.maxhp,keepHp and a.hp or math.floor(a.hp/old*a.maxhp))
   a.atk=math.floor(((i==1 and 4 or 3)+atk)*(1+pct/100));a.elementBonus=element/100;a.critDamageBonus=crit/100
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
 function C.giveArtifact(s,slot,level,rank)
  setup(s);local bag=s.inventory
  if #bag.items>=80 then bag.message='バッグ満杯。装備を整理してください。';return false end
  bag.items[#bag.items+1]=properties(s,{id=bag.nextId,slot=slot,itemLv=level,rarity=rank,enhance=0,owner=0});bag.nextId=bag.nextId+1
  return true
 end
 function C.dropArtifact(s,slot,level,rank,x,y)
  setup(s);local bag=s.inventory
  local item=properties(s,{id=bag.nextId,slot=slot,itemLv=level,rarity=rank,enhance=0,owner=0})
  bag.nextId=bag.nextId+1
  bag.ground[#bag.ground+1]={item=item,x=x,y=y,zone=s.campaign and s.campaign.zone or 'field'}
 end
 C.canAttack=function(s)
  setup(s)
  if #s.inventory.ground>=16 then s.inventory.message='未回収品が16個以上あります。回収・町で整理してから攻撃を再開します。';return false end
  return true
 end
 function C.artifactSalePrice(item) return item.itemLv*item.rarity*10 end
 C.onKill=function(s,e)
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
   if s.campaign and s.campaign.zone=='town' and (setId=='gladiator' or setId=='troupe') then bag.targetSet=setId;bag.message='以後のドロップ対象セットを変更しました。' end
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
  local command,id=string.match(key,'^artifact_(%a+):(%d+)$')
  if command then
   if not s.campaign or s.campaign.zone~='town' then bag.message='町で装備を変更してください。';return end
   for index,item in ipairs(bag.items) do if item.id==tonumber(id) then
    if command=='equip' then
     for _,other in ipairs(bag.items) do if other.owner==s.active and other.slot==item.slot then other.owner=0 end end
     item.owner=s.active;bag.message='操作中キャラに装備しました。';C.refreshArtifactStats(s)
    elseif command=='remove' then item.owner=0;C.refreshArtifactStats(s)
    elseif command=='lock' then item.locked=not item.locked
    elseif command=='sell' then
     if item.owner~=0 or item.locked then bag.message='装備中・ロック中の品は売却できません。'
     else local price=C.artifactSalePrice(item);table.remove(bag.items,index);s.mora=s.mora+price;bag.message=price..'モラで売却しました（試算価格）。' end
    elseif command=='upgrade' then
     local next=item.enhance+4;local cost=next*200*item.rarity^2
     if next>caps[item.rarity] then bag.message='通常強化の上限です。'
     elseif s.mora<cost then bag.message='強化には'..cost..'モラ必要です。'
     else s.mora=s.mora-math.floor(cost);item.enhance=next;C.refreshArtifactStats(s);bag.message='+4強化しました。' end
    end
    return
   end end
   return
  end
  action(s,key)
 end
 function C.step(s,dt,input)
  step(s,dt,input);setup(s)
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
  setup(s);local f=frame(s,mode,profile);f.inventory=s.inventory
  local starter=C.starterEquipment and C.starterEquipment(s,s.companion)
  if starter then
   local useFlower=true
   for _,item in ipairs(s.inventory.items) do
    if item.owner==2 and item.slot==1 then useFlower=false;break end
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
  if d.inventory then s.inventory=d.inventory;C.refreshArtifactStats(s) end
  return s
 end
end
