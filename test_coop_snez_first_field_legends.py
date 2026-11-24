"""Verify private sparring and passage gates before shared Snezhnaya fights."""
import json
import subprocess
import sys

from runtime import ROOT, runtime
from test_coop_branch_legends import SPECS, actor_at, hit, level
from test_coop_late_branch_bosses import difference, report_rewards
from test_coop_local import Client, LOCK, SESSIONS, lab
from test_coop_natlan_atocpan_totem import cross_route
from test_coop_natlan_entry_legends import shared_attacks
from test_coop_natlan_final_legends import encounter
from test_coop_natlan_north_trials import collect
from test_coop_nod_first_field_legends import go, locked_gate
from test_coop_ruin_guardians import QUESTS, balances, cross, edge


HUB = 'snezhnaya-hub'
FIELD = 'snezhnaya-field'
CH, BA, FU = ('legend-snez_churin', 'legend-snez_bandersnatch', 'legend-snez_furiosa')
BOUTS, PASSAGE = 'sne-snow-sculptor-bouts', 'sne-svetloredovka-cavern-check'
SQUARE, FIRST, SECOND = SPECS[CH]['entryThrough']
CAVERN, = SPECS[BA]['entryThrough']
TRAIL, = SPECS[FU]['entryThrough']
DOMAIN = 'sites-hunt-100707'
ALT = 'sne-wp-100695'
COMMON = (FIELD, 'sne-wp-100660', 'sne-wp-100659')
CH_ROUTE = (*COMMON, 'sne-wp-100670', 'sne-wp-100697', SQUARE)
BA_ROUTE = (*COMMON, 'sne-wp-100658', CAVERN)
FU_ROUTE = ('white-pass-woods', 'sne-wp-100643', ALT, TRAIL)


def create_room(url, route, id, quest=None, *, guest_bonus=0):
    host, guest = clients = (Client(url), Client(url))
    for client in clients:
        client.frame(['story_start'])
        with LOCK:
            env = SESSIONS[client.sid]
            core, state = env['core'], env['state']
            level(core, state, SPECS[id]['level'] + (guest_bonus if client is guest else 0))
            core.enterStoryNode(state, HUB)
            if quest:
                core.action(state, 'story_accept:' + quest)
            core.enterStoryNode(state, route[0])
    code = host.frame(['coop_create'])['coop']['code']
    assert guest.frame(['coop_join:' + code])['coop']['code'] == code
    for client, peer in ((host, guest), (guest, host)):
        go(client, peer, route, code)
    return host, guest, code


def enter_bout(client, source, target, code):
    result = cross(client, edge(source, target))
    assert result['coop']['code'] == code and not result['coop']['shared']
    return result


def finish_bout(client, bout):
    with LOCK:
        env = SESSIONS[client.sid]
        state = env['state']
        enemy, = [e for e in state.enemies.values() if e.spawnId == bout]
        assert enemy.hp == enemy.maxhp
        actor_at(state, enemy.x)
        hit(env['lua'], env['core'], state, enemy, 10000)


def report_and_restore(clients, id, quest=None):
    for client in clients:
        save = client.frame(checkpoint=True)['checkpoint']
        assert client.frame(restore=save)['story']['node'] == HUB
        with LOCK:
            state = SESSIONS[client.sid]['state']
            assert state.endgame.bosses[id].clears == 1
            before = balances(state)
        if quest:
            for _ in range(2):
                report = client.frame(['story_report:' + quest], checkpoint=True)
            assert report['story']['quests'][quest]['status'] == 'complete'
            with LOCK:
                assert difference(balances(state), before) == report_rewards(QUESTS[quest])
            assert client.frame(restore=report['checkpoint'])['story']['quests'][quest]['status'] == 'complete'


def churin(url):
    host, guest, code = create_room(url, CH_ROUTE, CH, BOUTS)
    clients = (host, guest)
    guidepost = QUESTS[BOUTS]['itinerary'][0]
    assert collect(host, guidepost)['story']['quests'][BOUTS]['count'] == 1
    assert locked_gate(guest, SQUARE, FIRST, '案内役')['story']['quests'][BOUTS]['count'] == 0
    assert collect(guest, guidepost)['story']['quests'][BOUTS]['count'] == 1
    for client in clients:
        enter_bout(client, SQUARE, FIRST, code)
    finish_bout(host, 'snow-apprentice-sparring')
    assert locked_gate(guest, FIRST, SECOND, '弟子')['story']['quests'][BOUTS]['count'] == 1
    enter_bout(host, FIRST, SECOND, code)
    finish_bout(host, 'snow-bragin-sparring')
    finish_bout(guest, 'snow-apprentice-sparring')
    enter_bout(guest, FIRST, SECOND, code)
    arena = SPECS[CH]['node']
    assert locked_gate(guest, SECOND, arena, 'ブラーギン')['story']['quests'][BOUTS]['count'] == 2
    finish_bout(guest, 'snow-bragin-sparring')
    result = encounter(host, guest, CH, SECOND, code, private_entry=True)
    for client in clients:
        with LOCK:
            assert not list(SESSIONS[client.sid]['state'].enemies.values())
        enter_bout(client, SECOND, FIRST, code)
        with LOCK:
            assert not list(SESSIONS[client.sid]['state'].enemies.values())
    report_and_restore(clients, CH, BOUTS)
    return dict(**result, personalSparringAndGates=True, clearedRoundsStayEmpty=True, reportRestored=True)


def bandersnatch(url):
    host, guest, code = create_room(url, BA_ROUTE, BA, PASSAGE)
    clients = (host, guest)
    sign, panel = QUESTS[PASSAGE]['itinerary']
    for index, spot in enumerate((sign, panel), 1):
        assert collect(host, spot)['story']['quests'][PASSAGE]['count'] == index
    assert collect(guest, sign)['story']['quests'][PASSAGE]['count'] == 1
    arena = SPECS[BA]['node']
    cross_route(host, (CAVERN, arena), code)
    blocked = locked_gate(guest, CAVERN, arena, '操作盤')
    assert blocked['coop']['peers'][0]['map'] == arena
    assert collect(guest, panel)['story']['quests'][PASSAGE]['count'] == 2
    cross_route(host, (arena, CAVERN), code)
    result = encounter(host, guest, BA, CAVERN, code)
    report_and_restore(clients, BA, PASSAGE)
    return dict(**result, personalIceDoor=True, reportRestored=True)


def furiosa(url):
    host, guest, code = create_room(url, FU_ROUTE, FU, guest_bonus=1)
    blocked = locked_gate(host, TRAIL, DOMAIN, '159')
    assert BOUTS not in blocked['story']['quests'] and PASSAGE not in blocked['story']['quests']
    cross_route(guest, (TRAIL, DOMAIN, TRAIL), code)
    result = encounter(host, guest, FU, TRAIL, code)
    report_and_restore((host, guest), FU)
    return dict(**result, lowLevelBypass=True, twoSnowfieldEntrances=True)


if __name__ == '__main__':
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'test_snez_first_field_legends.py')], check=True)
    lua, core = runtime()
    proof = {'lua': {id: shared_attacks(lua, core, id) for id in (CH, BA, FU)}, 'http': {}}
    with lab() as url:
        for check in (churin, bandersnatch, furiosa):
            proof['http'][check.__name__] = check(url)
            print('HTTP:', check.__name__, 'travel, gates and shared fight passed', flush=True)
    (ROOT / 'evidence/coop-snez-first-field-legends-lua-http.json').write_text(
        json.dumps(proof, indent=2) + '\n', encoding='utf8')
    print(proof)
