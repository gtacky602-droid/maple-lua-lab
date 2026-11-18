"""Exercise the two-gauge hunt through its normal Lua inputs."""
import json
import math

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub, arena, quest = 'nod-town', 'nod-stygian-hunt', 'stygian-rerir-commission'
spec = json.loads((ROOT/'content/stygian-matches.json').read_text(encoding='utf8'))['matches']['rerir']
manifest = json.loads((ROOT/'docs/stygian-motion-v1/MANIFEST.json').read_text(encoding='utf8'))
cards = {m['id']: m for m in manifest['entries'] if m['boss'] == 'rerir'}
advance = lua.eval('function(C,s,n) for i=1,n do C.step(s,1/60,{}) end end')


def place(a, x, y=480):
    a.x, a.y, a.vy, a.ground = x, y, 0, True


def step(s, n=1):
    advance(core, s, n)


def ready(level):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVELS[level-1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, hub)
    return s


def begin():
    s = ready(124)
    core.action(s, 'story_accept:'+quest)
    place(s.actors[1], 750)
    core.action(s, 'story_nearby_portal')
    assert s.story.node == arena
    core.action(s, 'stygian_start:rerir:extreme:troupe')
    assert s.endgameRun is None
    core.action(s, 'stygian_start:rerir:normal:troupe')
    s.actors[2].hp = 0
    s.actors[1].inv = 500
    return s, s.endgameRun, s.endgameRun.boss, s.actors[1]


def until(s, condition, limit=7000):
    for _ in range(limit):
        if condition():
            return
        step(s)
    r = s.endgameRun
    raise AssertionError((r.status, r.stage, r.phase, r.cast and r.cast.key))


def at(s, run, key, tick=0, variant=None):
    until(s, lambda: run.cast and run.cast.key == key and run.cast.t == tick and run.cast.variant == variant,
          20000)
    return run.cast


def events(s, tag, cast=None):
    return [e for e in s.events.values() if e.kind == 'stygian:rerir:'+tag and (cast is None or e.cast == cast)]


def cast(s, b, power=100000):
    hit = lua.table(id=1, key='normal', x=b.x-41, y=b.y, dir=1, range=125, limit=1, mult=1,
                    element='physical', color='#fff3e2', gain=0, atk=power,
                    playerInputAt=s.t, startedAt=s.t)
    core.resolveCast(s, hit)


def check_card(s, run, key, variant=None):
    c = at(s, run, key, variant=variant)
    data = cards[key]
    if variant not in (None, 'A'):
        data = next(v for v in data['variants'] if v['name'] == variant)
    step(s, data['total_ticks'])
    assert run.cast is None
    assert [e.tick for e in events(s, key+':window', c.serial)] == [w[0] for w in data['active_windows']]
    assert [e.tick for e in events(s, key+':lock', c.serial)] == data['lock_ticks']
    return c


def fog(s, run, boss, check=True):
    until(s, lambda: run.phase == 'ready')
    cast(s, boss)
    assert boss.hp == math.ceil(boss.maxhp * spec['fog']['threshold'])
    until(s, lambda: run.phase == 'fog-entry')
    step(s, 71)
    assert run.phase == 'fog-entry'
    step(s)
    c = run.cast
    assert c.key == 'RR05' and c.t == 0
    if check:
        step(s, 43)
        core.action(s, 'encounter_interact')
        assert run.fog.ward == 2 and events(s, 'RR05:lamp-early', c.serial)[0].tick == 43
        step(s, 40)
        assert not core.frame(s, 'sprite', 'standard').endgameRun.lampReady
        core.action(s, 'encounter_interact')
        assert run.fog.ward == 2
        step(s, 1)
    else:
        step(s, 84)
    assert core.frame(s, 'sprite','standard').endgameRun.lampReady
    core.action(s, 'encounter_interact')
    core.action(s, 'encounter_interact')
    assert run.fog.ward == 1 and c.lamp.at == 84
    assert boss.invulnerable
    step(s, 11)
    assert boss.invulnerable
    step(s)
    assert not boss.invulnerable
    step(s, 90)
    assert run.phase == 'fog' and run.fog.attempt == 2 and run.fog.ward == 1
    c2 = run.cast
    if check:
        step(s, 132)
        core.action(s, 'encounter_interact')
        assert run.fog.ward == 1 and [e.tick for e in events(s, 'RR05:window', c2.serial)] == [132]
        step(s, 108)
        assert run.fog.attempt == 3
        c2 = run.cast
    step(s, 84)
    core.action(s, 'encounter_interact')
    assert run.fog.ward == 0
    step(s, 191)
    assert run.phase == 'fog' and not boss.invulnerable
    step(s)
    assert run.phase == 'ready' and run.firstAfterFog
    assert not events(s, 'RR05:window', c2.serial)


def start_act_two(s, run, b):
    cast(s, b)
    assert b.hp == 0 and run.phase == 'interlude' and run.status == 'fighting' and s.kills == 0
    saved = validate_save(native(core.checkpoint(s)))
    assert saved['story']['node'] == hub and saved['story']['quests'][quest]['count'] == 0
    step(s, 89)
    assert run.stage == 1 and run.status == 'fighting'
    step(s)
    assert run.stage == 2 and b.hp == run.rules.secondHp and run.cast.key == 'RR12'
    gauge, hp = s.gauge, s.actors[1].hp
    step(s, 96)
    assert b.hp == run.rules.secondHp and not events(s, 'RR12:window')
    assert s.gauge == gauge and s.actors[1].hp == hp


