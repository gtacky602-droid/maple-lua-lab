"""Walk both Icewind commissions from the earned Fontaine checkpoint."""
import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey
from test_earned_fontaine_generator import HUB
from test_earned_sumeru_baptist import completed_commissions, markers


WORK = ROOT/'work/earned-fontaine-icewind'
SOURCE = ROOT/'work/earned-fontaine-tulpa/tulpa-complete.json'
ENTRANCE = 'icewind-promenade'
VARIANTS = ('icewind-coppelia', 'icewind-coppelius')


def dodge(hero, cast, dx):
    move, t = cast.move, cast.tick
    starts = [w[1] for w in move.active.values()]
    if move.kind == 'wind':
        for index, window in enumerate(move.active.values()):
            if cast.center is not None and window[1]-23 <= t < window[2]:
                center = cast.center+(index-1)*move.spacing*88
                if abs(hero.x-center) < 52:
                    return (160 if hero.x>=center else -160), True, False
        return dx, False, False
    if move.kind == 'ice':
        gap = (hero.x-cast.origin)*cast.dir
        delay = round(max(0, gap-44)/(move.speed*88/60))
        starts = [tick+delay for tick in move.fire.values()] if gap>30 else []
    if move.kind == 'guard' and any(tick-40<=t<tick+12 for tick in starts):
        if abs(hero.x-cast.origin) < 180:
            return (170 if hero.x>=cast.origin else -170), True, False
        return 0, True, False
    return dx, False, any(start-24<=t<=start-18 for start in starts)


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def show_cues(trip, cast, seen, recovery):
    move, t = cast.move, cast.tick
    windows = move.fire if move.fire else move.active
    if t == move.lock and move.id not in seen:
        order = markers(trip, list(range(1,len(windows)+1)))
        assert len({mark[1] for mark in order})==len(windows)
        elements = [d.y for d in trip.frame().draws.values() if d.kind=='text' and d.text in ('風','氷')]
        assert len(elements)==2 and max(mark[2] for mark in order)+22<min(elements)
        seen[move.id] = order
    if t == (move.fire[1] if move.fire else move.active[1][2]):
        expected = [str(i) for i in range(2,len(windows)+1)]
        actual = [d.text for d in trip.frame().draws.values() if d.kind=='text' and d.color=='#fff1b0']
        assert actual==expected
    if t == move.recover and move.id not in recovery:
        field = trip.frame().fieldBoss
        assert field.recovering and field.exposureTicks==move.total-t
        recovery[move.id] = field.exposureTicks


def clear(trip, slot):
    lead, hero = slot.enemy, trip.actor
    partner = lead.fieldPartner
    start = trip.state.t
    seen, recovery = {}, {}
    counter_hit = False
    controls = {(direction, attack): trip.lua.table(left=direction<0, right=direction>0, attack=attack, jump=True)
                for direction in (-1, 0, 1) for attack in (False, True)}
    for _ in range(125*60):
        if lead.hp<=0:
            break
        cast = slot.cast
        target = partner if lead.form=='guarded' else min((lead, partner), key=lambda e: abs(e.x-hero.x))
        dx = target.x-hero.x
        turn = abs(dx)>8 and dx*hero.dir<0
        move, evade, jump = dx, False, False
        if cast:
            show_cues(trip, cast, seen, recovery)
            move, evade, jump = dodge(hero, cast, dx)
        if jump and hero.ground:
            trip.act('jump')
        direction = 1 if move>85 or (turn and move>0) else -1 if move<-85 or (turn and move<0) else 0
        attack = len(recovery)==3 and abs(dx)<120 and not turn and not evade
        hp = lead.hp
        trip.tick(1, controls[direction, attack])
        counter_hit |= bool(cast and cast.tick>=cast.move.recover and attack and lead.hp<hp)
        assert trip.state.returns==0 and partner.hp==lead.hp
    assert lead.hp==0 and set(seen)==set(recovery) and len(seen)==3 and counter_hit, (lead.hp, seen, recovery, counter_hit)
    return dict(seconds=round(trip.state.t-start,2), hp=hero.hp, marks=seen,
                recoveryTicks=recovery, counterHit=counter_hit)


def run():
    WORK.mkdir(parents=True,exist_ok=True)
    trip = Journey(SOURCE, runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==91
    prior = set(completed_commissions(trip))
    assert len(prior)==18
    quests = [variant+'-commission' for variant in VARIANTS]
    for quest in quests:
        trip.act('story_accept:'+quest)
    save(trip,'icewind-ready')
    checks = {}
    for index, (variant, quest) in enumerate(zip(VARIANTS, quests), 1):
        arena = variant+'-field'
        trip.cross(ENTRANCE)
        trip.cross(arena)
        slot = trip.state.fieldSlots[variant]
        boss = slot.enemy
        trip.approach(min(boss.x, boss.fieldPartner.x)-110,480,arena)
        kills, xp, mora = trip.state.kills, trip.state.progression.killXp, trip.state.mora
        battle = clear(trip, slot)
        assert trip.state.kills==kills+1 and trip.state.mora==mora+325
        assert trip.state.progression.killXp>xp
        assert trip.state.story.quests[quest].count==1
        if index==1:
            assert trip.state.story.quests[quests[1]].count==0
        trip.cross(ENTRANCE)
        trip.cross(HUB)
        trip.report(quest)
        assert trip.reports[-1]==dict(quest=quest, xp=6000, mora=400)
        trip.restore()
        cooldown = trip.snapshot()['fieldBosses'][variant]
        assert cooldown['hp']==0 and cooldown['waitTicks']>0
        assert set(completed_commissions(trip))==prior|set(quests[:index])
        checks[variant] = dict(battle=battle, report=trip.reports[-1], restoredCooldown=cooldown['waitTicks'])
    assert all(trip.state.endgame.bosses[boss].clears==1 for boss in VARIANTS)
    save(trip,'icewind-complete')
    return dict(sourceSha256=trip.source, startLevel=91, endLevel=trip.state.progression.level,
                reportedCommissions=len(completed_commissions(trip)), returns=trip.state.returns,
                separateRecords=checks)


if __name__=='__main__':
    result = run()
    (ROOT/'evidence/earned-fontaine-icewind.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(result)
