-- Eight slots, at most three nonrecursive skill IDs per slot.
return function(C)
 local action,step,frame,checkpoint,restore=C.action,C.step,C.frame,C.checkpoint,C.restore
 local available={SK01='skill1',SK02='skill2',SK03='SK03',SK04='SK04',SK05='SK05',SK06='SK06',SK07='SK07',SK08='SK08',SK09='SK09',SK10='SK10',SK11='SK11',SK12='SK12',SK13='SK13',SK14='SK14',SK15='SK15',SK16='SK16',SK17='SK17',SK18='SK18',SK19='SK19',SK20='SK20',SK21='SK21',SK22='SK22',SK23='SK23',SK24='SK24',SK25='SK25',SK26='SK26',SK27='SK27',SK28='SK28',SK29='SK29',SK30='SK30',SK31='SK31',SK32='SK32',SK33='SK33',SK34='SK34',SK35='SK35',SK36='SK36',SK37='SK37',SK38='SK38',SK39='SK39',SK40='SK40',SK41='SK41',SK42='SK42',SK43='SK43',SK44='SK44',SK45='SK45',SK46='SK46',SK47='SK47',SK48='SK48',SK49='SK49',SK50='SK50',SK51='SK51',SK52='SK52',SK53='SK53',SK54='SK54',SK55='SK55',SK56='SK56',SK57='SK57',SK58='SK58',SK59='SK59',SK60='SK60'}
 local function setup(s)
  if not s.loadout then s.loadout={{'SK01'},{'SK02'},{'SK01','SK02'},{},{},{},{},{}} end
 end
 function C.configure(s,slots)
  setup(s)
  if not s.campaign or s.campaign.zone~='town' then return false,'町で編集してください。' end
  if type(slots)~='table' or #slots~=8 then return false,'8枠が必要です。' end
  local copy={}
  for i=1,8 do
   if type(slots[i])~='table' or #slots[i]>3 then return false,'1枠は最大3技です。' end
   copy[i]={}
   for j,id in ipairs(slots[i]) do
    if not available[id] then return false,'未実装の技・マクロ参照は装着できません。' end
    copy[i][j]=id
   end
  end
  s.loadout=copy;s.macro=nil;return true,'スキル枠を更新しました。'
 end
 function C.action(s,key)
  setup(s)
  local slot=tonumber(string.match(key,'^slot([1-8])$'))
  if slot then
   if s.paused or s.macro or s.active~=1 or s.actors[1].hp<=0 then return end
   if #s.loadout[slot]>0 then
    local sequence={};for i,id in ipairs(s.loadout[slot]) do sequence[i]=id end
    s.macro={skills=sequence,index=1,actor=1,zone=s.campaign and s.campaign.zone or 'lab',started=s.t,slot=slot}
   end
   return
  end
  if key=='cancel_macro' or key=='dodge' or key=='swap' or key=='town' or key=='field' or key=='arena' or key=='boss_anemo' then s.macro=nil end
  if key~='cancel_macro' then action(s,key) end
 end
 function C.step(s,dt,input)
  setup(s)
  local m=s.macro
  if m and not s.paused then
   local a=s.actors[m.actor];local zone=s.campaign and s.campaign.zone or 'lab'
   if s.active~=m.actor or a.hp<=0 or zone~=m.zone or s.t-m.started>60 then s.macro=nil
   else
    local id=m.skills[m.index]
    local allowed,reason=true,nil
    if C.skillPrerequisite then allowed,reason=C.skillPrerequisite(s,a,available[id]) end
    if not allowed then s.skillNotice=reason;s.macro=nil
    else
     s.macroInputAt=m.started
     local used=C.attack(s,a,available[id])
     s.macroInputAt=nil
     if used then
      m.index=m.index+1
      if m.index>#m.skills then s.macro=nil end
     end
    end
   end
  end
  step(s,dt,input)
 end
 function C.frame(s,mode,profile)
  setup(s);local f=frame(s,mode,profile)
  f.loadout=s.loadout;f.macro=s.macro;return f
 end
 function C.checkpoint(s)
  setup(s);local d=checkpoint(s)
  if d then d.loadout=s.loadout end
  return d
 end
 function C.restore(d,density)
  local s=restore(d,density);setup(s)
  if d.loadout then C.configure(s,d.loadout) end
  return s
 end
end
