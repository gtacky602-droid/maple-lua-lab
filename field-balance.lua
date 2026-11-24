return function(C,config)
 local frame=C.frame
 local bands=config.ordinaryHp
 local hpByLevel={}
 for index=2,#bands do
  local lo,hi=bands[index-1],bands[index]
  local ratio=hi[2]/lo[2]
  for level=lo[1],hi[1] do
   hpByLevel[level]=lo[2]*ratio^((level-lo[1])/(hi[1]-lo[1]))
  end
 end

 function C.applyOrdinaryFieldHp(enemy,node,placement)
  if enemy.dailyElite or node.clearedBy or enemy.barrier>0 or placement.questPhase or placement.cargo then return end
  local ordinary=enemy.expRole=='normal' or not (enemy.expRole or enemy.storyName)
  local hp=ordinary and hpByLevel[enemy.level]
  if not hp then return end
  enemy.maxhp=math.max(enemy.maxhp,math.floor(hp*enemy.maxhp/15+.5))
  enemy.hp=enemy.maxhp
  enemy.draftFieldHp=true
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  local minimum,maximum,count=math.huge,0,0
  if not s.growthTrial then
   for _,enemy in ipairs(s.enemies) do
    if enemy.draftFieldHp then
     minimum=math.min(minimum,enemy.maxhp)
     maximum=math.max(maximum,enemy.maxhp)
     count=count+1
    end
   end
  end
  f.fieldBalance={count=count,minHp=count>0 and minimum or nil,maxHp=count>0 and maximum or nil}
  return f
 end
end
