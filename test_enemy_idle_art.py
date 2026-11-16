import hashlib,json
from PIL import Image
from runtime import runtime,ROOT

lua,c=runtime();results=[]
for name,height in [('hydro-slime',40),('pyro-slime',40),('hilichurl',76)]:
 data=json.loads((ROOT/'assets'/f'{name}-idle-sprites.json').read_text())
 assert hashlib.sha256((ROOT/'assets'/data['source']).read_bytes()).hexdigest()==data['sha256']
 alpha=Image.open(ROOT/'assets'/data['source']).getchannel('A').getextrema()
 assert alpha[0]==0 and alpha[1]>=250
 for profile in ['legacy','h48c32','h32c16']:
  s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,'mond-road')
  for a in s.actors.values():a.hp=0
  for e in s.enemies.values():e.hp=0
  e=s.enemies[1];e.art=name;e.hp=e.maxhp;e.x=400;e.y=350
  before=(e.hp,e.kind,e.cd,e.x,e.y,e.home)
  png=c.frame(s,'sprite',profile)
  draws=[d for d in png.draws.values() if d.source==data['source']]
  assert len(draws)==1
  draw=draws[0]
  assert draw.h==height and draw.y==350 and abs(draw.w/height-data['box'][2]/data['box'][3])<1e-9
  assert draw.anchorX==data['anchorX']
  rect=c.frame(s,'rect',profile)
  e.hp=0;baseline=c.frame(s,'rect',profile)
  assert sum(d.kind=='rect' for d in rect.draws.values())-sum(d.kind=='rect' for d in baseline.draws.values())==len(data['profiles'][profile]['runs'])
  assert not any(d.source==data['source'] for d in c.frame(s,'sprite',profile).draws.values())
  e.hp=e.maxhp
  assert before==(e.hp,e.kind,e.cd,e.x,e.y,e.home),'Rendering changed gameplay state'
  e.x=-1000
  assert not any(d.source==data['source'] for d in c.frame(s,'sprite',profile).draws.values())
  results.append({'art':name,'profile':profile,'runs':len(data['profiles'][profile]['runs']),'height':height})
(ROOT/'evidence/enemy-idle-art.json').write_text(json.dumps({'results':results,'checks':['source hash and alpha','foot anchor and aspect ratio','dead and offscreen hidden','exact added rectangle count','render leaves mechanics unchanged'],'limits':['Residual low-alpha halo in source PNG','No animation or native-performance verification']},indent=2)+'\n')
print('Three enemy assets: all profiles, anchors, culling and unchanged mechanics passed')
