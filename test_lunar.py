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
def moon_scene():
 s,a,es=scene();s.companion='columbina';s.actors[2].hp=140;s.actors[2].lock=999;return s,a,es
s,a,es=scene();check('amber cannot cast lunar skill',not c.attack(s,a,'SK54') and a.cd.SK54 is None)
s,a,es=moon_scene();s.actors[2].hp=0;check('dead companion cannot enable skill',not c.attack(s,a,'SK55'))
s,a,es=moon_scene();c.attack(s,a,'SK54');ticks(s,720);check('moon orb twelve 90 percent hits',s.hits==12 and s.damage==1020 and len(s.pending)==0)
s,a,es=moon_scene();c.attack(s,a,'SK55');ticks(s,480);check('moon ring ten 125 percent hits',s.hits==10 and s.damage==1190 and len(s.pending)==0)
s,a,es=moon_scene();s.moonDomain=20;s.moonMark=20;c.attack(s,a,'SK54');ticks(s,120)
check('lunar direct damage does not trigger proxy or aura',s.hits==2 and es[0].aura is None and not any(e.reaction for _,e in s.events.items()))
s,a,es=moon_scene();c.attack(s,a,'SK54');ticks(s,60);s.actors[2].hp=0;ticks(s,120)
check('companion death cancels pending moon skill',s.hits==1 and len(s.pending)==0 and a.cd.SK54>18)
s,a,es=moon_scene();c.attack(s,a,'SK55');s.companion='amber';ticks(s,1);check('companion change cancels moon skill',len(s.pending)==0)
s,a,es=moon_scene();c.attack(s,a,'SK54');c.action(s,'pause');ticks(s,120);check('pause freezes moon pulses',s.hits==0)
s,a,es=moon_scene();es[0].immune='electro';c.attack(s,a,'SK54');ticks(s,60);check('moon equal split resistance applied once',s.damage==42)
s,a,es=moon_scene();a.elementBonus=.2;c.attack(s,a,'SK54');ticks(s,60);check('all element bonus not doubled',s.damage==102)
s,a,es=scene();c.action(s,'campaign');slots=[['SK54','SK55']]+[[] for _ in range(7)]
check('lunar loadout can be prepared in town',c.configure(s,lua.table_from(slots,recursive=True))[0])
c.action(s,'slot1');ticks(s,1);check('unmet macro condition cancels with message',s.macro is None and s.skillNotice is not None and len(s.pending)==0)
c.action(s,'companion:columbina');c.action(s,'slot1');ticks(s,35);check('eligible companion allows both lunar macro casts',len(s.pending)==2)
r=c.restore(c.checkpoint(s));check('lunar loadout and companion persist',r.companion=='columbina' and r.loadout[1][2]=='SK55')
(ROOT/'evidence/lunar-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'lunar checks passed')
