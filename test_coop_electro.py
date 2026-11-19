"""Exercise the Electro Hypostasis in a split-map room and with four actors."""
import json
import math
from time import monotonic, sleep

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from test_coop_anemo import ARENA as ANEMO
from test_coop_anemo import TICK, place, pulse, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_travel import ENTRY as ANEMO_ENTRY
from test_coop_travel import ROAD, TOWN, cross


BOSS, ENTITY = 'boss-20040101', 20040101
ENTRY, ARENA = 'electro-approach', 'electro-field-shelf'
QUEST = 'electro-commission'
LEVEL = LEVELS[17]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']
HOME = 850


def make(core, accept=False):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    if accept:
        core.action(s, 'story_accept:' + QUEST)
    core.enterStoryNode(s, ARENA)
    place(s, HOME - 106)
    return s


def hurt(s, since=0):
    return [e.value for e in s.events.values()
            if e.seq > since and e.kind == 'hurt' and e.target == ENTITY]


def hit(lua, core, s, x, attack):
    place(s, x - 100)
    pulse(lua, core, s, attack, origin=x)


def run_lua():
    lua, core = runtime()
    solo = make(core)
    solo_ticks = wait_cast(lambda: core.step(solo, TICK), solo.fieldSlots[BOSS], 'FE01', 78)
    assert solo.fieldSlots[BOSS].enemy.hp == 900 and hurt(solo) == [10]

    states = [make(core, accept) for accept in (True, False, True, False)]
    room = core.newCoop(states[0])
    members = [core.attachCoop(room, s) for s in states]
    slot = room.fieldSlot
    step = lambda: core.stepCoop(room, TICK)
    ticks = wait_cast(step, slot, 'FE01', 42)
    place(states[3], HOME + 106)
    assert ticks + wait_cast(step, slot, 'FE01', 78) == solo_ticks
    assert slot.enemy.hp == slot.enemy.maxhp == 900
    assert [hurt(s) for s in states] == [[10], [10], [10], []]
    wait_cast(step, slot, 'FE01', 204)
    assert [hurt(s) for s in states] == [[10, 11, 15]] * 3 + [[]]
    assert all(core.frame(s).fieldBoss.tick == 204 for s in states)

    wait_cast(step, slot, 'FE02', 36)
    place(states[2], HOME + 135)
    cast = slot.cast
    starts = [s.seq for s in states]
    # Suppress the counterattack to measure which party's own shield absorbs the drill.
    states[1].actors[1].waterShield = lua.table(hp=5, maxhp=5, life=7, counters=3)
    wait_cast(step, slot, 'FE02', 96)
    assert [hurt(s, seq) for s, seq in zip(states, starts)] == [[15], [10], [], []]
    assert states[1].actors[1].waterShield is None
    assert cast.dest < slot.enemy.x < HOME
    for s in states:
        s.actors[1].inv = 0
    wait_cast(step, slot, 'FE02', 108)
    assert [hurt(s, seq) for s, seq in zip(states, starts)] == [[15], [10], [], []]
    assert math.isclose(slot.enemy.x, HOME - 2.2 * 88)

    for i, s in enumerate(states):
        place(s, slot.enemy.x + (103 if i == 3 else -103))
    wait_cast(step, slot, 'FE03', 42)
    starts = [s.seq for s in states]
    members[1].input = lua.table(jump=True)
    for t in range(43, 199):
        if t in (77, 149):
            assert states[1].actors[1].ground
            core.action(states[1], 'jump')
        step()
    assert [hurt(s, seq) for s, seq in zip(states, starts)] == [[9, 9], [], [9, 9], []]

    for s in states[:2]:
        hit(lua, core, s, slot.enemy.x, 15)
    hit(lua, core, states[1], slot.enemy.x, 1500)
    assert slot.phase == 'respawn' and slot.enemy.hp == 0 and slot.cast is None
    assert [s.kills for s in states] == [1, 1, 0, 0]
    assert [s.progression.killXp for s in states] == [XP, XP, 0, 0]
    assert [s.mora for s in states] == [140, 140, 0, 0]
    assert states[0].story.quests[QUEST].count == 1 and states[2].story.quests[QUEST].count == 0
    assert all(s.fieldSlots[BOSS].waitUntil > s.t for s in states[:2])
    for _ in range(3599):
        step()
    assert slot.phase == 'respawn'
    step()
    assert slot.generation == 2 and slot.enemy.hp == 900 and slot.enemy.x == HOME

    # Start a room during an active solo drill. Its previous hit must stay counted
    # for the host while the guest is independently eligible for the same pass.
    host = make(core)
    wait_cast(lambda: core.step(host, TICK), host.fieldSlots[BOSS], 'FE02', 96)
    assert hurt(host)[-1] == 15
    host.actors[1].inv = 0
    start = host.seq
    joined = core.newCoop(host)
    core.attachCoop(joined, host)
    guest = make(core)
    core.attachCoop(joined, guest)
    core.stepCoop(joined, TICK)
    assert hurt(host, start) == [] and hurt(guest) == [15]
    return {'soloAndFourPlayerHp': 900, 'firstHitWorldTick': solo_ticks, 'combo': [10, 11, 15],
            'drill': {'bothPartiesHit': True, 'damage': [15, 10],
                      'shieldAbsorbed': 5, 'sweptDistancePx': 2.2 * 88},
            'waves': {'groundedDamage': 18, 'jumpDamage': 0}, 'adoptMidDrillPreservedHitMask': True,
            'killXp': XP, 'killMora': 140, 'respawnTicks': 3600}


