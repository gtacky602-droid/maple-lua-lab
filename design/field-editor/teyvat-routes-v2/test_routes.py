from __future__ import annotations
import unittest,json,copy,subprocess,sys,tempfile,hashlib
from pathlib import Path
import make_editor_proposal as conv
HERE=Path(__file__).resolve().parent
P=conv.read(HERE/'plan.json');MON=conv.read(HERE/'reference/mondstadt_plan_v1.json');SEED=conv.read(HERE/'monster_dependencies.json');CAT=conv.read(HERE/'reference/monster_catalog_v1.json')
M={m['monster_id']:m for m in CAT['monsters']};F={f['field_id']:f for f in P['fields']+P['unbound_slots']};IDS=set(F)|{f['field_id'] for f in MON['fields']}
FIELD_DEFAULTS={'name':'','location_alias':'','recommended_level':None,'enemy_level_min':None,'enemy_level_max':None,'respawn_seconds':None,'elite':'','local_legend':'','terrain':'','quests':[],'notes':'','production_state':'未着手','required_route':[]}
def fixture():
 d={'schema_version':1,'revision':7,'updated_at':'test-only','field_definitions':{},'field_edges':{},'field_spawns':{},'monster_families':{},'monster_variants':{},'graph_layouts':{},'graph_exceptions':{},'design_history':[],'proposals':{}}
 for f in P['fields']+MON['fields']:
  vals={**copy.deepcopy(FIELD_DEFAULTS),'region_id':f.get('source_region_id',f.get('region_id'))}
  d['field_definitions'][f['field_id']]={'field_id':f['field_id'],**vals,'_meta':{k:{'state':'unassigned','source':'test fixture','actor':'Codex','updated_at':'test'} for k in vals}}
 return d

def apply_copy(d,req):
 out=copy.deepcopy(d)
 for op in req['operations']:
  c=op['collection'];i=op['id'];rec=out[c].setdefault(i,{conv.COLS[c]:i,'_meta':{}})
  rec.update(copy.deepcopy(op['changes']))
  for k in op['changes']:rec['_meta'][k]={'state':op.get('states',{}).get(k,'approved'),'source':'unit fixture','actor':'ChatGPT','updated_at':'test'}
 out['revision']+=1
 return out

def request(d=None,region='LIY',review=False,part='all',challenges=False):
 return conv.build(d or fixture(),P,SEED,region,review,'Unit test only' if review else '',part,challenges)

