import json
from runtime import ROOT
source=(ROOT/'test_array_playthrough.py').read_text(encoding='utf8')
source=source[:source.index("assert s.story.quests['array-commission']")]
results=[]
for i in range(1,5):
 text=source.replace("c.action(s,'world_boss:array');assert s.bossJourney.id=='array'",f"c.action(s,'boss_array_{i}')").replace("p=ROOT/'evidence/array-playthrough.json'",f"p=ROOT/'evidence/array-variant-{i}-playthrough.json'")
 scope={};exec(compile(text,'variant-playthrough','exec'),scope)
 result=scope['result'];result['marked_index']=i;result['note']='Lv40/sample flower/Beidou fixture; direct selected laboratory encounter after walking to approach, normal battle inputs only; no story completion claim'
 (ROOT/f'evidence/array-variant-{i}-playthrough.json').write_text(json.dumps(result,indent=2),encoding='utf8');results.append(result)
(ROOT/'evidence/array-variants-playthrough.json').write_text(json.dumps(results,indent=2),encoding='utf8')
