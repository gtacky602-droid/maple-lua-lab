import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def start():
 s=c.new(16);c.action(s,'boss_geo');s.actors[2].hp=0;return s,s.geoHypostasis
def hit(s,e,element='geo',key='test',atk=1):
 c.resolveCast(s,lua.table_from(dict(id=1,key=key,x=e.x-10,y=e.y,dir=1,range=50,limit=1,atk=atk,mult=1,element=element,gain=0,color='#fff',targetId=e.id)))
def destroy(s,p):
 for i in range(3):hit(s,p,'geo',str(i))
s,b=start();check('four pillars and shielded elevated core',len(s.enemies)==5 and b.y==330 and b.invulnerable)
hp=b.hp;hit(s,b,'pyro',atk=100000);check('shell blocks attack',b.hp==hp)
p=s.enemies[2];hit(s,p,'pyro',atk=100000);check('non blunt element cannot brute force pillar',p.hp==6)
hit(s,p,'physical','n',atk=100000);check('physical gauge independent of ATK',p.hp==5.5)
hit(s,p);hit(s,p);check('geo stronger with application cooldown',p.hp==3.5)
hit(s,p,'geo','two');hit(s,p,'geo','three');check('occupied pillar drops core without rewards',p.hp==0 and b.phase=='down' and b.y==480 and s.kills==0 and s.mora==0)
hp=b.hp;hit(s,b,'geo',atk=10000);check('core immune to geo',b.hp==hp)
tick(s,361);check('recovers onto another pillar',b.activePillar.index==2 and b.y==330)
p=s.enemies[5];destroy(s,p);check('unoccupied pillar break does not drop core',b.phase=='perched' and b.breaks==1)
destroy(s,b.activePillar);hit(s,b,'physical',atk=100000);check('lethal core damage waits for revival',b.hp==1 and s.kills==0)
tick(s);check('three revival pillars replace normal pillars',b.phase=='revival' and len(s.enemies)==4 and s.enemies[2].revivalPillar)
destroy(s,s.enemies[2]);check('first revival pillar persists as destroyed',b.destroyed==1 and s.kills==0)
tick(s,901);check('two pillars heal 35 percent and restore four normal pillars',b.hp==175 and len(s.enemies)==5 and b.phase=='perched')
destroy(s,b.activePillar);hit(s,b,'physical',atk=100000);tick(s);check('broken revival pillar does not return',len(s.enemies)==3 and all(s.enemies[i].index!=1 for i in (2,3)))
destroy(s,s.enemies[2]);destroy(s,s.enemies[3]);check('last revival pillar immediately defeats once',b.hp==0 and s.kills==1)
tick(s,400);check('no respawn and objects cleaned',b.hp==0 and s.kills==1 and len(s.enemies)==1)
c.action(s,'town');check('exit clears encounter',s.geoHypostasis is None)
s,b=start()
for i in (2,3,4,5):destroy(s,s.enemies[i])
tick(s,361);check('all normal pillars destroyed leads to ground combat',b.phase=='ground_ready' and b.y==480)
tick(s,121);check('ground hammer telegraphs',b.phase=='hammer_warning')
c.action(s,'pause');timer=b.timer;tick(s,30);check('pause freezes phase',b.timer==timer);c.action(s,'pause')
s.actors[1].hp=0;tick(s);check('wipe cleans encounter',s.geoHypostasis is None)
s,b=start();tick(s,210);check('pillar shooting spawns attributed projectile',any(p.source==b.id for _,p in s.projectiles.items()))
destroy(s,b.activePillar);check('pillar collapse cancels owned projectiles',len(s.projectiles)==0 and b.phase=='down')
(ROOT/'evidence/geo-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'Geo checks passed')
