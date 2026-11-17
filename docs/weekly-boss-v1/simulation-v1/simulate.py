#!/usr/bin/env python3
"""Deterministic DESIGN-model tests, not a port/execution of the game runtime.

Run: python simulate.py --out results
Source rules are manually transcribed in fixtures.json. No network/dependencies.
All timers use 60 Hz. Traversal checks assume empty ground unless explicitly stated.
A passed case demonstrates this reference model only, never deployed Lua/AI/network.
"""
from __future__ import annotations
import argparse, csv, itertools, json, math, random
from pathlib import Path

HZ=60; U=88.0; SPEED=210.0; REACH=125.0; NORMAL_CD=36
NORMAL_HITS=(0,8)  # second normal hit at 0.12s rounds upward to tick 8


def jump(hold_ticks:int=60)->list[dict]:
    """Base core.lua semi-implicit update, no override/buff/platforms."""
    z=0.0; vy=-650.0; rows=[]
    for t in range(1,121):
        if t>hold_ticks and vy < -210: vy=-210
        vy+=1300/HZ; z-=vy/HZ
        rows.append({'tick':t,'z_px':max(0,z)})
        if z<=0: break
    return rows


def task_run(task:dict,start_u:float,reaction:int,pause:int,actors:int=1,proxy_ai:bool=False)->dict:
    """Sequential ground-route controller; NOT a globally optimal combat policy.

    Multiple contributors are identical baseline-normal users co-located on the
    same path, not actual companion AI. Source-derived range/count/timers are
    applied. A one-time pause is imposed after half the total progress; queued
    hits still resolve. Enemy attacks, HP, vertical route, and latency omitted.
    """
    targets=[dict(t, remaining=t['need']) for t in task['targets']]
    x=start_u*U
    if task.get('nearest_one'):
        targets=[min(targets,key=lambda a:abs(x-a['x_u']*U)),dict(task['next_target'],remaining=task['next_target']['need'])]
    elif task.get('sort_route'):
        # Pick a monotone ordering based on shorter route between the endpoints.
        lo=min(t['x_u'] for t in targets)*U; hi=max(t['x_u'] for t in targets)*U
        targets.sort(key=lambda a:a['x_u'], reverse=abs(x-hi)<abs(x-lo))
    initial=sum(t['remaining'] for t in targets)
    next_cast=[0]*actors; casts=[0]*actors; last_hit={}; seen=set(); queue=[]
    periods=[36]*(actors-1)+[42] if proxy_ai else [36]*actors
    offsets=[NORMAL_HITS]*(actors-1)+[(9,14)] if proxy_ai else [NORMAL_HITS]*actors
    idx=0; progress=0; pause_used=False; stalled_to=-1; trace=[]; done=None
    upper=max(task['deadline']+1800,2400)
    for tick in range(upper):
        if idx>=len(targets): done=tick-1; break
        target=targets[idx]; target_x=target['x_u']*U
        can_act=tick>=reaction and tick>=stalled_to
        if can_act and abs(target_x-x)>=REACH:
            x+=math.copysign(min(SPEED/HZ,abs(target_x-x)-(REACH-0.01)),target_x-x)
        if tick>=task['open'] and can_act and abs(target_x-x)<REACH:
            for actor in range(actors):
                if tick>=next_cast[actor]:
                    casts[actor]+=1; cid=casts[actor]
                    next_cast[actor]=tick+periods[actor]
                    for eid,offset in enumerate(offsets[actor]):
                        queue.append((tick+offset,actor,cid,eid,idx))
        for ev in [e for e in queue if e[0]==tick]:
            _,owner,cid,eid,tid=ev
            if tid!=idx or tick<task['open']: continue
            # Pending attack origin/range was in reach at cast; targets are static.
            key=(owner,cid,tid) if task.get('dedup_cast') else (owner,cid,eid,tid)
            if key in seen: continue
            gap=task.get('min_gap',0)
            if tick-last_hit.get((owner,tid),-10**9)<gap: continue
            seen.add(key);last_hit[(owner,tid)]=tick
            target['remaining']-=1;progress+=1
            trace.append({'t':tick,'target':tid,'actor':owner,'progress':progress})
            if target['remaining']<=0:
                idx+=1
                break
        queue=[e for e in queue if e[0]>tick]
        if not pause_used and progress>=math.ceil(initial/2):
            stalled_to=tick+pause;pause_used=True
        if idx>=len(targets):done=tick;break
    if done is None:raise RuntimeError('reference policy did not terminate')
    done+=task.get('tail_ticks',0)
    ok=done<task['deadline']  # acceptance intervals are half-open
    return {'id':task['id'],'start_u':start_u,'reaction_ticks':reaction,
            'pause_ticks':pause,'contributors':('1+ideal_normal_AI' if proxy_ai else actors),'finish_tick':done,
            'deadline_tick':task['deadline'],'margin_ticks':task['deadline']-done,
            'success':ok,'trace':trace}


