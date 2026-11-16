import json,time,statistics,random
from runtime import ROOT,runtime
variants=json.loads((ROOT/'assets/variants.json').read_text(encoding='utf8'))['variants']
lua,C=runtime();s=C.new(20);samples={k:[] for k in variants};counts={}
keys=list(variants);rng=random.Random(1611)
for round in range(140):
    rng.shuffle(keys)
    for key in keys:
        start=time.perf_counter();f=C.frame(s,'rect',key);elapsed=(time.perf_counter()-start)*1000
        if round>=20:samples[key].append(elapsed)
        counts[key]=f.commands
        assert f.visible==20 and f.t==0
results=[]
for key,v in variants.items():
    values=sorted(samples[key]);results.append({'profile':key,'commands':counts[key],'reduction_pct':100*(1-counts[key]/counts['legacy']),'median_ms':statistics.median(values),'p95_ms':values[int(len(values)*.95)],'json_bytes':len(json.dumps(v,separators=(',',':')).encode())})
out={'scope':'same frozen initial state, 20 enemies + two characters, Lua draw-command generation only. 20 warmup rounds + 120 samples per profile, randomized order. Includes normal GC pauses, excludes JSON / network / Canvas. No Miliastra inference.','results':results}
(ROOT/'evidence/variant-benchmark.json').write_text(json.dumps(out,indent=2),encoding='utf8');print(json.dumps(out,indent=2))
