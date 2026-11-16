from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parent
src=ROOT/'sources/map-research'
raw=(src/'points.json').read_bytes();points=json.loads(raw)
provenance=json.loads((src/'provenance.json').read_text(encoding='utf8'))
nodes=[]
for p in points:
 if p['labelId'] not in (2,3):continue
 nodes.append({'id':f"teyvat:{p['id']}",'source_id':p['id'],'kind':'statue' if p['labelId']==2 else 'waypoint',
               'x':p['x'],'y':p['y'],'region':None,'implementation':'not_implemented','localized_name':None})
assert len({p['id'] for p in nodes})==len(nodes)
out={'version':1,'source':provenance['url'],'source_sha256':hashlib.sha256(raw).hexdigest(),
     'snapshot':provenance['snapshot_meta'],'scope':'map_id=2 snapshot only; other maps and event worlds not verified',
     'complete_world_verified':False,'region_assignment':'not yet mapped; no nearest-region guess applied',
     'counts':{'waypoints':sum(p['kind']=='waypoint' for p in nodes),'statues':sum(p['kind']=='statue' for p in nodes)},'nodes':nodes}
(ROOT/'content/map-catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(out['counts'])