def to_hp(s, b, fraction):
    goal = b.maxhp*fraction
    while b.hp > goal:
        before = b.hp
        cast(s,b,60)
        assert 0 < b.hp < before


def play_trial(s, run, b, a, key, collect):
    c = at(s, run, key)
    step(s, 119)
    if collect:
        first = c.pickups[1]
        place(a,first.x,first.sole)
        assert not first.owner
    step(s)
    assert c.t == 120 and b.y == 172
    if collect:
        assert c.collected == 1
        second = c.pickups[2]
        place(a,second.x)
        step(s, 2)
        assert c.collected == 1
        place(a,second.x,second.sole)
        step(s)
        assert c.collected == 2
        third=c.pickups[3]
        s.actors[2].hp = s.actors[2].maxhp
        place(s.actors[2],third.x,third.sole)
        step(s)
        assert c.collected == 2
        core.action(s,'swap')
        assert s.active == 2
        place(s.actors[2],third.x,third.sole)
        step(s)
        assert c.collected == 3
    place(s.actors[s.active],900)
    step(s, 1007-c.t)
    s.actors[s.active].inv=0
    health=s.actors[s.active].hp
    assert health>spec['damage']['collapse']
    step(s)
    assert c.t==1008 and c.burst.complete==collect
    if collect:
        assert s.actors[s.active].hp==health
        assert len(events(s,key+':protected',c.serial))==2
    else:
        assert s.actors[s.active].hp<health
        assert len([e for e in events(s,key+':collapse',c.serial) if e.value>0])==1
    step(s, 72)
    assert c.t==1080 and not b.invulnerable and b.y==480
    assert [e.tick for e in events(s,key+':window',c.serial)]==[w[0] for w in cards[key]['active_windows']]
    return c


s, run, boss, player = begin()
for key in spec['firstOrder']:
    check_card(s,run,key)
fog(s,run,boss)
special = check_card(s,run,'RR11','first_after_fog')
assert [e.tick for e in events(s,'RR11:launch',special.serial)]==[240,246,252,258]
start_act_two(s,run,boss)
for card in spec['secondOrder']:
    key, _, variant=card.partition(':')
    check_card(s,run,key,variant or None)
to_hp(s,boss,.22)
assert native(run.trials)==['queued','queued']
play_trial(s,run,boss,player,'RR09',True)
step(s,180)
assert run.trials[1]=='done'
ordinary=[]
for _ in range(2):
    until(s, lambda: run.cast is not None)
    normal=run.cast
    ordinary.append(normal.key)
    assert normal.key not in ('RR09','RR13')
    step(s,normal.data.total_ticks)
play_trial(s,run,boss,player,'RR13',False)
step(s,95)
assert run.cast.key=='RR13' and run.cast.t==1175
step(s)
assert run.cast is None and run.trials[2]=='done'
cast(s,boss)
step(s)
assert run.status=='clear' and s.kills==1
assert run.reward.first and run.reward.mora==22300 and s.story.quests[quest].count==1
core.action(s,'endgame_exit')
core.enterStoryNode(s,hub)
core.action(s,'story_report:'+quest)
saved=validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(saved,recursive=True))
assert restored.story.quests[quest].status=='complete' and restored.endgame.stygian['rerir:normal'].clears==1

# The successful route opens a four-second window. An actual finishing hit is still required.
t, trial, b, a = begin()
fog(t,trial,b,False)
start_act_two(t,trial,b)
to_hp(t,b,.22)
play_trial(t,trial,b,a,'RR09',False)
step(t,180)
last=play_trial(t,trial,b,a,'RR13',True)
assert not last.stop and last.data.total_ticks==1320
step(t,239)
assert trial.cast and trial.cast.t==1319 and trial.status=='fighting' and b.hp>0
step(t)
assert trial.cast is None

t, trial, b, a = begin()
fog(t,trial,b,False)
start_act_two(t,trial,b)
to_hp(t,b,.23)
cast(t,b)
step(t)
assert trial.status=='clear' and not events(t,'RR09:start') and not events(t,'RR13:start')

fixture=ready(124)
fixture.mora=1250000
assert core.giveArtifact(fixture,2,66,4)
core.action(fixture,'artifact_equip:1')
assert core.giveArtifact(fixture,1,74,4)
core.action(fixture,'artifact_equip:2')
data=validate_save(native(core.checkpoint(fixture)))
(ROOT/'work/stygian-rerir-gear.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf8')
proof={'cards':list(cards),'rounds':[spec['modes'][0]['hp'],spec['modes'][0]['secondHp']],
       'missed_and_early_lamp_retry':True,'ward_recovery':[90,180],
       'first_slam_bolts':[240,246,252,258],'between_trials':ordinary,'trial_bursts_at':1008,
       'last_trial_recovery':{'protected':240,'missed':96},'pickup_progress_after_swap':True,
       'finite_damage_on_failure':True,'second_act_kill_precedes_queued_trials':True,
       'first_act_has_no_clear_or_reward':True,'quest_rewards_and_save':True}
(ROOT/'evidence/stygian-rerir-lua.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
print('Rerir Lua: 13 cards and variants, two lamps, two paths, burst branches, priority, rewards and save passed')
