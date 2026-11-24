"""Test the mountain lifts and each party's floating-island access."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import NODES, SPECS, actor_at, hit, level
from test_coop_late_branch_bosses import difference, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_natlan_atocpan_totem import cross_route
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_final_legends import encounter
from test_coop_natlan_night_trials import timed_travel
from test_coop_ruin_guardians import QUESTS, balances, cross, edge


SMALL = 'legend-natlan_infinitesimal'
BRONZE = 'legend-natlan_bronzelock'
QUEST = 'ochka-floating-island-spiritway'
DOCK = 'ochkanatlan-dock'
REEF = 'nat-wp-80030'
DEVICE = 'ochka-bronzelock-device-shore'
LANDING = 'ochka-bronzelock-floating-landing'
MOUNTAIN = ('nat-wp-82560', 'nat-mountain-camp', 'nat-wp-84104', 'nat-wp-84105',
            'nat-wp-84106', 'nat-wp-84108', 'nat-wp-84109', 'nat-wp-84107')
COAST = (DOCK, 'ochkanatlan-ruins', 'nat-wp-79546', 'nat-wp-80846', 'nat-wp-79550')


def penetrate_shore(client, peer, code):
    cross_route(client, COAST, code)
    assert timed_travel(client, COAST[-1], REEF, peer)['coop']['code'] == code
    arrived = cross(client, edge(REEF, DEVICE))
    assert arrived['coop']['code'] == code and not arrived['coop']['shared']


def devices(state):
    return {e.id: e for e in state.enemies.values() if e.breakTarget and e.hp > 0}


def break_device(client, entity):
    with LOCK:
        env = SESSIONS[client.sid]
        state = env['state']
        target = devices(state)[entity]
        actor_at(state, target.x - 42)
        before = state.kills, balances(state)
        hit(env['lua'], env['core'], state, target)
        assert (state.kills, balances(state)) == before


def device_ids(client):
    with LOCK:
        return set(devices(SESSIONS[client.sid]['state']))


def closed_spiritway(client, code):
    gate = edge(DEVICE, LANDING)
    with LOCK:
        actor_at(SESSIONS[client.sid]['state'], gate['x'], gate['y'])
    frame = client.frame(['story_portal:' + LANDING])
    assert frame['story']['node'] == DEVICE and not frame.get('storyLift')
    assert '二つ' in frame['storyNearbyPortal']['reason']
    assert frame['coop']['code'] == code
    assert frame['story']['quests'][QUEST]['count'] == 0


def journey(url):
    host, guest = clients = (Client(url), Client(url))
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            core, state = env['core'], env['state']
            level(core, state, 130 - int(client is guest))
            core.enterStoryNode(state, DOCK)
            core.action(state, 'story_accept:' + QUEST)
            core.enterStoryNode(state, MOUNTAIN[0])
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    for client, peer in ((host, guest), (guest, host)):
        for source, target in zip(MOUNTAIN, MOUNTAIN[1:]):
            if 'liftSeconds' in edge(source, target):
                assert timed_travel(client, source, target, peer)['coop']['code'] == code
            else:
                cross_route(client, (source, target), code)
    mountain = encounter(host, guest, SMALL, MOUNTAIN[-1], code, check_level=True)
    for client, peer in ((host, guest), (guest, host)):
        with LOCK:
            env = SESSIONS[client.sid]
            level(env['core'], env['state'], 180 - int(client is guest))
        start = client.frame(['story_fast:' + DOCK])
        assert start['coop']['code'] == code and start['story']['node'] == DOCK
        penetrate_shore(client, peer, code)
    west, east = (target['entity'] for target in NODES[DEVICE]['breakTargets'])
    break_device(guest, east)
    break_device(host, west)
    break_device(host, east)
    crossing = timed_travel(host, DEVICE, LANDING, guest)
    assert crossing['story']['quests'][QUEST]['count'] == 2
    assert device_ids(guest) == {west}
    closed_spiritway(guest, code)

    partial = guest.frame(checkpoint=True)['checkpoint']
    assert guest.frame(restore=partial)['story']['node'] == DOCK
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    penetrate_shore(guest, host, code)
    assert device_ids(guest) == {west}
    closed_spiritway(guest, code)
    break_device(guest, west)
    assert timed_travel(guest, DEVICE, LANDING, host)['story']['quests'][QUEST]['count'] == 2
    bronze = encounter(host, guest, BRONZE, LANDING, code, check_level=True)
    for client, peer in ((host, guest), (guest, host)):
        returned = timed_travel(client, LANDING, DEVICE, peer, shared=False)
        assert returned['actors'][0]['y'] == 414 and returned['coop']['code'] == code
        assert device_ids(client) == set()
        cross_route(client, (DEVICE, REEF), code)
    for client in clients:
        save = client.frame(checkpoint=True)['checkpoint']
        assert all(save['endgame']['bosses'][id]['clears'] == 1 for id in (SMALL, BRONZE))
        assert client.frame(restore=save)['story']['node'] == DOCK
        with LOCK:
            state = SESSIONS[client.sid]['state']
            before = balances(state)
        for _ in range(2):
            report = client.frame(['story_report:' + QUEST], checkpoint=True)
        assert report['story']['quests'][QUEST]['status'] == 'complete'
        with LOCK:
            assert difference(balances(state), before) == report_rewards(QUESTS[QUEST])
        assert client.frame(restore=report['checkpoint'])['story']['quests'][QUEST]['status'] == 'complete'
    return dict(participants=2, mountain=mountain, bronzelock=bronze, sharedLiftAndFerry=True,
                separateDevicesAndUnlock=True, partialDeviceSaveAndRejoin=True,
                sameRoomAcrossSpiritway=True, spiritwayReturnY=414, personalReportsRestored=True)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_natlan_highland_legends.py')], check=True)
    lua, core = runtime()
    proof = {'lua': {id: shared_attacks(lua, core, id) for id in (SMALL, BRONZE)}}
    with lab() as url:
        proof['http'] = journey(url)
    (ROOT / 'evidence/coop-natlan-highland-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