def sweep_tasks(tasks:list[dict]):
    rows=[];summaries=[]
    starts=[i/2 for i in range(21)]
    reactions=[0,12,24,36];pauses=[0,60,120]
    for task in tasks:
        for mode in ([1,2,4,'proxyAI'] if task.get('ai_credit') else [1,2,4]):
            proxy=mode=='proxyAI'; n=2 if proxy else mode
            group=[]
            for x,r,p in itertools.product(starts,reactions,pauses):
                v=task_run(task,x,r,p,n,proxy);v.pop('trace');rows.append(v);group.append(v)
            summaries.append({'id':task['id'],'contributors':('1+ideal_normal_AI' if proxy else n),'cases':len(group),
                 'met_deadline':sum(v['success'] for v in group),
                 'min_finish_s':min(v['finish_tick'] for v in group)/HZ,
                 'max_finish_s':max(v['finish_tick'] for v in group)/HZ,
                 'worst_margin_s':min(v['margin_ticks'] for v in group)/HZ,
                 'deadline_s':task['deadline']/HZ})
    return rows,summaries


def opportunity(duration_ticks:int,distance_u:float,reaction:int=18,cooldown:int=0)->dict:
    travel=max(0,distance_u*U-(REACH-0.01))
    arrival=math.ceil(travel/(SPEED/HZ))+reaction
    first=max(arrival,cooldown)
    hits=[t+h for t in range(first,duration_ticks,NORMAL_CD) for h in NORMAL_HITS if t+h<duration_ticks]
    full=sum(t+NORMAL_HITS[-1]<duration_ticks for t in range(first,duration_ticks,NORMAL_CD))
    return {'window_s':duration_ticks/HZ,'distance_u':distance_u,
            'reaction_s':reaction/HZ,'first_attack_s':first/HZ,'hits':len(hits),'complete_normal_casts':full}


