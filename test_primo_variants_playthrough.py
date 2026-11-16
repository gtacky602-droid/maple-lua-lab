"""Run the shared input controller against non-story elemental lab challenges."""
import json
from pathlib import Path
root=Path(__file__).resolve().parent
source=(root/'test_primo_playthrough.py').read_text(encoding='utf8')
for element in ['pyro','cryo','electro']:
 script=source.replace("c.action(s,'world_boss:primo')",f"c.action(s,'boss_primo_{element}')").replace("assert s.bossJourney.id=='primo'",'')
 script=script[:script.index("assert s.story.quests['primo-commission']")]
 script=script.replace('evidence/primo-playthrough.json',f'evidence/primo-{element}-playthrough.json')
 exec(compile(script,f'primo_{element}_input','exec'),{})
 path=root/f'evidence/primo-{element}-playthrough.json'
 data=json.loads(path.read_text(encoding='utf8'));data['element']=element
 data['note']='Lv20 hub fixture; then action/movement inputs only. Direct laboratory variant challenge, no quest reporting claimed. Sample flower and lab-unlocked skills.'
 path.write_text(json.dumps(data,indent=2),encoding='utf8')
