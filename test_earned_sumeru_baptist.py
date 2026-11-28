"""Continue the earned Lv72 Sumeru save through the Baptist commission."""
from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_inazuma_bosses import collect
from test_earned_survey_itineraries import SurveyJourney, quests, walk_objectives
from test_earned_sumeru_wenut import HUB, ENTRY, QUEST as WENUT


WORK = ROOT/'work/earned-sumeru-baptist'
SOURCE = ROOT/'work/earned-sumeru-wenut/wenut-complete.json'
BOSS, ARENA, QUEST = 'boss-22100501', 'baptist-field-sanctuary', 'baptist-commission'
VISITORS, WANDERER = 'sum-fungus-visitors', 'sum-wanderer-observation'
SURVEYS = ('sum-mapped-north-quay', 'sum-mapped-twin-shaft')
ORDER_COLOR = '#fff1b0'


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', 'utf8')


def completed_commissions(trip):
    progress = trip.snapshot()['story']['quests']
    return [key for key, q in quests.items()
            if q['kind']=='boss' and progress.get(key, {}).get('status')=='complete']


def visit(trip):
    trip.act('story_accept:'+VISITORS)
    quest = trip.state.story.quests[VISITORS]
    assert quest.status == 'active'
    collect(trip, 231)
    for destination, x, y, kill_count, objectives in (
        ('sum-visitors-meadow', 1028, 480, 4, 3),
        ('sum-visitors-terrace', 1152, 299, 3, 5),
        ('sum-visitors-store', 919, 480, 3, 7),
    ):
        trip.cross(destination)
        enemies = list(trip.state.enemies.values())
        assert len(enemies) == kill_count
        trip.fight(enemies, trip.totals())
        collect(trip, x, y)
        assert quest.count == objectives, (destination, quest.count, trip.state.storyNotice)
        if objectives == 3:
            notes = list(trip.frame().storyAirflowCue.notes.values())
    for x in (1006, 1124, 1326):
        collect(trip, x)
    assert quest.count == 10 and trip.frame().storyObservationVisitors.sample == 'stored'
    trip.approach(1006, 480, '観測器')
    trip.tick(135)
    assert trip.frame().storyObservationVisitors.quiet
    trip.act('story_collect')
    assert quest.count == 11 and list(trip.frame().storyAirflowCue.notes.values()) == notes == [349,440,392]
    trip.cross(HUB)
    trip.report(VISITORS)
    return dict(notes=notes, objectives=quest.count, report=trip.reports[-1])


def wander(trip):
    trip.act('story_accept:'+WANDERER)
    quest = trip.state.story.quests[WANDERER]
    assert quest.status == 'active'
    collect(trip, 415)
    trip.cross('sum-wanderer-trail')
    collect(trip, 287)
    collect(trip, 607, 396)
    trip.approach(711, 303, '風が通る上段')
    collect(trip, 942, 303)
    collect(trip, 1251)
    trip.cross('sum-wanderer-hollow')
    collect(trip, 273)
    collect(trip, 452)
    trip.tick(200)
    assert quest.count == 7
    trip.approach(698, 390, '谷の足場')
    trip.approach(868, 297, '調査ルートの上段')
    collect(trip, 1048, 297)
    trip.cross(HUB)
    trip.report(WANDERER)
    return dict(objectives=quest.count, report=trip.reports[-1])


def grow(trip):
    parent, hunt = 'sum-wp-28741', 'sumeru-north-forest-floor'
    trip.travel(parent)
    sorties = []
    while trip.state.progression.level < 74:
        assert len(sorties) < 30
        if trip.actor.hp < 90:
            trip.warp(HUB)
            trip.warp(parent)
        trip.cross(hunt)
        before, start = trip.totals(), trip.state.t
        trip.act('auto')
        for _ in range(560):
            trip.tick(8)
            if trip.state.progression.level >= 74 or trip.actor.hp < 65:
                break
        trip.act('auto')
        after = trip.totals()
        assert not trip.state.auto and after[2] == before[2] and after[0] > before[0], after
        sorties.append(dict(kills=after[0]-before[0], xp=after[1]-before[1],
                            seconds=round(trip.state.t-start, 2)))
        trip.cross(parent)
    trip.warp(HUB)
    return sorties


def markers(trip, expected):
    def marks(frame):
        return [(d.text,d.x,d.y) for d in frame.draws.values() if d.kind=='text' and d.color==ORDER_COLOR]
    original = marks(trip.frame())
    assert [int(label) for label, _, _ in original] == expected
    for profile in ('legacy','h48c32','h32c16'):
        assert marks(trip.core.frame(trip.state,'rect',profile)) == original
    return original


