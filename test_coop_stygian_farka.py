"""Drive the live room API and Lua fight through Farka's encounter and settlement."""
import json

from experience import LEVELS
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_coop_local import Client, LOCK, SESSIONS, lab


HUB, ARENA, QUEST = 'mond-town', 'mond-stygian-dual-court', 'stygian-farka-commission'
NORMAL = 'stygian_start:farka:normal:'
KEY = 'farka:normal'


def place(actor, x):
    actor.x, actor.y, actor.vy, actor.ground = x, 480, 0, True


def open_arena(client, level, accept=False, *, hub=HUB, arena=ARENA, quest=QUEST, entrance_x=295):
    client.frame(['story_start'])
    with LOCK:
        env = SESSIONS[client.sid]
        core, state = env['core'], env['state']
        core.grantExp(state, LEVELS[level - 1]['maple_reference_total_exp_to_reach'], 'quest')
        core.enterStoryNode(state, hub)
        place(state.actors[1], entrance_x)
    if accept:
        assert client.frame(['story_accept:' + quest])['story']['quests'][quest]['status'] == 'active'
    frame = client.frame(['story_nearby_portal'])
    assert frame['story']['node'] == arena and frame['coop']['eligible']


def strike(env, boss, power):
    s, core, lua = env['state'], env['core'], env['lua']
    moving = s.actors[s.active]
    place(moving, boss.x - 42)
    shot = lua.table(id=s.active, key='normal', x=moving.x, y=boss.y, dir=1, element='physical',
                     range=120, limit=1, color='#fff3e2', gain=0, atk=power, mult=1, critRate=0)
    core.resolveCast(s, shot)


