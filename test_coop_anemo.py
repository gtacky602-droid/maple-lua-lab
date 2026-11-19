"""Verify one authored field-boss encounter across solo and cooperative play."""
import json
from uuid import uuid4

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_local import Client, LOCK, SESSIONS, lab


BOSS = 'boss-20040201'
ENTITY = 20040201
ARENA = 'anemo-field-basin'
QUEST = 'anemo-commission'
TICK = 1 / 60
LEVEL = LEVELS[15]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']
FULL_HP = 870


def place(state, x, companion=False):
    a = state.actors[1]
    a.x, a.y, a.dir, a.vy, a.ground, a.inv = x, 480, 1, 0, True, 0
    if not companion:
        state.actors[2].hp = 0


def prepare(lua, core, accept=False, x=696):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    if accept:
        core.action(state, 'story_accept:' + QUEST)
    core.enterStoryNode(state, ARENA)
    place(state, x)
    return state


def pulse(lua, core, state, power, origin=696):
    core.resolveCast(state, lua.table_from({
        'id': 1, 'isNormal': True, 'atk': power, 'element': 'physical',
        'x': origin, 'y': 480, 'radial': True, 'range': 130, 'limit': 1,
        'mult': 1, 'critRate': 0, 'color': '#ffffff', 'gain': 1,
    }))


def wait_cast(step, slot, move, tick):
    for count in range(1, 901):
        step()
        if slot.cast and slot.cast.move.id == move and slot.cast.tick == tick:
            return count
    raise AssertionError((move, tick, slot.phase))


def damage_received(state, start_seq=0):
    return [event.value for event in state.events.values()
            if event.seq > start_seq and event.kind == 'hurt' and event.target == ENTITY]


def run_lua():
    lua, core = runtime()
    solo = prepare(lua, core)
    solo_ticks = wait_cast(lambda: core.step(solo, TICK), solo.fieldSlots[BOSS], 'FA01', 84)
    assert damage_received(solo) == [13]

    states = [prepare(lua, core, accept, x) for accept, x in (
        (True, 696), (False, 690), (True, 688), (True, 540),
    )]
    room = core.newCoop(states[0])
    members = [core.attachCoop(room, state) for state in states]
    slot = room.fieldSlot
    step = lambda: core.stepCoop(room, TICK)
    assert room.enemies[1].maxhp == solo.fieldSlots[BOSS].enemy.maxhp == FULL_HP
    assert wait_cast(step, slot, 'FA01', 84) == solo_ticks
    views = [native(core.frame(s).fieldBoss) for s in states]
    assert all(v == views[0] for v in views)
    assert [damage_received(s) for s in states] == [[13], [13], [13], []]
    for _ in range(12):
        step()
    assert [damage_received(s) for s in states] == [[13], [13], [13], []]

    wait_cast(step, slot, 'FA02', 96)
    assert [damage_received(s) for s in states] == [[13, 16], [13, 16], [13, 16], []]
    wait_cast(step, slot, 'FA03', 116)
    assert [damage_received(s) for s in states[:3]] == [[13, 16, 9]] * 3
    before = slot.enemy.hp
    for state in states[:3]:
        pulse(lua, core, state, 10)
        assert 0 < slot.enemy.hp < before
        before = slot.enemy.hp
    assert core.checkpoint(states[0]).fieldBosses[BOSS].hp == FULL_HP
    pulse(lua, core, states[2], 1500)
    assert slot.enemy.hp == 0 and slot.phase == 'respawn' and slot.cast is None
    initial = [native(core.checkpoint(s)) for s in states]
    assert [s.kills for s in states] == [1, 1, 1, 0]
    assert [s.mora for s in states] == [125, 125, 125, 0]
    assert [s.progression.killXp for s in states] == [EXP, EXP, EXP, 0]
    assert [s.endgame.bosses[BOSS].clears if s.endgame and s.endgame.bosses[BOSS] else 0
            for s in states] == [1, 1, 1, 0]
    assert [s.story.quests[QUEST].count if s.story.quests[QUEST] else None
            for s in states] == [1, None, 1, 0]
    assert [s['fieldBosses'][BOSS]['waitTicks'] for s in initial] == [3600, 3600, 3600, 0]

    # A contributor's personal save restores the commission and exact remaining cooldown.
    save = validate_save(initial[0])
    resumed = core.restore(lua.table_from(save, recursive=True), 12)
    assert resumed.endgame.bosses[BOSS].clears == 1 and resumed.fieldSlots[BOSS].enemy.hp == 0
    cash, xp = resumed.mora, resumed.progression.questXp
    core.action(resumed, 'story_report:' + QUEST)
    core.action(resumed, 'story_report:' + QUEST)
    assert (resumed.mora - cash, resumed.progression.questXp - xp) == (300, 1500)

    members[1].online = False
    for _ in range(3599):
        step()
    assert slot.enemy.hp == 0 and slot.generation == 1
    step()
    assert slot.enemy.hp == FULL_HP and slot.generation == 2
    assert core.checkpoint(states[1]).fieldBosses[BOSS].waitTicks == 3600
    members[1].online = True
    pulse(lua, core, states[1], 10)
    pulse(lua, core, states[2], 1500)
    assert [s.kills for s in states] == [1, 2, 2, 0]
    assert states[1].endgame.bosses[BOSS].clears == 2
    assert states[2].endgame.bosses[BOSS].clears == 2
    assert states[2].mora == 250 and states[2].progression.killXp == EXP * 2
    assert states[2].story.quests[QUEST].count == 1

    # The boss still enters the shared cooldown after a distant, ineligible final hit.
    fresh = prepare(lua, core, True, x=1260)
    other = core.newCoop(fresh)
    core.attachCoop(other, fresh)
    pulse(lua, core, fresh, 1500, origin=800)
    assert other.fieldSlot.phase == 'respawn' and other.fieldSlot.enemy.hp == 0
    assert fresh.kills == 0 and core.checkpoint(fresh).fieldBosses[BOSS].hp == FULL_HP

    # Adopting a hit in flight neither hits the host twice nor hides it from a new guest.
    host = prepare(lua, core)
    wait_cast(lambda: core.step(host, TICK), host.fieldSlots[BOSS], 'FA01', 84)
    host.actors[1].inv = 0
    active = core.newCoop(host)
    host_member = core.attachCoop(active, host)
    guest = prepare(lua, core)
    guest.actors[1].hp = 1
    guest_member = core.attachCoop(active, guest)
    core.stepCoop(active, TICK)
    assert damage_received(host) == [13] and damage_received(guest) == [13]
    core.stepCoop(active, TICK)
    assert core.sharesCoopField(host) and not core.sharesCoopField(guest)
    core.detachCoop(guest_member)
    assert active.tick == 2
    core.detachCoop(host_member)
    assert host.coop is None and host.fieldSlots[BOSS].enemy.hp == FULL_HP

    return {'soloAndFourPlayerMaxHp': FULL_HP, 'clapFirstHitTicks': solo_ticks,
            'partyDamageByMove': [13, 16, 9], 'cooldownTicks': 3600,
            'oneTimeCommission': {'xp': 1500, 'mora': 300}, 'xpPerKill': EXP,
            'moraPerKill': 125, 'personalFirstClearParticipants': [1, 2, 3],
            'repeatParticipants': [2, 3], 'returnDuringRepeatAfterOfflineCooldown': True,
            'distantFinalHitStartsCooldown': True,
            'createDuringCastAndPartyDefeat': True}