class PlanTests(unittest.TestCase):
 def test_01_region_coverage(self):
  self.assertEqual(len(P['regions']),24);self.assertEqual(len([r for r in P['regions'] if not r['preserved_mondstadt_reference']]),21)
 def test_02_unique_official_fields(self):
  self.assertEqual(len(P['fields']),883);self.assertEqual(len(set(f['field_id'] for f in P['fields'])),883)
 def test_03_unbound_slots_not_official(self):
  self.assertEqual(len(P['unbound_slots']),32)
  for f in P['unbound_slots']:self.assertTrue(f['field_id'].startswith('slot:'));self.assertIsNone(f['x']);self.assertIsNone(f['official_map_id']);self.assertFalse(f['import_enabled'])
 def test_04_edges_no_duplicates_or_dangling(self):
  self.assertEqual(len({e['edge_id'] for e in P['edges']}),len(P['edges']))
  self.assertEqual(len({tuple(sorted([e['from_field'],e['to_field']])) for e in P['edges']}),len(P['edges']))
  for e in P['edges']:self.assertIn(e['from_field'],IDS);self.assertIn(e['to_field'],IDS);self.assertNotEqual(e['from_field'],e['to_field'])
 def test_05_no_runtime_verified_claims(self):
  self.assertFalse(P['physical_walkthrough_verified']);self.assertFalse(P['policies']['runtime_export_allowed'])
  for e in P['edges']:self.assertFalse(e['runtime_ready']);self.assertEqual(e['physical_ports'],{'from':None,'to':None})
 def test_06_fixed_monster_ids_levels(self):
  for s in P['field_spawns']:self.assertIn(s['monster_id'],M);self.assertEqual(s['catalog_level'],M[s['monster_id']]['base_level']);self.assertIsNone(s['level_override']);self.assertFalse(s['special'])
 def test_07_ordinary_not_boss_or_summon(self):
  for s in P['field_spawns']:self.assertEqual(M[s['monster_id']]['spawn_role'],'normal_pool');self.assertEqual(M[s['monster_id']]['kind'],'normal')
 def test_08_safe_fields_have_no_spawns(self):
  for f in F.values():
   if f['role'] in ('town','safe_connector','hold','challenge_entrance'):self.assertEqual(f['spawns'],[])
 def test_09_population_totals(self):
  for f in F.values():
   rows=[s for s in P['field_spawns'] if s['field_id']==f['field_id']]
   self.assertEqual(sum(s['count'] for s in rows),f['ordinary_total'])
   if rows:self.assertLessEqual(f['ordinary_total']/f['layout_screens'],16);self.assertEqual(f['layout_screens'],3)
 def test_10_no_cross_region_duplicate_spawn(self):
  self.assertEqual(len({s['spawn_id'] for s in P['field_spawns']}),len(P['field_spawns']))
  for s in P['field_spawns']:self.assertEqual(M[s['monster_id']]['region_id'],F[s['field_id']]['placement_region_id'])
 def test_11_review_connections_excluded_default(self):
  for e in P['edges']:
   if e['review_status']=='entrance_or_layer_review':self.assertFalse(e['default_import'])
 def test_12_crossings_limited_and_specific(self):
  self.assertEqual(len(P['crossings']),25)
  snow=next(e for e in P['crossings'] if e['crossing_id']=='C02')
  self.assertEqual({snow['from_field'],snow['to_field']},{'teyvat:6599','teyvat:34'});self.assertFalse(snow['default_import']);self.assertEqual(snow['crossing_category'],'optional')
 def test_13_normal_hubs_no_mandatory_high_branch(self):
  a=conv.read(HERE/'evidence/graph_analysis.json');self.assertTrue(all(a['normal_country_hubs_reachable_without_high_level_branches'].values()))
 def test_14_bosses_not_in_main_spawns(self):
  for e in P['encounter_assignments']:self.assertFalse(e['route_required']);self.assertEqual(e['entry_mode'],'interact_to_challenge');self.assertFalse(e['default_import'])
 def test_15_elites_optional_single(self):
  for e in P['elite_pockets']:self.assertEqual(e['count'],1);self.assertFalse(e['main_road_aggro']);self.assertFalse(e['default_import'])
 def test_16_catalog_unchanged(self):
  self.assertEqual(hashlib.sha256((HERE/'reference/monster_catalog_v1.json').read_bytes()).hexdigest(),P['sources']['catalog-v1']['sha256'])
  self.assertEqual(len(M),863);self.assertEqual(M['MON-013']['base_level'],3);self.assertEqual(M['DSP-003']['base_level'],40)
 def test_17_mondstadt_not_replaced(self):
  self.assertEqual(len(MON['fields']),64);self.assertFalse({f['field_id'] for f in MON['fields']}&{f['field_id'] for f in P['fields']})
 def test_18_no_bare_spatial_auto_edge_rule(self):
  self.assertFalse(P['policies']['auto_nearest_connection'])
  for e in P['edges']:self.assertTrue(e['corridor']);self.assertTrue(e['traversal_type']);self.assertTrue(e['source_refs'])
 def test_19_inventory_counts(self):
  self.assertEqual(P['counts']['new_routed_official_fields'],sum(bool(f['corridor_ids']) for f in P['fields']))
  self.assertEqual(P['counts']['normal_spawn_records'],len(P['field_spawns']))
 def test_20_levels_in_range(self):
  for f in F.values():
   if f['recommended_level'] is not None:self.assertGreaterEqual(f['recommended_level'],1);self.assertLessEqual(f['recommended_level'],200)
 def test_21_level_gaps_visible(self):
  self.assertGreater(len(P['balance_gaps']),0)
  for g in P['balance_gaps']:self.assertGreaterEqual(g['gap'],4)
 def test_22_source_refs_resolve(self):
  for e in P['edges']:
   for ref in e['source_refs']:self.assertIn(ref,P['sources'])