def play(url):
    host, guest, observer, reserve = (Client(url) for _ in range(4))
    for client in (host, guest, observer, reserve):
        open_arena(client, 42 if client is reserve else 12, accept=client in (host, guest))
    code = host.frame(['coop_create'])['coop']['code']
    for client in (guest, observer, reserve):
        assert client.frame(['coop_join:' + code])['coop']['code'] == code
    locked = guest.frame(['stygian_start:farka:hard:gladiator'])
    assert 'endgameRun' not in locked
    assert host.frame([NORMAL + 'troupe'])['endgameRun']['gathering'] > 0
    assert guest.frame([NORMAL + 'gladiator'])['boss']['maxhp'] == 670
    assert observer.frame([NORMAL + 'troupe'])['boss']['maxhp'] == 670

    with LOCK:
        h, g = [SESSIONS[c.sid] for c in (host, guest)]
        s, t, core = h['state'], g['state'], h['core']
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss
        idle = SESSIONS[observer.sid]['state']
        idle.actors[2].hp = 0
        place(idle.actors[1], 35)
        same = h['lua'].eval('function(a,b) return rawequal(a,b) end')
        assert same(s.enemies[1], t.enemies[1]) and same(s.endgameRun.shared, t.endgameRun.shared)

        def advance(condition, bound=3000):
            for _ in range(bound):
                if condition():
                    return
                core.stepCoop(world, 1 / 60)
            raise AssertionError((run.phase, run.stage, run.elapsed))

        for party in (s, t):
            party.actors[2].hp = 0
            place(party.actors[1], 510)
        advance(lambda: run.cast and run.cast.key == 'FK01' and run.cast.t == 24)
        a, b = [native(core.frame(p, 'sprite').endgameRun) for p in (s, t)]
        assert a['areas'] == b['areas'] and a['tick'] == b['tick'] == 24
        area = a['areas'][0]
        for party in (s, t):
            place(party.actors[1], area['right'] - 45)
        advance(lambda: run.cast.t == 48)
        assert all(p.actors[1].hp < p.actors[1].maxhp for p in (s, t))
        assert all(sum(e.kind == 'stygian:farka:FK01:contact' for e in p.events.values()) == 1 for p in (s, t))
        strike(g, boss, 105)
        strike(h, boss, 99999)
        assert 0 < boss.hp < 670 and s.endgameRun.skills['normal'] > 0 and t.endgameRun.skills['normal'] > 0
        hp = boss.hp
        guest_hp = t.actors[1].hp

    late = reserve.frame([NORMAL + 'troupe'])
    assert 'endgameRun' not in late and '挑戦中' in late['coop']['notice']
    hard = reserve.frame(['stygian_start:farka:hard:troupe'])
    assert hard['boss']['hp'] == 1880 and hard['endgameRun']['mode'] == 'ハード'
    with LOCK:
        other = SESSIONS[reserve.sid]['state']
        assert not same(s.coop, other.coop)
        assert other.endgameRun.boss.hp == 1880 and boss.hp == hp
    guest.release()
    resumed = guest.frame(resume=True)
    assert resumed['coop']['code'] == code and resumed['boss']['hp'] == hp
    assert resumed['actors'][0]['hp'] == guest_hp
    with LOCK:
        t.actors[1].hp = 0
        s.actors[1].inv = 400
        core.stepCoop(world, 1 / 60)
        assert t.endgameRun.status == 'spectate' and t.returns == 0 and t.story.node == ARENA
        assert s.endgameRun.status == 'fighting'
        advance(lambda: run.stage == 2 and run.phase == 'ready')
        strike(h, boss, 99999)
        advance(lambda: run.stage == 3 and run.phase == 'ready')
        advance(lambda: run.chainOpen)
        strike(h, boss, 99999)
        advance(lambda: run.status == 'clear')

    results = []
    for client in (host, guest):
        done = client.frame(checkpoint=True)
        assert done['endgameRun']['status'] == 'clear' and done['boss']['hp'] == 0
        reward = done['endgameRun']['matchReward']
        assert reward['first'] and reward['xp'] == run.rules.xp + run.rules.firstXp
        assert reward['mora'] == run.rules.mora + run.rules.firstMora
        assert done['checkpoint']['story']['node'] == HUB
        record = done['checkpoint']['endgame']['stygian'][KEY]
        assert record['clears'] == 1 and record['mainSkill'] == 'normal'
        repeated_frame = client.frame(checkpoint=True)
        assert repeated_frame['checkpoint']['endgame']['stygian'][KEY] == record
        assert repeated_frame['mora'] == done['mora']
        results.append(reward)
    assert results[0]['set'] != results[1]['set']
    no_reward = observer.frame(checkpoint=True)
    assert no_reward['endgameRun']['status'] == 'clear' and 'matchReward' not in no_reward['endgameRun']
    assert KEY not in (no_reward.get('endgame', {}).get('stygian') or {})
    assert no_reward['mora'] == 0
    observer.frame(['endgame_exit'])
    host.frame(['endgame_exit'])
    assert '挑戦中' in host.frame([NORMAL + 'troupe'])['coop']['notice']
    assert guest.frame(['endgame_exit'])['story']['node'] == HUB
    retry = host.frame([NORMAL + 'troupe'])
    assert retry['boss']['hp'] == 670 and retry['endgameRun']['gathering'] > 0
    with LOCK:
        world = s.coop
        run, boss = world.stygianRun, world.stygianRun.boss
        s.actors[1].inv = 400
        advance(lambda: run.phase == 'ready')
        strike(h, boss, 99999)
        advance(lambda: run.stage == 2 and run.phase == 'ready')
        strike(h, boss, 99999)
        advance(lambda: run.stage == 3 and run.phase == 'ready')
        advance(lambda: run.chainOpen)
        strike(h, boss, 99999)
        advance(lambda: run.status == 'clear')
    saved = host.frame(checkpoint=True)
    second = saved['endgameRun']['matchReward']
    assert not second['first'] and second['xp'] == run.rules.xp and second['mora'] == run.rules.mora
    restored = host.frame(restore=saved['checkpoint'])
    assert restored['endgame']['stygian'][KEY]['clears'] == 2
    with LOCK:
        other.actors[1].hp = other.actors[2].hp = 0
        core.stepCoop(other.coop, 1 / 60)
        assert other.endgameRun.status == 'failed'
    assert reserve.frame(['endgame_exit'])['story']['node'] == HUB
    return dict(contributors=2, normalHP=670, hardHP=1880, warningAndDamageForBoth=True, lateJoinBlocked=True,
                sameSessionRestoredHP=True, defeatedContributorRewarded=True, idleObserverUnrewarded=True,
                independentDifficulties=True, allDownReturnsThroughHub=True,
                selectedSets=results, rematchReward=second, savedClears=2)


def fixture(hub=HUB, name='farka', item_level=60):
    _, core = runtime()
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[199]['maple_reference_total_exp_to_reach'], 'quest')
    for slot in (1, 2, 3):
        assert core.giveArtifact(state, slot, item_level, 3)
        core.action(state, 'artifact_equip:' + str(slot))
    core.enterStoryNode(state, hub)
    saved = validate_save(native(core.checkpoint(state)))
    (ROOT / f'work/coop-stygian-{name}-fixture.json').write_text(json.dumps(saved), encoding='utf8')


if __name__ == '__main__':
    with lab() as url:
        proof = play(url)
    fixture()
    (ROOT / 'evidence/coop-stygian-farka-http.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(proof)
