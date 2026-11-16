import json
from runtime import runtime,ROOT,native
lua,c=runtime();checks=[]
def check(n,v):
 assert v,n
 checks.append(n)
def tick(s,n=1):
 for _ in range(n):c.step(s,1/60,lua.table())
for element,total in [('hydro',7),('pyro',6),('cryo',3),('electro',1)]:
 s=c.new(16);c.action(s,'boss_primo_'+element);b=s.primo;s.actors[2].hp=0
 check(element+' launch and resistance',b.element==element and abs(b.resist[element]-.3)<1e-8 and b.resist.geo==.5)
 b.phase='stones_warning';b.timer=0;tick(s);check(element+' three warning stones',len(b.stones)==3 and len(b.fields)==0)
 for a in s.actors.values():a.inv=999
 tick(s,121);check(element+' field starts after delay',len(b.fields)==3 and b.fields[1].total==total and b.fields[1].pulse==1)
 first=b.fields[1];shapes=[native(first.boxes)];pulses={1}
 c.action(s,'pause');clock=first.clock;tick(s,90);check(element+' pause freezes field',first.clock==clock);c.action(s,'pause')
 for _ in range(250):
  b.timer=100;tick(s)
  if len(b.fields)>0:pulses.add(first.pulse);shapes.append(native(first.boxes))
 check(element+' exact pulse count and cleanup',pulses==set(range(1,total+1)) and len(b.fields)==0)
 if element=='hydro':check('hydro moves eruption positions',len({str(shape) for shape in shapes})==7)
 if element=='cryo':check('cryo expands to paired spikes',any(len(shape)==2 for shape in shapes))
 if element=='electro':check('electro uses crossed diagonal cells',len(shapes[0])==26 and len({r['y'] for r in shapes[0]})>3)
 c.action(s,'town');check(element+' exit cleanup',s.primo is None)
 # Water shield comparison against all four infused elements, unit fixture with sufficient durability.
 c.action(s,'boss_primo_'+element);b=s.primo;a=s.actors[1];a.hp=140;a.x=b.x-100;a.inv=0;a.lock=0;c.attack(s,a,'SK20');a.waterShield.hp=25;b.phase='shower_warning';b.timer=0;tick(s)
 check(element+' water shield reflect fraction',b.lastReflection==(120 if element=='hydro' else 40) and b.phase=='stunned' and len(b.fields)==0)
(ROOT/'evidence/primo-variants-test.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2),encoding='utf8');print(len(checks),'variant checks passed')
