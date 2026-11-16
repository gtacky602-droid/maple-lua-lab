import json
from runtime import runtime,ROOT
lua,c=runtime();layouts=json.loads((ROOT/'content/enemy-art-layout.json').read_text());results=[]
for name,layout in [*layouts.items(),('legacy-atlas',{'height':40,'hover':0})]:
 for mode in ['sprite','rect']:
  for profile in ['legacy','h48c32','h32c16']:
   s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,'mond-road');s.camera=100
   for a in s.actors.values():a.hp=0
   for e in s.enemies.values():e.hp=0
   e=s.enemies[1];e.art=name;e.x=400;e.y=350;e.hp=e.maxhp/2;e.warning=.5
   before=(e.hp,e.warning,e.cd,e.x,e.y,e.kind)
   f=c.frame(s,mode,profile);bars=[d for d in f.draws.values() if d.kind=='rect' and d.color in ['#45645d','#ffcc7c']];warnings=[d for d in f.draws.values() if d.kind=='text' and d.text=='!']
   head=350-layout['height']-layout['hover']
   assert len(bars)==2 and len(warnings)==1,(name,mode)
   assert [d.w for d in bars]==[40,20] and all(d.x==280 and d.y==head-9 and d.y+d.h<head for d in bars)
   assert warnings[0].x==300 and warnings[0].y==head-23
   assert before==(e.hp,e.warning,e.cd,e.x,e.y,e.kind)
   e.hp=e.maxhp;e.warning=0
   f=c.frame(s,mode,profile);assert not any(d.color in ['#45645d','#ffcc7c'] or d.text=='!' for d in f.draws.values())
   e.hp=0;e.warning=.5
   assert not any(d.text=='!' for d in c.frame(s,mode,profile).draws.values())
   results.append({'asset':name,'mode':mode,'profile':profile,'head_y':head,'bar_y':head-9,'warning_y':head-23})
(ROOT/'evidence/enemy-overlays.json').write_text(json.dumps({'results':results,'checks':['bar and warning above sprite including hover offset','half HP bar length','camera shift','full HP and inactive warning hidden','dead enemy warning hidden','render leaves combat state unchanged'],'scope':'layout only; no attack timing, damage or hitbox changes'},indent=2)+'\n')
print('8 layouts x 2 modes x 3 profiles: overhead UI and combat-state invariance passed')
