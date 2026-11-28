"""Verify the shared Geo Hypostasis pillar, timing and projectile defenses."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, native, runtime
from test_coop_anemo import TICK, place, wait_cast
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_travel import cross


BOSS, ENTITY = 'boss-20040301', 20040301
HUB, ENTRY, ARENA = 'liyue-harbor', 'geo-approach', 'geo-field-court'
QUEST = 'geo-commission'
LEVEL = LEVELS[31]
XP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['field_boss']
HOME = 835


def prepare(core, accept=False):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accept:
        core.action(state, 'story_accept:' + QUEST)
    core.enterStoryNode(state, ARENA)
    place(state, HOME - 104)
    return state


def attack(lua, power=10, element='physical', reaction=False):
    return lua.table(id=1, atk=power, isNormal=element=='physical', x=HOME-74, y=480,
                     radial=True, range=125, limit=1, mult=1, element=element, reaction=reaction,
                     color='#fff0ac', critRate=0, gain=1)


def hurt(state, start_seq):
    return [event.value for event in state.events.values()
            if event.seq > start_seq and event.kind=='hurt' and event.target==ENTITY]


def run_lua():
    lua, core = runtime()
    parties = [prepare(core, accept) for accept in (True, False, True, True)]
    # Independently played profiles need not start with the same private clock.
    for state, offset in zip(parties[1:], (43.2, 191.9, 880.0)):
        state.t = offset
    room = core.newCoop(parties[0])
    for state in parties:
        core.attachCoop(room, state)
    slot = room.fieldSlot
    step = lambda: core.stepCoop(room, TICK)
    assert slot.enemy.maxhp == slot.enemy.hp == 980

    wait_cast(step, slot, 'FG02', 71)
    for i, state in enumerate(parties):
        place(state, HOME + (-69 if i < 2 else 104))
    starts = [state.seq for state in parties]
    # The guest's wall should stop the first projectile for everyone.
    parties[1].rockWall = lua.table(x=HOME-49, y=480, life=5, hp=10, maxhp=10)
    assert any(d.color=='#b39a62' for d in core.frame(parties[0]).draws.values())
    wait_cast(step, slot, 'FG02', 78)
    assert slot.cast.shots[1] and parties[1].rockWall is None
    assert [hurt(state, seq) for state, seq in zip(parties, starts)] == [[], [], [], []]
    place(parties[0], HOME + 104)
    wait_cast(step, slot, 'FG02', 102)
    assert slot.cast.shots[2]
    assert [hurt(state, seq) for state, seq in zip(parties, starts)] == [[], [10], [], []]
    parties[1].actors[1].inv = 0
    parties[2].rockWall = lua.table(x=HOME-49, y=480, life=5, hp=4, maxhp=4)
    wait_cast(step, slot, 'FG02', 126)
    assert slot.cast.shots[3] and parties[2].rockWall is None
    assert [hurt(state, seq) for state, seq in zip(parties, starts)] == [[], [10,6], [], []]
    for state in parties:
        place(state, HOME - 74)

    wait_cast(step, slot, 'FG03', 35)
    cast = slot.cast
    core.resolveCast(parties[3], attack(lua, element='geo'))
    assert cast.cracks == 0
    step()
    assert cast.tick == 36
    core.resolveCast(parties[3], attack(lua, element='geo', reaction=True))
    assert cast.cracks == 0
    # One cast is counted once. Hit two is Geo-immune at the core but still hits the pillar.
    anchor = attack(lua)
    core.resolveCast(parties[0], anchor)
    core.resolveCast(parties[0], anchor)
    assert cast.cracks == 1
    hp = slot.enemy.hp
    core.resolveCast(parties[1], attack(lua, element='geo'))
    assert cast.cracks == 2 and slot.enemy.hp == hp
    assert all(core.frame(s).fieldBoss.label.startswith('近くで柱に攻撃 2/3') for s in parties)

    wait_cast(step, slot, 'FG03', 148)
    third = attack(lua)
    third.remaining, third.interval, third.next = 1, .12, parties[2].t + TICK
    parties[2].pending[len(parties[2].pending)+1] = third
    step()
    assert cast.cracks == 3 and cast.exposure == 0
    assert all(core.frame(s).fieldBoss.label == '柱破壊・核が静止（あと2.5秒）' for s in parties)
    assert all(s.kills == s.mora == s.progression.killXp == 0 for s in parties)
    for _ in range(149):
        step()
    assert cast.exposure == 149
    step()
    assert cast.exposure == 150 and all(core.frame(s).fieldBoss.label == '殻を組み直す' for s in parties)
    for _ in range(24):
        step()
    assert slot.cast is None

    # Break eligibility is separate from damage-based reward eligibility.
    for state in parties[:3]:
        core.resolveCast(state, attack(lua))
    core.resolveCast(parties[2], attack(lua, power=1600))
    assert slot.enemy.hp == 0 and slot.phase == 'respawn'
    assert [s.kills for s in parties] == [1, 1, 1, 0]
    assert [s.mora for s in parties] == [160, 160, 160, 0]
    assert [s.progression.killXp for s in parties] == [XP, XP, XP, 0]
    assert [parties[i].story.quests[QUEST].count for i in (0,2,3)] == [1,1,0]
    for _ in range(3599):
        step()
    assert slot.phase == 'respawn'
    step()
    assert slot.generation == 2 and slot.enemy.hp == 980

    first, second = prepare(core), prepare(core)
    second.t = 210
    late = core.newCoop(first)
    for state in (first, second):
        core.attachCoop(late, state)
    step_late = lambda: core.stepCoop(late, TICK)
    wait_cast(step_late, late.fieldSlot, 'FG03', 149)
    cast = late.fieldSlot.cast
    next_hit = attack(lua)
    next_hit.remaining, next_hit.interval, next_hit.next = 1, .12, second.t + TICK
    second.pending[len(second.pending)+1] = next_hit
    starts = [s.seq for s in (first, second)]
    step_late()
    assert cast.tick == 150 and cast.cracks == 0 and cast.exposure is None
    assert [hurt(s, seq) for s, seq in zip((first, second), starts)] == [[15], [15]]
    return {'hpWithFourPlayers': 980, 'differentPartyClocks': True,
            'samePillarCounts': [1,2,3], 'onlyDistinctCastsCount': True,
            'thirdHitOnTick149Exposes': True, 'pendingHitOnTick150CannotInterrupt': True,
            'exposureAndReformTicks': [150,24], 'pillarDoesNotGrantRewards': True,
            'partyWallVisibleAndStopsSharedBolt': True, 'secondBoltOnlyHitsOneParty': True,
            'thirdBoltDamageAfterPartialWallAbsorption': 6,
            'personalKillReward': {'xp': XP, 'mora':160}, 'respawnTicks':3600}


def run_http(url):
    host, guest = Client(url), Client(url)
    for i, client in enumerate((host,guest)):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            env['core'].grantExp(env['state'], LEVEL['maple_reference_total_exp_to_reach'], 'quest')
            env['core'].enterStoryNode(env['state'], HUB)
            env['state'].actors[2].hp = 0
        if i == 0:
            assert client.frame(['story_accept:'+QUEST])['story']['quests'][QUEST]['status']=='active'
        cross(client,1380,'liyue-field')
        cross(client,400,ENTRY)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:'+code])['coop']['code']==code
    for client in (host,guest):
        frame = cross(client,1270,ARENA)
        assert frame['coop']['code']==code and frame['coop']['enemies'][0]['maxhp']==980
    with LOCK:
        h, g = [SESSIONS[c.sid] for c in (host,guest)]
        core, lua = h['core'], h['lua']
        world = h['coop_room'].worlds[ARENA]
        for env in (h,g):
            place(env['state'], HOME-74)
        wait_cast(lambda: core.stepCoop(world,TICK),world.fieldSlot,'FG03',54)
        core.resolveCast(h['state'],attack(lua))
        core.resolveCast(g['state'],attack(lua))
    assert all(client.frame()['fieldBoss']['label'].startswith('近くで柱に攻撃 2/3') for client in (host,guest))
    with LOCK:
        core.resolveCast(g['state'],attack(lua))
    frames = [c.frame() for c in (host,guest)]
    assert all(f['fieldBoss']['label'].startswith('柱破壊・核が静止') and f['kills']==0 for f in frames)
    with LOCK:
        core.resolveCast(g['state'],attack(lua,1600))
    a, b = [c.frame(checkpoint=True) for c in (host,guest)]
    assert all(f['fieldBoss']['hp']==0 and f['kills']==1 for f in (a,b))
    assert a['story']['quests'][QUEST]['count']==1 and QUEST not in b['story']['quests']
    assert all(f['checkpoint']['endgame']['bosses'][BOSS]['clears']==1 for f in (a,b))
    return {'participants':2, 'realRouteFromLiyueHarbor':True,
            'bothViewsSeeTwoHitsAndExposure':True, 'individualRecords':True}


if __name__ == '__main__':
    evidence = {'lua':run_lua()}
    with lab() as url:
        evidence['http'] = run_http(url)
    (ROOT/'evidence/coop-geo-lua-http.json').write_text(
        json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print('Shared Geo pillar, tick boundaries, player walls, rewards and HTTP views passed.')
