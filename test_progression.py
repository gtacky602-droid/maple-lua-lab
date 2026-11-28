import json
from runtime import runtime,native,ROOT
from savegame import validate_save
from experience import CAP, CAP_EXP, CURVE_ID, LEVELS
lua,c=runtime();checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
s=c.new(12);s.kills=50;c.action(s,'campaign')
check('lab kills not retroactively credited',s.progression.total==0)
# Use actual attacks, including companion kills, to exercise EXP integration.
c.action(s,'field');s.active=2;s.actors[1].hp=0;a=s.actors[2];e=s.enemies[1];e.hp=1;a.x=e.x-10;a.y=e.y;a.atk=100
s.enemies=lua.table_from([e])
c.attack(s,a,'normal');tick(s,10)
check('companion kill awards shared EXP',s.progression.total==1 and s.progression.lastKills==s.kills)
tick(s,20);check('one reward per kill',s.progression.total==1)
atk=a.atk;c.grantExp(s,c.expNeeded(1)-1,'kill')
check('exact threshold levels once',s.progression.level==2 and s.progression.xp==0)
check('level does not grant equipment ATK',a.atk==atk)
c.grantExp(s,c.expNeeded(2)+c.expNeeded(3)+3,'quest')
check('multiple levels and remainder',s.progression.level==4 and s.progression.xp==3)
check('gate EXP uses the full required level and current progress',
      c.expRemainingToLevel(s,6)==c.expNeeded(4)+c.expNeeded(5)-3
      and c.expRemainingToLevel(s,4) is None)
c.action(s,'town');s.campaign.quest='report';s.campaign.count=8
total=s.progression.total;c.action(s,'report');c.action(s,'report')
check('quest reward once',s.progression.total==total+500 and s.progression.questRewarded)
saved=validate_save(native(c.checkpoint(s)))
newlua,newc=runtime();restored=newc.restore(newlua.table_from(saved,recursive=True),16)
newc.action(restored,'report');tickBefore=restored.progression.total
newc.step(restored,1/60,newlua.table())
check('restore neither replays kills nor report reward',restored.progression.total==saved['progression']['total']==tickBefore)
check('roundtrip preserves progression',native(newc.checkpoint(restored))['progression']==saved['progression'])
bad=json.loads(json.dumps(saved));bad['progression']['xp']+=1
try:validate_save(bad)
except ValueError:checks.append('inconsistent EXP rejected')
else:raise AssertionError('inconsistent EXP accepted')
legacy=saved.copy();legacy.pop('progression');restored=newc.restore(newlua.table_from(validate_save(legacy),recursive=True),16)
check('old saves migrate without replaying rewarded quest',restored.progression.level==1 and restored.progression.questRewarded)
s=c.new(12);c.action(s,'campaign');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,20)),'quest')
f=c.frame(s,'sprite',None)
check('region eligibility follows shared level',f.regionEligibility[2].eligible and not f.regionEligibility[3].eligible)
check('eligibility does not claim map exists',not f.regionEligibility[2].mapImplemented)
check('all 199 transitions match the design table',
      all(c.expNeeded(l)==row['required_exp_to_next'] for l,row in enumerate(LEVELS,1)))
check('Lv200 cap target totals 11.46 billion',sum(c.expNeeded(l) for l in range(1,CAP))==CAP_EXP==11_462_335_230)

def old_save(level,xp):
    p=dict(level=level,xp=xp,killXp=0,lastKills=0,questRewarded=False)
    p['total']=sum(100+20*(i-1)**2 for i in range(1,level))+xp
    p['questXp']=p['total']
    fresh=c.new(12);c.action(fresh,'campaign')
    return {**native(c.checkpoint(fresh)), 'progression':p}

for level,old_xp in [(2,60),(40,901),(199,190001),(200,45)]:
    previous=validate_save(old_save(level,old_xp))
    migrated=c.restore(lua.table_from(previous,recursive=True),12)
    state=validate_save(native(c.checkpoint(migrated)))['progression']
    expected_xp=old_xp*c.expNeeded(level)//(100+20*(level-1)**2) if level<CAP else 0
    check(f'legacy Lv{level} preserves level and lifetime',
          (state['curve'],state['level'],state['total'],state['baseXp'])==
          (CURVE_ID,level,previous['progression']['total'],previous['progression']['total']))
    check(f'legacy Lv{level} preserves relative progress or overflow',
          (state['xp'],state['overflowXp'])==(expected_xp,old_xp if level==CAP else 0))
    if level<CAP:
        check(f'legacy Lv{level} gate EXP uses migrated progress',
              c.expRemainingToLevel(migrated,level+1)==c.expNeeded(level)-expected_xp)
    loaded=c.restore(lua.table_from(native(c.checkpoint(migrated)),recursive=True),12)
    check(f'legacy Lv{level} migration is idempotent',native(c.checkpoint(loaded))['progression']==state)

def at_level(level):
    fresh=c.new(12);c.action(fresh,'campaign')
    c.grantExp(fresh,LEVELS[level-1]['maple_reference_total_exp_to_reach'],'quest')
    return fresh

for player,enemy_level,expected in [(20,20,23),(25,20,21),(31,20,15),(41,20,5),(61,20,1),(9,20,14),(1,22,6)]:
    scenario=at_level(player)
    mob=lua.table_from({'hp':1,'id':1,'level':enemy_level,'x':200,'y':480})
    c.defeatEnemy(scenario,mob,1)
    if player==1 and enemy_level==22:
        expected=max(1,(LEVELS[21]['normal_enemy_base_exp']*20+50)//100)
    check(f'level gap {player} vs {enemy_level}',scenario.progression.killXp==expected)
elite=at_level(40)
c.defeatEnemy(elite,lua.table_from({'hp':1,'id':1,'level':40,'x':200,'y':480,'storyName':'精鋭'}),1)
check('named story elite uses the draft multiplier',elite.progression.killXp==1540)

end=at_level(199)
c.grantExp(end,c.expNeeded(199)-1,'quest')
c.grantExp(end,4,'kill',4)
p=end.progression
check('overflow is recorded separately at cap',p.level==CAP and p.xp==0 and p.overflowXp==7 and p.total==CAP_EXP+7)
check('base excludes the granted bonus',p.baseXp==p.total-4)
c.grantExp(end,500,'quest',500)
check('fixed quest EXP excludes the bonus',p.total==CAP_EXP+507 and p.baseXp==p.total-4)
c.defeatEnemy(end,lua.table_from({'hp':1,'id':1,'level':200,'x':200,'y':480}),2)
check('level 200 mob continues lifetime and overflow',p.total==CAP_EXP+507+296366 and p.overflowXp==507+296366)
d=validate_save(native(c.checkpoint(end)))
reloaded=c.restore(lua.table_from(d,recursive=True),12)
check('large whole numbers survive cap round trip',native(c.checkpoint(reloaded))==d)
bad=json.loads(json.dumps(d));bad['progression']['overflowXp']-=1
try:validate_save(bad)
except ValueError:checks.append('inconsistent overflow rejected')
else:raise AssertionError('inconsistent overflow accepted')

(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/progression-cap-fixture.json').write_text(json.dumps(d),encoding='utf8')
(ROOT/'evidence/progression-test.json').write_text(json.dumps({
    'count':len(checks),'checks':checks,'curve':CURVE_ID,'exp_to_level_200':CAP_EXP,
    'scope':'Lua thresholds, draft enemy EXP, save and migration. Playtime and Miliastra unmeasured.',
},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(len(checks),'progression checks passed')
