#!/usr/bin/env python3
"""Regression tests for DESIGN corrections, not the Lua game or a live playtest.

The old timing controller is reused unchanged. Geometry tests below cover only
specified static targets and empty-ground travel. No enemy combat, damage balance,
real companion AI or network is simulated. Run: python verify.py --out results
"""
from __future__ import annotations
import argparse
import copy
import csv
import hashlib
import importlib.util
import itertools
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent
V1 = DOCS / 'simulation-v1'
EXPECTED_V1 = '85bb55d9ac7fc4c90c1cc84f989d6cc53de21e7c'
BASE_COMMIT = '3de53fd196b553e94e04cec136b54ebf1ec00dd5'


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()


def load_model():
    path = V1 / 'simulate.py'
    if blob_sha(path.read_bytes()) != EXPECTED_V1:
        raise ValueError('v1 timing model changed: review before regenerating evidence')
    spec = importlib.util.spec_from_file_location('weekly_design_model_v1', path)
    if spec is None or spec.loader is None:
        raise RuntimeError('Cannot load the pinned v1 reference model')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MODEL = load_model()


def load_entries() -> tuple[dict[str, dict], list[dict]]:
    docs = [json.loads((DOCS / name).read_text(encoding='utf-8')) for name in
            ('MANIFEST_PRIMAL_GATE.json', 'MANIFEST_FONTAINE.json')]
    entries = {e['id']: e for d in docs for e in d['entries']}
    assert len(entries) == sum(len(d['entries']) for d in docs) == 72
    return entries, docs


def validate_manifests(entries: dict, docs: list[dict]) -> int:
    """Structural checks, not a geometric or full prose equivalence proof."""
    routes = 0
    for doc in docs:
        assert doc['source_of_truth'][0] == 'CORRECTIONS_V02.md'
        assert doc['counts']['total'] == len(doc['entries'])
        for entry in doc['entries']:
            if entry['kind'] != 'fixed':
                continue
            for route in [entry] + entry.get('variants', []):
                total = route['total_ticks']
                rs, re = route['recovery']
                assert 0 <= rs < re == total
                assert all(isinstance(v, int) for v in (rs, re, total))
                for a, b in route.get('active_windows', []):
                    assert 0 <= a < b <= rs
                for t in route.get('lock_ticks', []):
                    assert isinstance(t, int) and 0 <= t < total
                for p in route.get('projectiles', []):
                    assert all(t + p['ttl_ticks'] <= rs for t in p['spawn_ticks'])
                routes += 1
    g = entries['WG05']
    assert g['conditional_success']['accept'] == [60, 780]
    assert g['barrier_units'] == entries['WG16']['barrier_units'] == 12
    assert entries['WG16']['accept_window'] == [60, 780]
    assert g['projectiles'][0]['spawn_ticks'][0] > 780
    assert entries['WV11']['accept_window'][1] == entries['WV11']['failure_telegraph'][0]
    assert entries['WV11']['failure_telegraph'][1] == entries['WV11']['deadline_ticks']
    t = entries['WT17']
    assert t['freeze_completed_by'] + t['charge_window_offset'][1] < t['deadline_ticks']
    assert t['last_retry_start_tick'] + t['charge_window_offset'][1] == t['deadline_ticks']
    for a in ('WG05', 'WG16', 'WT17'):
        assert entries[a].get('on_success', entries[a].get('conditional_success', {}).get('on_success')) in entries
    return routes


def timing_tasks(entries: dict) -> tuple[list[dict], list[dict]]:
    fixture = json.loads((V1 / 'fixtures.json').read_text(encoding='utf-8'))
    old = [x for x in fixture['tasks'] if '_PROPOSED_' not in x['id']]
    new = copy.deepcopy(old)
    for task in new:
        e = entries.get(task['id'])
        if task['id'] in ('WG05', 'WG16'):
            task['targets'][0]['need'] = e['barrier_units']
            task['open'], task['deadline'] = e.get('accept_window', e.get('conditional_success', {}).get('accept'))
        elif task['id'] == 'WV11':
            task['open'], task['deadline'] = e['accept_window']
            task['targets'][0]['need'] = e['required_manual_casts']
    return old, new


def prefire(need: int, start: int, close: int, phase: int) -> dict:
    """WG-only: an already started cast's second hit may land after opening."""
    events = [(c + h, c, h) for c in range(start-36+phase, close+2000, 36) for h in (0, 8)]
    seen = set()
    last = -10**9
    accepted = []
    for t, cast, hit in sorted(events):
        if t < start or cast in seen or t-last < 24:
            continue
        seen.add(cast); last = t; accepted.append(t)
        if len(accepted) == need:
            break
    return {'phase': phase, 'finish_tick': accepted[-1],
            'success': accepted[-1] < close,
            'count_in_window': sum(t < close for t in accepted)}


