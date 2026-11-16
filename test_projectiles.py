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
s,a,es=scene();c.attack(s,a,'SK47');ticks(s,420);check('steam six hits over seven seconds',s.hits==6 and len(s.pending)==0)
s,a,es=scene();s.enemies=lua.table();c.spawnEnemyProjectile(s,100,300,1,0);ticks(s,1);normal=s.projectiles[1].angle
s,a,es=scene();s.enemies=lua.table();c.attack(s,a,'SK47');c.spawnEnemyProjectile(s,100,300,1,0);ticks(s,1)
check('steam reduces angular steering to twenty percent',abs(s.projectiles[1].angle-normal*.2)<1e-8 and s.projectiles[1].obscured)
s,a,es=scene();s.enemies=lua.table();c.spawnEnemyProjectile(s,300,450,1);ticks(s,40)
check('projectile hits and is consumed',a.hp==126 and len(s.projectiles)==0)
s,a,es=scene();s.enemies=lua.table();a.inv=2;c.spawnEnemyProjectile(s,300,450,1);ticks(s,40);check('invulnerability prevents projectile damage',a.hp==140 and len(s.projectiles)==0)
s,a,es=scene();s.enemies=lua.table();s.solids=lua.table_from([{'x':250,'y':380,'w':20,'h':100}],recursive=True);c.spawnEnemyProjectile(s,300,450,1);ticks(s,40)
check('solid wall blocks projectile',a.hp==140 and len(s.projectiles)==0)
s,a,es=scene();s.enemies=lua.table();c.attack(s,a,'SK06');c.spawnEnemyProjectile(s,300,450,1);ticks(s,40)
check('rock wall spends durability',a.hp==140 and s.rockWall.hp==146)
s,a,es=scene();s.enemies=lua.table();a.atk=4;c.attack(s,a,'SK06');c.spawnEnemyProjectile(s,300,450,1);ticks(s,40)
check('broken wall passes remaining projectile damage',s.rockWall is None and a.hp==132)
s,a,es=scene();s.enemies=lua.table();c.attack(s,a,'SK37');c.spawnEnemyProjectile(s,300,450,1);ticks(s,40)
check('coral wall blocks projectile',a.hp==140 and len(s.projectiles)==0)
s,a,es=scene();s.enemies=lua.table();c.spawnEnemyProjectile(s,1000,100,1);c.action(s,'pause');ticks(s,60);check('pause freezes projectile',s.projectiles[1].x==1000)
c.action(s,'pause');s.projectiles[1].life=.01;ticks(s,1);check('projectile lifetime expires',len(s.projectiles)==0)
s,a,es=scene()
for _ in range(128):c.spawnEnemyProjectile(s,1000,100,1)
check('projectile cap bounded',not c.spawnEnemyProjectile(s,1000,100,1) and len(s.projectiles)==128)
c.action(s,'campaign');check('map transition clears projectiles',len(s.projectiles)==0)
slots=[['SK47']]+[[] for _ in range(7)];check('steam skill equips',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('steam slot persists',r.loadout[1][1]=='SK47')
(ROOT/'evidence/projectiles-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'projectile checks passed')
