import json
from runtime import runtime,native,ROOT
from savegame import validate_save
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
check('companion kill awards shared EXP',s.progression.total==10 and s.progression.lastKills==s.kills)
tick(s,20);check('one reward per kill',s.progression.total==10)
atk=a.atk;c.grantExp(s,90,'kill')
check('exact threshold levels once',s.progression.level==2 and s.progression.xp==0)
check('level does not grant equipment ATK',a.atk==atk)
c.grantExp(s,300,'quest')
check('multiple levels and remainder',s.progression.level==4 and s.progression.xp==0)
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
(ROOT/'evidence/progression-test.json').write_text(json.dumps({'count':len(checks),'checks':checks,'model':'provisional, not official EXP table'},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'progression checks passed')