class ConverterTests(unittest.TestCase):
 def test_23_generation_no_mutation(self):
  d=fixture();before=copy.deepcopy(d);r=request(d);self.assertEqual(d,before);self.assertEqual(r['base_revision'],7)
 def test_24_no_coordinate_or_quest_updates(self):
  for op in request()['operations']:
   if op['collection']=='field_definitions':self.assertFalse(set(op['changes'])&{'x','y','map_node','official_map_id','region_id','quests','required_route'})
 def test_25_nonblank_field_protected(self):
  d=fixture();d['field_definitions']['teyvat:29']['name']='ユーザーの正本名'
  with self.assertRaises(conv.Conflict):request(d)
 def test_26_approved_empty_field_protected(self):
  d=fixture();d['field_definitions']['teyvat:29']['_meta']['name']['state']='approved'
  with self.assertRaises(conv.Conflict):request(d)
 def test_27_revision_is_fresh(self):
  d=fixture();d['revision']=123;self.assertEqual(request(d)['base_revision'],123)
 def test_28_review_needs_acknowledgement(self):
  with self.assertRaises(ValueError):conv.build(fixture(),P,SEED,'LIY',True,'')
 def test_29_default_fewer_than_review(self):
  self.assertLess(len(request()['operations']),len(request(review=True)['operations']))
 def test_30_mondstadt_scope_rejected(self):
  for r in ['MON','DSP','DOP']:
   with self.assertRaises(ValueError):request(region=r,review=True)
 def test_31_unbound_regions_rejected(self):
  for r in ['GAA','VLM','SIM','NSP']:
   with self.assertRaises(ValueError):request(region=r,review=True)
 def test_32_all_bound_regions_convert(self):
  for r in P['regions']:
   if r['preserved_mondstadt_reference'] or r['unbound_design_slots']:continue
   q=request(region=r['prefix'],review=True,challenges=True)
   self.assertLessEqual(len(q['operations']),2000,r['prefix']);self.assertTrue(q['operations'])
 def test_33_no_duplicate_record_operations(self):
  q=request(region='SUM',review=True,challenges=True);ids=[(o['collection'],o['id']) for o in q['operations']];self.assertEqual(len(ids),len(set(ids)))
 def test_34_new_variant_fields_complete(self):
  need={'family_id','region_id','name','base_level','hp','attack','defense','exp','drops','behavior','sprite','animation','classification','element'}
  for op in request()['operations']:
   if op['collection']=='monster_variants':self.assertEqual(set(op['changes']),need)
 def test_35_idempotent_matching_data(self):
  d=fixture();q=request(d);d2=apply_copy(d,q)
  with self.assertRaisesRegex(ValueError,'No changes'):request(d2)
 def test_36_variant_level_conflict(self):
  d=fixture();q=request(d);v=next(o for o in q['operations'] if o['collection']=='monster_variants');d['monster_variants'][v['id']]={**v['changes'],'monster_id':v['id'],'base_level':199}
  with self.assertRaises(conv.Conflict):request(d)
 def test_37_duplicate_population_prevented(self):
  d=fixture();d['field_spawns']['manual-spawn']={'field_id':'teyvat:29','monster_id':'LIY-001','count':3}
  with self.assertRaises(conv.Conflict):request(d)
 def test_38_existing_edge_pair_protected(self):
  d=fixture();d['field_edges']['manual-edge']={'from_field':'teyvat:29','to_field':'teyvat:30'}
  with self.assertRaises(conv.Conflict):request(d)
 def test_39_missing_official_ids_rejected(self):
  d=fixture();del d['field_definitions']['teyvat:29']
  with self.assertRaises(conv.Conflict):request(d)
 def test_40_crossings_no_slot_or_mondstadt_field_writes(self):
  q=request(region='CROSS',review=True)
  self.assertEqual(len(q['operations']),21)
  for op in q['operations']:self.assertEqual(op['collection'],'field_edges');self.assertFalse(op['changes']['from_field'].startswith('slot:'));self.assertFalse(op['changes']['to_field'].startswith('slot:'))
 def test_41_ports_and_spawn_coordinates_unassigned(self):
  for o in request()['operations']:
   if o['collection']=='field_edges':self.assertEqual(o['states']['exit_position'],'unassigned');self.assertEqual(o['states']['entrance_position'],'unassigned')
   if o['collection']=='field_spawns':self.assertEqual(o['states']['area'],'unassigned');self.assertFalse(o['changes']['conditions']['runtime_enabled'])
 def test_42_classification_separate_and_protected(self):
  q=request(region='CHY',review=True,part='classification');self.assertEqual(len(q['operations']),27)
  self.assertTrue(all(set(o['changes'])=={'region_id'} for o in q['operations']))
  d=fixture();d['field_definitions']['teyvat:64825']['_meta']['region_id']['state']='approved'
  with self.assertRaises(conv.Conflict):request(d,region='CHY',review=True,part='classification')
 def test_43_existing_art_and_stats_preserved(self):
  d=fixture();q=request(d);d2=apply_copy(d,q);v=next(iter(d2['monster_variants'].values()));v['sprite']='my_art.json';v['hp']=12345
  with self.assertRaisesRegex(ValueError,'No changes'):request(d2)
  self.assertEqual(v['hp'],12345);self.assertEqual(v['sprite'],'my_art.json')
 def test_44_cli_no_canonical_write_and_no_overwrite(self):
  with tempfile.TemporaryDirectory() as td:
   src=Path(td)/'project.json';dst=Path(td)/'proposal.json';src.write_text(json.dumps(fixture(),ensure_ascii=False),encoding='utf-8');before=src.read_bytes()
   args=[sys.executable,str(HERE/'make_editor_proposal.py'),'--project',str(src),'--out',str(dst),'--region','LIY']
   cp=subprocess.run(args,capture_output=True,text=True);self.assertEqual(cp.returncode,0,cp.stderr);self.assertTrue(dst.exists());self.assertEqual(before,src.read_bytes())
   cp=subprocess.run(args,capture_output=True,text=True);self.assertEqual(cp.returncode,2);self.assertEqual(before,src.read_bytes())
if __name__=='__main__':unittest.main(verbosity=2)
