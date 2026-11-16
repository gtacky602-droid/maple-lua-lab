import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.enemies=lua.table();a=s.actors[1];a.atk=100;a.x=200;a.y=480;a.dir=1;c.attack(s,a,'SK06');return s,a
src=lua.table_from({'id':99,'x':280,'y':480})
s,a=scene();check('wall durability equals attack x 160 percent',s.rockWall.hp==160)
hp=a.hp;c.damageActor(s,a,30,src,True)
check('intervening wall absorbs direct attack',a.hp==hp and s.rockWall.hp==130)
c.damageActor(s,a,30,src,True);check('invulnerability prevents duplicate drain',s.rockWall.hp==130)
a.inv=0;c.damageActor(s,a,150,src,True)
check('broken wall lets excess damage through',s.rockWall is None and a.hp==hp-20)
s,a=scene();hp=a.hp;c.damageActor(s,a,30,src,False)
check('area attack bypasses wall',a.hp==hp-30 and s.rockWall.hp==160)
s,a=scene();hp=a.hp;src.x=180;c.damageActor(s,a,30,src,True)
check('wall behind actor does not protect',a.hp==hp-30)
s,a=scene();src.x=280;src.y=100;a.y=100;hp=a.hp;c.damageActor(s,a,30,src,True)
check('attack above wall not intercepted',a.hp==hp-30)
s,a=scene();b=s.actors[2];b.x=200;b.y=480;src.y=480;c.damageActor(s,b,30,src,True)
check('wall protects companion in same geometry',b.hp==140 and s.rockWall.hp==130)
a.lock=0;a.cd.SK06=0;a.atk=200;c.attack(s,a,'SK06')
check('new cast replaces old wall',s.rockWall.hp==320)
for _ in range(421):c.step(s,1/60,lua.table())
check('wall expires at seven seconds',s.rockWall is None)
s,a=scene();c.action(s,'pause');life=s.rockWall.life
for _ in range(60):c.step(s,1/60,lua.table())
check('pause freezes wall',s.rockWall.life==life)
c.action(s,'campaign');check('map transition removes wall',s.rockWall is None)
(ROOT/'evidence/wall-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'wall checks passed')
