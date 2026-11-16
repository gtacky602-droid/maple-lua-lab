"""Import names/IDs, not combat logic or descriptions. Classification remains provisional."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent
src=json.loads((ROOT/'sources/boss-research/japanese-boss-candidates.json').read_text(encoding='utf8'))
en=json.loads((ROOT/'sources/boss-research/english-boss-candidates.json').read_text(encoding='utf8'))
english={x['data']['id']:x['data']['name'] for x in en['candidates']}
rows=[]
for entry in src['candidates']:
    d=entry['data']
    exp=next((r.get('count') for r in d.get('rewardPreview',[]) if r['id']==102),None)
    rows.append({'id':str(d['id']),'name':d['name'],'english_name':english[d['id']],
      'kind_candidate':'weekly' if exp==300 else 'normal' if exp==200 else 'unknown',
      'classification_basis':'inference from rewardPreview Adventure EXP; needs encounter-level cross-check',
      'source_url':f"https://github.com/theBowja/genshin-db/blob/{src['sha']}/{entry['path']}",
      'encounter_group_status':'unverified','implementation':'not_implemented','art':'not_created'})
for row in rows:
    if row['id']=='20040201':
        row['implementation']='partial_2d_encounter';row['art']='generated_core_and_shell_candidates';row['design']='content/anemo-design.json'
for row in rows:
    if row['id']=='26020101':
        row.update(implementation='partial_2d_encounter',art='generated_idle_candidate',design='content/regisvine-design.json')
for row in rows:
    if row['id']=='20040101':
        row.update(implementation='partial_2d_encounter',art='generated_core_and_shell_candidates',design='content/electro-design.json')
for row in rows:
    if row['id']=='26050101':row.update(implementation='partial_2d_encounter',art='generated_hydro_idle_candidate',design='content/primo-design.json')
    if row['id']=='20050101':
        row.update(implementation='partial_2d_encounter',art='generated_host_and_eight_mimic_candidates',design='content/oceanid-design.json')
for row in rows:
    if row['id']=='20040301':
        row.update(implementation='partial_2d_encounter',art='generated_core_shell_pillar_candidates',design='content/geo-design.json')
for row in rows:
    if row['id']=='26020201':
        row.update(implementation='partial_2d_encounter',art='generated_idle_candidate',design='content/pyro-regisvine-design.json')
out={'version':1,'snapshot_commit':src['sha'],'snapshot_date':src['commit_date'],
     'complete_roster_verified':False,'warning':'Entity records, not encounter count. Paired enemies and alternative forms require grouping. Latest-release coverage not established.',
     'source_license':'MIT (repository); game names belong to their respective owners',
     'boss_entities':rows,'original_stygian_candidates':json.loads((ROOT/'content/stygian-encounters.json').read_text(encoding='utf8'))['encounters']}
(ROOT/'content/boss-catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(f'{len(rows)} entity candidates imported; no implementation claimed')