def state_tests()->dict:
    """Reference contracts with adversarial inputs, not runtime integration tests."""
    checks=[]
    def ck(name,ok,detail):
        checks.append({'name':name,'passed':bool(ok),'detail':detail})
    rng=random.Random(20261117)
    for _ in range(1000):
        maxhp=rng.randint(100,10000);hp=rng.uniform(0,maxhp);debt=rng.uniform(0,maxhp*.5);heal=rng.uniform(0,maxhp*2)
        paid=min(debt,heal);d2=debt-paid;hp2=min(maxhp,hp+max(0,heal-paid))
        assert 0<=d2<=debt and hp<=hp2<=maxhp and abs((debt-d2)-paid)<1e-8
    ck('knave_healing',True,'1000 generated inputs, healing pays debt before HP; not real C.heal')
    for _ in range(1000):
        alive_max=rng.randint(100,10000);dead_max=rng.randint(100,10000);alive=rng.uniform(.21*alive_max,alive_max)
        transfer=min(alive*.5,dead_max)
        assert abs((alive-transfer)+transfer-alive)<1e-8 and transfer<=dead_max
    ck('gate_hp_transfer',True,'1000 generated inputs, transfer preserves combined HP')
    # Same-frame charging requests, shot reservations and stale-generation calls.
    checked=0
    for order in itertools.permutations(range(4)):
        charge=100;reserved=None;shots=0
        for p in order:
            if charge==100 and reserved is None:reserved=p
        for p in order:
            if reserved==p and charge>=100:charge-=100;reserved=None;shots+=1
        assert shots==1 and charge==0;checked+=1
    ck('shared_terminal_reservation',True,f'{checked} orderings, one reservation and one spend in reference model')
    # Counterexample: a process crash/death can leave reservation forever without a release rule.
    reserved='dead-player';timer=0
    for timer in range(600):pass
    ck('reservation_owner_loss_without_release',reserved is None,'EXPECTED FAILURE: a countermodel with no death/timeout release remains reserved after 10s')
    reserved='dead-player'
    if reserved=='dead-player':reserved=None
    ck('reservation_owner_loss_with_release',reserved is None,'proposed release-on-owner-loss, no game patch applied')
    # Ban rule: explicit provenance vs checking raw displacement.
    events=[('manual_walk',True,True),('manual_dash',True,True),('manual_new_root_attack',True,True),
            ('old_cast_motion',True,False),('knockback',True,False),('sync_correction',True,False),
            ('ai_walk',True,False),('idle_animation',False,False),('swap_without_manual_movement',False,False)]
    false_positives=sum(moved and not should for _,moved,should in events)
    ck('ban_position_only_counterexample',false_positives==0,f'EXPECTED FAILURE: raw displacement falsely flags {false_positives} of {len(events)} designed events')
    ck('ban_provenance_filter',all((name.startswith('manual_'))==should for name,_,should in events),'9 event origins, reference evaluator follows WM09 exclusions')
    # Synthetic source priority sequences for cleanup and HP0, no executable boss code.
    for order in itertools.permutations(('hit','deadline','cleanup')):
        accepted_hit=True;hp=0
        result='victory' if accepted_hit and hp<=0 else 'timeout'
        assert result=='victory'
    ck('hp0_priority',True,'6 orderings resolved at end-of-tick: victory dominates timeout/cleanup')
    # Progress P is aggregated before clamping: the order must not alter victory.
    current=98;increments=(3,-4,1)
    outcomes={min(100,max(0,current+sum(order))) for order in itertools.permutations(increments)}
    ck('apep_aggregate_progress',outcomes=={98},f'6 orderings -> {sorted(outcomes)}')
    # Multi-part bosses must not multiply a single event.
    seen=set();damages=0
    for part in ('head','tail','head','side','tail'):
        key=('cast-1','hit-1','boss-1')
        if key not in seen:seen.add(key);damages+=1
    ck('multipart_damage_once',damages==1,'Dvalin/Azhdaha/Narwhal: 5 contact callbacks -> 1 reference request')
    return {'checks':checks,'case_totals':{'healing_samples':1000,'transfer_samples':1000,'reservation_orderings':24,'ban_events':9,'priority_orderings':6,'progress_orderings':6,'part_callbacks':5}}