def lure_cases(entry: dict) -> list[dict]:
    """Empty floor, no body obstruction. Reach the right side before LOCK."""
    rows = []
    for x, reaction in itertools.product([i/4 for i in range(1,40)], (0,12,24,36)):
        travel = math.ceil(max(0, entry['lure_min_x_U']-x)*MODEL.U / (MODEL.SPEED/60))
        arrival = travel + reaction
        rows.append({'start_u':x, 'reaction_ticks':reaction, 'arrival_tick':arrival,
                     'old_success':arrival < 72,
                     'new_success':arrival < entry['lock_offset'],
                     'new_margin_ticks':entry['lock_offset']-arrival})
    return rows


@dataclass
class Repayment:
    """Normalized basis points; no HP healing. One actor/debt generation only."""
    debt: int
    hp: int = 73
    feather: int = 0
    last_paid: int = -10**9
    next_paid: int | None = None
    payments: int = 0

    def start(self, tick: int) -> bool:
        if self.debt <= 0 or self.next_paid is not None:
            return False
        self.next_paid = max(tick + 45, self.last_paid + 30)
        return True

    def cancel(self) -> None:
        self.next_paid = None

    def advance(self, tick: int, *, held: bool = True, eligible: bool = True) -> bool:
        if not held or not eligible or self.debt <= 0:
            self.cancel(); return False
        if self.next_paid is None or tick < self.next_paid:
            return False
        before = self.debt
        self.debt -= min(self.debt, 500)
        self.last_paid = tick; self.payments += 1
        self.next_paid = tick + 30 if self.debt else None
        if before > 0 and self.debt == 0:
            self.feather = 1
        return True


@dataclass(frozen=True)
class Token:
    sequence: int
    epoch: int
    owner: str  # real player + actor generation in the integration contract


class Reservation:
    """Reference transaction/lease contract; not actual multiplayer code."""
    def __init__(self, charge: int = 100):
        self.charge = charge
        self.epoch = 0
        self.serial = 0
        self.pending: Token | None = None
        self.expires = 0
        self.hard_expires = 0
        self.spent: set[Token] = set()

    def expire(self, tick: int) -> None:
        if self.pending and tick >= min(self.expires, self.hard_expires):
            self.pending = None

    def reserve(self, tick: int, owner: str, eligible: bool = True) -> Token | None:
        self.expire(tick)
        if not eligible or self.pending is not None or self.charge < 100:
            return None
        self.serial += 1
        self.pending = Token(self.serial, self.epoch, owner)
        self.expires, self.hard_expires = tick+120, tick+300
        return self.pending

    def valid(self, tick: int, token: Token | None) -> bool:
        self.expire(tick)
        return token is not None and token == self.pending and token.epoch == self.epoch

    def renew(self, tick: int, token: Token | None, eligible: bool = True) -> bool:
        if not self.valid(tick, token):
            return False
        if not eligible:
            self.release(token); return False
        self.expires = min(tick+120, self.hard_expires)
        return True

    def release(self, token: Token | None) -> bool:
        if token is None or token != self.pending:
            return False
        self.pending = None
        return True  # no debit occurred, so no refund occurs

    def owner_lost(self, owner: str) -> None:
        if self.pending and self.pending.owner == owner:
            self.pending = None

    def change_epoch(self) -> None:
        self.epoch += 1; self.pending = None

    def commit(self, tick: int, token: Token | None, eligible: bool = True) -> bool:
        if not self.valid(tick, token):
            return False
        if not eligible:
            self.release(token); return False
        if token in self.spent or self.charge < 100:
            return False
        self.spent.add(token); self.charge -= 100; self.pending = None
        return True  # projectile misses must NOT refund charge


def stop_violation(event: dict, start: int = 120, end: int = 420) -> bool | None:
    """None = missing/unknown provenance; rule must not impose punishment."""
    if not start <= event['tick'] < end:
        return False
    origin = event.get('origin')
    if origin not in {'manual','manual_repeat','ai','forced','sync','auto_aim','animation'}:
        return None
    if origin not in {'manual','manual_repeat'}:
        return False
    if not event.get('accepted', True):
        return False
    if event['kind'] in {'walk','dodge','jump'}:
        return True
    if event['kind'] == 'root_attack':
        if 'root_started_tick' not in event:
            return None
        return event['root_started_tick'] >= start and bool(event.get('root_moves'))
    return False


