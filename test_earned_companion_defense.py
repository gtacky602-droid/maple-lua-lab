"""Exercise companion defenses against authored attacks using earned saves."""

import json

from runtime import ROOT
from test_earned_branch_quests import Journey, core, lua


HARE = 'original-rime-hare'
SIFTER = 'original-rubble-sifter'


def wait(trip, predicate, ticks=300):
    for _ in range(ticks):
        if predicate():
            return
        trip.tick(1)
    raise AssertionError((trip.state.story.node, trip.state.t, trip.actor.x, trip.actor.y))


def route(companion, boss=HARE):
    trip = Journey('lv165-save.json' if boss == HARE else 'lv200-save.json')
    if boss == HARE:
        trip.warp('mond-town')
        trip.travel('spine-shelter')
        arena = 'spine-trace-ridge'
    else:
        trip.warp('natlan-hub')
        trip.travel('ochkanatlan-dock')
        arena = 'ochka-sifting-kiln'
    trip.act('companion:' + companion)
    assert trip.state.companion == companion
    if boss == SIFTER and companion == 'ayaka':
        (ROOT/'work/earned-ayaka-sifter-checkpoint.json').write_text(
            json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    trip.travel(arena)
    return trip, trip.state.fieldSlots[boss]


def observations(trip, slot, finish):
    proof = []
    watch = lua.eval("""function(C, state, boss, record)
      local damage=C.damageActor
      C.damageActor=function(s,a,amount,source,blockable,telegraphed)
        if s~=state or a.id~=2 or not source or source.owner~=boss then
          return damage(s,a,amount,source,blockable,telegraphed)
        end
        local took=damage(s,a,amount,source,blockable,telegraphed)
        record(amount,took)
        return took
      end
      return function() C.damageActor=damage end
    end""")
    restore = watch(core, trip.state, slot.enemy, lambda incoming, actual: proof.append([incoming, actual]))
    try:
        finish()
    finally:
        restore()
    return proof


def beidou():
    trip, slot = route('beidou')
    trip.approach(728, 480, '岩兎の予兆')
    actor = trip.state.actors[2]
    wait(trip, lambda: bool(slot.cast))
    first = slot.cast
    assert first.move.id == 'RH01'
    wait(trip, lambda: bool(actor.counterCast))
    frame = trip.frame()
    assert frame.companion.counterSeconds > 0
    assert core.nextFieldImpact(trip.state, actor) is not None
    hp = actor.hp
    counters = observations(trip, slot, lambda: wait(trip, lambda: bool(first.seen[2])))
    assert counters == [[17, 0]] and actor.counterCast is None and actor.hp == hp
    assert any(cast.key == 'beidou:skill1' for cast in trip.state.pending.values())
    return {'sourceSha256':trip.source, 'boss':HARE, 'move':first.move.id, 'incomingAndTaken':counters}


def guard():
    trip, slot = route('beidou')
    trip.act('swap')
    assert trip.state.active == 2
    trip.act('skill1')
    assert trip.actor.cd.skill1 == 8
    wait(trip, lambda: trip.state.swap == 0)
    trip.act('swap')
    assert trip.state.active == 1
    trip.approach(728, 480, '岩兎の予兆')
    actor = trip.state.actors[2]
    wait(trip, lambda: bool(slot.cast))
    first = slot.cast
    wait(trip, lambda: (actor.guardUntil or 0) > trip.state.t)
    assert actor.cd.skill1 > 0 and trip.frame().companion.guardSeconds > 0
    shield_hp = actor.thunderShield.hp if actor.thunderShield else 0
    hp = actor.hp
    hits = observations(trip, slot, lambda: wait(trip, lambda: bool(first.seen[2])))
    remaining = actor.thunderShield.hp if actor.thunderShield else 0
    assert hits == [[17, max(0, 8-shield_hp)]]
    assert hp-actor.hp+shield_hp-remaining == 8
    return {'sourceSha256':trip.source, 'boss':HARE, 'move':first.move.id,
            'incoming':17, 'afterGuard':8, 'shieldAbsorbed':shield_hp-remaining}


def ayaka():
    trip, slot = route('ayaka', SIFTER)
    trip.approach(685, 480, '選鉱炉の予兆')
    actor = trip.state.actors[2]
    wait(trip, lambda: bool(slot.cast))
    first = slot.cast
    assert first.move.id == 'RK01'
    wait(trip, lambda: (actor.frostDodgeUntil or 0) > trip.state.t)
    assert trip.frame().companion.dodgeSeconds > 0 and not first.seen[2]
    hp = actor.hp
    hits = observations(trip, slot, lambda: wait(trip, lambda: bool(first.seen[2])))
    assert hits == [[20, 0]] and actor.hp == hp
    wait(trip, lambda: trip.frame().companion.dodgeSeconds is None, 40)
    return {'sourceSha256':trip.source, 'boss':SIFTER, 'move':first.move.id, 'incomingAndTaken':hits}


def wanderer():
    trip, slot = route('wanderer')
    trip.act('swap')
    assert trip.state.active == 2
    trip.approach(760, 480, '岩兎の予兆')
    wait(trip, lambda: bool(slot.cast))
    first = slot.cast
    assert first.move.id == 'RH01' and core.nextFieldImpact(trip.state, trip.actor) is not None
    trip.act('skill1')
    hp = trip.actor.hp
    wait(trip, lambda: trip.actor.y == 380, 35)
    assert not trip.actor.ground and core.nextFieldImpact(trip.state, trip.actor) is None
    assert trip.frame().companion.floatSeconds > 9
    wait(trip, lambda: first.tick >= first.move.windup)
    assert not first.seen[2] and trip.actor.hp == hp
    sequence = trip.state.seq
    trip.act('skill2')
    trip.tick(39)
    assert any(event.kind == 'hit' and event.actor == 2 and event.target == slot.enemy.id and event.seq > sequence
               for event in trip.state.events.values())
    return {'sourceSha256':trip.source, 'boss':HARE, 'move':first.move.id,
            'standingY':480, 'floatingY':380, 'outsideGroundHitbox':True, 'airBarrageHit':True}


if __name__ == '__main__':
    proof = {run.__name__: run() for run in (beidou, guard, ayaka, wanderer)}
    (ROOT/'evidence/earned-companion-defense-lua.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('Earned companion tests: the counter, guard, frost dodge and flight resolved against live field bosses.')
