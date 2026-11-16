import json,copy
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 s=c.new(12);c.action(s,'story_start');return s
def go(s,id,x):
 s.actors[s.active].x=x;s.actors[s.active].y=480;c.action(s,'story_portal:'+id)
s=start();check('starts at safe hub',s.story.node=='mond-town' and s.campaign.zone=='town' and len(s.enemies)==0)
c.action(s,'story_portal:mond-road');check('cannot teleport to unvisited exit remotely',s.story.node=='mond-town')
go(s,'liyue-harbor',1380);check('nonadjacent exit rejected',s.story.node=='mond-town')
c.action(s,'story_accept:mond-patrol');go(s,'mond-road',1380);check('adjacent portal loads authored combat stage',s.story.node=='mond-road' and len(s.enemies)==6 and s.campaign.zone=='story:mond-road')
for i in range(8):c.onKill(s,s.enemies[1])
check('local kills advance accepted quest',s.story.quests['mond-patrol'].count==8)
c.action(s,'story_report:mond-patrol');check('report outside hub rejected',s.story.quests['mond-patrol'].status=='active')
c.action(s,'story_fast:mond-town');before=s.mora;c.action(s,'story_report:mond-patrol');check('quest reward paid once',s.mora==before+200 and s.progression.questXp==500);c.action(s,'story_report:mond-patrol');check('repeat report cannot duplicate rewards',s.mora==before+200)
c.action(s,'story_accept:mond-border-check');go(s,'mond-road',1380);go(s,'mond-border',1380);check('visit quest requires actual entry',s.story.quests['mond-border-check'].count==1)
go(s,'liyue-entry',1380);check('Liyue level twenty required',s.story.node=='mond-border')
c.grantExp(s,sum(c.expNeeded(i) for i in range(1,20)),'quest');go(s,'liyue-entry',1380);check('level unlock does not require previous quests completion',s.story.node=='liyue-entry' and s.story.quests['mond-border-check'].status=='active')
c.action(s,'story_fast:liyue-harbor');check('unvisited hub cannot fast travel',s.story.node=='liyue-entry');go(s,'liyue-harbor',1380);check('harbor becomes discovered hub',s.story.visited['liyue-harbor'])
c.action(s,'story_accept:liyue-supply');go(s,'liyue-field',1380);check('second region combat route loads',s.story.node=='liyue-field')
d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('save resumes at discovered regional hub',r.story.node=='liyue-harbor' and r.story.quests['liyue-supply'].status=='active')
bad=native(d);bad['story']['node']='unknown'
try:validate_save(bad);raise AssertionError('bad story accepted')
except ValueError:checks.append('invalid graph node rejected')
s=start();c.action(s,'story_accept:mond-patrol');c.action(s,'field');c.onKill(s,s.enemies[1]);check('legacy test arena cannot advance story quest',s.story.quests['mond-patrol'].count==0)
s=start();go(s,'mond-road',1380);s.actors[1].hp=0;s.actors[2].hp=0;c.step(s,1/60,lua.table());check('wipe returns to story hub',s.story.node=='mond-town' and s.story.active)
s=start();c.action(s,'story_accept:mond-patrol');go(s,'mond-road',1380);a=s.actors[1];e=s.enemies[1];a.x=e.x-20;e.hp=1;c.attack(s,a,'normal');check('actual lethal hit updates story quest',s.story.quests['mond-patrol'].count==1)
(ROOT/'evidence/story-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'story checks passed')
