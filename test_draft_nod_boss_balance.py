"""Measure the six Nod-Krai encounters from route-earned saves."""

import json

from runtime import ROOT
from test_earned_branch_quests import Journey, lua, core
from test_earned_snezhnaya_bosses import Encounter, Trial, REFERENCE_ENGINE


HUB = 'nod-town'
ENTRY = ROOT/'work/natlan-fresh-route-draft-empty/nod-save.json'
SAVES = ROOT/'work/nod-fresh-route-draft'
EARLY = {
    'knuckleDuck':122, 'battleship':128, 'frostnightHerra':128,
    'whispererNightmares':128, 'moonfly':130, 'moongecko':133,
}
REQUIRED = {
    'knuckleDuck':122, 'battleship':124, 'frostnightHerra':126,
    'whispererNightmares':128, 'moonfly':130, 'moongecko':132,
}
SPECS = {
    'knuckleDuck': Encounter('boss-24100101', 'nod-duckle-workyard', 'knuckle-duckle-commission', HUB),
    'battleship': Encounter('boss-23090101', 'nod-battleship-depot', 'battleship-commission', HUB),
    'frostnightHerra': Encounter('boss-20081001', 'nod-herra-terrace', 'frostnight-herra-commission', HUB),
    'whispererNightmares': Encounter('boss-22150101', 'nod-nightmare-shore', 'whisperer-nightmares-commission', HUB),
    'moonfly': Encounter('boss-26301101', 'nod-moonfly-hollow', 'moonfly-commission', HUB),
    'moongecko': Encounter('boss-26302101', 'nod-gecko-depths', 'moongecko-commission', HUB),
}


def check_at_gates():
    trip = Journey(ENTRY)
    assert trip.state.progression.level == 120
    trip.travel('nod-field')
    for name, spec in SPECS.items():
        guide = trip.guide(spec.arena)
        assert guide['status'] == 'blocked' and guide['requiredLevel'] == REQUIRED[name], guide
        trip.confirm_lock(spec.arena, str(REQUIRED[name]))
    return {'level':120, 'sourceSha256':trip.source, 'gates':trip.locks}


def compare():
    result = {}
    for name, spec in SPECS.items():
        level = EARLY[name]
        file = SAVES/f'earned-lv{level}.json'
        base = Trial(spec, False, file=file, engine=REFERENCE_ENGINE)
        base_result = base.finish(normal=True)
        assert base_result['damagingHits'] == 1
        draft = Trial(spec, False, file=file, engine=(lua,core))
        assert draft.trip.state.progression.level == level, (name, draft.trip.state.progression.level)
        assert draft.equipped_atk == base.equipped_atk
        draft_result = draft.finish(normal=True, ticks=12000)
        assert draft_result['damagingHits'] > 10
        assert draft_result['killXpAndMora'] == base_result['killXpAndMora']
        assert draft_result['commission'] == base_result['commission']
        result[name] = {'level':level, 'previousHp':base_result, 'comparisonHp':draft_result}
        print(name, level, base_result['damagingHits'], draft_result['elapsedSeconds'], draft_result['moves'], flush=True)
    return result


def late_trial(name, skills, *, file=SAVES/'snow-ready-save.json'):
    return Trial(SPECS[name], False, file=file, engine=(lua,core), skills=skills)


def duck():
    trial = late_trial('knuckleDuck', ('SK21','SK09','SK10'))
    trial.until(lambda: trial.slot.cast and trial.slot.cast.summons)
    summons = list(trial.slot.cast.summons.values())
    assert all(unit.repairUnit for unit in summons)
    for unit in sorted(summons, key=lambda enemy:abs(trial.trip.actor.x-enemy.x)):
        trial.until(lambda: unit.hp == 0, normal=True, skills=('SK09','SK21'), aim=unit, ticks=230)
    trial.until(lambda: trial.boss.form == 'down', ticks=30)
    assert trial.boss.duckWard == 0 and all(unit.resolved == 'destroyed' for unit in summons)
    return {**trial.finish(normal=True, skills=('SK21','SK09')), 'repairUnitsDestroyed':len(summons)}


def battleship():
    fire = ('SK21','SK22','SK24','SK23')
    trial = late_trial('battleship', fire)
    trial.until(lambda: trial.slot.cast and trial.slot.cast.move.id == 'FBT03', skills=fire)
    assert trial.boss.iceWard > 0
    trial.until(lambda: trial.boss.form == 'down', skills=fire, normal=True)
    assert trial.boss.iceWard == 0 and trial.boss.heat == 0
    return {**trial.finish(normal=True), 'heatedAndInterruptedCooling':True}


def herra():
    ice = ('SK25','SK26','SK28')
    trial = late_trial('frostnightHerra', ice, file=ROOT/'work/snez-fresh-route-draft/white-pass-save.json')
    trial.until(lambda: trial.boss.form == 'gloom')
    trial.until(lambda: trial.boss.form == 'down', skills=ice)
    assert all(trial.attacks[key] == 1 for key in ice)
    return {**trial.finish(normal=True), 'gloomBrokenByThreeCryoCasts':True}


