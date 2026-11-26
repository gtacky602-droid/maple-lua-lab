"""Reconcile the reloaded story save with the complete playable encounter catalogs."""
import json
from runtime import ROOT
from savegame import validate_save

def read(path):
    return json.loads((ROOT/path).read_bytes())

save=validate_save(read('evidence/remaining-survey-save.json'))
end=save['endgame']
fields=read('content/field-boss-spawns.json')['fieldBosses']
weekly=read('content/weekly-boss-spawns.json')['weeklyBosses']
duels=read('content/stygian-matches.json')['matches']
groups={k:{} for k in ('field','legend','weekly','stygian')}
for b in fields:
    group='legend' if b['id'].startswith('legend-') else 'field'
    groups[group][b['id']]=end['bosses'][b['id']]['clears']
for b in weekly:
    key=b['id']
    record=end['bosses'][key] if b.get('original') else end['weekly'][key+':entry']
    groups['weekly'][key]=record['clears']
for key in duels:
    groups['stygian'][key]=end['stygian'][key+':normal']['clears']
assert all(n>0 for group in groups.values() for n in group.values())
assert sum(map(len,groups.values()))==len(fields)+len(weekly)+len(duels)
quests=read('content/story-graph.json')['quests']
active=[q['id'] for q in quests if not q.get('legacyOnly')]
assert all(save['story']['quests'][key]['status']=='complete' for key in active)
result=dict(seed='remaining-survey-save.json',storyReports=len(active),legacyOnly=len(quests)-len(active),
            visits=sum(bool(v) for v in save['story']['visited'].values()),clears=groups)
(ROOT/'evidence/adventure-roster.json').write_bytes((json.dumps(result,ensure_ascii=False,sort_keys=True)+'\n').encode())
print({key:len(rows) for key,rows in groups.items()},len(active),'quest reports')
