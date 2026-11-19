"""Verify room membership across maps and map-local combat through HTTP."""
import json
from uuid import uuid4

from runtime import ROOT
from test_coop_anemo import ARENA, BOSS, LEVEL, QUEST, pulse
from test_coop_local import Client, LOCK, SESSIONS, advance, lab


TOWN, ROAD, ENTRY = 'mond-town', 'mond-road', 'anemo-approach'


def setup(client, accept=False):
    assert client.frame(['story_start'])['story']['node'] == TOWN
    with LOCK:
        env = SESSIONS[client.sid]
        env['core'].grantExp(env['state'], LEVEL['maple_reference_total_exp_to_reach'], 'quest')
        env['state'].actors[2].hp = 0  # Keep contributions attributable to the manual actor.
    if accept:
        assert client.frame(['story_accept:' + QUEST])['story']['quests'][QUEST]['status'] == 'active'


def cross(client, x, node):
    with LOCK:
        actor = SESSIONS[client.sid]['state'].actors[1]
        actor.x, actor.y, actor.vy, actor.ground = x, 480, 0, True
    frame = client.frame(['story_portal:' + node])
    assert frame['story']['node'] == node
    return frame


def hit(client, power, target_x):
    with LOCK:
        env = SESSIONS[client.sid]
        env['state'].actors[1].x = target_x - 104
        pulse(env['lua'], env['core'], env['state'], power, origin=target_x)


def peer(frame):
    return frame['coop']['peers'][0]


def run(url):
    host, guest = Client(url), Client(url)
    setup(host, accept=True)
    setup(guest, accept=True)
    cross(guest, 1380, ROAD)
    cross(guest, 1200, ENTRY)
    cross(guest, 1270, ARENA)
    opened = host.frame(['coop_create'])
    assert opened['coop']['enemies'] == [] and opened['coop']['map'] == TOWN
    code = opened['coop']['code']
    joined = guest.frame(['coop_join:' + code])
    assert peer(joined)['map'] == TOWN and peer(joined)['online'] and peer(joined)['actors'] == []
    slot = joined['coop']['slot']
    assert joined['coop']['enemies'][0]['maxhp'] == 870
    assert peer(host.frame())['map'] == ARENA

    road = cross(host, 1380, ROAD)
    assert road['coop']['code'] == code and len(road['coop']['enemies']) == 6
    assert peer(guest.frame())['map'] == ROAD
    start_a, start_b = host.frame()['coop']['tick'], guest.frame()['coop']['tick']
    a, b = advance(host, guest, .16)
    assert a['coop']['tick'] > start_a and b['coop']['tick'] > start_b
    assert peer(a)['actors'] == peer(b)['actors'] == []
    with LOCK:
        first = SESSIONS[host.sid]['state'].enemies[1]
        first_x = first.x
    hit(host, 30, first_x)
    a, b = host.frame(), guest.frame()
    assert a['kills'] == 1 and b['kills'] == 0
    assert a['coop']['enemies'][0]['hp'] == 0 and b['coop']['enemies'][0]['hp'] == 870

    hit(guest, 150, 800)
    wounded = guest.frame()['fieldBoss']
    assert 0 < wounded['hp'] < 870
    at_entry = cross(guest, 65, ENTRY)
    assert at_entry['coop']['code'] == code and peer(at_entry)['map'] == ROAD
    with LOCK:
        world = SESSIONS[guest.sid]['coop_room'].worlds[ARENA]
        empty_tick = world.tick
    advance(host, guest, .18)
    with LOCK:
        assert world.tick == empty_tick
        assert world.fieldSlot.enemy.hp == wounded['hp']

    gathered = cross(host, 1200, ENTRY)
    assert len(peer(gathered)['actors']) == 2 and peer(gathered)['map'] == ENTRY
    returned = cross(host, 1270, ARENA)
    assert returned['coop']['code'] == code
    assert returned['coop']['enemies'][0]['hp'] == wounded['hp']
    assert not peer(returned)['actors']
    together = cross(guest, 1270, ARENA)
    assert together['coop']['slot'] == slot and len(peer(together)['actors']) == 2
    hit(host, 20, 800)
    hit(guest, 20, 800)
    a, b = advance(host, guest, .85)
    assert a['fieldBoss']['hp'] == b['fieldBoss']['hp'] < wounded['hp']
    assert a['fieldBoss']['move'] == b['fieldBoss']['move']

    cross(host, 65, ENTRY)
    hit(guest, 1500, 800)
    a, b = host.frame(checkpoint=True), guest.frame(checkpoint=True)
    assert a['kills'] == b['kills'] == 1  # Host only has the earlier road kill.
    assert a['story']['quests'][QUEST]['count'] == 0 and b['story']['quests'][QUEST]['count'] == 1
    assert b['checkpoint']['endgame']['bosses'][BOSS]['clears'] == 1
    assert a['checkpoint']['fieldBosses'][BOSS]['hp'] == 870

    guest.release()
    assert not peer(host.frame())['online']
    guest.owner = uuid4().hex
    rejoined = guest.frame(resume=True)
    assert rejoined['coop']['code'] == code and rejoined['coop']['slot'] == slot
    assert peer(rejoined)['map'] == ENTRY and rejoined['fieldBoss']['remaining'] > 58

    cross(host, 60, ROAD)
    local = cross(host, 240, 'mond-wp-13')
    assert local['coop']['code'] == code and not local['coop']['shared']
    assert local['coop']['enemies'] == [] and peer(local)['map'] == ARENA
    later, other = advance(host, guest, .18)
    assert later['t'] > local['t'] and other['coop']['tick'] > rejoined['coop']['tick']
    paused = host.frame(['pause'])
    assert paused['paused'] and paused['coop']['code'] == code
    later, other = advance(host, guest, .15)
    assert later['t'] == paused['t']
    assert other['fieldBoss']['remaining'] < rejoined['fieldBoss']['remaining']
    with LOCK:
        state = SESSIONS[guest.sid]['state']
        state.actors[1].hp = state.actors[2].hp = 0
    _, returned_to_town = advance(host, guest, .12)
    assert returned_to_town['story']['node'] == TOWN
    assert returned_to_town['coop']['code'] == code and returned_to_town['coop']['slot'] == slot
    assert peer(host.frame())['map'] == TOWN
    left = host.frame(['coop_leave'])
    assert 'code' not in left['coop'] and left['story']['node'] == 'mond-wp-13'
    assert guest.frame()['coop']['code'] == code

    return {'joinedFromDifferentMaps': [TOWN, ARENA], 'separateCombatMaps': [ROAD, ARENA],
            'bothMapsAdvanced': True, 'ordinaryLootStaysOnMap': True,
            'emptyBossMapKeepsHpAndClock': True, 'hpAfterRegroup': wounded['hp'],
            'bossLootStaysOnMap': True, 'stableSlotAfterTravelAndReload': True,
            'retainedMembershipInPrivateMap': 'mond-wp-13', 'localPauseLeavesOtherMapRunning': True,
            'partyDefeatRetainsMembershipInTown': True}