def herra_with_ayaka():
    trip = Journey(SAVES/'earned-lv128.json')
    trip.warp(HUB)
    trip.act('companion:ayaka')
    assert trip.state.companion == 'ayaka'
    checkpoint = ROOT/'work/earned-nod-herra-ayaka.json'
    checkpoint.write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    trial = late_trial('frostnightHerra', ('SK21',), file=checkpoint)
    trial.trip.act('swap')
    assert trial.trip.state.active == 2
    trial.trip.approach(285, 480, '戦闘前の再使用待ち')
    trial.trip.tick(1560)
    trial.until(lambda: trial.boss.form == 'gloom')
    trial.trip.approach(trial.boss.x-149, 480, '高速踏込の開始位置')
    trial.trip.tick(1, trial.trip.inputs['right'])
    trial.trip.act('skill1')
    trial.step()
    trial.until(lambda: trial.boss.gloomCharges == 1, ticks=40)
    for key in ('skill2','skill4'):
        trial.until(lambda: trial.trip.actor.lock == 0
                    and 0 < (trial.boss.x-trial.trip.actor.x)*trial.trip.actor.dir < 120)
        assert (trial.trip.actor.cd[key] or 0) == 0
        trial.trip.act(key)
        trial.step()
    trial.until(lambda: trial.boss.form == 'down', ticks=110)
    trial.trip.act('swap')
    return {**trial.finish(normal=True, ticks=9600), 'level':128, 'gloomBrokenByAyaka':True}


def nightmare():
    trial = late_trial('whispererNightmares', ('SK21','SK09','SK10'))
    trial.until(lambda: trial.slot.cast and trial.slot.cast.summons)
    summons = list(trial.slot.cast.summons.values())
    assert len(summons) == 4 and trial.boss.damageShield > 400
    for unit in sorted(summons, key=lambda enemy:abs(trial.trip.actor.x-enemy.x)):
        trial.until(lambda: unit.hp == 0 or trial.boss.form == 'down', normal=True,
                    skills=('SK21','SK09','SK10'), aim=unit, ticks=450)
    assert sum(unit.hp == 0 for unit in summons) >= 1
    trial.until(lambda: trial.boss.form == 'down', normal=True, skills=('SK21','SK09'), ticks=340)
    assert trial.boss.damageShield == 0
    return {**trial.finish(normal=True, skills=('SK21','SK09'), ticks=8000),
            'fishersDefeated':sum(unit.hp == 0 for unit in summons), 'shieldBroken':True}


def moonfly():
    trial = late_trial('moonfly', ('SK21','SK17','SK18'))
    party = trial.trip.state
    mark = lambda: core.radiantCocoonEffect(party, 1)
    trial.until(lambda: mark() and mark().bound and trial.boss.form == 'winged')
    trial.until(lambda: trial.boss.element == 'pyro', skills=('SK21',), ticks=65)
    assert trial.attacks['SK21'] == 1
    trial.until(lambda: trial.boss.element == 'dendro', skills=('SK17',), ticks=65)
    assert trial.attacks['SK17'] == 1
    trial.until(lambda: mark() and not mark().bound, skills=('SK18',))
    assert trial.attacks['SK18'] == 1
    return {**trial.finish(normal=True, skills=('SK21','SK17')), 'wingElements':['pyro','dendro'],
            'cocoonReleasedByHealing':True}


def evade_cocoon():
    trial = late_trial('moonfly', ('SK21','SK17','SK18'))
    trial.until(lambda: trial.slot.cast and trial.slot.cast.move.kind == 'cocoon'
                and trial.slot.cast.tick == trial.slot.cast.move.bind-1)
    cast = trial.slot.cast
    actor, party = trial.trip.actor, trial.trip.state
    before = actor.hp
    trial.trip.act('dodge')
    assert cast.left < actor.x < cast.right and actor.inv > 0
    trial.trip.tick(1)
    assert actor.hp == before and core.radiantCocoonEffect(party, 1) is None
    return {'insideBindRange':True, 'hpBefore':before, 'hpAfter':actor.hp, 'noCocoon':True}

def gecko():
    rock = ('SK05','SK07')
    trial = late_trial('moongecko', rock+('SK18',))
    trial.until(lambda: trial.slot.cast and trial.slot.cast.summon)
    cast = trial.slot.cast
    anchor = cast.summon
    assert anchor.moonstoneAnchor and anchor.hp == 5
    before = trial.trip.state.seq
    trial.until(lambda: trial.boss.form == 'down', skills=rock, normal=True, aim=anchor)
    assert anchor.hp == 0 and cast.broken
    backlash = [event.value for event in trial.trip.state.events.values()
                if event.seq > before and event.kind == 'hit' and event.target == trial.boss.id
                and event.reaction and event.element == 'geo']
    assert len(backlash) == 1 and backlash[0] > 0
    return {**trial.finish(normal=True, skills=rock, ticks=8000), 'moonstoneAnchorBroken':True,
            'anchorBacklashDamage':backlash[0]}


def browser_checkpoint():
    trip = Journey(SAVES/'earned-lv130.json')
    trip.warp(HUB)
    skills = [['SK21'],['SK18']]+[[] for _ in range(6)]
    assert core.configure(trip.state, lua.table_from(skills, recursive=True))[0]
    trip.act('story_accept:'+SPECS['moonfly'].quest)
    assert trip.state.story.quests[SPECS['moonfly'].quest].status == 'active'
    (ROOT/'work/earned-nod-moonfly.json').write_text(
        json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')


if __name__ == '__main__':
    browser_checkpoint()
    results = {'levelGates':check_at_gates(), 'balance':compare(), 'mechanics':{},
               'cocoonDodge':evade_cocoon(), 'earlyHerra':herra_with_ayaka()}
    for test in (duck, battleship, herra, nightmare, moonfly, gecko):
        results['mechanics'][test.__name__] = test()
        print(test.__name__, 'mechanics clear', results['mechanics'][test.__name__]['elapsedSeconds'], flush=True)
    (ROOT/'evidence/draft-nod-boss-hp-lua.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
