import json, unittest
from pathlib import Path
from simulate import task_run,jump,opportunity,state_tests,special_models

class ReferenceModelTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  data=json.loads((Path(__file__).parent/'fixtures.json').read_text())
  cls.tasks={t['id']:t for t in data['tasks']}
 def test_two_physical_hits_are_one_group(self):
  r=task_run(self.tasks['WG05'],5,0,0)
  self.assertEqual(r['finish_tick'],888)
  self.assertEqual([e['t'] for e in r['trace'][:3]],[60,96,132])
 def test_ordinary_hit_events_are_both_counted(self):
  r=task_run(self.tasks['WV05'],5,0,0)
  self.assertEqual([e['t'] for e in r['trace'][:4]],[60,68,96,104])
  self.assertEqual(r['finish_tick'],176)
 def test_wg16_is_impossible_with_baseline_normals(self):
  self.assertFalse(task_run(self.tasks['WG16'],5,0,0)['success'])
 def test_candidates_work_in_fast_case(self):
  self.assertTrue(task_run(self.tasks['WG16_PROPOSED_G12_12S'],5,0,0)['success'])
  self.assertTrue(task_run(self.tasks['WG16_PROPOSED_G24_18S'],5,0,0)['success'])
 def test_acceptance_is_half_open(self):
  t={'id':'boundary','open':60,'deadline':96,'targets':[{'x_u':5,'need':2}],'min_gap':24,'dedup_cast':True}
  self.assertFalse(task_run(t,5,0,0)['success'])
 def test_second_player_improves_hand_count(self):
  self.assertTrue(task_run(self.tasks['WG16'],5,0,0,2)['success'])
 def test_proxy_not_silent_human_copy(self):
  a=task_run(self.tasks['WG16'],5,0,0,2,True)
  b=task_run(self.tasks['WG16'],5,0,0,2)
  self.assertGreater(a['finish_tick'],b['finish_tick'])
 def test_jump_integration(self):
  self.assertAlmostEqual(max(v['z_px'] for v in jump()),157.0833333333)
  self.assertLess(max(v['z_px'] for v in jump(1)),1.4*88)
 def test_recovery_does_not_implicitly_teleport(self):
  self.assertEqual(opportunity(60,5)['hits'],0)
  self.assertGreater(opportunity(60,1)['hits'],0)
 def test_countermodels_are_explicit_not_engine_failures(self):
  r=state_tests()['checks'];failed=[x['name'] for x in r if not x['passed']]
  self.assertEqual(failed,['reservation_owner_loss_without_release','ban_position_only_counterexample'])
 def test_first_lure_position_dependency(self):
  r=special_models()['gate_first_lure']
  self.assertTrue(all(not x['first_lure_possible'] for x in r if x['lamp_u_assumption']==.5 and x['lock_delay_ticks']==72))
  self.assertTrue(all(x['first_lure_possible'] for x in r if x['lock_delay_ticks']==210))

if __name__=='__main__':unittest.main(verbosity=2)
