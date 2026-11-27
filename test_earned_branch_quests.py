"""Follow Dornman Port and Frostmoon quests using controls and earned saves."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from math import ceil
from pathlib import Path

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


graph = json.loads((ROOT / 'content/story-graph.json').read_bytes())
quests = {quest['id']: quest for quest in graph['quests']}
exits = {node['id']: node['exits'] for node in graph['nodes']}
edges = {(node, exit['to']): exit for node, gates in exits.items() for exit in gates}
lua, core = runtime(draft_balance=True)
advance = lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end')

DORN, WIND_STAIRS, FLAGS, WORKS = ('dornman-camp', 'dornman-wind-stairs',
                                   'dornman-flag-trestle', 'dornman-windworks')
WIND_QUESTS = ('windward-lookouts', 'windward-flags', 'windward-tower-clear')
FROST = 'frostmoon-camp'
SURVEY, TRIAL = 'frost-wujian-access-survey', 'frost-commander-console-test'
HALL = 'frost-ancient-moon-console'
FIRST, SECOND = 'frost-commander-first-wave', 'frost-commander-second-wave'
PRISM, INNER = 'frost-prism-slime-basin', 'frost-mushteshir-inner-chamber'


class Journey(TrailWalk):
    def __init__(self, file, engine=None, *, select_traveler=False):
        self.lua, runtime_core = engine or (lua, core)
        self._advance = self.lua.eval('function(C,s,n,input) for _=1,n do C.step(s,1/60,input) end end') if engine else advance
        raw = (ROOT / 'work/cap-fresh-route-draft' / file).read_bytes()
        self.source = sha256(raw).hexdigest()
        self.itineraries, self.reports, self.battles, self.locks = [], [], [], []
        state = runtime_core.restore(self.lua.table_from(validate_save(json.loads(raw)), recursive=True), 12)
        super().__init__(self.lua, runtime_core, state, edges, exits)
        if select_traveler and state.active != 1:
            self.act('swap')
        assert state.active == 1 and not state.auto

    def act(self, action):
        self.core.action(self.state, action)

    def frame(self):
        return self.core.frame(self.state, 'sprite', 'legacy')

    def tick(self, count, controls=None):
        self._advance(self.core, self.state, count, self.idle if controls is None else controls)

    def snapshot(self):
        return validate_save(native(self.core.checkpoint(self.state)))

    def restore(self):
        self.state = self.core.restore(self.lua.table_from(self.snapshot(), recursive=True), 12)

    def warp(self, hub):
        assert self.state.story.visited[hub]
        self.act('story_fast:' + hub)
        assert self.state.story.node == hub

    def guide(self, target):
        self.act('world_map_focus:' + target)
        view = self.frame().worldMap
        assert view.selected.id == target
        selected = native(view.guide)
        self.act('world_map_close')
        return selected

    def travel(self, target):
        start = self.state.story.node
        view = self.guide(target)
        assert view['status'] in ('here', 'ready'), (start, target, view)
        stops = view['stops'] or []
        for leg in stops:
            assert self.state.story.node == leg['from']
            if leg.get('automaticArrival') or (leg['from'], leg['id']) not in edges:
                voyage = self.state.voyage
                assert voyage and voyage.destination == leg['id']
                self.tick(ceil((voyage.arrives-self.state.t)*60)+1)
                assert self.state.story.node == leg['id'] and not self.state.voyage
            else:
                self.cross(leg['id'], leg.get('gateX'))
        assert self.state.story.node == target
        self.itineraries.append(dict(start=start, destination=target, stops=stops))
        return stops

    def confirm_lock(self, target, text, gate_x=None):
        start = self.state.story.node
        edge = edges[start, target] if gate_x is None else next(
            edge for edge in exits[start] if edge['to'] == target and edge['x'] == gate_x)
        self.approach(edge['x'], edge.get('y', 480), target)
        portal = self.frame().storyNearbyPortal
        assert portal and portal.to == target and not portal.available and text in portal.reason, (
            target, native(portal),
        )
        self.act('story_nearby_portal')
        assert self.state.story.node == start
        self.locks.append(dict(node=start, target=target, reason=portal.reason))

    def mark(self, quest, index):
        mark = quests[quest]['itinerary'][index-1]
        assert self.state.story.node == mark['node']
        self.approach(mark['x'], mark.get('y', 480), quest)
        self.act('story_collect')
        assert self.state.story.quests[quest].count == index

    def report(self, quest):
        assert self.state.story.node == quests[quest]['hub']
        before = self.state.progression.total, self.state.mora
        self.act('story_report:' + quest)
        assert self.state.story.quests[quest].status == 'complete'
        after = self.state.progression.total, self.state.mora
        self.act('story_report:' + quest)
        assert after == (self.state.progression.total, self.state.mora)
        assert after[0] > before[0] and after[1] > before[1]
        self.reports.append(dict(quest=quest, xp=after[0]-before[0], mora=after[1]-before[1]))

    def fight(self, enemies, before, *, rewarded=True, guided_quest=None, allow_collateral=False):
        controls = self.lua.table(attack=True)
        remaining = list(enemies)
        while remaining:
            if guided_quest:
                guide = self.frame().storyHunts[guided_quest]
                enemy = next(e for e in remaining if e.spawnId == guide.spawn)
            else:
                enemy = remaining[0]
            remaining.remove(enemy)
            if enemy.hp > 0:
                self.approach(max(30, enemy.x-52), enemy.y, enemy.id)
            for _ in range(600):
                if enemy.hp <= 0:
                    break
                dx=enemy.x-self.actor.x
                if self.actor.dir*dx<0:
                    self.tick(1,self.inputs['right' if dx>0 else 'left'])
                else:
                    self.tick(1, controls)
            assert enemy.hp <= 0, (enemy.id, enemy.hp, self.actor.x, self.actor.dir)
        kills = self.state.kills-before[0]
        assert all(e.hp <= 0 for e in enemies)
        assert kills >= len(enemies) if allow_collateral else kills == len(enemies)
        xp = self.state.progression.killXp-before[1]
        assert (xp > 0 if rewarded else xp == 0) and self.state.returns == before[2]
        self.battles.append(dict(node=self.state.story.node, targets=[e.spawnId or e.fieldBoss for e in enemies],
                                 xp=xp, kills=kills))

    def totals(self):
        return self.state.kills, self.state.progression.killXp, self.state.returns

    def proof(self):
        return dict(sourceSha256=self.source, itineraries=self.itineraries, reports=self.reports,
                    battles=self.battles, locks=self.locks, returns=self.state.returns)


def windward(trip=None):
    if trip is None:
        trip = Journey('lv180-save.json')
        assert trip.state.progression.level == 180
    trip.warp('mond-town')
    trip.travel(DORN)
    first, second, third = WIND_QUESTS
    if not trip.state.story.quests[first]:
        trip.act('story_accept:' + second)
        assert trip.state.story.quests[second] is None
        trip.act('story_accept:' + first)
        trip.travel(WIND_STAIRS)
        for index in (1, 2, 3):
            trip.mark(first, index)
        trip.travel(DORN)
        trip.report(first)
    assert trip.state.story.quests[first].status == 'complete'
    trip.act('story_accept:' + third)
    assert trip.state.story.quests[third] is None

    trip.act('story_accept:' + second)
    trip.travel(FLAGS)
    spec = next(n['signalFlags'] for n in graph['nodes'] if n['id'] == FLAGS)

    def signal_count(frame):
        rectangles = {(d.x,d.y,d.w,d.h,d.color) for d in frame.draws.values() if d.kind == 'rect'}
        return sum((flag['x']-frame.camera+x,flag['y']+y,w,h,color) in rectangles
                   for flag in spec['flags'] for x,y,w,h,color in flag['rects'])

    assert signal_count(trip.frame()) == 0
    trip.mark(second, 1)
    trip.restore()
    assert trip.state.story.node == DORN and trip.state.story.quests[second].count == 1
    trip.travel(WIND_STAIRS)
    legs = trip.travel(FLAGS)
    assert legs[-1]['mode'] == 'lift' and '渡り廊下' in legs[-1]['hint'] and trip.actor.y == 374
    trip.mark(second, 2)
    for mode, profile in (('sprite','legacy'),('rect','h48c32'),('rect','h32c16')):
        frame = trip.core.frame(trip.state, mode, profile)
        assert signal_count(frame) == sum(len(flag['rects']) for flag in spec['flags']), profile
    trip.travel(DORN)
    trip.report(second)

    trip.act('story_accept:' + third)
    trip.travel(WORKS)
    slot = trip.state.fieldSlots['original-windward-tower']
    before = trip.totals()
    trip.fight([slot.enemy], before)
    assert slot.phase == 'respawn' and trip.state.story.quests[third].count == 1
    trip.mark(third, 2)
    trip.travel(DORN)
    trip.report(third)
    trip.restore()
    assert trip.state.story.node == DORN and trip.state.fieldSlots['original-windward-tower'].waitUntil is not None
    assert all(trip.state.story.quests[q].status == 'complete' for q in WIND_QUESTS)
    return trip.proof()


def choose_test_exit(trip, right):
    leg = trip.guide(HALL)['stops'][0]
    expected_x = 1460 if right else 94
    expected_side = '右側の門' if right else '左側の門'
    assert leg['gateX'] == expected_x and expected_side in leg['hint'], leg
    return leg


def frostmoon(trip=None):
    standalone = trip is None
    if standalone:
        trip = Journey('lv200-save.json')
    assert trip.state.progression.level == 200
    trip.warp('nod-town')
    trip.travel(FROST)
    if not trip.state.story.quests[SURVEY]:
        trip.act('story_accept:' + SURVEY)
        trip.mark(SURVEY, 1)
        trip.travel(quests[SURVEY]['itinerary'][1]['node'])
        trip.mark(SURVEY, 2)
        assert '報告' in trip.guide(HALL)['reason']
        trip.travel('frost-wujian-south-trail')
        trip.confirm_lock(PRISM, '報告')
        trip.travel(FROST)
        trip.report(SURVEY)
    assert trip.state.story.quests[SURVEY].status == 'complete'
    trip.act('story_accept:' + TRIAL)
    trip.travel(PRISM)
    trip.fight([trip.state.fieldSlots['legend-frostmoon_prism_slime'].enemy], trip.totals())
    trip.travel(HALL)
    trip.confirm_lock(FIRST, '第一試験')
    trip.mark(TRIAL, 1)
    exits_seen = []
    for stage, index in ((FIRST, 2), (SECOND, 4)):
        trip.travel(stage)
        if stage == FIRST and standalone:
            (ROOT/'work/earned-frostmoon-first-checkpoint.json').write_text(
                json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
        exits_seen.append(choose_test_exit(trip, right=False))
        before = trip.totals()
        enemies = list(trip.state.enemies.values())
        assert {enemy.spawnId for enemy in enemies} == set(quests[TRIAL]['itinerary'][index-1]['enemies'])
        trip.fight(enemies, before, guided_quest=TRIAL)
        guides = trip.frame().storyHunts
        assert not guides or not guides[TRIAL]
        assert trip.state.story.quests[TRIAL].count == index
        exits_seen.append(choose_test_exit(trip, right=True))
        selected = trip.travel(HALL)[0]
        assert selected['gateX'] == 1460 and trip.actor.y == 480
        if stage == FIRST:
            trip.restore()
            assert trip.state.story.node == FROST and trip.state.story.quests[TRIAL].count == 2
            trip.travel(HALL)
            trip.confirm_lock(SECOND, 'もう一度')
            trip.travel(FIRST)
            assert len(trip.state.enemies) == 0
            assert trip.travel(HALL)[0]['gateX'] == 94 and trip.actor.y == 409
        else:
            trip.confirm_lock(INNER, '奥の扉')
        trip.mark(TRIAL, index+1)
    trip.travel(INNER)
    trip.fight([trip.state.fieldSlots['legend-frostmoon_mushteshir'].enemy], trip.totals())
    trip.travel(FROST)
    trip.report(TRIAL)
    trip.restore()
    assert trip.state.story.node == FROST and trip.state.story.quests[TRIAL].status == 'complete'
    assert all(trip.state.endgame.bosses[id].clears == 1 for id in
               ('legend-frostmoon_prism_slime', 'legend-frostmoon_mushteshir'))
    assert '円環島へ戻る昇降機' in trip.travel('nod-town')[0]['hint']
    return trip.proof() | {'testedExitChoices': exits_seen}


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', type=Path)
    parser.add_argument('--output-dir', type=Path)
    args = parser.parse_args()
    if bool(args.from_save) != bool(args.output_dir):
        parser.error('--from-save and --output-dir must be provided together')
    if args.from_save:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        trip = Journey(args.from_save.resolve(), runtime(), select_traveler=True)
        before = trip.snapshot()['story']['quests']
        windward(trip)
        proof = frostmoon(trip)
        trip.restore()
        save = trip.snapshot()
        after = save['story']['quests']
        reports = {r['quest'] for r in trip.reports}
        assert all(after[q] == record for q, record in before.items() if record['status'] == 'complete')
        assert reports == {q for q, record in after.items()
                           if record['status'] == 'complete' and before.get(q, {}).get('status') != 'complete'}
        (args.output_dir / 'branch-save.json').write_text(json.dumps(save, ensure_ascii=False) + '\n', 'utf8')
        output = args.output_dir / 'branch-proof.json'
    else:
        proof = {'dornman':windward(), 'frostmoon':frostmoon()}
        output = ROOT / 'evidence/earned-branch-quests-lua.json'
    output.write_text(
        json.dumps(proof, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print('Dornman and Frostmoon branch quests passed, including gate selection and saved progress.')
