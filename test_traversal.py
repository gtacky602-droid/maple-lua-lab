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
s,a,es=scene();s.enemies=lua.table();check('grapple cast accepts authored point',c.attack(s,a,'SK46'));ticks(s,10)
check('grapple moves gradually not teleport',200<a.x<420 and 340<a.y<480)
ticks(s,30);check('grapple lands on target platform',a.x==420 and a.y==340 and a.ground and a.grapple is None)
s,a,es=scene();s.grappleNodes[1].locked=True;check('locked node rejected without cooldown',not c.attack(s,a,'SK46') and a.cd.SK46 is None)
s,a,es=scene();s.grappleNodes[1].requiredQuest='complete';check('quest gated node rejected',not c.attack(s,a,'SK46'))
s,a,es=scene();s.selectedGrapple=2;check('distant authored node rejected',not c.attack(s,a,'SK46'))
s,a,es=scene();s.solids=lua.table_from([{'x':290,'y':250,'w':30,'h':250}],recursive=True);check('wall blocks grapple path',not c.attack(s,a,'SK46'))
s,a,es=scene();c.attack(s,a,'SK46');s.solids=lua.table_from([{'x':290,'y':250,'w':30,'h':250}],recursive=True);ticks(s,20)
check('new obstacle interrupts grapple before collision',a.x+12<290 and a.grapple is None)
s,a,es=scene();c.attack(s,a,'SK46');c.action(s,'pause');ticks(s,30);check('pause freezes grapple',a.x==200)
s,a,es=scene();c.action(s,'grapple_next');check('node selection cycles',s.selectedGrapple==2)
c.action(s,'boss_anemo');check('no unapproved boss room grapple nodes',len(s.grappleNodes)==0 and not c.attack(s,a,'SK46'))
s,a,es=scene();s.enemies=lua.table();c.attack(s,a,'SK48')
for _ in range(60):c.step(s,1/60,lua.table_from({'right':True}))
check('ice run grounded speed sixty percent bonus',abs(a.x-536)<.001)
s,a,es=scene();s.enemies=lua.table();a.y=100;a.ground=False;c.attack(s,a,'SK48');c.step(s,1/60,lua.table_from({'right':True}))
check('ice speed not applied in air',abs(a.x-203.5)<.001)
s,a,es=scene((230,));c.attack(s,a,'SK48');ticks(s,360);check('ice contact five pulses over six seconds',s.hits==5 and len(s.pending)==0)
ticks(s,1);check('ice acceleration expires',a.iceRun==0)
s,a,es=scene();c.attack(s,a,'SK48');c.action(s,'campaign');check('map clears traversal buffs',a.iceRun==0 and a.grapple is None)
slots=[['SK46','SK48']]+[[] for _ in range(7)];check('traversal skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('restored town has authored nodes and loadout',len(r.grappleNodes)==3 and r.loadout[1][2]=='SK48')
(ROOT/'evidence/traversal-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'traversal checks passed')
