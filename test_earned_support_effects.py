"""Exercise support skills on authored terrain and live enemies with earned saves."""

import json

from runtime import ROOT
from test_earned_branch_quests import Journey, core, lua
from test_earned_companion_defense import wait


STATION = 'white-pass-station'
DAWN = 'dawn-crystal-field'


def ready(file, companion, *slots):
    trip = Journey(file)
    trip.warp(STATION)
    trip.act('companion:' + companion)
    assert trip.state.companion == companion
    if file == 'lv200-save.json':
        # Use the town's equipment actions to keep the same enemy alive across reactions.
        trip.act('weapon_equip:traveler:SW07')
        assert core.equippedWeapon(trip.state, 'traveler') == 'SW07'
        for item in trip.state.inventory['items'].values():
            if item.owner == 1 and item.slot in (2, 3):
                trip.act(f'artifact_remove:{item.id}')
                assert item.owner == 0
    loadout = [[id] for id in slots] + [[] for _ in range(8-len(slots))]
    assert core.configure(trip.state, lua.table_from(loadout, recursive=True))[0]
    return trip


def kachina():
    trip = ready('lv165-save.json', 'kachina', 'SK16')
    (ROOT/'work/earned-kachina-climb.json').write_text(
        json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    trip.approach(330, 480, '駅の登攀経路')
    trip.act('slot1')
    trip.tick(1)
    p = next(p for p in trip.state.platforms.values() if p.structure == 'vine')
    stem = p.x+p.w/2
    ally = trip.state.actors[2]
    assert abs(ally.x-stem) > 35 and ally.y == 480 and not ally.cd.skill3
    trip.approach(stem, 480, '蔦の根元')
    for _ in range(40):
        if trip.actor.y <= p.y:
            break
        trip.tick(1, trip.inputs['jump'])
    assert trip.actor.y <= p.y
    wait(trip, lambda: bool(ally.climbIntent))
    assert trip.frame().companion.climbBoostSeconds > 0
    start_y = ally.y
    trip.tick(1)
    climb_step = round(start_y-ally.y, 4)
    assert climb_step > 5.3 and core.traversalRate(trip.state, ally) == 1.25
    wait(trip, lambda: ally.y <= p.y+1)
    trip.travel('white-pass-woods')
    assert not ally.climbIntent and core.traversalRate(trip.state, ally) == 1
    return {'sourceSha256':trip.source, 'field':STATION, 'leaderCast':'SK16',
            'stem':stem, 'ledgeY':p.y, 'boostedPixelsPerTick':climb_step, 'mapExitClears':True}


def combat(trip):
    if trip.state.story.visited[DAWN]:
        trip.warp(DAWN)
    else:
        trip.travel(DAWN)
    target = min((e for e in trip.state.enemies.values() if e.y == 480), key=lambda e:e.x)
    trip.approach(max(24, target.x-124), target.y, '暁晶原の敵')
    trip.tick(1, trip.inputs['right'])
    assert trip.actor.x < target.x and target.hp > 10000
    return target


def spell(trip, index):
    wait(trip, lambda: trip.actor.lock <= 0, 120)
    trip.act('slot'+str(index))
    trip.tick(1)
    assert trip.state.macro is None


def emilie():
    trip = ready('lv200-save.json', 'emilie', 'SK21', 'SK13')
    target = combat(trip)
    rows = []
    watch = lua.eval("""function(C,state,target,record)
      local damage=C.enemyHitDamage
      C.enemyHitDamage=function(s,cast,e,mult,element,resist)
        local n,critical=damage(s,cast,e,mult,element,resist)
        if s==state and e==target and cast.id==2 and cast.key and cast.key:match('^emilie:') then
          record(cast.key, n, C.damageBonus(s,cast,element,e), e.burning~=nil, s.t)
        end
        return n,critical
      end
      return function() C.enemyHitDamage=damage end
    end""")
    reset = watch(core, trip.state, target, lambda key, damage, bonus, burning, time:
                  rows.append(dict(cast=key, damage=damage, bonus=bonus, burning=burning, t=round(time, 4))))
    try:
        spell(trip, 1)
        wait(trip, lambda: bool(target.burning or target.aura and target.aura.element == 'pyro'))
        if not target.burning:
            spell(trip, 2)
            wait(trip, lambda: bool(target.burning))
        wait(trip, lambda: any(row['burning'] and row['bonus'] > .29 for row in rows))
        wait(trip, lambda: target.burning is None, 400)
        assert trip.frame().companion.burnBoostSeconds > 0
        count = len(rows)
        wait(trip, lambda: any(not row['burning'] and row['bonus'] < .01 for row in rows[count:]))
        assert any(not row['burning'] and row['bonus'] < .01 for row in rows)
    finally:
        reset()
    return {'sourceSha256':trip.source, 'field':DAWN, 'target':target.spawnId, 'hits':rows}


def columbina():
    trip = ready('lv200-save.json', 'columbina', 'SK09', 'SK13')
    target = combat(trip)
    wait(trip, lambda: trip.frame().companion.moonDomain > 0 and trip.frame().companion.moonMark > 0)
    assert target.aura is None
    spell(trip, 1)
    spell(trip, 2)

    def support_hits():
        return [r for r in trip.state.reactions.values() if r.kind == 'moon-support' and r.owner == 1]

    marks = support_hits()
    assert len(marks) == 1 and marks[0].target == target.id
    assert target.aura.element == 'dendro' and target.aura.owner == 1
    wait(trip, lambda: trip.frame().companion.moonDomain == 0, 630)
    assert trip.frame().companion.moonMark > 0
    assert target.aura.element == 'hydro' and target.aura.companion == 'columbina'
    spell(trip, 1)
    trip.tick(20)
    assert len(support_hits()) == 1
    assert any(r.kind == 'moon-electro' and r.target == target.id and r.owner == 1
               for r in trip.state.reactions.values())
    trip.warp(STATION)
    assert trip.frame().companion.moonMark == trip.frame().companion.moonDomain == 0
    return {'sourceSha256':trip.source, 'field':DAWN, 'target':target.spawnId,
            'travelerSupportStrikes':len(marks), 'supportExcludedAfterDomainExpiry':True,
            'moonElectroWithExistingHydroAuraAfterDomainExpiry':True, 'mapExitClears':True}


if __name__ == '__main__':
    proof = {}
    for run in (kachina, emilie, columbina):
        proof[run.__name__] = run()
        print(run.__name__, 'verified from an earned save', flush=True)
    (ROOT/'evidence/earned-support-effects-lua.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
