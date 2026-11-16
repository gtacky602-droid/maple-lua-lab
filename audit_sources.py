from pathlib import Path
import json
P=Path(__file__).resolve().parent
a=json.loads((P/'sources/attachments/miliastra_simulation_package_v0_6/results/results_v0_6.json').read_text(encoding='utf8'))
b=json.loads((P/'evidence/v06-rerun/results/results_v0_6.json').read_text(encoding='utf8'))
differences=[]
def compare(a,b,path=''):
 if isinstance(a,dict) and isinstance(b,dict):
  for k in a.keys()|b.keys():compare(a.get(k),b.get(k),path+'/'+k)
 elif isinstance(a,list) and isinstance(b,list):
  if len(a)!=len(b):differences.append({'path':path,'reason':'length'})
  else:
   for i,(x,y) in enumerate(zip(a,b)):compare(x,y,path+'/'+str(i))
 elif a!=b:
  if isinstance(a,(int,float)) and isinstance(b,(int,float)) and abs(a-b)<=max(1e-7,abs(a)*1e-12):return
  differences.append({'path':path,'old':a,'new':b})
compare(a,b)
v2=json.loads((P/'sources/attachments/miliastra_codex_full_handoff_20261113/sources/miliastra_traveler_60skills_v0_2.json').read_text(encoding='utf8'))
out={'rerun_passed':sum(t['passed'] for t in b['tests']),'rerun_total':len(b['tests']),'cases':len(b['combat']),'exact_json_match':a==b,'numeric_tolerance':'max(1e-7, abs(reference)*1e-12)','material_differences':differences,'skills_declared':v2['number_of_skills'],'source_priority':'20261116 user amendments > v0.2 skill original > per-domain original data. v0.6 is independent comparison model, not full replacement.'}
(P/'evidence/source-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(out,ensure_ascii=False,indent=2))
