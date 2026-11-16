import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def start():
 d=json.loads((ROOT/'work/natlan-fixture.json').read_text());s=c.restore(lua.table_from(d,recursive=True));c.grantExp(s,sum(c.expNeeded(i) for i in range(1,120))-s.progression.total,'quest');s.actors[s.active].x=720;c.action(s,'story_portal:natlan-voyage');return s
def tick(s,n):
 for _ in range(n):c.step(s,1/30,lua.table())
def exit(s,id,x):
 s.actors[s.active].x=x;s.actors[s.active].y=480;c.action(s,'story_portal:'+id)
s=start();check('ninety second voyage begins',abs(s.voyage.arrives-s.t-90)<1e-8)
exit(s,'ochkanatlan-dock',720);check('early disembark rejected',s.story.node=='natlan-voyage');tick(s,899);exit(s,'ochkanatlan-dock',720);check('before thirty seconds rejected',s.story.node=='natlan-voyage');tick(s,1);check('thirty seconds opens stopover',c.frame(s).voyage.stopover)
exit(s,'ochkanatlan-dock',720);check('optional stop disembarks and cancels old timer',s.story.node=='ochkanatlan-dock' and s.voyage is None);tick(s,3000);check('shore does not teleport at old arrival time',s.story.node=='ochkanatlan-dock')
c.action(s,'story_accept:ochkanatlan-survey');exit(s,'ochkanatlan-ruins',1380);check('ruins visit progresses optional quest',s.story.quests['ochkanatlan-survey'].count==1);exit(s,'ochkanatlan-dock',60)
d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('shore save resumes at shore',r.story.node=='ochkanatlan-dock')
exit(s,'natlan-voyage',60);check('reboard resumes outbound leg with forty seconds left',abs(s.voyage.arrives-s.t-40)<1e-8 and not c.frame(s).voyage.stopover);tick(s,1200);check('reboard reaches NodKrai',s.story.node=='nod-port')
s=start();tick(s,1500);exit(s,'ochkanatlan-dock',720);check('fifty seconds closes disembark',s.story.node=='natlan-voyage');tick(s,1200);check('staying aboard reaches next country without optional visit',s.story.node=='nod-port' and s.story.visited['ochkanatlan-dock'] is None)
s=start();tick(s,900);c.action(s,'pause');tick(s,3000);check('pause preserves stopover window',c.frame(s).voyage.stopover and s.story.node=='natlan-voyage')
c.action(s,'pause');exit(s,'natlan-port',60);tick(s,3000);check('cancel does not later arrive',s.story.node=='natlan-port')
s=start();tick(s,900);exit(s,'ochkanatlan-dock',720);exit(s,'natlan-voyage',60);d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('mid reboard save returns safe original harbor',r.story.node=='natlan-port')
s=start();d=c.checkpoint(s);d.story.node='natlan-port';(ROOT/'work/stopover-fixture.json').write_text(json.dumps(native(d)),encoding='utf8')
(ROOT/'evidence/stopover-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'stopover checks passed')
