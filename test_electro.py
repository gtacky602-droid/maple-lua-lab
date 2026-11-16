import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 s=c.new(16);c.action(s,'boss_electro');s.actors[2].hp=0
 return s,s.electroHypostasis
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
def hit(s,e,element='physical',key='test',atk=100000,reaction=False):
 c.resolveCast(s,lua.table_from(dict(id=1,x=e.x-10,y=480,dir=1,atk=atk,gain=0,range=80,limit=1,mult=1,color='#fff',element=element,key=key,reaction=reaction,targetId=e.id)))
s,b=start();hit(s,b);check('shell blocks attack',b.hp==420)
s.actors[1].x=150;tick(s,121);check('combo locks first target',b.phase=='combo_warning' and b.target==150)
s.actors[1].x=900;hp=s.actors[1].hp;tick(s,67);check('leaving telegraph avoids first attack',s.actors[1].hp==hp and b.combo==2)
tick(s,104);check('three attacks expose core',b.phase=='exposed')
hit(s,b);check('lethal attack awaits revival',b.hp==1 and s.kills==0)
tick(s);check('three prisms spawned',b.phase=='revival' and len(s.enemies)==4)
p=s.enemies[2];hit(s,p);hit(s,p,'hydro');hit(s,p,'electro');check('physical hydro electro ineffective regardless ATK',p.hp==3)
hit(s,p,'pyro');check('pyro one gauge independent of ATK',p.hp==2)
hit(s,p,'pyro');check('same skill application cooldown',p.hp==2)
hit(s,p,'cryo','reaction',reaction=True);check('secondary reaction cannot double apply',p.hp==2)
hit(s,p,'cryo','cold',atk=1);check('one ATK cryo still one gauge',p.hp==1)
hit(s,p,'dendro','grass');check('first prism destroyed without reward',p.hp==0 and b.destroyed==1 and s.kills==0 and s.mora==0)
tick(s,901);check('two remaining heal 35 percent',b.hp==147 and b.phase=='exposed')
hit(s,b);tick(s);check('broken prism absent next revival',len(s.enemies)==3 and all(s.enemies[i].index!=1 for i in (2,3)))
p=s.enemies[2];hit(s,p,'anemo');check('anemo half gauge',p.hp==2.5)
for i in (2,3):
 p=s.enemies[i]
 for j in range(3):hit(s,p,'pyro',str(j))
check('last prism immediately defeats boss once',b.hp==0 and b.phase=='defeated' and s.kills==1)
tick(s,400);check('no respawn or duplicate reward',s.kills==1 and b.hp==0 and len(s.enemies)==1)
c.action(s,'town');check('exit clears encounter',s.electroHypostasis is None)
s,b=start();b.phase='wave';b.timer=3;b.waveX=150;s.actors[1].x=150;s.actors[1].y=350;hp=s.actors[1].hp;tick(s);check('jump avoids ground wave',s.actors[1].hp==hp)
s.actors[1].y=480;s.actors[1].inv=0;tick(s);check('ground wave damages grounded actor',s.actors[1].hp<hp)
c.action(s,'pause');t=b.timer;tick(s,60);check('pause freezes phase',b.timer==t)
c.action(s,'pause');s.actors[1].hp=0;tick(s);check('wipe clears boss',s.electroHypostasis is None and s.campaign.zone=='town')
(ROOT/'evidence/electro-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'Electro checks passed')


