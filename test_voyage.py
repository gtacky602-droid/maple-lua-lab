import json
from runtime import runtime,ROOT,native
from savegame import validate_save
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n):
 for _ in range(n):c.step(s,1/30,lua.table())
def go(s,id,x=1380):
 s.actors[s.active].x=x;s.actors[s.active].y=480;c.action(s,'story_portal:'+id)
def harbor(level=40):
 s=c.new(12);c.action(s,'story_start');c.grantExp(s,sum(c.expNeeded(i) for i in range(1,level)),'quest')
 for id in ('mond-road','mond-border','liyue-entry','liyue-harbor'):go(s,id)
 return s
s=harbor(20);go(s,'liyue-ferry',720);check('departure requires level forty',s.story.node=='liyue-harbor')
s=harbor();go(s,'liyue-ferry',720);check('boarding creates peaceful deck and timer',s.voyage is not None and len(s.enemies)==0)
go(s,'inazuma-port',900);check('arrival exit cannot skip timer',s.story.node=='liyue-ferry')
tick(s,899);check('stays aboard before thirty seconds',s.story.node=='liyue-ferry');tick(s,1);check('automatically arrives once',s.story.node=='inazuma-port' and s.voyage is None);tick(s,10);check('arrival stable',s.story.node=='inazuma-port')
c.action(s,'story_accept:ayaka-join');go(s,'inazuma-road');check('inazuma combat stage reached',len(s.enemies)==6);d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('inazuma checkpoint resumes at port',r.story.node=='inazuma-port')
s=harbor();go(s,'liyue-ferry',720);c.action(s,'pause');tick(s,1200);check('pause freezes voyage',s.story.node=='liyue-ferry' and s.t==0)
c.action(s,'pause');go(s,'liyue-harbor',60);tick(s,1000);check('return to departure cancels arrival',s.story.node=='liyue-harbor' and s.voyage is None)
s=harbor();go(s,'liyue-ferry',720);tick(s,300);d=c.checkpoint(s);validate_save(native(d));r=c.restore(d);check('save mid voyage safely resumes source port',r.story.node=='liyue-harbor' and r.voyage is None)
s=harbor();go(s,'liyue-ferry',720);s.actors[1].hp=0;s.actors[2].hp=0;tick(s,1);check('wipe aboard returns to discovered port',s.story.node=='liyue-harbor')
(ROOT/'evidence/voyage-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print(len(checks),'voyage checks passed')