def run_http(url):
    host, guest = Client(url), Client(url)
    for client, accept in ((host, True), (guest, False)):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            env['core'].grantExp(env['state'], LEVEL['maple_reference_total_exp_to_reach'], 'quest')
            env['state'].actors[1].x = 1380
        if accept:
            offered = client.frame(['story_accept:' + QUEST])
            assert offered['story']['quests'][QUEST]['status'] == 'active'
        assert client.frame(['story_portal:mond-road'])['story']['node'] == 'mond-road'
        with LOCK:
            env = SESSIONS[client.sid]
            env['state'].actors[1].x = 1200
        assert client.frame(['story_portal:anemo-approach'])['story']['node'] == 'anemo-approach'
        with LOCK:
            SESSIONS[client.sid]['state'].actors[1].x = 1270
        assert client.frame(['story_nearby_portal'])['story']['node'] == ARENA
        with LOCK:
            place(SESSIONS[client.sid]['state'], 696, companion=True)
    code = host.frame(['coop_create'])['coop']['code']
    joined = guest.frame(['coop_join:' + code])
    assert joined['fieldBoss']['maxhp'] == joined['coop']['enemies'][0]['maxhp'] == FULL_HP
    with LOCK:
        h, g = [SESSIONS[c.sid] for c in (host, guest)]
        for party in (h, g):
            place(party['state'], 696)
            pulse(party['lua'], party['core'], party['state'], 20)
        pulse(g['lua'], g['core'], g['state'], 1500)
    frames = [c.frame(checkpoint=True) for c in (host, guest)]
    assert all(f['fieldBoss']['phase'] == 'respawn' and f['fieldBoss']['hp'] == 0 for f in frames)
    assert [f['kills'] for f in frames] == [1, 1]
    assert frames[0]['story']['quests'][QUEST]['count'] == 1 and QUEST not in frames[1]['story']['quests']
    assert [f['checkpoint']['endgame']['bosses'][BOSS]['clears'] for f in frames] == [1, 1]

    guest.release()
    assert not host.frame()['coop']['peers'][0]['online']
    guest.owner = uuid4().hex
    reopened = guest.frame(resume=True)
    assert reopened['coop']['code'] == code and reopened['kills'] == 1
    assert reopened['fieldBoss']['remaining'] > 58
    assert host.frame()['coop']['peers'][0]['online']
    left = host.frame(['coop_leave'], checkpoint=True)
    assert 'code' not in left['coop'] and left['fieldBoss']['hp'] == 0
    assert left['checkpoint']['fieldBosses'][BOSS]['waitTicks'] > 3480
    assert guest.frame()['coop']['code'] == code
    restored = guest.frame(restore=frames[1]['checkpoint'])
    assert restored['story']['node'] == 'mond-town' and 'code' not in restored['coop']
    assert restored['kills'] == 1
    return {'participants': 2, 'fieldEntry': ARENA, 'hp': FULL_HP, 'separateCheckpoints': True,
            'releaseAndResume': True, 'remainingCooldownAfterLeave': True}


if __name__ == '__main__':
    evidence = {'lua': run_lua()}
    with lab() as url:
        evidence['http'] = run_http(url)
    destination = ROOT / 'evidence/coop-anemo-lua-http.json'
    destination.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print('Anemo solo/four-player timing, shared damage, rewards, and HTTP reconnect passed.')
