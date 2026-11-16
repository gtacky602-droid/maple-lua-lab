import json,time,statistics
from runtime import runtime,native,ROOT
lua,C=runtime()
lua.globals().C=C
checks=lua.execute('''
local out={}
local function check(name,value) assert(value,name);out[#out+1]=name end
local s=C.new(16)
check('16 enemies per screen / 48 total',#s.enemies==48 and C.frame(s).visible==16)
local x=s.actors[1].x
for i=1,30 do C.step(s,1/60,{right=true}) end
check('movement',s.actors[1].x>x+90)
s=C.new(16); C.action(s,'jump')
local high=480
for i=1,60 do C.step(s,1/60,{jump=true});high=math.min(high,s.actors[1].y) end
check('jump reaches upper platform',high<340)
check('land on one-way platform',s.actors[1].y==340)
C.action(s,'drop');for i=1,45 do C.step(s,1/60,{}) end
check('drop to ground',s.actors[1].y==480)
s=C.new(16);s.actors[1].hp=77;s.actors[1].cd.skill1=2
local g=s.gauge;C.action(s,'swap')
check('swap keeps hp cooldown gauge',s.active==2 and s.actors[1].hp==77 and s.actors[1].cd.skill1==2 and s.gauge==g)
s=C.new(16);s.actors[1].x=260
C.action(s,'skill1');local hits=s.hits;C.action(s,'skill1')
check('cooldown prevents duplicate cast',hits>0 and s.hits==hits)
check('hit gauge increment once per cast',s.gauge==65)
s=C.new(16);s.gauge=59;C.action(s,'light');check('insufficient gauge rejected',s.actors[1].light==0)
s.gauge=100;C.action(s,'light');check('shared gauge consumes 60',s.gauge==40 and s.actors[1].light==12)
C.action(s,'light');check('light cooldown enforced',s.gauge==40)
s=C.new(16);s.auto=true
for i=1,3600 do C.step(s,1/60,{}) end
check('AI deals damage and kills',s.hits>0 and s.kills>0)
check('effect and event buffers bounded',#s.numbers<=80 and #s.events<=240)
check('gauge bounded',s.gauge>=0 and s.gauge<=100)
s=C.new(12);s.enemies[1].hp=0;s.enemies[1].respawn=6
for i=1,359 do C.step(s,1/60,{}) end
check('respawn waits six seconds',s.enemies[1].hp==0)
C.step(s,1/60,{});C.step(s,1/60,{})
check('respawn restores enemy',s.enemies[1].hp==15)
s=C.new(20);s.actors[1].hp=0;C.step(s,1/60,{})
check('death switches to living partner',s.active==2)
s.actors[2].hp=0;s.mora=123;s.gauge=88;C.step(s,1/60,{})
check('wipe preserves rewards gauge',s.mora==123 and s.gauge==88 and s.returns==1)
C.action(s,'pause');local t=s.t;C.step(s,1/60,{right=true});check('pause freezes simulation',s.t==t)
return out
''')
bench=[]
for density in (12,16,20,40):
    lua,C=runtime();s=C.new(density);s.auto=True
    times=[];peak=0;commands=0
    for i in range(3600):
        start=time.perf_counter();C.step(s,1/60,lua.table());f=C.frame(s)
        times.append((time.perf_counter()-start)*1000)
        peak=max(peak,lua.eval("collectgarbage('count')"));commands=max(commands,f.commands)
    bench.append(dict(density=density,enemies=len(s.enemies),sim_seconds=60,mean_ms=statistics.mean(times),p95_ms=sorted(times)[int(len(times)*.95)],max_ms=max(times),peak_lua_kb=peak,max_lua_commands=commands,hits=s.hits,kills=s.kills))
result={'runtime':'Lua 5.3 Lupa native, local PC','scope':'one fixed 1/60 step + Lua draw-command generation; excludes browser / HTTP / Miliastra','checks':native(checks),'benchmarks':bench}
(ROOT/'evidence').mkdir(exist_ok=True)
(ROOT/'evidence/verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
