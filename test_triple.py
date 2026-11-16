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
s,a,es=scene((300,));es[0].y=330;es[0].immune='anemo';c.attack(s,a,'SK50');ticks(s,60);check('triple damage keeps other two thirds when one immune',s.damage==73)
s,a,es=scene((300,));es[0].y=330;c.attack(s,a,'SK50');p=s.platforms[len(s.platforms)];a.x=p.x+80;a.y=310;a.vy=100;ticks(s,15)
check('aerial garden supports actor',a.y==330 and a.ground)
ticks(s,585);check('garden ten strikes and ten second platform expiry',s.hits==10 and len(s.pending)==0 and not any(p.structure=='garden' for _,p in s.platforms.items()))
s,a,es=scene((300,));c.attack(s,a,'SK51');ticks(s,54);check('ten shared shots concentrate on single target',s.hits==10 and s.damage==1710)
s,a,es=scene((300,350,400,450,500));c.attack(s,a,'SK51');ticks(s,54)
check('ten shared shots not ten per target',s.hits==10 and all(e.hp==9658 for e in es))
s,a,es=scene((300,));c.attack(s,a,'SK51');es[0].x=1000;ticks(s,54);check('locked projectiles track moving target within bound',s.hits==10)
s,a,es=scene();c.attack(s,a,'SK52');ticks(s,180);check('steam cannon twelve hits in three seconds',s.hits==12 and a.channel is None and len(s.pending)==0)
s,a,es=scene();c.attack(s,a,'SK52');ticks(s,30);hits=s.hits;c.action(s,'cancel_channel');ticks(s,180)
check('explicit cannon interruption stops damage and retains cooldown',s.hits==hits and a.channel is None and a.cd.SK52>30)
s,a,es=scene();c.attack(s,a,'SK52');ticks(s,15);c.damageActor(s,a,10,es[0],False);ticks(s,30)
check('damage interrupts channel',s.hits==1 and a.channel is None)
s,a,es=scene();c.attack(s,a,'SK52');c.step(s,1/60,lua.table_from({'right':True}));check('movement cancels cannon and moves',a.channel is None and a.x>200)
s,a,es=scene();c.attack(s,a,'SK52');c.action(s,'pause');ticks(s,180);check('pause freezes cannon',s.hits==0 and a.channel=='SK52')
s,a,es=scene((360,));es[0].boss=True;c.attack(s,a,'SK53');ticks(s,720);check('fortress twelve hits and does not trap boss',s.hits==12 and len(s.pending)==0 and s.solids is None)
s,a,es=scene();c.attack(s,a,'SK53');a.lock=0;a.cd.SK53=0;c.attack(s,a,'SK53');check('one fortress per actor',len(s.pending)==1)
c.action(s,'campaign');check('map clears triple structures',len(s.pending)==0)
slots=[['SK50','SK51','SK52'],['SK53']]+[[] for _ in range(6)];check('triple skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('triple skills persist',r.loadout[2][1]=='SK53')
(ROOT/'evidence/triple-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8');print(len(checks),'triple checks passed')
