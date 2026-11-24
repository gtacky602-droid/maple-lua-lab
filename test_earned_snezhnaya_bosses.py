"""Clear four normal-boss commissions using runtime inputs and an earned save."""

from dataclasses import dataclass
from functools import cache
import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey


@dataclass(frozen=True)
class Encounter:
    id: str
    arena: str
    quest: str
    hub: str = 'snezhnaya-hub'


ENCOUNTERS = {
    'flugel': Encounter('boss-26310501', 'flugel-tundra-basin', 'flugel-commission'),
    'driftingSnow': Encounter('boss-25135202', 'drifting-snow-court', 'drifting-snow-commission'),
    'immortalConstruct': Encounter('boss-25140101', 'immortal-construct-root-hollow', 'immortal-construct-commission'),
    'wavebinder': Encounter('boss-25134601', 'wavebinder-tide-cavern', 'wavebinder-commission', 'novokichev-camp'),
}
SKILLS = ('SK21', 'SK09', 'SK10', 'SK13')
@cache
def reference_engine():
    return runtime(draft_balance=True, draft_field_boss_hp=False)


class Trial:
    def __init__(self, spec, controlled, *, file='lv165-save.json', engine=None, skills=SKILLS):
        self.spec = spec
        self.skills = skills
        self.trip = Journey(file, engine=engine if engine is not None else reference_engine())
        self.controls = {
            (move, attack): self.trip.lua.table(left=move == -1, right=move == 1, attack=attack)
            for move in (-1, 0, 1) for attack in (False, True)
        }
        start = spec.hub if self.trip.state.story.visited[spec.hub] else 'snezhnaya-hub'
        self.trip.warp(start)
        if controlled:
            self.trip.act('companion:kachina')
            self.trip.act('weapon_equip:traveler:SW03')
            assert self.trip.core.equippedWeapon(self.trip.state, 'traveler') == 'SW03'
            for item in self.trip.state.inventory['items'].values():
                if item.owner == 1 and item.slot in (2, 3):
                    self.trip.act(f'artifact_remove:{item.id}')
            assert 0 < self.trip.actor.atk < 70
        slots = [[key] for key in skills] + [[] for _ in range(8-len(skills))]
        assert self.trip.core.configure(self.trip.state, self.trip.lua.table_from(slots, recursive=True))[0]
        if spec.hub != self.trip.state.story.node:
            self.trip.travel(spec.hub)
        self.trip.act('story_accept:'+spec.quest)
        assert self.trip.state.story.quests[spec.quest].status == 'active'
        if controlled and spec.quest == 'drifting-snow-commission':
            (ROOT/'work/earned-drifting-snow.json').write_text(
                json.dumps(self.trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
        self.paths = [leg['id'] for leg in self.trip.travel(spec.arena)]
        self.slot = self.trip.state.fieldSlots[spec.id]
        self.boss = self.slot.enemy
        self.max_hp = self.boss.maxhp
        self.moves = []
        self.attacks = {key:0 for key in skills}
        self.kills = self.trip.state.kills
        self.hits = self.trip.state.hits
        self.totals = self.trip.state.progression.killXp, self.trip.state.mora
        self.returns = self.trip.state.returns
        self.started = self.trip.state.t
        self.equipped_atk = [a.atk for a in self.trip.state.actors.values()]

    def step(self, *, normal=False, skills=(), aim=None):
        actor = self.trip.actor
        target = self.boss if aim is None else aim
        dx = target.x - actor.x
        distance = abs(dx)
        correct_side = dx*actor.dir >= 0
        move = 0
        if distance > 86 or not correct_side:
            move = 1 if dx > 0 else -1
        elif distance < 64:
            move = -1 if dx > 0 else 1
        attack = normal and correct_side and distance < 118
        chosen = None
        if actor.lock <= 0 and correct_side and distance < 160:
            for key in skills:
                if (actor.cd[key] or 0) > 0:
                    continue
                self.trip.act('slot'+str(self.skills.index(key)+1))
                chosen = key
                attack = False
                break
        self.trip.tick(1, self.controls[move, attack])
        if chosen:
            assert actor.cd[chosen] > 0
            self.attacks[chosen] += 1
        cast = self.slot.cast
        if cast and cast.move.id not in self.moves:
            self.moves.append(cast.move.id)

    def until(self, predicate, *, ticks=3600, **inputs):
        for _ in range(ticks):
            if predicate():
                return
            assert self.trip.state.returns == self.returns and self.boss.hp > 0, self.diagnose()
            self.step(**inputs)
        raise AssertionError(self.diagnose())

    def diagnose(self):
        cast = self.slot.cast
        return (self.spec.quest, self.boss.hp, self.boss.form, cast and cast.move.id,
                cast and cast.tick, self.moves, self.attacks, self.trip.actor.x, self.boss.x)

    def finish(self, **inputs):
        self.until(lambda: self.slot.phase == 'respawn', **inputs)
        state = self.trip.state
        elapsed = round(state.t-self.started, 3)
        hits = state.hits-self.hits
        assert self.boss.hp == 0 and state.kills == self.kills+1 and state.returns == self.returns
        assert state.story.quests[self.spec.quest].count == 1
        loot = [state.progression.killXp-self.totals[0], state.mora-self.totals[1]]
        assert min(loot) > 0
        self.trip.travel(self.spec.hub)
        self.trip.report(self.spec.quest)
        self.trip.restore()
        state = self.trip.state
        assert state.story.quests[self.spec.quest].status == 'complete'
        assert state.endgame.bosses[self.spec.id].clears >= 1
        return {'sourceSha256':self.trip.source, 'boss':self.spec.id, 'arena':self.spec.arena,
                'entryRoute':self.paths, 'maxHp':self.max_hp, 'partyAttack':self.equipped_atk,
                'elapsedSeconds':elapsed, 'damagingHits':hits, 'moves':self.moves, 'skillCasts':self.attacks,
                'killXpAndMora':loot, 'commission':self.trip.reports[0], 'savedClear':True}


def wavebinder():
    t = Trial(ENCOUNTERS['wavebinder'], True)
    t.until(lambda: t.slot.cast and t.slot.cast.drinkOpen)
    t.until(lambda: t.boss.downReason == 'drink', skills=('SK09','SK10'), ticks=150)
    assert t.boss.drinkInterrupts == 1 and not t.boss.valiant
    assert t.attacks['SK09'] == t.attacks['SK10'] == 1
    return {**t.finish(normal=True, skills=('SK21','SK09')), 'drinkInterruptedByTwoElectroCasts':True}


def immortal():
    t = Trial(ENCOUNTERS['immortalConstruct'], True)
    t.until(lambda: t.boss.lifeUnits == 12)
    t.until(lambda: t.boss.form == 'down', normal=True)
    assert t.boss.lifeUnits == 0 and t.boss.shieldBreaks == 6
    return {**t.finish(normal=True, skills=('SK21','SK09')), 'lifeLayersBrokenWithNormalAttacks':6}


def drifting_snow():
    t = Trial(ENCOUNTERS['driftingSnow'], True)
    t.until(lambda: t.boss.coffinLayers == 8, normal=True)
    t.until(lambda: t.boss.form == 'down', normal=True, skills=('SK21','SK09','SK10'), ticks=360)
    assert t.boss.coffinUsed and t.boss.coffinLayers == 0
    return {**t.finish(normal=True), 'coffinBroken':True}


def flugel():
    t = Trial(ENCOUNTERS['flugel'], True)
    t.until(lambda: t.boss.downReason == 'ward', normal=True, skills=('SK21','SK13'))
    assert t.boss.ward == 0
    t.until(lambda: t.boss.mode == 'anemo')
    t.until(lambda: t.slot.cast and t.slot.cast.summons is not None)
    cast = t.slot.cast
    for _ in range(240):
        if t.boss.downReason == 'orbs':
            break
        assert t.slot.cast and t.slot.cast.summons and t.boss.hp > 0
        target = min((e for e in cast.summons.values() if e.hp > 0),
                     key=lambda enemy:abs(enemy.x-t.trip.actor.x))
        t.step(normal=True, skills=('SK09','SK21','SK10'), aim=target)
    assert t.boss.downReason == 'orbs' and cast.brokenOrbs >= 3
    return {**t.finish(normal=True, skills=('SK21','SK09')), 'wardBrokenAndSwitchedToAnemo':True,
            'windOrbsBroken':cast.brokenOrbs}


if __name__ == '__main__':
    proof = {'level':165, 'draftBalance':True, 'tests':{}, 'unchangedGear':{}}
    for test in (wavebinder, immortal, drifting_snow, flugel):
        proof['tests'][test.__name__] = test()
        print(test.__name__, proof['tests'][test.__name__]['elapsedSeconds'], flush=True)
    for name, spec in ENCOUNTERS.items():
        baseline = Trial(spec, False).finish(normal=True)
        proof['unchangedGear'][name] = {key:baseline[key] for key in
                                       ('boss', 'elapsedSeconds', 'damagingHits', 'partyAttack', 'moves')}
        print(name, 'unchanged gear hits', baseline['damagingHits'], flush=True)
    (ROOT/'evidence/earned-snezhnaya-bosses-lua.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
