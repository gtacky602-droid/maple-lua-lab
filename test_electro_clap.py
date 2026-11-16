import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1,**keys):
 for _ in range(n):c.step(s,1/60,lua.table_from(keys))
def start(x=300):
 s=c.new(16);c.action(s,'boss_electro');b=s.electroHypostasis;a=s.actors[1];a.x=x;a.inv=0;s.actors[2].hp=0;b.cycle=6;b.timer=0;tick(s)
 return s,b,a
s,b,a=start();check('seventh attack moves near player and warns',b.phase=='clap_warning' and b.x==300 and b.clapCenter==300 and b.invulnerable)
hp=a.hp;tick(s,68,right=True);check('walking out of locked target avoids clap',a.hp==hp and b.phase=='clap_impact' and b.clapCenter==300)
tick(s,16);check('recovery exposes core',b.phase=='exposed' and not b.invulnerable)
s,b,a=start();hp=a.hp;tick(s,68);check('staying takes one hit',a.hp==hp-28)
a.inv=0;tick(s,10);check('impact does not repeatedly hit',a.hp==hp-28)
s,b,a=start();tick(s,40);c.action(s,'jump');hp=a.hp;tick(s,28,jump=True);check('timed normal jump avoids ground clap',a.hp==hp)
s,b,a=start(940);check('edge clamp stays on arena',b.clapCenter==830);c.action(s,'pause');t=b.timer;tick(s,20);check('pause freezes tell',b.timer==t);c.action(s,'pause')
b.hp=1;tick(s);check('revival cancels clap',b.phase=='revival')
c.action(s,'town');check('exit clears encounter',s.electroHypostasis is None)
(ROOT/'evidence/electro-clap-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'clap checks passed')
