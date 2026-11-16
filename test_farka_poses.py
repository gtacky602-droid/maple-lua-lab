import json
from runtime import runtime,ROOT,native
lua,c=runtime();s=c.new(16);c.action(s,'boss_farka');b=s.farka;b['from']=680;b.target=200;checks=[]
for phase,index in [('ready',None),('charge_warning',1),('charge',2),('sweep_warning',1),('recover',4)]:
 b.phase=phase
 for facing in [-1,1]:
  b.facing=facing;d=next(d for d in native(c.frame(s,'sprite'))['draws'] if d['kind']=='boss_sprite')
  expected=f'farka-actions/{index:02}.png' if index else 'farka-source-v1.png'
  assert d['source']==expected and d['y']==480 and d['flip']==(facing==1)
  assert 0<d['anchorX']<1
  checks.append(phase+':'+str(facing))
b.slashUntil=.3;d=next(d for d in native(c.frame(s,'sprite'))['draws'] if d['kind']=='boss_sprite');assert d['source']=='farka-actions/03.png';checks.append('slash display overrides recovery')
for profile in ['legacy','h48c32','h32c16']:
 b.facing=-1;left=native(c.frame(s,'rect',profile))['draws'];b.facing=1;right=native(c.frame(s,'rect',profile))['draws'];n=len(json.loads((ROOT/'assets/farka-action-3.json').read_text())['profiles'][profile]['runs'])
 for a,z in zip(left[-n:],right[-n:]):assert abs(a['x']+z['x']+a['w']-2*b.x-.05)<1e-7
 checks.append(profile+' anchor mirror')
(ROOT/'evidence/farka-poses-test.json').write_text(json.dumps({'checks':checks,'count':len(checks)},indent=2),encoding='utf8');print(len(checks),'pose checks passed')
