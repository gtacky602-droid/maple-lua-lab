"""Exercise the Knave arena through the Lua runtime and the published card timings."""
import json
from math import isclose

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
hub, arena, quest, uid = 'fontaine-hub', 'knave-crimson-court', 'knave-weekly-commission', 'boss-29091001'
advance = lua.eval('function(C,s,n,input) for i=1,n do C.step(s,1/60,input) end end')
hold = lua.table(interact=True)


def step(s, count, input=None):
    advance(core, s, count, input or lua.table())


def place(a, x, y=480):
    a.x, a.y, a.ground, a.vy = x, y, True, 0


def action(s, key):
    core.action(s, key)


def start(enter=True):
    s = core.new(12)
    action(s, 'story_start')
    core.grantExp(s, LEVELS[87]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(s, hub)
    if not enter:
        return s
    core.enterStoryNode(s, arena)
    s.actors[2].hp = 0
    place(s.actors[1], 44)
    w, spec = core.currentWeeklyBoss(s)
    return s, w, spec


def events(s, suffix):
    return [e for e in s.events.values() if e.kind == 'knave:'+suffix]


def move(s, w, spec, key):
    order = spec.first if w.form == 1 else spec.second
    w.index = list(order.values()).index(key)+1
    w.rest, w.cast, w.lastDeclaration = 0, None, w.clock
    if spec.closeMoves[key]:
        place(s.actors[1], w.primary.x-85)
    step(s, 1)
    assert w.cast.key == key, key
    return w.cast


def declare(s, w, spec):
    w.primary.hp = spec.secondHp+(spec.hp-spec.secondHp)*0.69
    w.rest = 0
    step(s, 1)
    assert w.cast.key == 'WK07'
    step(s, 119)
    assert w.actors[s.actors[1]].debt == 0
    hp = s.actors[1].hp
    step(s, 1)
    assert w.cast.t == 120 and s.actors[1].hp == hp
    assert isclose(w.actors[s.actors[1]].debt, s.actors[1].maxhp*.25)


def normal(s, w, key='normal', atk=8, offset=70):
    a = s.actors[s.active]
    place(a, w.primary.x-offset)
    a.dir, a.atk, a.lock, a.cd.normal = 1, atk, 0, 0
    action(s, key)


manifest = json.loads((ROOT/'docs/weekly-boss-v1/MANIFEST_FONTAINE.json').read_text(encoding='utf8'))
s, w, spec = start()
fixed = []
for row in manifest['entries']:
    if row['boss'] != 'knave' or row['kind'] != 'fixed':
        continue
    fixed.append(row['id'])
    m = spec.moves[row['id']]
    assert (m.total, m.recovery) == (row['total_ticks'], row['recovery'][0]), row['id']
    assert list(native(m.locks)) == row['lock_ticks'] and list(native(m.windows)) == row['active_windows']
    assert list(native(m.projectiles)) == row['projectiles']
    assert (native(m.interrupt) if m.interrupt else None) == row.get('interrupt_window')

s, w, spec = start()
a, d = s.actors[1], w.actors[s.actors[1]]
declare(s, w, spec)
quarter = d.debt
assert core.healActor(s, a, 0) == 0 and d.debt == quarter
assert core.healActor(s, a, quarter/2) == 0 and isclose(d.debt, quarter/2) and d.feather is None
a.hp -= 20
assert core.healActor(s, a, quarter/2+7) == 7 and d.debt == 0 and d.feather
assert len(events(s, 'WK08:feather')) == 1
core.healActor(s, a, 40)
assert len(events(s, 'WK08:feather')) == 1
s, w, spec = start()
a, d = s.actors[1], w.actors[s.actors[1]]
declare(s, w, spec)
step(s, 1, hold)
start_tick = w.clock
step(s, 44, hold)
assert len(events(s, 'WK08:lamp')) == 0
step(s, 1, hold)
assert isclose(d.debt, a.maxhp*.20)
assert d.lastPay-start_tick == 45
step(s, 29, hold)
assert len(events(s, 'WK08:lamp')) == 1
step(s, 1, hold)
assert isclose(d.debt, a.maxhp*.15)
step(s, 1)
assert w.players[s].hold is None
step(s, 1, hold)
step(s, 44, hold)
assert isclose(d.debt, a.maxhp*.15)
step(s, 1, hold)
assert isclose(d.debt, a.maxhp*.10)
step(s, 60, hold)
assert d.debt == 0 and d.feather and len(events(s, 'WK08:lamp')) == 5
assert a.hp < a.maxhp and len(events(s, 'WK08:feather')) == 1  # The periodic damage stayed active through the hold.

c = move(s, w, spec, 'WK10')
step(s, 88)
normal(s, w, 'encounter_interact', offset=200)
step(s, 20)
assert d.feather and len(events(s, 'WK09')) == 0
normal(s, w)
assert d.feather and len(events(s, 'WK09')) == 0
normal(s, w, 'encounter_interact')
assert d.feather is None and w.cast.key == 'WK17' and len(events(s, 'WK09')) == 1
step(s, 35)
assert w.phase == 'interrupted'
step(s, 1)
assert w.phase == 'exposure'
step(s, 216)
assert w.phase == 'recover' and not w.primary.invulnerable

s, w, spec = start()
a, b = s.actors[1], s.actors[2]
d, other = w.actors[a], w.actors[b]
declare(s, w, spec)
b.hp = b.maxhp
action(s, 'swap')
assert s.active == 2 and d.debt > 0 and other.debt == 0
assert core.healActor(s, b, a.maxhp) == 0 and d.feather is None
step(s, 49)
action(s, 'swap')
assert s.active == 1 and isclose(d.debt, a.maxhp*.25)
place(a, 44)
step(s, 21, hold)
assert w.players[s].hold
action(s, 'jump')
step(s, 1, hold)
assert w.players[s].hold is None
place(a, 44)
step(s, 20, hold)
action(s, 'dodge')
step(s, 1, hold)
assert w.players[s].hold is None and isclose(d.debt, a.maxhp*.25)
core.healActor(s, a, a.maxhp)
assert d.feather and other.feather is None
a.hp = 0
step(s, 1)
assert d.feather is None and not d.debt and s.active == 2

s, w, spec = start()
a, d = s.actors[1], w.actors[s.actors[1]]
declare(s, w, spec)
hp = a.hp
normal(s, w, atk=10000)
assert w.primary.hp == spec.secondHp and w.cast.key == 'WK11' and w.primary.invulnerable
pause_at = w.debtClock
step(s, 143)
assert w.form == 1 and not s.kills
step(s, 1)
assert w.form == 2 and w.primary.invulnerable
step(s, 96)
assert not w.primary.invulnerable and w.debtClock == pause_at and a.hp == hp and d.debt > 0
for key in ('WK14', 'WK15', 'WK16', 'WK18'):
    c = move(s, w, spec, key)
    place(a, 26)
    before = a.hp
    if key == 'WK18':
        place(a, 370)
        step(s, 90)
        step(s, 120, lua.table(left=True))
    step(s, c.move.total-1-c.t)
    assert a.hp > 0
    if key in ('WK16', 'WK18'):
        assert a.hp == before  # Standing outside the locked attacks with debt cleared below.
    core.healActor(s, a, a.maxhp)

s = start(False)
assert core.giveArtifact(s, 1, 82, 3)
action(s, 'artifact_equip:1')
s.mora = 280000
action(s, 'artifact_upgrade:1')
assert core.giveArtifact(s, 2, 40, 3)
action(s, 'artifact_equip:2')
save = lambda: validate_save(native(core.checkpoint(s)))
(ROOT/'work/knave-weekly-gear.json').write_text(json.dumps(save(), ensure_ascii=False), encoding='utf8')
action(s, 'story_accept:'+quest)
place(s.actors[1], 186)
action(s, 'story_portal:'+arena)
assert s.story.node == arena and s.story.quests[quest].status == 'active'
w, spec = core.currentWeeklyBoss(s)
declare(s, w, spec)
core.enterStoryNode(s, hub)
core.enterStoryNode(s, arena)
assert w.actors[s.actors[1]].debt == 0 and w.actors[s.actors[1]].feather is None and w.primary.hp == spec.hp
s.actors[2].hp = 0
normal(s, w, atk=10000)
step(s, 240)
normal(s, w, atk=10000)
assert w.primary.hp == 0 and s.story.quests[quest].count == 1 and s.kills == 1 and w.actors is None
action(s, 'story_fast:'+hub)
action(s, 'story_report:'+quest)
r = core.restore(lua.table_from(save(), recursive=True))
assert r.story.quests[quest].status == 'complete' and r.weeklySlots[uid].primary.hp == 0

result = {'manifest_fixed_cards': fixed, 'declaration_no_direct_damage': True,
          'heal_before_hp_clamp': True, 'repayment_first_tick': 45, 'repayment_interval': 30,
          'lamp_continues_during_drain': True, 'one_feather_per_payment': True,
          'manual_hit_only_in_window': True, 'exposure_ticks': 216, 'transformation_pauses_drain_ticks': 240,
          'ownership_cancel_and_death': True, 'major_attack_has_ground_escape': True,
          'separate_hp_sections': True, 'exit_resets_trial': True, 'reward_and_restore': True}
(ROOT/'evidence/knave-weekly-lua.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print('Knave Lua: card timing, heal, hold, interrupt, transformation, one reward and restore passed')
