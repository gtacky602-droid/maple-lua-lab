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
def apply(s,e,element,key):
 c.resolveCast(s,lua.table_from({'id':1,'key':key,'atk':100,'x':e.x,'y':e.y,'targetId':e.id,'dir':1,'radial':True,'range':1,'limit':1,'mult':1,'element':element,'color':'#fff','gain':0}))
s,a,es=scene();apply(s,es[0],'dendro','grass');apply(s,es[0],'pyro','fire')
check('grass plus fire starts burning',es[0].burning.remaining==4 and es[0].aura is None and s.reactions[1].kind=='burning')
before=s.damage;ticks(s,240);check('burn four nonrecursive ticks and expiry',s.damage-before==112 and es[0].burning is None and len(s.reactions)==1)
s,a,es=scene((300,300));apply(s,es[0],'pyro','fire');apply(s,es[0],'dendro','grass');before=es[1].hp;ticks(s,60)
check('reverse order works and overlapping enemy untouched',es[0].burning.remaining==3 and es[1].hp==before)
s,a,es=scene();apply(s,es[0],'dendro','grass');apply(s,es[0],'anemo','wind');check('wind does not swirl grass',s.reactions is None and es[0].aura.element=='dendro')
s,a,es=scene((260,300,340,380));a.hp=50
for e in es:apply(s,e,'dendro','grass');apply(s,e,'pyro','fire')
check('ash life accepts burning targets',c.attack(s,a,'SK45'))
check('three burning enemies give sixteen percent max hp',abs(a.hp-72.4)<1e-8 and sum(e.burning is not None for e in es)==1)
check('ash cooldown enforced',not c.attack(s,a,'SK45'))
s,a,es=scene();a.hp=50;apply(s,es[0],'dendro','grass');apply(s,es[0],'pyro','fire');c.attack(s,a,'SK45')
check('one enemy scales healing to one third cap',abs(a.hp-(50+140*.16/3))<1e-8)
s,a,es=scene();check('no burning target no cast or cooldown',not c.attack(s,a,'SK45') and a.cd.SK45 is None)
s,a,es=scene();apply(s,es[0],'dendro','grass');apply(s,es[0],'pyro','fire');c.action(s,'pause');ticks(s,240)
check('pause freezes burn',es[0].burning.remaining==4)
c.action(s,'pause');es[0].hp=0;ticks(s,1);check('death clears burn',es[0].burning is None)
s,a,es=scene();es[0].chill=4;c.attack(s,a,'SK49');ticks(s,30);check('melt slash six cold boosted hits',s.hits==6 and s.damage==2400)
s,a,es=scene();c.attack(s,a,'SK49');ticks(s,30);check('melt slash without cold unboosted',s.damage==1998)
s,a,es=scene();c.action(s,'campaign');slots=[['SK45','SK49']]+[[] for _ in range(7)]
check('conditional skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('conditional slots persist',r.loadout[1][2]=='SK49')
(ROOT/'evidence/conditional-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'conditional checks passed')
