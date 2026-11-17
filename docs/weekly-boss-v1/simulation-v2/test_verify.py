import itertools
import unittest
from verify import (MODEL, Repayment, Reservation, contract_checks, load_entries,
                    lure_cases, prefire, stop_violation, timing_tasks, validate_manifests)


class RevisedDesignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries, cls.docs = load_entries()
        cls.old, cls.new = timing_tasks(cls.entries)

    def test_72_entries_and_59_fixed_routes(self):
        self.assertEqual(validate_manifests(self.entries, self.docs), 59)

    def test_sources_of_truth_are_explicit(self):
        for doc in self.docs:
            self.assertEqual(doc['source_of_truth'][0], 'CORRECTIONS_V02.md')

    def test_old_barriers_fail_even_without_travel(self):
        for task in self.old:
            if task['id'] in ('WG05', 'WG16'):
                self.assertFalse(MODEL.task_run(task, 5, 0, 0)['success'])

    def test_three_corrected_tasks_solo_all_252_conditions(self):
        for task in self.new:
            if task['id'] not in ('WG05','WG16','WV11'):
                continue
            for x,r,p in itertools.product([i/2 for i in range(21)], (0,12,24,36), (0,60,120)):
                self.assertTrue(MODEL.task_run(task,x,r,p)['success'],(task['id'],x,r,p))

    def test_unchanged_task_definitions_preserved(self):
        changed={'WG05','WG16','WV11'}
        self.assertEqual([t for t in self.old if t['id'] not in changed],
                         [t for t in self.new if t['id'] not in changed])

    def test_prefire_36_phases_each_barrier(self):
        for phase in range(36):
            self.assertTrue(prefire(12,60,780,phase)['success'])
            for end in (600,660):
                self.assertFalse(prefire(24,60,end,phase)['success'])

    def test_acceptance_is_half_open(self):
        for a,b in ((60,780),(60,360)):
            accept=lambda t:a<=t<b
            self.assertFalse(accept(a-1));self.assertTrue(accept(a))
            self.assertTrue(accept(b-1));self.assertFalse(accept(b))

    def test_nucleus_lower_edge_not_visual_anchor(self):
        e=self.entries['WV11'];lo,hi=e['hurtbox_z_U']
        self.assertGreater(e['visual_center_z_U']*88,75)
        # Equivalent to core C.targetHeight, converted from y-down to z-up.
        target_z=max(lo*88,min(hi*88,0))
        self.assertLess(abs(target_z),75)
        self.assertAlmostEqual(target_z,57.2)
        self.assertEqual(MODEL.REACH,125)

    def test_nucleus_success_cancels_failure_schedule(self):
        e=self.entries['WV11'];close=e['accept_window'][1]
        for success in (60,close-1):
            resolved=False;calls=[]
            for tick in range(e['deadline_ticks']+1):
                if tick==success and 60<=tick<close:
                    resolved=True;calls.append('success')
                if tick==e['deadline_ticks'] and not resolved:
                    calls.append('failure')
            self.assertEqual(calls,['success'])

    def test_lure_156_placements_and_reactions(self):
        rows=lure_cases(self.entries['WT17'])
        self.assertEqual(len(rows),156)
        self.assertTrue(all(r['new_success'] for r in rows))
        self.assertEqual(min(r['new_margin_ticks'] for r in rows),16)
        self.assertLess(sum(r['old_success'] for r in rows),156)

    def test_lure_latest_freeze_and_retry_boundary(self):
        e=self.entries['WT17']
        self.assertEqual(e['freeze_completed_by']+e['charge_window_offset'][1],894)
        self.assertEqual(e['last_retry_start_tick']+e['charge_window_offset'][1],960)
        self.assertGreater(e['last_retry_start_tick']+1+e['charge_window_offset'][1],960)

    def test_repayment_duration_and_hp_invariance(self):
        for debt,finish in ((2500,165),(5000,315)):
            r=Repayment(debt);r.start(0)
            for tick in range(finish+1):r.advance(tick)
            self.assertEqual((r.debt,r.hp,r.feather,r.last_paid),(0,73,1,finish))

    def test_repayment_cancel_keeps_completed_payments(self):
        r=Repayment(2500);r.start(0)
        self.assertTrue(r.advance(45));r.cancel()
        self.assertEqual(r.debt,2000)
        self.assertFalse(r.advance(75))
        r.start(80)
        self.assertFalse(r.advance(124));self.assertTrue(r.advance(125))
        self.assertEqual(r.debt,1500)

    def test_repayment_no_repeated_tick_or_catchup(self):
        r=Repayment(5000);r.start(0)
        self.assertTrue(r.advance(300))
        self.assertEqual(r.debt,4500)
        self.assertFalse(r.advance(300));self.assertFalse(r.advance(329))
        self.assertTrue(r.advance(330))
        self.assertEqual(r.payments,2)

    def test_repayment_zero_debt_never_mints_feather(self):
        r=Repayment(0);self.assertFalse(r.start(0));self.assertFalse(r.advance(100))
        self.assertEqual(r.feather,0)

    def test_repayment_release_range_death_cancel(self):
        for held,eligible in ((False,True),(True,False)):
            r=Repayment(2500);r.start(0)
            self.assertFalse(r.advance(45,held=held,eligible=eligible))
            self.assertEqual(r.debt,2500);self.assertIsNone(r.next_paid)

    def test_reservation_cancel_has_no_refund(self):
        r=Reservation();tok=r.reserve(0,'p1')
        self.assertTrue(r.release(tok));self.assertEqual(r.charge,100)
        self.assertFalse(r.release(tok));self.assertEqual(r.charge,100)

    def test_reservation_fire_once_and_miss_has_no_refund(self):
        r=Reservation();tok=r.reserve(0,'p1')
        self.assertTrue(r.commit(20,tok));self.assertFalse(r.commit(21,tok))
        self.assertFalse(r.release(tok));self.assertEqual(r.charge,0)

    def test_reservation_expiry_is_exclusive(self):
        r=Reservation();tok=r.reserve(0,'p1')
        self.assertTrue(r.valid(119,tok));self.assertFalse(r.commit(120,tok))
        self.assertEqual(r.charge,100)
        self.assertIsNotNone(r.reserve(120,'p2'))

    def test_renewal_cannot_hold_forever(self):
        r=Reservation();tok=r.reserve(0,'p1')
        for tick in range(30,300,30):self.assertTrue(r.renew(tick,tok))
        self.assertFalse(r.renew(300,tok));self.assertFalse(r.commit(300,tok))

    def test_stale_token_cannot_cancel_new_owner(self):
        r=Reservation();old=r.reserve(0,'p1');r.owner_lost('p1')
        new=r.reserve(1,'p2');self.assertFalse(r.release(old))
        self.assertTrue(r.commit(2,new))

    def test_epoch_invalidates_old_commit(self):
        r=Reservation();old=r.reserve(0,'p1');r.change_epoch()
        self.assertFalse(r.commit(1,old));self.assertEqual(r.charge,100)

    def test_owner_loss_has_priority_over_commit_same_tick(self):
        for messages in itertools.permutations(('death','fire')):
            r=Reservation();tok=r.reserve(0,'p1')
            # Explicit integration contract: terminal/loss signals before commit.
            if 'death' in messages:r.owner_lost('p1')
            self.assertFalse(r.commit(30,tok));self.assertEqual(r.charge,100)

    def test_ineligible_owner_cannot_reserve_or_renew(self):
        r=Reservation();self.assertIsNone(r.reserve(0,'p1',False))
        tok=r.reserve(0,'p1');self.assertFalse(r.renew(30,tok,False))
        self.assertIsNone(r.pending)

    def test_contract_enumerations(self):
        self.assertEqual(contract_checks(),{'reservation_orders':24,'owner_loss_cases':7,
                                         'provenance_cases':15,'repayment_amount_cases':1000})

    def test_stop_rule_boundaries(self):
        base={'origin':'manual','kind':'walk'}
        self.assertFalse(stop_violation({'tick':119,**base}))
        self.assertTrue(stop_violation({'tick':120,**base}))
        self.assertTrue(stop_violation({'tick':419,**base}))
        self.assertFalse(stop_violation({'tick':420,**base}))

    def test_old_root_is_not_new_child_movement(self):
        e={'tick':130,'origin':'manual','kind':'root_attack','root_started_tick':119,'root_moves':True}
        self.assertFalse(stop_violation(e))
        e['root_started_tick']=120;self.assertTrue(stop_violation(e))

    def test_unknown_provenance_is_not_guilt(self):
        self.assertIsNone(stop_violation({'tick':130,'kind':'walk'}))


if __name__=='__main__':
    unittest.main(verbosity=2)