def fight(trip):
    state, player = trip.state, trip.actor
    slot = state.fieldSlots[BOSS]
    enemy = slot.enemy
    assert enemy.hp == 1090
    trip.approach(enemy.x-105, 480, ARENA)
    before, start, hp = trip.totals(), state.t, player.hp
    first, recovered, bolts = {}, set(), set()
    hit_on_recovery = False
    inputs = {(direction,attack):trip.lua.table(left=direction<0,right=direction>0,attack=attack,jump=True)
              for direction in (-1,0,1) for attack in (False,True)}
    for _ in range(7800):
        if enemy.hp <= 0:
            break
        cast, reach = slot.cast, enemy.x-player.x
        path = reach
        recovery = False
        if cast:
            move,tick = cast.move,cast.tick
            recovery = tick>=move.recover
            if tick==move.lock:
                count = 2 if move.fire else 3
                first.setdefault(move.id, dict(lock=tick, order=markers(trip,list(range(1,count+1)))))
            if move.fire:
                bolts.update(cast.projectiles.keys())
                if tick in (74,122) and player.ground:
                    trip.act('jump')
                if tick==move.fire[1]:
                    markers(trip,[2])
                if tick==move.fire[2]:
                    markers(trip,[])
            elif tick>=move.lock:
                sign = cast.dir if move.kind=='fall' else 1
                for i,w in enumerate(move.active.values()):
                    x = cast.center+(i-1)*move.spacing*88*sign
                    if w[1]-26 <= tick < w[2] and abs(player.x-x)<47:
                        path = (1 if player.x>=x else -1)*180
                if tick==move.active[1][1]:
                    markers(trip,[2,3])
            if recovery and move.id not in recovered:
                view = trip.frame().fieldBoss
                assert view.recovering and '反撃の隙' in view.label
                recovered.add(move.id)
        turn = path*player.dir<0
        direction = 1 if path>109 or (turn and path>0) else -1 if path<-109 or (turn and path<0) else 0
        attack = len(recovered)==3 and abs(reach)<125 and reach*player.dir>=0 and abs(path)<125
        prior = enemy.hp
        trip.tick(1, inputs[direction,attack])
        hit_on_recovery = hit_on_recovery or (recovery and enemy.hp<prior)
        assert state.returns==before[2] and player.hp>0
    assert slot.phase=='respawn' and state.kills==before[0]+1
    assert list(first)==['FIB01','FIB02','FIB03'] and recovered==set(first) and bolts=={1,2} and hit_on_recovery
    return dict(moves=first, bolts=sorted(bolts), recoveries=sorted(recovered), counterHit=hit_on_recovery,
                hpBefore=hp, hpAfter=player.hp, seconds=round(state.t-start,2), xp=state.progression.killXp-before[1])


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip = SurveyJourney(source, runtime())
    state = trip.state
    assert state.story.node==HUB and state.progression.level==72 and not state.inventory.sampleKit
    assert state.story.quests[WENUT].status=='complete'
    completed = completed_commissions(trip)
    assert len(completed)==13 and QUEST not in completed
    trip.cross(ENTRY)
    assert trip.guide(ARENA)['status']=='blocked'
    trip.confirm_lock(ARENA,'必要レベル 74')
    trip.cross(HUB)
    save(trip,'visitors-ready')
    visitors = visit(trip)
    save(trip,'wanderer-ready')
    wanderer = wander(trip)
    surveys = {}
    for key in SURVEYS:
        if not state.story.quests[key] or state.story.quests[key].status!='complete':
            surveys[key] = walk_objectives(trip,quests[key])
    sorties = grow(trip)
    assert state.progression.level==74
    trip.act('story_accept:'+QUEST)
    save(trip,'baptist-ready')
    route = trip.travel(ARENA)
    assert [step['id'] for step in route]==[ENTRY,ARENA]
    combat = fight(trip)
    assert state.story.quests[QUEST].count==1
    trip.travel(HUB)
    trip.report(QUEST)
    cooldown = trip.snapshot()['fieldBosses'][BOSS]
    assert cooldown['hp']==0 and cooldown['waitTicks']>0
    trip.restore()
    assert trip.snapshot()['fieldBosses'][BOSS]==cooldown
    assert trip.state.story.quests[QUEST].cycles==1 and trip.state.endgame.bosses[BOSS].clears==1
    assert all(trip.state.story.quests[key].status=='complete' for key in (WENUT,VISITORS,WANDERER,*SURVEYS,QUEST))
    assert completed_commissions(trip)==[*completed,QUEST]
    save(trip,'baptist-complete')
    return dict(sourceSha256=trip.source, gateChecks=trip.locks, visitors=visitors, wanderer=wanderer,
                surveys=surveys, reports=trip.reports, hunts=sorties, battle=combat,
                restoredCooldown=cooldown['waitTicks'], reportedCommissions=[*completed,QUEST], returns=trip.state.returns)


if __name__=='__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save', default=str(SOURCE))
    result = run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-sumeru-baptist.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(f"Lv72 to Lv74, {len(result['reportedCommissions'])} commissions reported, "
          f"Baptist defeated in {result['battle']['seconds']}s, {result['returns']} returns.")
