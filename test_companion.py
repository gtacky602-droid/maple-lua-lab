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
def colscene():
 s,a,es=scene();enemies=s.enemies;c.action(s,'campaign');c.action(s,'companion:columbina');s.enemies=enemies;s.active=2;s.actors[1].hp=0;b=s.actors[2];b.hp=140;b.atk=100;b.x=200;return s,b,es
s,b,es=colscene();c.attack(s,b,'normal');ticks(s,8);check('normal first hit waits 150ms',s.hits==0)
ticks(s,11);check('normal water three hits',s.hits==3 and s.damage==255 and es[0].aura.element=='hydro')
s,b,es=colscene();c.attack(s,b,'skill1');ticks(s,348);check('ripple ten hits at source timings',s.hits==10 and s.damage==660)
s,b,es=colscene();c.attack(s,b,'skill2');ticks(s,540);check('moon domain eight hits',s.hits==8 and s.damage==336 and s.moonDomain==10)
s,b,es=colscene();c.attack(s,b,'skill4');ticks(s,53);check('ultimate ten hits',s.hits==10 and s.damage==1040)
s,b,es=colscene();c.attack(s,b,'skill3');check('mark no direct attack and source duration',s.hits==0 and s.moonMark==10)
s,b,es=colscene();a=s.actors[1];a.hp=140;a.atk=100;s.active=1;b.lock=999;s.moonMark=10;s.moonDomain=10
c.attack(s,a,'SK05');check('eligible traveler hit triggers one 120 percent proxy',s.hits==2 and s.damage==285)
ticks(s,8);check('one second global ICD suppresses extra multi hit proxy',s.hits==3)
check('proxy does not recursively trigger itself',sum(e.reaction==True for _,e in s.events.items())==1)
s,b,es=colscene();a=s.actors[1];a.hp=140;s.active=1;b.lock=999;s.moonMark=10;c.attack(s,a,'SK05')
check('mark without domain no proxy',s.hits==1)
s,b,es=colscene();s.actors[1].hp=140;s.moonMark=10;s.moonDomain=10;b.hp=0;ticks(s,1);check('dead companion removes support',s.moonMark==0 and s.moonDomain==0)
s,b,es=colscene();c.action(s,'field');c.action(s,'companion:amber');check('cannot change companion in field',s.companion=='columbina')
c.action(s,'town');c.action(s,'companion:amber');check('town selection works and clears buffs',s.companion=='amber' and s.moonMark==0)
c.action(s,'companion:columbina');r=c.restore(c.checkpoint(s));check('companion selection saved',r.companion=='columbina')
from savegame import validate_save
from runtime import native
saved=native(c.checkpoint(s));validate_save(saved);saved['companion']='unknown'
try:validate_save(saved);valid=False
except ValueError:valid=True
check('unknown companion rejected by save validator',valid)
saved.pop('companion');r=c.restore(lua.table_from(saved,recursive=True));check('old saves default to amber',r.companion=='amber')
(ROOT/'evidence/companion-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'companion checks passed')