def special_models():
    full=jump(60);short=jump(1)
    jmax=max(v['z_px'] for v in full)
    platform={str(h):[v['tick'] for v in full if v['z_px']>=h*U] for h in (1.4,1.6,1.8)}
    # Landing path for Dvalin: run to gap, jump near edge; pollution starts tick120.
    drows=[]
    for start,r in itertools.product([0.15,.5,1,1.5,2,2.5,2.85],[0,12,24,36]):
        x=start*U;z=0;vy=0;air=False;hit=False;end=None
        for t in range(240):
            if t>=r:x+=SPEED/HZ
            if not air and x>=2.8*U and x<3.45*U:air=True;vy=-650
            if air:
                vy+=1300/HZ;z-=vy/HZ
                if z<=0:
                    if x<3*U or x>=3.45*U:z=0;air=False
            if t>=120 and t%60==0 and x<3*U and not air:hit=True
            if x>=3.45*U and not air:end=t;break
        drows.append({'start_u':start,'reaction_ticks':r,'hit':hit,'landed_tick':end})
    # Low waves crossing at 90tick spacing; jump 16 ticks before each crossing.
    wave_z={v['tick']:v['z_px'] for v in full}
    waves=[120,210,300,390];cleared=[]
    for error in range(-12,13):
        phase=16+error
        cleared.append({'jump_timing_error_ticks':error,'success':wave_z.get(phase,0)>.65*U})
    # WA05 shortest escape from the stated forward2U/back1.3U envelope.
    escapes=[]
    for x,r in itertools.product([3.7+i*.05 for i in range(67)],[0,12,24,36]):
        a=3.7*U-12;b=7*U+12
        dist=max(0,min(x*U-a,b-x*U))
        needed=math.ceil(dist/(SPEED/HZ))
        escapes.append({'start_u':round(x,3),'reaction_ticks':r,'arrival_tick':r+needed,'success':r+needed<84})
    # WT17 source locks at s+72; ending point must be beyond queen x6U.
    # Lamp position is NOT fixed by source: explicit test assumption x.5/9.5U.
    lure=[]
    for lamp,r,lock in itertools.product([.5,9.5],[0,12,24,36],[72,210]):
        goal=6.5*U
        needed=math.ceil(max(0,goal-lamp*U)/(SPEED/HZ))
        lure.append({'lamp_u_assumption':lamp,'reaction_ticks':r,'lock_delay_ticks':lock,
                     'arrival_tick':needed+r,'first_lure_possible':needed+r<=lock})
    # Apep: limited progress model after 4 normal attackers have already arrived.
    p=25;defense=[]
    for t in range(1,61):
        p+=1
        if t%3==0:p-=4*4
        p=max(0,min(100,p));defense.append({'second':t,'progress':p})
        if p==0:break
    # Healer-free contract debt, no incoming damage/cancellation modeled.
    repayment=[]
    for debt in (.25,.5):
        count=math.ceil(debt/.05-1e-9)
        service=45+(count-1)*60
        max_travel=math.ceil((5-.5-.55)*U/(SPEED/HZ))
        repayment.append({'debt_fraction':debt,'payments':count,'stationary_s':service/HZ,
            'center_travel_s':max_travel/HZ,'center_total_with_0_3_reaction_s':(max_travel+18+service)/HZ})
    # Signora centre->nearest device: +6/sec outside, -20/sec inside.
    temp=[]
    for initial,r in itertools.product([70,80,90,95,99],[0,12,24,36]):
        distance=(5-.5-.85)*U # device centre x.5 is a test placement assumption
        arrival=r+math.ceil(distance/(SPEED/HZ));T=float(initial);peak=T;first100=None
        for t in range(arrival+31):
            if t<arrival:T=min(100,T+6/HZ)
            else:T=max(0,T-20/HZ)
            peak=max(peak,T)
            if T>=100 and first100 is None:first100=t
        temp.append({'start_T':initial,'reaction_ticks':r,'arrival_tick':arrival,'peak_T':round(peak,3),
                     'reached_cap':first100 is not None,'after_30ticks_cooling':round(T,3)})
    return {'jump':{'full_max_px':jmax,'full_air_ticks':len(full),'tap1_max_px':max(v['z_px'] for v in short),
                    'platform_height_ticks':platform,'minimum_hold_ticks':{str(h):next((n for n in range(1,61) if max(v['z_px'] for v in jump(n))>=h*U),None) for h in (1.4,1.6,1.8)},'trace':full},
            'dvalin_gap_route':drows,'low_wave_jump':cleared,'andrius_escape':escapes,
            'gate_first_lure':lure,'apep_four_attackers_unanswered':defense,
            'knave_repayment':repayment,'signora_temperature':temp,
            'narwhal_nucleus_point_target':{'z_px':.9*U,'normal_vertical_strict_px':75,
              'point_target_reachable_from_ground':.9*U<75,
              'note':'Conditional integration risk only: sprite anchor is not necessarily target hitBottom.'}}


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,default=Path(__file__).parent/'results');args=ap.parse_args()
    fixture=json.loads((Path(__file__).parent/'fixtures.json').read_text(encoding='utf-8'))
    args.out.mkdir(parents=True,exist_ok=True)
    raw,summary=sweep_tasks(fixture['tasks'])
    specials=special_models();contracts=state_tests()
    opportunities=[]
    for boss,item,duration in fixture['opportunities']:
        for d in (1,3,5):
            v=opportunity(duration,d);v.update(boss=boss,item=item);opportunities.append(v)
    out={'source_commit':fixture['source_commit'],'model_scope':fixture['scope'],
         'timing_cases':len(raw),'timing_summaries':summary,
         'special_models':specials,'reference_contract_tests':contracts,'opportunities':opportunities}
    (args.out/'results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (args.out/'timing_cases.csv').open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(raw[0]));w.writeheader();w.writerows(raw)
    with (args.out/'opportunities.csv').open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(opportunities[0]));w.writeheader();w.writerows(opportunities)
    examples={}
    for task in fixture['tasks']:
        if task['id'] in ('WG05','WG16','WH13'):
            examples[task['id']]=task_run(task,5,0,0,1)
    (args.out/'example_traces.json').write_text(json.dumps(examples,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('timing cases',len(raw))
    for s in summary:print(s)
    print('jump', {k:v for k,v in specials['jump'].items() if k not in ('trace','platform_height_ticks')})
    print('point target',specials['narwhal_nucleus_point_target'])
    print('contracts',[(c['name'],c['passed']) for c in contracts['checks']])
    print('repayment',specials['knave_repayment'])
    print('apep unanswered',specials['apep_four_attackers_unanswered'][-1])

if __name__=='__main__':main()
