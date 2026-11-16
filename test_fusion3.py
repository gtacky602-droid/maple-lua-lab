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
s,a,es=scene();c.attack(s,a,'SK37');c.damageActor(s,a,100,es[0],True)
check('coral blocks crossing direct damage',a.hp==140)
a.inv=0;c.damageActor(s,a,20,es[0],False);check('area damage bypasses coral',a.hp==120)
s,a,es=scene();s.enemies=lua.table();a.hp=50;c.attack(s,a,'SK37');ticks(s,480)
check('behind wall eight pulses 4.8 percent healing',abs(a.hp-56.72)<1e-8 and s.coralWall is None)
s,a,es=scene();s.enemies=lua.table();a.hp=50;c.attack(s,a,'SK37');a.x=300;ticks(s,60);check('front of wall not healed',a.hp==50)
s,a,es=scene();c.attack(s,a,'SK37');a.lock=0;a.cd.SK37=0;a.x=400;c.attack(s,a,'SK37');check('coral replacement single wall',s.coralWall.x==460)
s,a,es=scene((230,));c.attack(s,a,'SK38');c.damageActor(s,a,100,es[0],False)
check('lava armor reduces incoming damage twenty percent',a.hp==60)
ticks(s,600);check('lava contact ten hits over ten seconds',s.hits==10 and len(s.pending)==0)
ticks(s,1);a.inv=0;c.damageActor(s,a,20,es[0],False);check('armor reduction expires',a.hp==40 and a.lavaArmor==0)
s,a,es=scene((230,));c.attack(s,a,'SK38');a.lock=0;c.attack(s,a,'SK20');c.damageActor(s,a,100,es[0],False)
check('armor mitigation before shield absorption',a.hp==140 and a.waterShield.hp==60)
s,a,es=scene();es[0].chill=4;c.attack(s,a,'SK39');ticks(s,45);check('cold target twenty percent bonus six hits',s.damage==2400 and s.hits==6)
s,a,es=scene();c.attack(s,a,'SK39');check('first unchilled hit no bonus',s.damage==333)
ticks(s,9);check('next hit can use own cryo aura',s.damage==733)
s,a,es=scene((320,));c.attack(s,a,'SK40');a.x=1000;ticks(s,600);check('tree fixed position ten strikes',s.hits==10 and len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK37');a.lock=0;c.attack(s,a,'SK38');c.action(s,'pause');ticks(s,120)
check('pause freezes defenses',s.coralWall.elapsed==0 and a.lavaArmor==10)
c.action(s,'campaign');check('map clears defense buffs',s.coralWall is None and a.lavaArmor==0)
slots=[['SK37','SK38','SK39'],['SK40']]+[[] for _ in range(6)]
check('defense skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('defense slots persist',r.loadout[2][1]=='SK40')
(ROOT/'evidence/fusion3-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'fusion3 checks passed')
