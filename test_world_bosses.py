import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
for id,action,hub in [('thunder','boss_thunder','inazuma-port'),('array','boss_array','inazuma-port'),('maguu','boss_maguu','inazuma-port'),('primo','boss_primo','liyue-harbor'),('oceanid','boss_oceanid','liyue-harbor'),('geo','boss_geo','liyue-harbor'),('electro','boss_electro','mond-town'),('anemo','boss_anemo','mond-town'),('cryo','boss_cryo_regisvine','mond-town'),('pyro','boss_pyro_regisvine','liyue-harbor')]:
 s=c.new(16);c.action(s,'story_start')
 if id in ('maguu','array','thunder'):c.grantExp(s,500000,'quest');c.enterStoryNode(s,hub)
 if id in ('pyro','geo','oceanid','primo'):c.grantExp(s,50000,'quest');c.enterStoryNode(s,hub)
 c.action(s,'story_accept:'+id+'-commission');c.enterStoryNode(s,id+'-approach')
 c.action(s,'world_boss:'+id);check(id+' remote challenge blocked',s.bossJourney is None)
 s.actors[1].x=720;c.action(s,'world_boss:'+id);check(id+' journey starts',s.bossJourney.id==id and not s.story.active)
 saved=validate_save(native(c.checkpoint(s)));check(id+' save does not mutate live story',saved['story']['active'] and not s.story.active)
 restored=c.restore(lua.table_from(saved,recursive=True),16);check(id+' restore resumes checkpoint hub',restored.story.active and restored.story.node==hub)
 b=s.enemies[1];b.invulnerable=False;b.minhp=None;b.hp=1
 a=s.actors[1];a.x=b.x-20;a.y=b.y;a.dir=1;a.atk=100;a.lock=0;a.cd=lua.table();c.attack(s,a,'normal');tick(s)
 check(id+' boss kill advances accepted commission',s.bossJourney.defeated and s.story.quests[id+'-commission'].count==1)
 # Validate a real boss-zone artifact record, regardless of random drop roll.
 c.giveArtifact(s,2,21,3)
 item=s.inventory['items'][len(s.inventory['items'])];s.inventory.ground=lua.table_from([lua.table_from({'item':item,'x':b.x,'y':480,'zone':s.campaign.zone})]);s.inventory['items']=lua.table()
 validate_save(native(c.checkpoint(s)));checks.append(id+' boss-zone loot checkpoint accepted')
 c.action(s,'world_boss_return');check(id+' returns to peaceful approach',s.story.active and s.story.node==id+'-approach' and len(s.enemies)==0)
 c.enterStoryNode(s,hub);money=s.mora;c.action(s,'story_report:'+id+'-commission');paid=s.mora;c.action(s,'story_report:'+id+'-commission');check(id+' reward only once',paid==money+300 and s.mora==paid)
s=c.new(16);c.action(s,'story_start');c.action(s,'story_accept:cryo-commission');c.action(s,'boss_cryo_regisvine');b=s.regisvine;b.hp=1;a=s.actors[1];a.x=620;a.dir=1;a.atk=100;c.attack(s,a,'normal');tick(s)
check('direct lab fight does not advance story quest',s.story.quests['cryo-commission'].count==0)
c.enterStoryNode(s,'cryo-approach');s.actors[1].x=720;c.action(s,'world_boss:cryo');s.actors[1].hp=0;s.actors[2].hp=0;tick(s)
check('wipe returns to approach without completion',s.story.node=='cryo-approach' and s.story.active and s.bossJourney is None and s.story.quests['cryo-commission'].count==0)
(ROOT/'evidence/world-bosses-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'world boss checks passed')
