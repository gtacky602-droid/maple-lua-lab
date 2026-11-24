"""Verify the shared hillside, quest clearing, and resort shallow-ground fights."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, hit, level
from test_coop_late_branch_bosses import difference, normal_rewards, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, advance, lab
from test_coop_natlan_atocpan_totem import cross_route
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_night_trials import timed_travel
from test_coop_natlan_north_trials import collect
from test_coop_ruin_guardians import QUESTS, balances, edge


PEAK = 'legend-natlan_peak'
TENO = 'legend-natlan_last_tenochtzitoc'
QUEST = 'natlan-southern-trail-survey'
STATUE = 'nat-wp-82557'
TRAIL = 'atocpan-peak-rock-trail'
COAST = 'nat-wp-82564'
DOMAIN = 'sites-hunt-82577'
CLEARING = 'atocpan-domain-side-clearing'
PORT = 'natlan-port'
PIER = 'nat-resort-pier'
BAY = 'nat-wp-85972'
MOUNTAIN = (STATUE, 'nat-wp-82570', 'nat-wp-82571', TRAIL)
SOUTH = (STATUE, 'nat-wp-82560', 'nat-wp-82561', 'nat-wp-82562', COAST)
NORTH_PORT = (STATUE, 'nat-wp-82559', 'nat-wp-82558', 'nat-wp-82572',
              'nat-wp-79051', 'nat-wp-72429', 'natlan-field', PORT)
RESORT = (PIER, 'nat-wp-85957', 'nat-wp-85960', 'nat-wp-85962', 'nat-wp-85968', 'nat-wp-85969', BAY)


def encounter(host, guest, id, entry, code, *, check_level=False):
    spec = SPECS[id]
    arena = spec['node']
    inbound = edge(entry, arena)
    return_y = edge(arena, entry).get('arrivalY', 480)

    def travel(client, source, target):
        if 'liftSeconds' in edge(source, target):
            peer = guest if client is host else host
            frame = timed_travel(client, source, target, peer)
            assert frame['coop']['code'] == code
            return frame
        return cross_route(client, (source, target), code)

    travel(host, entry, arena)
    if check_level:
        with LOCK:
            env = SESSIONS[guest.sid]
            actor_at(env['state'], inbound['x'], inbound.get('y', 480))
        denied = guest.frame(['story_portal:' + arena])
        assert denied['story']['node'] == entry
        assert str(spec['level']) in denied['storyNearbyPortal']['reason']
        assert denied['coop']['peers'][0]['map'] == arena
        with LOCK:
            level(env['core'], env['state'], spec['level'])
    assert not travel(guest, entry, arena).get('storySwim')

    with LOCK:
        env = SESSIONS[host.sid]
        core, lua, a = env['core'], env['lua'], env['state']
        b = SESSIONS[guest.sid]['state']
        room = a.coop
        boss = room.fieldSlot.enemy
        actor_at(a, boss.x - 54).dir = 1
        a.actors[2].hp = b.actors[2].hp = 0
    host.frame(['normal'])
    first, second = advance(host, guest, .4)
    hp = first['fieldBoss']['hp']
    assert 0 < hp < spec['hp'] and second['fieldBoss']['hp'] == hp
    with LOCK:
        actor_at(b, boss.x + 52)
    clients = (host, guest)
    for client in clients:
        returned = travel(client, arena, entry)
        assert returned['actors'][0]['y'] == return_y
    elevator = 'liftSeconds' in edge(arena, entry)
    if elevator:
        assert room.fieldSlot.out == 0, 'The last party in the elevator must not advance the combat leash.'
    frozen = room.tick, boss.hp
    assert 0 < frozen[1] <= hp
    advance(host, guest, .15)
    assert (room.tick, boss.hp) == frozen
    for client in clients:
        resumed = travel(client, entry, arena)['coop']['enemies'][0]['hp']
        assert resumed == frozen[1], (id, resumed, frozen[1])
        with LOCK:
            actor_at(SESSIONS[client.sid]['state'], boss.x)
    with LOCK:
        before = balances(a), balances(b)
        for state in (a, b):
            actor_at(state, boss.x)
        hit(lua, core, b, boss, power=40)
        hit(lua, core, a, boss, power=10000)
        assert all(difference(balances(state), prior) == normal_rewards(spec)
                   for state, prior in zip((a, b), before))
    for client in clients:
        saved = client.frame(checkpoint=True)['checkpoint']
        assert saved['endgame']['bosses'][id]['clears'] == 1
    travel(host, arena, entry)
    assert travel(host, entry, arena)['coop']['enemies'][0]['hp'] == 0
    for client in clients:
        travel(client, arena, entry)
    restarted = travel(host, entry, arena)
    assert restarted['coop']['enemies'][0]['hp'] == spec['hp']
    travel(host, arena, entry)
    result = dict(sharedOrdinaryAttack=True, pausedOnRetreat=True, returnY=return_y,
                  clearPersistsUntilEveryoneLeaves=True, personalAwards=True)
    if check_level:
        result['independentLevelGate'] = True
    if elevator:
        result['lastElevatorPausesCombat'] = True
    return result


def journey(url):
    host, guest = clients = (Client(url), Client(url))
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            core, state = env['core'], env['state']
            core.enterStoryNode(state, 'natlan-hub')
            level(core, state, 120 - int(client is guest))
            core.action(state, 'story_accept:' + QUEST)
            core.enterStoryNode(state, STATUE)
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    marks = QUESTS[QUEST]['itinerary']
    for client in clients:
        cross_route(client, MOUNTAIN, code)
        with LOCK:
            actor_at(SESSIONS[client.sid]['state'], edge(TRAIL, SPECS[PEAK]['node'])['x'])
        assert client.frame(['story_portal:' + SPECS[PEAK]['node']])['story']['node'] == TRAIL
        assert collect(client, marks[0])['story']['quests'][QUEST]['count'] == 1
    peak = encounter(host, guest, PEAK, TRAIL, code, check_level=True)
    for client in clients:
        cross_route(client, (*reversed(MOUNTAIN), *SOUTH[1:]), code)
    cross_route(host, (COAST, CLEARING), code)
    cross_route(guest, (COAST, DOMAIN, CLEARING), code)
    for client in clients:
        assert collect(client, marks[1])['story']['quests'][QUEST]['count'] == 2
        cross_route(client, (CLEARING, *reversed(SOUTH), *NORTH_PORT[1:]), code)
    for client, peer in ((host, guest), (guest, host)):
        assert timed_travel(client, PORT, PIER, peer)['coop']['code'] == code
        cross_route(client, RESORT, code)
    teno = encounter(host, guest, TENO, BAY, code)
    for client in clients:
        checkpoint = client.frame(checkpoint=True)['checkpoint']
        restored = client.frame(restore=checkpoint)
        assert restored['story']['node'] == PIER
        assert client.frame(['story_fast:natlan-hub'])['story']['node'] == 'natlan-hub'
        with LOCK:
            state = SESSIONS[client.sid]['state']
            assert all(state.endgame.bosses[id].clears == 1 for id in (PEAK, TENO))
            before = balances(state)
        for _ in range(2):
            done = client.frame(['story_report:' + QUEST], checkpoint=True)
        assert done['story']['quests'][QUEST]['status'] == 'complete'
        with LOCK:
            assert difference(balances(state), before) == report_rewards(QUESTS[QUEST])
        assert client.frame(restore=done['checkpoint'])['story']['quests'][QUEST]['status'] == 'complete'
    return dict(participants=2, peak=peak, lastTenochtzitoc=teno, sameRoomAcrossBoatAndLand=True,
                bothGrasslandRoutes=True, savedClearsAndPersonalReports=True)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_natlan_final_legends.py')], check=True)
    lua, core = runtime()
    proof = {'lua': {id: shared_attacks(lua, core, id) for id in (PEAK, TENO)}}
    with lab() as url:
        proof['http'] = journey(url)
    (ROOT / 'evidence/coop-natlan-final-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
