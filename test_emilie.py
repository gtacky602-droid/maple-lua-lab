import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.companion='emilie';s.active=2;s.actors[1].lock=999;a=s.actors[2];a.atk=100
 e=s.enemies[1];e.x=300;e.home=300;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
def burn(e):e.burning=lua.table_from({'owner':1,'atk':0,'next':999,'remaining':4})
for key,hits,damage in [('normal',2,170),('skill1',10,850),('skill2',4,512),('skill4',10,1330)]:
 s,a,e=scene();c.attack(s,a,key);ticks(s,580 if key=='skill1' else 190);check(key+' source hit count and multiplier',s.hits==hits and s.damage==damage)
s,a,e=scene();check('no burning rejects buff without cooldown',not c.attack(s,a,'skill3') and a.cd.skill3 is None)
burn(e);c.attack(s,a,'skill3');ticks(s,22);c.attack(s,a,'normal');ticks(s,20);check('burning target gains thirty percent personal bonus',s.damage==222)
s,a,e=scene();burn(e);c.attack(s,a,'skill3');e.burning=None;ticks(s,22);c.attack(s,a,'normal');ticks(s,20);check('burn ends so bonus ends on that target',s.damage==170)
s,a,e=scene();burn(e);c.attack(s,a,'skill3');ticks(s,481);c.attack(s,a,'normal');ticks(s,20);check('buff expires after eight seconds',s.damage==170)
s,a,e=scene();burn(e);c.attack(s,a,'skill3');check('buff does not increase traveler damage',c.damageBonus(s,lua.table_from({'id':1}),'dendro',e)==0)
s,a,e=scene();c.attack(s,a,'skill1');ticks(s,30);a.lock=999;c.action(s,'swap');ticks(s,550);check('bottle survives control swap and finishes ten hits',s.hits==10 and s.perfume.skill1 is not None);ticks(s,21);check('bottle expires after ten seconds',s.perfume.skill1 is None)
s,a,e=scene();c.attack(s,a,'skill1');a.lock=0;a.cd.skill1=0;c.attack(s,a,'skill1');check('one bottle per owner',len(s.pending)==1)
s,a,e=scene();c.attack(s,a,'skill1');a.lock=0;c.attack(s,a,'skill4');check('bottle and ultimate coexist',len(s.pending)==2)
s,a,e=scene();c.attack(s,a,'skill1');s.paused=True;ticks(s,700);check('pause freezes bottle',s.hits==0 and s.perfume.skill1 is not None)
s,a,e=scene();c.attack(s,a,'skill1');a.hp=0;ticks(s,700);check('death cancels bottle',s.hits==0 and s.perfume is None)
s,a,e=scene();c.attack(s,a,'skill1');c.action(s,'campaign');check('map cancels bottle',s.perfume is None and len(s.pending)==0)
s,a,e=scene();burn(e);c.companionAI(s,a,e);check('AI prioritizes burn boost',a.burnBoostUntil==8)
s,a,e=scene();traveler=s.actors[1];traveler.lock=0;c.attack(s,traveler,'SK21');traveler.lock=999;ticks(s,35);c.attack(s,a,'skill2');ticks(s,10);check('actual pyro then dendro history produces burning',e.burning is not None and e.burning.owner==2);ticks(s,25);check('actual burning enables buff',c.attack(s,a,'skill3'))
s,a,e=scene();c.action(s,'campaign');d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('emilie selection persists',r.companion=='emilie')
(ROOT/'evidence/emilie-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'emilie checks passed')
