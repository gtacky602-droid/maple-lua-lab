"""Compare Farka's two extreme chains using ordinary movement, jump and attack."""

from argparse import ArgumentParser
import json
from pathlib import Path

from test_earned_stygian_rematch import StygianRematch


def replay(source, output, evade):
    trip = StygianRematch(source, 'farka')
    state, run, hero = trip.state, trip.run, trip.actor
    boss, spec = run.boss, trip.spec
    arena = spec['arena']
    floor, left, right = arena['floor'], arena['left'] + 12, arena['right'] - 12
    geometry = trip.lua.execute(Path('stygian-geometry.lua').read_text('utf8'))
    moves = trip.lua.execute(Path('stygian-farka-moves.lua').read_text('utf8'))(trip.core, geometry)
    stages, chains = [], {}
    active_chain = escape = None
    previous, jump_to = None, 0

    for tick in range(1, 60 * 420 + 1):
        parent = run.cast
        child = parent.child if parent else None
        if not stages or stages[-1] != run.stage:
            stages.append(run.stage)
        first_chain = parent and parent.key == 'FK07' and (
            parent.variant not in chains or chains[parent.variant]['serial'] == parent.serial)
        if first_chain:
            active_chain = chains.setdefault(parent.variant, dict(serial=parent.serial, windows=[],
                contacts=[], positions=[], openings=[0, 0], counterDamage=[0, 0], childOrder=[]))
            if child.key not in active_chain['childOrder']:
                active_chain['childOrder'].append(child.key)
        token = (parent.serial, child.key) if parent else None
        if token != previous:
            previous, escape, jump_to = token, None, 0
        t = child.t if child else 0
        goal, attack = hero.x, False
        dx = boss.x - hero.x
        direction = 1 if dx > 0 else -1
        kid = child.key if child else None
        counter = child and t >= child.card.recovery[1]
        index = int(child.offset > 0) if child else 0

        def outside(*zones):
            candidates = [min(z.left for z in zones) - 27, max(z.right for z in zones) + 27]
            return min((x for x in candidates if left <= x <= right), key=lambda x: abs(x - hero.x))

        if run.phase in ('enter', 'phase'):
            pass
        elif kid == 'FK03' and t < 114:
            if t >= 30:
                zone = moves.geometry(run, child, 1)
                if escape is None:
                    escape = outside(zone) if evade or not first_chain else child.destination
                goal = escape
                if hero.ground and hero.y < floor:
                    trip.act('drop')
        elif kid == 'FK05' and t < 177:
            if t >= 42:
                low, high = (moves.geometry(run, child, i) for i in (1, 2))
                if escape is None:
                    escape = (max(low.left, high.left) + min(low.right, high.right)) / 2
                goal = escape
                dodge = evade or not first_chain
                jump_at = 88 if dodge else 151
                if t == jump_at:
                    jump_to = t + 42
                    trip.act('jump')
                if hero.ground and hero.y < floor and (t < jump_at - 20 or dodge and t >= 121):
                    trip.act('drop')
        elif kid == 'FK04' and t < 72:
            if t >= 18:
                a, b = (moves.geometry(run, child, i) for i in (1, 2))
                if escape is None:
                    escape = outside(a, b) if evade or not first_chain else child.x + child.dir * 50
                goal = escape
                if hero.ground and hero.y < floor:
                    trip.act('drop')
                if first_chain and not evade and t == 59:
                    jump_to = 94
                    trip.act('jump')
        else:
            goal = boss.x - direction * 74
            if abs(goal - hero.x) < 9 and dx * hero.dir < 0:
                goal = hero.x + direction * 23
            if boss.y == floor and hero.ground and hero.y < floor:
                trip.act('drop')
            allowed = run.stage < 3 or len(chains) == 2 and all(c.get('finished') for c in chains.values())
            if first_chain and counter:
                allowed = active_chain['counterDamage'][index] == 0
            attack = allowed and not boss.invulnerable and abs(dx) < 110 and dx * hero.dir > 0 and abs(hero.y-boss.y) < 68
        seq = state.events[len(state.events)].seq if len(state.events) else 0
        hp_before, boss_before = hero.hp, boss.hp
        goal = max(left, min(right, goal))
        trip.tick(1, trip.lua.table(left=goal < hero.x - 5, right=goal > hero.x + 5,
                                   jump=t < jump_to, attack=attack))
        if run.status == 'clear':
            break
        assert run.status == 'fighting' and hero.hp > 0 and not state.returns
        if not first_chain:
            continue
        same_cast = run.cast and run.cast.serial == parent.serial
        if kid == 'FK05' and child.t == 92:
            trip.capture('B・二連撃の残像', tick, parent)
        for event in state.events.values():
            if event.seq <= seq or event.cast != parent.serial:
                continue
            kind = event.kind.rsplit(':', 1)[-1]
            if kind == 'window':
                active_chain['windows'].append(event.tick)
                area = moves.geometry(run, child, event.index)
                active_chain['positions'].append(dict(tick=event.tick, x=hero.x, y=hero.y,
                    left=area.left, right=area.right, top=area.top, bottom=area.bottom))
                label = f"{parent.variant}・{('突き立て', '一撃目', '二撃目')[len(active_chain['windows'])-1]}"
                trip.capture(label, tick, parent)
            elif kind == 'contact' and event.actor == hero.id:
                assert event.value == hp_before - hero.hp
                active_chain['contacts'].append(dict(tick=event.tick, damage=event.value))
        if same_cast:
            current = parent.child
            if current.t >= current.card.recovery[1]:
                slot = int(current.offset > 0)
                active_chain['openings'][slot] += 1
                active_chain['counterDamage'][slot] += boss_before - boss.hp
                if active_chain['openings'][slot] == 1:
                    trip.capture(f'{parent.variant}・反撃{slot + 1}開始', tick, parent)
        else:
            active_chain['finished'] = True
    else:
        raise AssertionError((run.stage, run.phase, boss.hp, chains))

    assert stages == [1, 2, 3] and list(chains) == ['B', 'A'], (stages, chains)
    for variant, chain in chains.items():
        assert chain['finished'] and chain['openings'] == [90, 144], chain
        assert chain['childOrder'] == ['FK03', 'FK05' if variant == 'B' else 'FK04']
        assert chain['windows'] == ([102, 309, 375] if variant == 'B' else [102, 258, 270])
        assert all(amount > 0 for amount in chain['counterDamage']), chain
        if evade:
            assert chain['contacts'] == [], chain
        else:
            assert chain['contacts'][0] == {'tick': 102, 'damage': 34}, chain
    if not evade:
        assert chains['B']['contacts'] == [
            {'tick': 102, 'damage': 34}, {'tick': 309, 'damage': 37}, {'tick': 375, 'damage': 37}], chains
        assert chains['A']['contacts'] == [
            {'tick': 102, 'damage': 34}, {'tick': 258, 'damage': 26}, {'tick': 270, 'damage': 0}], chains
    for variant, chain in chains.items():
        contacts = {hit['tick']: hit['damage'] for hit in chain['contacts']}
        expected = [{'contact': tick in contacts, 'damage': contacts.get(tick, 0)} for tick in chain['windows']]
        assert trip.frames[f'{variant}・反撃2開始']['view']['chainResult'] == expected
        assert trip.frames[f'{variant}・反撃1開始']['view']['hint'] == '連係の途中。反撃の隙 1.5秒'
        assert trip.frames[f'{variant}・反撃2開始']['view']['hint'] == '反撃の隙 2.4秒'
    reward = trip.verify_clear()
    case = 'farka-evade' if evade else 'farka-contact'
    label = '突き立てと二本の斬撃を回避' if evade else '斬撃の高さに体を合わせて被弾'
    (output / f'{case}-frames.json').write_text(
        json.dumps(trip.frames, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf8')
    print(case, tick, {key: (row['contacts'], row['openings'], row['counterDamage'])
                       for key, row in chains.items()}, flush=True)
    return dict(controller='farka', case=case, label=label, ticks=tick, sourceSha256=trip.source,
                stages=stages, chains=chains, reward=reward, extremeClears=[trip.prior, trip.prior + 1])


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cases = [replay(args.from_save, args.output_dir, evade) for evade in (True, False)]
    (args.output_dir / 'weekly-mechanics.json').write_text(
        json.dumps(cases, ensure_ascii=False, indent=2) + '\n', 'utf8')
