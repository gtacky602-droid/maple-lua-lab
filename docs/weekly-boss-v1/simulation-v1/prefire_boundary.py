"""Check normal-hit phases, including a pending second hit at window opening."""
import json
from pathlib import Path

def count(window,phase,need=24):
    accepted=[];seen=set();last=-10**9
    events=sorted((c+offset,c) for c in range(-phase,1600,36) for offset in (0,8))
    for tick,cast in events:
        if tick<0 or cast in seen or tick-last<24: continue
        accepted.append(tick);seen.add(cast);last=tick
    return {'window_ticks':window,'phase_ticks':phase,
            'count_in_window':sum(t<window for t in accepted),
            'tick_of_24th':accepted[need-1]}

if __name__=='__main__':
    rows=[count(w,p) for w in (540,600) for p in range(36)]
    summary={str(w):{'max_count':max(x['count_in_window'] for x in rows if x['window_ticks']==w),
                        'best_24th_tick':min(x['tick_of_24th'] for x in rows if x['window_ticks']==w)} for w in (540,600)}
    out={'scope':'normal-only phase boundary, not full game','cases':72,'summary':summary,'rows':rows}
    Path(__file__).with_name('prefire_results.json').write_text(json.dumps(out,indent=2)+'\n')
    print(summary)
