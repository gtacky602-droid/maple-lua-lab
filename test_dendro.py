import json
from runtime import runtime,ROOT
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def scene():
 s=c.new(12);s.actors[2].hp=0;a=s.actors[1];a.atk=100
 e=s.enemies[1];e.hp=10000;e.maxhp=10000;e.x=320;e.home=320;e.y=480;e.custom=True
 s.enemies=lua.table_from([e]);return s,a,e
def ticks(s,n,jump=False):
 for _ in range(n):c.step(s,1/60,lua.table_from({'jump':jump}))
s,a,e=scene();c.attack(s,a,'SK13');ticks(s,9)
check('bind two hits at 90 percent',s.hits==2 and s.damage==170 and e.root>1.9)
e.custom=False;x=e.x;ticks(s,100);check('root prevents wandering',e.x==x)
ticks(s,25);check('root expires and movement resumes',e.root==0 and e.x!=x)
s,a,e=scene();e.boss=True;c.attack(s,a,'SK13');check('boss slowed not rooted',e.slow==2 and not e.root and c.enemyRate(e)==.7)
s,a,e=scene();e.invulnerable=True;c.attack(s,a,'SK13');check('immune phase rejects bind',not e.root and not e.slow)
s,a,e=scene();e.y=340;c.attack(s,a,'SK14');ticks(s,27);check('vine attack reaches one upper tier',s.hits==4 and s.damage==644)
s,a,e=scene();e.y=300;c.attack(s,a,'SK14');ticks(s,27);check('vine attack excludes too high targets',s.hits==0)
s,a,e=scene();a.y=340;c.attack(s,a,'SK14');ticks(s,27);check('upper tier attack excludes lower floor',s.hits==0)
s,a,e=scene();e.y=340;c.attack(s,a,'SK15');e.x=800;e.y=260;ticks(s,60)
check('seeds track moving target for six hits',s.hits==6 and s.damage==738)
s,a,e=scene();c.attack(s,a,'SK15');e.x=1200;ticks(s,60);check('tracking has bounded range',s.hits==1)
s,a,e=scene();s.enemies=lua.table();c.attack(s,a,'SK16');p=s.platforms[len(s.platforms)]
check('vine seven second climbable structure',p.structure=='vine' and p.life==7 and p.base-p.y==160)
a.x=p.x+60;ticks(s,48,True);ticks(s,20)
check('climb reaches and lands on vine top',a.y==p.y and a.ground)
ticks(s,360);check('expired vine releases actor',len(s.platforms)==4 and a.y>p.y)
s,a,e=scene();s.enemies=lua.table()
for key in ['SK08','SK08','SK16','SK16','SK16']:
 a.cd[key]=0;a.lock=0;c.attack(s,a,key)
check('separate caps two stones two vines',sum(p.structure=='vine' for _,p in s.platforms.items())==2 and sum(p.structure=='stone' for _,p in s.platforms.items())==2)
c.action(s,'pause');life=s.platforms[len(s.platforms)].life;ticks(s,60);check('pause preserves vine life',s.platforms[len(s.platforms)].life==life)
c.action(s,'campaign');check('transition clears vines',not any(p.temporary for _,p in s.platforms.items()))
s,a,e=scene();c.action(s,'boss_anemo');b=s.encounter;b.phase='exposed';b.invulnerable=False;b.timer=4;a.x=500;c.attack(s,a,'SK13');ticks(s,60)
check('boss phase clock slows without stopping',3.25<b.timer<3.35 and not b.root)
s,a,e=scene();c.action(s,'campaign');slots=[['SK13','SK14','SK15'],['SK16']]+[[] for _ in range(6)]
check('grass skills equip',c.configure(s,lua.table_from(slots,recursive=True))[0])
r=c.restore(c.checkpoint(s));check('grass loadout persists',r.loadout[1][3]=='SK15' and r.loadout[2][1]=='SK16')
(ROOT/'evidence/dendro-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
print(len(checks),'dendro checks passed')
