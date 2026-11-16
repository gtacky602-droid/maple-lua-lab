import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene(xs=(300,)):
 s=c.new(12);a=s.actors[1];a.atk=100;s.actors[2].hp=0;es=[]
 for i,x in enumerate(xs):
  e=s.enemies[i+1];e.x=x;e.home=x;e.y=480;e.hp=10000;e.maxhp=10000;e.custom=True;es.append(e)
 s.enemies=lua.table_from(es);return s,a,es
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
s,a,es=scene((250,270,290,310,330,350));c.attack(s,a,'SK21');ticks(s,18)
check('slash three hits five targets',s.hits==15 and s.damage==185*15 and es[5].hp==10000)
check('slash cooldown rejects repeat',not c.attack(s,a,'SK21'))
s,a,es=scene((380,));c.attack(s,a,'SK22');p=s.pending[1];check('pillar placed ahead',p.x==380 and p.radial)
ticks(s,59);check('pillar first pulse at one second',s.hits==0)
ticks(s,1);check('pillar 175 percent hit',s.hits==1 and s.damage==166)
a.x=1000;ticks(s,240);check('pillar stays fixed five pulses and expires',s.hits==5 and len(s.pending)==0)
s,a,es=scene((100,));a.dir=-1;c.attack(s,a,'SK22');check('pillar respects facing and world edge',s.pending[1].x==20)
s,a,es=scene((260,360,460,560,660));c.attack(s,a,'SK23');ticks(s,46)
check('flame dash moves through path',680<a.x<700 and a.dash==0 and es[4].hp<10000)
check('dash resolves six pulses',len(s.pending)==0)
s,a,es=scene();s.solids=lua.table_from([{'x':250,'y':380,'w':30,'h':100}],recursive=True);c.attack(s,a,'SK23');ticks(s,46)
check('flame dash respects wall',a.x+12<=250)
s,a,es=scene((110,300,700));c.attack(s,a,'SK24');ticks(s,60)
check('ring attacks front and rear',s.hits==2 and s.damage==218)
a.x=700;ticks(s,60);check('ring follows owner to new targets',s.hits==3 and es[2].hp==9891)
ticks(s,360);check('ring eight pulses over eight seconds',s.hits==9 and len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK24');a.lock=0;a.cd.SK24=0;c.attack(s,a,'SK24');check('ring replacement cannot stack',len(s.pending)==1)
c.action(s,'pause');ticks(s,120);check('pause freezes ring',s.hits==0 and len(s.pending)==1)
c.action(s,'pause');a.hp=0;ticks(s,1);check('death cancels ring',len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK22');a.lock=0;c.attack(s,a,'SK24');c.action(s,'campaign');check('transition clears both fire effects',len(s.pending)==0)
s,a,es=scene();c.action(s,'campaign');slots=[['SK21','SK22','SK24'],['SK23']]+[[] for _ in range(6)]
check('fire skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('fire loadout persists',r.loadout[1][3]=='SK24' and r.loadout[2][1]=='SK23')
(ROOT/'evidence/pyro-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'pyro checks passed')
