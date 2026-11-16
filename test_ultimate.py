import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene(n=1):
 s=c.new(20);a=s.actors[1];a.atk=100;s.actors[2].lock=999;s.gauge=100;es=[]
 for i in range(n):
  e=s.enemies[i+1];e.x=260+i*10;e.home=e.x;e.y=480;e.hp=100000+i*100;e.maxhp=e.hp;e.custom=True;es.append(e)
 s.enemies=lua.table_from(es);return s,a,es
def ticks(s,n):
 for _ in range(n):c.step(s,1/60,lua.table())
s,a,es=scene();check('cast spends full common gauge',c.attack(s,a,'SK60') and s.gauge==0 and a.cd.SK60==90)
ticks(s,161);check('twenty broad pulses before final',s.hits==20 and s.damage==4760 and s.ultimate is not None)
ticks(s,7);check('single twelve hundred percent final hit',s.hits==21 and s.damage==5902 and s.ultimate is None)
check('ultimate cannot refund its gauge',s.gauge==0);ticks(s,60);check('final occurs once',s.hits==21)
s,a,es=scene(16);c.attack(s,a,'SK60');ticks(s,168);check('fifteen targets per broad pulse plus one final',s.hits==301)
check('final selects highest remaining HP including outside first fifteen',es[15].hp==101500-1142 and es[0].hp==100000-4760)
s,a,es=scene(2);es[1].hp=100000;c.attack(s,a,'SK60');ticks(s,168);check('equal remaining HP tie resolves by ID',es[0].hp==94098 and es[1].hp==95240)
s,a,es=scene(2);es[1].x=1800;c.attack(s,a,'SK60');ticks(s,168);check('final cannot reach outside authored range',es[1].hp==100100 and s.hits==21)
s,a,es=scene();s.gauge=99;check('insufficient gauge rejected without cooldown',not c.attack(s,a,'SK60') and a.cd.SK60 is None and s.gauge==99)
s,a,es=scene();c.attack(s,a,'SK60');s.paused=True;ticks(s,200);check('pause freezes all segments',s.hits==0 and s.ultimate.finish==2.8)
s,a,es=scene();c.attack(s,a,'SK60');a.hp=0;ticks(s,200);check('death cancels pending and final',s.hits==0 and s.ultimate is None and len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK60');c.action(s,'campaign');ticks(s,200);check('map clears final',s.ultimate is None and s.hits==0)
s,a,es=scene();es[0].immune='anemo';c.attack(s,a,'SK60');ticks(s,8);check('seven element resistance averaged once',s.damage==204)
s,a,es=scene();a.elementBonus=.2;a.light=12;c.attack(s,a,'SK60');ticks(s,8);check('element equipment and light bonus applied once',s.damage==328)
check('ultimate adds no ordinary aura',es[0].aura is None)
s,a,es=scene();c.attack(s,a,'SK09');ticks(s,40);source=s.echoSource;c.attack(s,a,'SK60');check('ultimate excluded from echo record',s.echoSource.cast.key=='SK09')
s,a,es=scene();c.action(s,'light');ticks(s,22);check('light and ultimate share same resource',s.gauge==40 and not c.attack(s,a,'SK60'))
s,a,es=scene();c.action(s,'campaign');c.configure(s,lua.table_from([['SK60']]+[[] for _ in range(7)],recursive=True));d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('slot saved with shared gauge',r.loadout[1][1]=='SK60' and r.gauge==100);c.action(s,'slot1');ticks(s,1);check('macro activates ultimate',s.ultimate is not None and s.macro is None)
(ROOT/'evidence/ultimate-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'ultimate checks passed')