def setup_http(client, quest=False):
    assert client.frame(['story_start'])['story']['node'] == TOWN
    with LOCK:
        env = SESSIONS[client.sid]
        env['core'].grantExp(env['state'], LEVEL['maple_reference_total_exp_to_reach'], 'quest')
        env['state'].actors[2].hp = 0
    if quest:
        assert client.frame(['story_accept:' + QUEST])['story']['quests'][QUEST]['status'] == 'active'
    cross(client, 1380, ROAD)


def run_http(url):
    host, guest, wind = clients = [Client(url) for _ in range(3)]
    for i, client in enumerate(clients):
        setup_http(client, i == 0)
        cross(client, 400 if i == 1 else 1200, ENTRY if i == 1 else ANEMO_ENTRY)
        cross(client, 1270, ARENA if i == 1 else ANEMO)
    opened = host.frame(['coop_create'])
    code, host_slot = opened['coop']['code'], opened['coop']['slot']
    assert opened['coop']['enemies'][0]['maxhp'] == 870
    for client in (guest, wind):
        assert client.frame(['coop_join:' + code])['coop']['code'] == code
    cross(host, 65, ANEMO_ENTRY)
    cross(host, 60, ROAD)
    cross(host, 400, ENTRY)
    arrived = cross(host, 1270, ARENA)
    assert arrived['coop']['code'] == code and arrived['coop']['slot'] == host_slot
    assert arrived['coop']['enemies'][0]['maxhp'] == 900
    with LOCK:
        for client in clients:
            place(SESSIONS[client.sid]['state'], 742)
    deadline = monotonic() + 4
    while monotonic() < deadline:
        a, b, c = [client.frame() for client in clients]
        if a.get('fieldBoss', {}).get('tick', 0) >= 78 and c.get('fieldBoss', {}).get('tick', 0) >= 84:
            break
        sleep(.02)
    assert [f['fieldBoss']['move'] for f in (a, b, c)] == ['FE01', 'FE01', 'FA01']
    assert all([e['target'] for e in f['events'] if e['kind'] == 'hurt'] == [ENTITY] for f in (a, b))
    assert [e['target'] for e in c['events'] if e['kind'] == 'hurt'] == [20040201]
    with LOCK:
        for client, power in ((host, 20), (guest, 1500)):
            env = SESSIONS[client.sid]
            hit(env['lua'], env['core'], env['state'], HOME, power)
    a, b, c = [client.frame(checkpoint=True) for client in clients]
    assert [f['kills'] for f in (a, b, c)] == [1, 1, 0]
    assert [f['fieldBoss']['hp'] for f in (a, b, c)] == [0, 0, 870]
    assert a['story']['quests'][QUEST]['count'] == 1 and QUEST not in b['story']['quests']
    assert all(f['checkpoint']['endgame']['bosses'][BOSS]['clears'] == 1 for f in (a, b))
    return {'participants': 3, 'stableSlotFromAnemoToElectro': True,
            'simultaneousBossMaps': [ARENA, ANEMO], 'eachMapHadOnlyItsOwnDamage': True,
            'electroRewards': [1, 1], 'anemoRewardsForElectroKill': 0}


if __name__ == '__main__':
    evidence = {'lua': run_lua()}
    with lab() as url:
        evidence['http'] = run_http(url)
    (ROOT/'evidence/coop-electro-lua-http.json').write_text(
        json.dumps(evidence, indent=2)+'\n', encoding='utf-8')
    print('Electro four-player attacks, personal shields, shared respawn and separate boss maps passed.')