def contract_checks() -> dict:
    counts = {'reservation_orders':0, 'owner_loss_cases':0, 'provenance_cases':0, 'repayment_amount_cases':0}
    for order in itertools.permutations(('p1','p2','p3','p4')):
        r=Reservation(); tokens=[r.reserve(0,p) for p in order]
        assert sum(t is not None for t in tokens)==1
        assert sum(r.commit(1,t) for t in tokens)==1 and r.charge==0
        counts['reservation_orders']+=1
    for reason in ('death','disconnect','swap','range_exit','target_despawn','phase','victory'):
        r=Reservation(); token=r.reserve(0,'p1/actor1/g1')
        if reason in ('phase','victory','target_despawn'): r.change_epoch()
        else: r.owner_lost('p1/actor1/g1')
        assert not r.commit(1,token)
        new=r.reserve(1,'p2/actor2/g4'); assert new is not None and r.commit(2,new)
        assert r.charge==0;counts['owner_loss_cases']+=1
    events=[
        ({'origin':'manual','kind':'walk'},True),
        ({'origin':'manual','kind':'jump'},True),
        ({'origin':'manual','kind':'dodge'},True),
        ({'origin':'manual_repeat','kind':'root_attack','root_started_tick':125,'root_moves':True},True),
        ({'origin':'manual','kind':'root_attack','root_started_tick':100,'root_moves':True},False),
        ({'origin':'manual','kind':'root_attack','root_started_tick':125,'root_moves':False},False),
        ({'origin':'ai','kind':'walk'},False),
        ({'origin':'forced','kind':'walk'},False),
        ({'origin':'sync','kind':'walk'},False),
        ({'origin':'animation','kind':'walk'},False),
        ({'origin':'auto_aim','kind':'walk'},False),
        ({'origin':'manual','kind':'swap'},False),
        ({'origin':'manual','kind':'walk','accepted':False},False),
        ({'origin':'unknown','kind':'walk'},None),
        ({'origin':'manual','kind':'root_attack'},None),
    ]
    for event, expected in events:
        assert stop_violation({'tick':126,**event}) is expected
        counts['provenance_cases']+=1
    for debt in range(1,5001,5):
        r=Repayment(debt);r.start(0);seen=[]
        for t in range(600):
            if r.advance(t):seen.append(t)
            if r.debt==0:break
        assert r.hp==73 and r.feather==1 and r.debt==0
        assert len(seen)==math.ceil(debt/500)
        assert seen==[45+30*i for i in range(len(seen))]
        counts['repayment_amount_cases']+=1
    return counts


def main() -> None:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out',type=Path,default=HERE/'results')
    args=ap.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    entries,docs=load_entries();routes=validate_manifests(entries,docs)
    before,after=timing_tasks(entries)
    old_rows,old_summary=MODEL.sweep_tasks(before)
    new_rows,new_summary=MODEL.sweep_tasks(after)
    # Unmodified tasks must preserve every timing result, not merely pass totals.
    changed={'WG05','WG16','WV11'}
    assert [r for r in old_rows if r['id'] not in changed]==[r for r in new_rows if r['id'] not in changed]
    for summary in new_summary:
        if summary['id'] in changed:
            assert summary['met_deadline']==summary['cases']
    boundary=[]
    for version,tasks in [('before',before),('after',after)]:
        for task in tasks:
            if task['id'] not in {'WG05','WG16'}:continue
            for phase in range(36):
                row=prefire(task['targets'][0]['need'],task['open'],task['deadline'],phase)
                boundary.append({'version':version,'id':task['id'],**row})
    lure=lure_cases(entries['WT17']);assert all(r['new_success'] for r in lure)
    # C.targetHeight equivalent in z-up coordinates: distance to target interval.
    zlo,zhi=entries['WV11']['hurtbox_z_U']
    target_distance=max(zlo*88,min(zhi*88,0))
    assert target_distance<75
    repayments=[]
    for d in (2500,5000):
        r=Repayment(d);r.start(0)
        for t in range(600):
            r.advance(t)
            if r.debt==0:break
        approach=math.ceil((5-0.5-0.55)*88/(210/60))+18
        repayments.append({'debt_percent':d/100,'new_at_device_ticks':t,
                           'old_at_device_ticks':45+(math.ceil(d/500)-1)*60,
                           'approach_and_reaction_ticks':approach,
                           'new_central_total_ticks':t+approach})
    report={'scope':'Independent reference model only. Not full combat, Lua, real AI/network or game balance.',
            'source_commit':BASE_COMMIT,'source_core_blob':'8119a471f2476350307d023521fea5036dfe1fbc',
            'v1_model_blob':EXPECTED_V1,'manifest_entries':72,'fixed_routes_checked':routes,
            'timing_cases':len(old_rows)+len(new_rows),
            'timing_before':old_summary,'timing_after':new_summary,
            'prefire_cases':len(boundary),
            'lure_cases':len(lure),'lure_before_met':sum(r['old_success'] for r in lure),
            'lure_after_met':sum(r['new_success'] for r in lure),
            'lure_worst_margin_ticks':min(r['new_margin_ticks'] for r in lure),
            'lure_latest_first_end':entries['WT17']['freeze_completed_by']+entries['WT17']['charge_window_offset'][1],
            'hurtbox_ground_distance_px':target_distance,'repayment':repayments,
            'contracts':contract_checks(),
            'manifest_blobs':{n:blob_sha((DOCS/n).read_bytes()) for n in ('MANIFEST_PRIMAL_GATE.json','MANIFEST_FONTAINE.json')}}
    (args.out/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for name,rows in [('timing_before',old_rows),('timing_after',new_rows),('prefire',boundary),('lure',lure)]:
        with (args.out/(name+'.csv')).open('w',encoding='utf-8',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    print(json.dumps({k:v for k,v in report.items() if k not in ('timing_before','timing_after')},ensure_ascii=False,indent=2))
    for row in new_summary:
        if row['id'] in changed:print(row)


if __name__=='__main__':
    main()
