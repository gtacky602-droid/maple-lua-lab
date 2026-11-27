"""Verify Signora's weekly story encounter through the Lua runtime."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
node, hub, quest = 'signora-ten-shrine-arena', 'inazuma-town', 'signora-weekly-commission'
uid = 'boss-29050101'
ticks = lua.eval('function(C,s,n,hold) for i=1,n do C.step(s,1/60,{interact=hold}) end end')
manifest = json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_INAZUMA.json').read_text(encoding='utf8'))


def act(s, name):
    core.action(s, name)


def save(s):
    return validate_save(native(core.checkpoint(s)))


def restore(s):
    return core.restore(lua.table_from(save(s), recursive=True))


def place(a, x, y=480):
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def start():
    s = core.new(12)
    act(s, 'story_start')
    core.grantExp(s, LEVELS[43]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, hub)
    return s


def arena():
    s = start()
    core.enterStoryNode(s, node)
    w, spec = core.currentWeeklyBoss(s)
    place(s.actors[1], 70)
    return s, w, spec


def hit(s, w, actor=None, force=False):
    a = actor or s.actors[1]
    place(a, w.primary.x-48)
    a.dir, a.lock, a.cd.normal = 1, 0, 0
    if force:
        a.atk = 10000
    assert core.attack(s, a, 'normal')


def events(s, kind):
    return [e for e in s.events.values() if e.kind == 'signora:'+kind]


def timings(items):
    return [round(60*(e.t-items[0].t)) for e in items[1:]]


def has_art(s, form):
    return any(d.source == 'signora-'+form+'source-v1.png' for d in core.frame(s, 'sprite').draws.values())


views = {}
def capture_view(key, s, pose):
    frame = core.frame(s, 'sprite', 'legacy')
    draws = list(frame.draws.values())
    source = core.signoraWeeklyArt[pose].source
    index = next(i for i,d in enumerate(draws) if d.kind=='boss_sprite' and d.source==source)
    body = draws[index]
    colors = {'#4b4b61','#ff964c','#8be5f3','#fff3bd'}
    if key=='emerging':
        colors.update(('#597b9d','#91c7dd','#c0eff3','#ffb676'))
    behind = [[d.x,d.y,d.w,d.h,d.color,d.opacity or 1] for d in draws[:index]
              if d.kind=='rect' and d.color in colors]
    assert len(behind)==(15 if key=='emerging' else 8)
    views[key] = dict(pose=pose,node=node,tick=round(s.t*60),camera=frame.camera,
                      platforms=native(frame.platforms),x=body.x,y=body.y,height=body.h,
                      flip=body.flip,behind=behind,device=frame.weeklyBoss.deviceLabel)


s, w, spec = arena()
capture_view('frost',s,'cryo')
checked = {}
for row in manifest['entries']:
    name = row['id']
    if not name.startswith('WS') or name in ('WS08', 'WS15', 'WS16'):
        continue
    for key, detail in [(name,row), *((name+'.'+v['name'],v) for v in row.get('variants',[]))]:
        move = spec.moves[key]
        assert move.total == detail['total_ticks'] and move.recovery == detail['recovery'][0], key
        for field, source in [('locks','lock_ticks'), ('windows','active_windows')]:
            assert list(native(move[field])) == detail[source], key
        for field, source in [('launches','projectiles'), ('floors','detached_ground')]:
            assert list(native(move[field])) == [t for item in detail[source] for t in item['spawn_ticks']], key
        if name == 'WS09':
            continue
        t, state, config = arena()
        phase = 1 if name in ('WS01','WS02','WS03','WS04','WS05','WS06','WS07') and key != 'WS05.pyro' else 2
        if phase == 2:
            state.stage, state.primary.hp = 'pyro', config.pyroHp
        state.index = list(config.orders[phase].values()).index(key)+1
        state.rest = 0
        ticks(core, t, 1)
        cast = state.cast
        assert cast.key == key
        ticks(core, t, move.total)
        assert state.cast is None, key
        starts = events(t,name)
        assert timings(starts+events(t,name+':lock')) == list(native(move.locks)), key
        assert timings(starts+events(t,name+':spawn')) == list(native(move.launches)), key
        checked[key] = cast.t

s, w, spec = arena()
a, ally = s.actors[1], s.actors[2]
assert has_art(s,'idle-')
w.climates[s].temperature = 95
ticks(core,s,29,True)
assert w.climates[s].hold == 29 and w.climates[s].temperature < 95 and w.devices[1] == 0
ticks(core,s,1,True)
assert w.climates[s].hold == 0 and w.climates[s].temperature == 0 and w.devices[1] > w.clock
place(a,890)
ticks(core,s,30,True)
assert w.devices[1] <= w.clock < w.devices[2] and len(events(s,'WS16:release')) == 2
w.cast, w.rest = None, 1000
w.climates[s].temperature = 100
place(a,160)
hp, ally_hp = a.hp, ally.hp
ticks(core,s,91)
assert a.hp == hp-spec.temperature.envDamage and ally.hp == ally_hp

# WS01 keeps its detached floor after recovery, and it stays on its marked platform.
s,w,spec = arena()
a = s.actors[1]
place(a,220,368)
ticks(core,s,43)
ticks(core,s,175)
assert len(w.floors) == 1 and w.floors[1].y == 368
f = w.floors[1]
place(a,f.x)
hp = a.hp
ticks(core,s,120)
assert a.hp == hp and len(w.floors) == 1
w.rest = 1000
place(a,70)
ticks(core,s,f.expires-w.clock)
assert len(w.floors) == 0

s,w,spec = arena()
a, ally = s.actors[1], s.actors[2]
hit(s,w,force=True)
assert w.stage == 'seal' and w.primary.hp == spec.pyroHp and s.kills == 0
ticks(core,s,spec.seal.opening-1)
assert w.seal.openedAt is None and w.primary.invulnerable
ticks(core,s,1)
assert w.seal.openedAt and not w.primary.invulnerable
old = lua.table_from({'id':1,'playerInputAt':w.seal.openedAt-.02})
assert not w.primary.onCastContact(s,old,w.primary,1,'#fff','pyro') and w.seal.hp == 100
hit(s,w)
assert w.seal.hp == 99
for remaining in (74,49,24,0):
    place(a,70)
    ticks(core,s,spec.seal.mothCycle)
    moth = next(iter(w.seal.moths.values()))
    place(a,moth.x)
    ticks(core,s,1)
    assert w.seal.tokens[s].id == moth.id
    if remaining == 74:
        before = w.seal.hp
        hit(s,w,ally)
        ticks(core,s,28)
        assert w.seal.tokens[s].id == moth.id and w.seal.hp == before
        act(s,'swap')
        assert s.active == 2 and w.seal.tokens[s].id == moth.id
        ticks(core,s,48)
        act(s,'swap')
        assert s.active == 1
    hit(s,w)
    if remaining:
        assert w.seal.hp == remaining and w.seal.tokens[s] is None
assert w.stage == 'transform' and w.primary.hp == spec.pyroHp
assert not list(w.floors.values()) and list(w.devices.values()) == [0,0]
ticks(core,s,spec.moves.WS09.total-1)
assert w.primary.invulnerable
capture_view('emerging',s,'pyro')
ticks(core,s,1)
assert not w.primary.invulnerable and w.stage == 'pyro' and core.frame(s).weeklyBoss.temperature == 0 and has_art(s,'flame-idle-')
assert len(events(s,'moth-used')) == 4
capture_view('blaze',s,'pyro')
(ROOT/'evidence/signora-access-views.json').write_bytes((json.dumps({'views':views},ensure_ascii=False,indent=2)+'\n').encode())

fight = start()
assert core.giveArtifact(fight,2,45,3)
act(fight,'artifact_equip:1')
(ROOT/'work/signora-weekly-gear.json').write_text(json.dumps(save(fight),ensure_ascii=False),encoding='utf8')
route = restore(fight)
flower_id = route.inventory.nextId
assert core.giveArtifact(route,1,100,3)
act(route,f'artifact_equip:{flower_id}')
assert route.actors[1].hp>=2000
(ROOT/'work/signora-weekly-route-gear.json').write_text(
    json.dumps(save(route),ensure_ascii=False),encoding='utf8')
act(fight,'story_accept:'+quest)
place(fight.actors[1],995)
act(fight,'story_portal:'+node)
assert fight.story.node == node
play = lua.eval("""function(C,s)
 local w,spec=C.currentWeeklyBoss(s)
 local a=s.actors[1];local e=w.primary
 for t=1,14000 do
  local dx=e.x-a.x
  local goal=e.x+(dx>=0 and -73 or 73)
  local needsCooling=w.stage~='transform' and (w.climates[s] and w.climates[s].temperature or 0)>=53
  local attacking=w.stage~='transform' and not e.invulnerable
  if needsCooling then
   local left=w.clock>=w.devices[1]
   local right=w.clock>=w.devices[2]
   goal=(left and (not right or a.x<480)) and 70 or 890;attacking=false
  elseif w.stage=='seal' and not w.seal.tokens[s] then
   attacking=false;goal=70
   for _,moth in pairs(w.seal.moths) do goal=moth.x;break end
  end
  local delta=goal-a.x
  if math.abs(delta)<7 then delta=attacking and dx*a.dir<0 and dx or 0 end
  C.step(s,1/60,{left=delta<0,right=delta>0,interact=needsCooling and math.abs(goal-a.x)<12,
    attack=attacking and dx*a.dir>=0 and math.abs(dx)<113})
  if e.hp<=0 or s.returns>0 then return t,a.hp,e.hp,s.returns end
 end
 return 14000,a.hp,e.hp,s.returns
end""")
t,hp,opponent,returns = play(core,fight)
assert opponent == 0 and returns == 0, (t,hp,opponent,returns)
assert fight.story.quests[quest].count == 1
act(fight,'story_fast:'+hub)
act(fight,'story_report:'+quest)
reward = fight.mora
act(fight,'story_report:'+quest)
assert fight.story.quests[quest].status == 'complete' and fight.mora == reward
assert restore(fight).weeklySlots[uid].primary.hp == 0
result = {'attack_ticks':checked,'devices_hold_release':True,'temperature_active_actor_only':True,
          'detached_floor_plane_and_expiry':True,'seal_manual_fresh_and_one_token':True,
          'new_phase_resets_hazards':True,'normal_attacks_clear':{'seconds':round(t/60,2),'hp':hp},
          'story_report_and_restore':True}
(ROOT/'evidence/signora-weekly-lua.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Signora Lua: authored timings, device input, disjoint floors, moth ownership and weekly clear passed')
