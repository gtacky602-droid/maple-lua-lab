import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.actors[2].hp=0;es=[]
 for i in range(5):
  e=s.enemies[i+1];e.x=300+i*20;e.y=480;e.home=e.x;e.hp=10000;e.maxhp=10000;e.custom=True;es.append(e)
 s.enemies=lua.table_from(es);return s,es
def strike(s,element,owner=1,key='test',reaction=False):
 c.resolveCast(s,lua.table_from({'id':owner,'key':key,'atk':100,'x':280,'y':480,'dir':1,'range':30,'limit':1,'mult':1,'element':element,'color':'#fff','gain':0,'reaction':reaction}))
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
s,es=scene();strike(s,'pyro',2);check('amber-owned fire aura',es[0].aura.element=='pyro' and es[0].aura.owner==2)
strike(s,'anemo',1);check('traveler triggers owned swirl',len(s.reactions)==1 and s.reactions[1].owner==1 and s.reactions[1].auraOwner==2)
check('swirl hits four nearby enemies with no recursion',s.hits==6 and es[4].hp==10000 and es[0].aura is None and es[1].aura is None)
check('reaction damage identified in events',sum(bool(e.reaction) for _,e in s.events.items())==4)
check('reaction awards no gauge',s.gauge==60)
strike(s,'pyro',2);check('same skill aura ICD blocks repeat',es[0].aura is None)
strike(s,'pyro',2,'other');strike(s,'anemo',1);check('wind ICD blocks repeated swirl',len(s.reactions)==1)
ticks(s,151);strike(s,'anemo',1);check('wind allowed after ICD',len(s.reactions)==2)
s,es=scene();strike(s,'hydro');ticks(s,361);check('aura expires after six seconds',es[0].aura is None)
s,es=scene();strike(s,'cryo');c.action(s,'pause');ticks(s,500);check('pause preserves aura',es[0].aura is not None)
s,es=scene();es[0].immune='pyro';strike(s,'pyro');check('immune hit applies no aura',es[0].aura is None)
s,es=scene();strike(s,'pyro',reaction=True);check('reaction damage cannot apply aura',es[0].aura is None)
s,es=scene();strike(s,'pyro');es[0].hp=0;ticks(s,1);check('death clears aura and ICD',es[0].aura is None and es[0].applicationClocks is None)
s,es=scene();strike(s,'pyro');strike(s,'physical');check('physical does not consume aura',es[0].aura.element=='pyro')
strike(s,'hydro',1,'water');check('unimplemented pair replaces aura without fake reaction',es[0].aura.element=='hydro' and s.reactions is None)
(ROOT/'evidence/reactions-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'reaction checks passed')
