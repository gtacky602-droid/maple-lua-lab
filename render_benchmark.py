import time,json,statistics
from runtime import ROOT,runtime
results=[]
for density in (12,16,20,40):
 for mode in ('sprite','rect'):
  lua,C=runtime();s=C.new(density);times=[]
  for i in range(180):
   start=time.perf_counter();f=C.frame(s,mode);times.append((time.perf_counter()-start)*1000)
  results.append({'density':density,'mode':mode,'visible':f.visible,'commands':f.commands,'mean_lua_draw_ms':statistics.mean(times),'p95_lua_draw_ms':sorted(times)[171]})
out={'scope':'static initial scene; Lua command generation only, excluding JSON/HTTP/Canvas; no Miliastra inference','results':results}
(ROOT/'evidence/render-benchmark.json').write_text(json.dumps(out,indent=2),encoding='utf8');print(json.dumps(out,indent=2))
