import json
from runtime import runtime, ROOT
lua,c=runtime();s=c.new(16);c.action(s,'boss_anemo');b=s.encounter
checks=[]
def check(name,condition):
    assert condition,name
    checks.append(name)
def tick(n=1):
    for _ in range(n): c.step(s,1/60,lua.table())
def strike():
    a=s.actors[1];a.x=b.x-30;a.y=480;a.dir=1;a.lock=0;a.cd=lua.table();a.atk=1000
    c.attack(s,a,'normal')
s.actors[2].hp=0
strike();check('shell blocks damage',b.hp==300)
s.actors[1].x=150;s.actors[1].inv=0
tick(121);check('clap telegraph locks position',b.phase=='clap_warning' and b.target==150)
s.actors[1].x=900;hp=s.actors[1].hp;tick(74)
check('moving avoids clap',s.actors[1].hp==hp and b.phase=='exposed')
strike();check('lethal damage gated until revival',b.hp==1 and s.kills==0)
tick();check('low hp starts four orb revival',b.phase=='revival' and len(b.orbs)==4)
assert '残った風玉で回復（あと12.0秒）' in c.frame(s).boss.label
strike();check('revival invulnerable',b.hp==1)
s.actors[1].x=b.orbs[1].x;s.actors[1].y=345;tick()
check('airborne collection',b.collected==1 and b.orbs[1].taken)
s.actors[1].x=900;tick(730)
check('uncollected orbs heal boss',b.hp==195 and b.phase=='exposed')
strike();tick();check('collected orb does not return',b.phase=='revival' and b.orbs[1].taken)
for i in range(2,5):
    s.actors[1].x=b.orbs[i].x;s.actors[1].y=345;tick()
check('all orbs disable revival',b.collected==4 and b.minhp is None and b.phase=='exposed')
strike();tick(420);check('final kill and no respawn',b.hp==0 and s.kills==1 and b.phase=='defeated')
c.action(s,'town');check('exit cleans encounter',s.encounter is None and len(s.enemies)==0)
c.action(s,'boss_anemo');b=s.encounter;s.actors[2].hp=0;s.actors[1].x=940
tick(2*60+73+4*60+91+73)
check('second attack has moving vortices',b.phase=='vortices' and len(b.vortices)==2)
x=b.vortices[1].x;tick(10);check('vortices move',b.vortices[1].x>x)
c.action(s,'pause');t=b.timer;tick(60);check('pause freezes boss',b.timer==t)
c.action(s,'pause');s.actors[1].hp=0;s.actors[2].hp=0;tick()
check('wipe returns to town and removes boss',s.encounter is None and s.campaign.zone=='town')
c.action(s,'boss_anemo');b=s.encounter
s.actors[2].hp=0;b.hp=1;tick()
a=s.actors[1];a.x=160;a.y=480;a.vy=0
for _ in range(45): c.step(s,1/60,lua.table_from({'jump':True}))
check('updraft lifts player from ground to collect orb',b.orbs[1].taken and a.y<400)
a.x=940;a.y=480;a.vy=0;a.dir=1;a.cd.dodge=0;c.action(s,'dodge')
for _ in range(60): c.step(s,1/60,lua.table_from({'right':True}))
check('arena boundary keeps player on floor',a.x<=940 and a.y==480)
(ROOT/'evidence/anemo-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'Anemo checks passed')
