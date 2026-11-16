from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parent
SRC=ROOT/'sources/attachments/miliastra_codex_full_handoff_20261113/sources'
traveler=SRC/'miliastra_traveler_60skills_v0_2.json'
companion=SRC/'v05_extracted/miliastra_v05/miliastra_combat_config_v0_5.json'
t=json.loads(traveler.read_text(encoding='utf8'))['skills']
c=json.loads(companion.read_text(encoding='utf8'))['companion_skills']
assert len(t)==60 and len(c)==40
assert len({s['id'] for s in t+c})==100
rows=[]
for source,skills,owner in [(traveler,t,'traveler'),(companion,c,None)]:
 for s in skills:
  row=dict(s);row['owner']=owner or s['owner']
  row['implementation']='partial' if s['id'] in ('SK01','SK02','SK03','SK04','SK05','SK06','SK07','SK08','SK09','SK10','SK11','SK12','SK13','SK14','SK15','SK16','SK17','SK18','SK19','SK20','SK21','SK22','SK23','SK24','SK25','SK26','SK27','SK28','SK29','SK30','SK31','SK32','SK33','SK34','SK35','SK36','SK37','SK38','SK39','SK40','SK41','SK42','SK43','SK44','SK45','SK46','SK47','SK48','SK49','SK50','SK51','SK52','SK53','SK54','SK55','SK56','SK57','SK58','SK59','SK60','amber_0','amber_1','amber_2','amber_3','amber_4','columbina_0','columbina_1','columbina_2','columbina_3','columbina_4','wanderer_0','wanderer_1','wanderer_2','wanderer_3','wanderer_4','beidou_0','beidou_1','beidou_2','beidou_3','beidou_4','ayaka_0','ayaka_1','ayaka_2','ayaka_3','ayaka_4','emilie_0','emilie_1','emilie_2','emilie_3','emilie_4','kachina_0','kachina_1','kachina_2','kachina_3','kachina_4','mitya_0','mitya_1','mitya_2','mitya_3','mitya_4') else 'not_implemented'
  row['equippable']=s['id'] in ('SK01','SK02','SK03','SK04','SK05','SK06','SK07','SK08','SK09','SK10','SK11','SK12','SK13','SK14','SK15','SK16','SK17','SK18','SK19','SK20','SK21','SK22','SK23','SK24','SK25','SK26','SK27','SK28','SK29','SK30','SK31','SK32','SK33','SK34','SK35','SK36','SK37','SK38','SK39','SK40','SK41','SK42','SK43','SK44','SK45','SK46','SK47','SK48','SK49','SK50','SK51','SK52','SK53','SK54','SK55','SK56','SK57','SK58','SK59','SK60')
  row['source']=str(source.relative_to(ROOT)).replace('\\','/')
  rows.append(row)
out={'version':1,'scope':'60 traveler skills plus 8 companions x 5 (including normals)','source_priority':'Selected names from v0.2; companion runtime proposals from v0.5; later amendments still override. Import is not implementation.',
 'sources':[{'file':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [traveler,companion]],'skills':rows}
(ROOT/'content/skill-catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print('100 skill definitions imported; 60 equippable partial implementations')