def run_four(url):
    clients = [Client(url) for _ in range(4)]
    for index, client in enumerate(clients):
        setup(client, accept=index >= 2)
        cross(client, 1380, ROAD)
        if index >= 2:
            cross(client, 1200, ENTRY)
            cross(client, 1270, ARENA)
    code = clients[0].frame(['coop_create'])['coop']['code']
    for client in clients[1:]:
        assert client.frame(['coop_join:' + code])['coop']['code'] == code
    before = [client.frame() for client in clients]
    assert [frame['coop']['map'] for frame in before] == [ROAD, ROAD, ARENA, ARENA]
    for frame in before:
        peers = frame['coop']['peers']
        assert len(peers) == 3 and all(row['online'] for row in peers)
        assert sum(bool(row['actors']) for row in peers) == 1
    with LOCK:
        target_x = SESSIONS[clients[0].sid]['state'].enemies[1].x
    hit(clients[0], 4, target_x)
    hit(clients[1], 30, target_x)
    hit(clients[2], 20, 800)
    hit(clients[3], 1500, 800)
    after = [client.frame(checkpoint=True) for client in clients]
    assert [b['kills'] - a['kills'] for a, b in zip(before, after)] == [1, 1, 1, 1]
    assert all(frame['coop']['enemies'][0]['hp'] == 0 for frame in after)
    assert all(BOSS not in frame['checkpoint'].get('endgame', {}).get('bosses', {}) for frame in after[:2])
    assert all(frame['checkpoint']['endgame']['bosses'][BOSS]['clears'] == 1 for frame in after[2:])
    return {'players': 4, 'partiesPerMap': [2, 2], 'maps': [ROAD, ARENA],
            'onlySameMapActorsVisible': True, 'rewardsPerPlayer': [1, 1, 1, 1]}


if __name__ == '__main__':
    with lab() as url:
        result = run(url)
    with lab() as url:
        result['fourPlayers'] = run_four(url)
    (ROOT / 'evidence/coop-travel-http.json').write_text(
        json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('Cross-map join, separate clocks, regroup, map-local loot and reconnect passed.')
