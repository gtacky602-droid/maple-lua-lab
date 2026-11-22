"""Exercise the shared chess court through the Lua and HTTP entry points."""
import json

from experience import LEVELS, RUNTIME_EXP
from runtime import ROOT, runtime
from test_coop_anemo import TICK
from test_coop_childe import run, spot, strike
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_travel import cross


BOSS, HUB, ARENA = 'boss-29122000', 'mond-town', 'mond-gate-chess-court'
QUEST, LEVEL = 'gate-weekly-commission', LEVELS[111]
EXP = LEVEL['normal_enemy_base_exp'] * RUNTIME_EXP['roles']['weekly_boss']


def prepare(core, state, accepted=False):
    core.grantExp(state, LEVEL['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, HUB)
    if accepted:
        core.action(state, 'story_accept:' + QUEST)
        assert state.story.quests[QUEST].status == 'active'
    state.actors[2].hp = 0


def match(core):
    parties = []
    for i in range(4):
        state = core.new(12)
        core.action(state, 'story_start')
        prepare(core, state, i == 0)
        core.enterStoryNode(state, ARENA)
        parties.append(state)
    room = core.newCoop(parties[0])
    members = [core.attachCoop(room, state) for state in parties]
    return room, parties, members, *core.currentWeeklyBoss(parties[0])


def view(core, state):
    return core.frame(state).weeklyBoss.gate


def events(state, key):
    return [e.value for e in state.events.values() if e.kind == 'gate:' + key]


def royal(lua, core, host, other, step, w, spec):
    strike(lua, core, host, w.king)
    for _ in range(450):
        if w.stage == 'queen':
            break
        step()
    assert w.stage == 'queen' and w.king.hp == 225
    strike(lua, core, other, w.queen)
    step()
    assert w.stage == 'finish'
    strike(lua, core, host, w.king)
    step()
    assert w.cast.key == 'WT09'
    run(step, 192 + 48 + spec.restTicks + 1)
    assert w.stage == 'royal' and w.cast.key == 'WT17'


def pawns(lua, core):
    room, parties, members, w, spec = match(core)
    host, guest, other, far = parties
    step = lambda: core.stepCoop(room, TICK)
    for state, x in zip(parties, (155, 754, 705, 780)):
        spot(state, x)
    run(step, spec.noticeTicks + 2)
    c = w.cast
    assert c.shield == 3 and view(core, host).run.member == 4
    core.detachCoop(members[3])
    step()
    assert view(core, host).run.member == 2
    run(step, spec.charge.lock)
    goal = c.run.goal
    assert goal > 600 and view(core, host).run.mine is False
    assert view(core, guest).run.mine is True
    core.detachCoop(members[1])
    run(step, spec.charge.active[2] - spec.charge.lock)
    assert c.shield == 2 and c.run.goal == goal
    core.attachCoop(room, guest, members[1])
    core.attachCoop(room, far, members[3])
    for state, x in zip(parties, (155, 701, 735, 680)):
        spot(state, x)
    run(step, 2 * (spec.charge.finish + 50))
    assert w.cast.key == 'WT18' and w.pawnsDone
    assert events(host, 'WT04:pawn') == [2, 1, 0]
    assert w.primary.coopHits[members[2].id] is not None
    assert [p.broken for p in c.pawns.values()] == [True, True, True]


def shields_and_hits(lua, core):
    room, parties, members, w, spec = match(core)
    host, guest, other, far = parties
    step = lambda: core.stepCoop(room, TICK)
    w.pawnsDone, w.rest = True, 0
    for state, x in zip(parties, (355, 362, 705, 782)):
        spot(state, x)
    step()
    run(step, w.cast.move.windows[1][1])
    assert [events(s, 'WT01:hurt') for s in parties] == [[31], [31], [], []]
    assert all(s.actors[1].maxhp - s.actors[1].hp == 31 for s in (host, guest))
    w.cast, w.index, w.rest = None, 3, 0
    step()
    c = w.cast
    assert c.key == 'WT05' and c.g == 12
    strike(lua, core, host, w.king, power=15)
    strike(lua, core, guest, w.king, power=15)
    strike(lua, core, guest, w.king, power=15)
    assert c.g == 10 and w.king.hp == 900
    assert all(view(core, s).shield == 10 for s in parties)
    for _ in range(5):
        run(step, 24)
        strike(lua, core, host, w.king, power=15)
        strike(lua, core, guest, w.king, power=15)
    step()
    assert w.cast.key == 'WT18'
    assert w.primary.coopHits[members[0].id] is not None
    assert w.primary.coopHits[members[1].id] is not None


def frost_and_transfer(lua, core):
    room, parties, members, w, spec = match(core)
    host, guest, lure, remote = parties
    step = lambda: core.stepCoop(room, TICK)
    w.pawnsDone = True
    royal(lua, core, host, guest, step, w, spec)
    c = w.cast
    for state, x in zip(parties, (84, 874, 704, 560)):
        spot(state, x)
    members[0].input = members[1].input = lua.table(interact=True)
    run(step, 31)
    assert view(core, host).hold == 30 and view(core, guest).hold is None
    assert view(core, guest).frostOwner == 1
    core.action(guest, 'dodge')
    step()
    assert view(core, host).hold == 31
    core.action(host, 'dodge')
    spot(guest, 874)
    step()
    assert view(core, guest).frostOwner == 2
    assert len(events(lure, 'WT20:cancel:action')) == 1
    run(step, 90)
    assert all(view(core, state).freeze == 50 for state in parties)
    assert view(core, guest).releaseRequired is True
    assert view(core, host).hold is None
    members[0].input = lua.table()
    step()
    spot(host, 84)
    spot(guest, 455)
    spot(lure, 704)
    members[0].input = lua.table(interact=True)
    run(step, 119)
    assert view(core, host).hold == 0
    run(step, 90)
    assert c.freeze == 100 and view(core, lure).run.mine
    assert view(core, host).run.member == 3
    run(step, 210)
    assert c.run.goal >= 612
    run(step, 84)
    assert w.cast.key == 'WT18' and len(events(guest, 'WT17:collision')) == 1
    assert w.primary.coopHits[members[2].id] is not None
    run(step, 48-w.cast.t)
    assert all(view(core, state).exposure == 360 for state in parties)
    for remaining in (1, 0):
        strike(lua, core, host, w.king)
        step()
        assert w.cast.key == 'WT19'
        hp = w.queen.hp
        run(step, 180)
        assert w.reviveLeft == remaining and w.king.hp + w.queen.hp == hp
    # Use the same cast to finish both royal pieces. The spectator gets no credit.
    for state in parties:
        spot(state, 500)
    strike(lua, core, lure, w.queen, power=12)
    strike(lua, core, guest, w.queen, power=12)
    strike(lua, core, host, w.king, power=100000, x=520, range=480, limit=2)
    assert w.king.hp == w.queen.hp == 0
    step()
    assert [state.kills for state in parties] == [1, 1, 1, 0]
    assert [state.progression.killXp for state in parties] == [EXP, EXP, EXP, 0]
    assert host.story.quests[QUEST].count == 1 and guest.story.quests[QUEST] is None


def cancelled_frost_and_wipe(lua, core):
    room, parties, members, w, spec = match(core)
    host, guest, *_ = parties
    step = lambda: core.stepCoop(room, TICK)
    w.pawnsDone = True
    royal(lua, core, host, guest, step, w, spec)
    spot(host, 84)
    spot(guest, 874)
    members[0].input = members[1].input = lua.table(interact=True)
    run(step, 20)
    assert view(core, host).frostOwner == 1
    a = host.actors[1]
    assert core.damageActor(host, a, 5, w.king, False, True) == 5
    assert core.healActor(host, a, 5) == 5
    assert w.cast.hold is None and w.cast.freeze == 0
    step()
    assert view(core, guest).frostOwner == 2
    assert len(events(guest, 'WT20:cancel:damage')) == 1
    core.detachCoop(members[1])
    step()
    assert w.cast.hold is None and w.cast.freeze == 0
    assert len(events(host, 'WT20:cancel:scene')) == 1
    for state in (host, *parties[2:]):
        state.actors[1].hp = 1
        state.actors[1].inv = 0
    w.cast.t = w.cast.move.deadline_ticks-1
    step()
    assert w.rechallenge and all(s.actors[1].hp == 0 for s in (host, *parties[2:]))
    step()
    assert w.stage == 'king' and w.primary.hp == 3620 and w.reviveLeft == 2
    assert all(state.kills == 0 for state in parties)


def via_http(url):
    host, guest = parties = (Client(url), Client(url))
    for i, client in enumerate(parties):
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            prepare(env['core'], env['state'], i == 0)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    for client in parties:
        assert cross(client, 442, ARENA)['weeklyBoss']['maxhp'] == 3620
    for client in parties:
        cross(client, 863, HUB)
    with LOCK:
        env = SESSIONS[host.sid]
        room = env['coop_room'].worlds[ARENA]
        frozen = room.tick
    advance(host, guest, .18)
    assert room.tick == frozen
    for client in parties:
        assert cross(client, 442, ARENA)['weeklyBoss']['maxhp'] == 3620
    with LOCK:
        lua,core = env['lua'],env['core']
        states = [SESSIONS[client.sid]['state'] for client in parties]
        w,spec = core.currentWeeklyBoss(states[0])
        w.pawnsDone,w.rest,w.cast = True,0,None
        royal(lua, core, *states, lambda: core.stepCoop(room, TICK), w, spec)
        for state,e in zip(states,(w.king,w.queen)):
            spot(state,e.x-65)
            state.actors[1].dir = 1
    for client in parties:
        client.frame(['normal'])
    views = advance(host, guest, .15)
    assert [body['hp'] for body in views[0]['weeklyBoss']['gate']['bodies']] == [
        body['hp'] for body in views[1]['weeklyBoss']['gate']['bodies']]
    assert all(body['hp'] < body['max'] for body in views[0]['weeklyBoss']['gate']['bodies'])
    with LOCK:
        strike(lua, core, states[0], w.king, power=100000, x=520, range=480, limit=2)
        core.stepCoop(room, TICK)
    for i,client in enumerate(parties):
        saved = client.frame(checkpoint=True)['checkpoint']
        assert saved['weeklyBosses'][BOSS]['hp'] == 0
        assert saved['endgame']['bosses'][BOSS]['clears'] == 1
        assert (saved['progression']['killXp'], saved['mora']) == (EXP, 4200)
        assert (saved['story']['quests'].get(QUEST) or {}).get('count') == (1 if i==0 else None)


if __name__ == '__main__':
    lua, core = runtime()
    pawns(lua, core)
    shields_and_hits(lua, core)
    frost_and_transfer(lua, core)
    cancelled_frost_and_wipe(lua, core)
    with lab() as url:
        via_http(url)
    proof = dict(lua=dict(participants=4, sharedPawns=3, retargetBeforeLock=True, fixedPathAfterLock=True,
                         individualHits=True, sharedBarrier=12, frostExclusive=True, frostShared=[50,100],
                         damageAndExitCancelFrost=True, wipeRestoresRoom=True,
                         collision=True, exposureTicks=360, hpConservedAcrossTwoTransfers=True,
                         sameCastBothPiecesOneClear=True, spectatorNoReward=True),
                 http=dict(participants=2, sharedHp=3620, retreatFreezesRoom=True,
                           eachPlayerHitsOwnTarget=True, personalXp=EXP, personalMora=4200, ownQuestAndSaves=True))
    (ROOT/'evidence/coop-gate-lua-http.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf8')
    print(proof)
