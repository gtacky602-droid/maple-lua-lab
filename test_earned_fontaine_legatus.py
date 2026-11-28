"""Follow the earned photo quest into both outcomes of the Legatus encounter."""
import json
from math import ceil

from runtime import ROOT, runtime
from test_earned_fontaine_generator import HUB
from test_earned_sumeru_baptist import completed_commissions
from test_earned_survey_itineraries import SurveyJourney


WORK = ROOT/'work/earned-fontaine-legatus'
APPROACH, ARENA = 'nostoi-castle-approach', 'legatus-field-hall'
BOSS, QUEST = 'boss-26140101', 'legatus-commission'
PHOTO = 'fon-navia-photo'


def save(trip, name):
    path = WORK/f'{name}.json'
    path.write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')
    return path


def read_timer(trip):
    def sample(frame):
        timer, = [d for d in frame.draws.values() if d.kind=='rect' and d.color=='#ffe392' and d.h==3]
        return frame.fieldBoss.resonatorTicks, timer.x, timer.y, timer.w

    first = sample(trip.frame())
    assert first[0]==112 and first[-1]==30
    for profile in ('legacy', 'h48c32', 'h32c16'):
        assert sample(trip.core.frame(trip.state,'rect',profile))==first
    return first


def movement(trip, boss, cast, dx):
    hero, m, t = trip.actor, cast.move, cast.tick
    jump = m.kind=='sweep' and 77<=t<84
    if m.kind=='charge' and cast.dest is not None and 88<=t<141:
        distance = (hero.x-boss.x)*cast.dir
        arrival = max(112,t)+ceil(max(0,distance-m.margin*88)*39/max(1,abs(cast.dest-cast.origin)))
        jump = distance>=-32 and 0<=arrival-t<=22
        if (hero.cd.dodge or 0)<=0 and t>=108 and abs(distance)<95 and hero.dir==-cast.dir:
            trip.act('dodge')
    if jump and hero.ground:
        trip.act('jump')
    if m.resonator and not cast.interrupted and 115<=t<181:
        gap = hero.x-cast.resonatorX
        if abs(gap)<m.width*88/2+18:
            return (160 if gap>=0 else -160), True
    return dx, False


def fight(trip, stop):
    slot, hero = trip.state.fieldSlots[BOSS], trip.actor
    boss = slot.enemy
    trip.approach(boss.x-107,480,ARENA)
    before, start = trip.totals(), trip.state.t
    moves, recovery = set(), None
    timer, device_totals = None, None
    counter_hit = False
    controls = {(direction, attack):trip.lua.table(left=direction<0,right=direction>0,attack=attack,jump=True)
                for direction in (-1,0,1) for attack in (False,True)}
    for _ in range(135*60):
        if boss.hp<=0:
            break
        cast = slot.cast
        device = cast and cast.summon
        target = device if stop and device and device.hp>0 else boss
        dx = target.x-hero.x
        turn = abs(dx)>8 and dx*hero.dir<0
        move, evade = dx, False
        if cast:
            m, t = cast.move, cast.tick
            moves.add(m.id)
            if m.resonator and timer is None and t==m.resonator.spawn:
                timer = read_timer(trip)
                device_totals = (*trip.totals(), trip.state.mora)
            if m.resonator and recovery is None and (
                (cast.interrupted and t==cast.ends-m.resonator.stagger) or
                (not cast.interrupted and t==m.recover)
            ):
                field = trip.frame().fieldBoss
                assert bool(cast.interrupted)==stop and field.resonatorTicks is None
                assert field.recovering and field.exposureTicks==144 and cast.summon is None
                assert (*trip.totals(), trip.state.mora)==device_totals
                recovery = field.exposureTicks
            move, evade = movement(trip,boss,cast,dx)
        threshold = 58 if target is not boss else 96
        direction = 1 if move>threshold or (turn and move>0) else -1 if move<-threshold or (turn and move<0) else 0
        attack = (recovery is not None or target is not boss) and abs(dx)<(95 if target is not boss else 121) and not turn and not evade
        hp = boss.hp
        trip.tick(1,controls[direction,attack])
        counter_hit |= bool(attack and target is boss and boss.form=='staggered' and boss.hp<hp)
        assert hero.hp>0 and trip.state.returns==before[2]
    assert slot.phase=='respawn' and trip.state.kills==before[0]+1
    assert moves=={'FLG01','FLG02','FLG03'} and timer and recovery and counter_hit
    return dict(moves=sorted(moves),timer=timer,interrupted=stop,recoveryTicks=recovery,counterHit=counter_hit,
                seconds=round(trip.state.t-start,2),hp=hero.hp,xp=trip.state.progression.killXp-before[1])


def run():
    locked = SurveyJourney(ROOT/'work/earned-fontaine-icewind/icewind-complete.json',runtime())
    locked.confirm_lock(APPROACH,'必要レベル 92')
    trip = SurveyJourney(WORK/'photo-complete.json',runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==92
    assert trip.state.story.quests[PHOTO].groupPhoto.posted=='candid'
    prior = set(completed_commissions(trip))
    assert len(prior)==20
    trip.act('story_accept:'+QUEST)
    seed = save(trip,'legatus-ready')
    result = dict(sourceSha256=trip.source,gateAt91=locked.locks[0]['reason'],entryLevel=92,
                  postedPhoto='菓子を囲む休憩写真',reportedCommissions=21, runs={})
    for name, stop in (('interrupt',True),('release',False)):
        trip = SurveyJourney(seed,runtime())
        if not stop:
            trip.act('hold_ally_fire')
        assert [leg['id'] for leg in trip.travel(ARENA)]==[APPROACH,ARENA]
        battle = fight(trip,stop)
        trip.travel(HUB)
        trip.report(QUEST)
        trip.restore()
        assert trip.state.story.quests[QUEST].cycles==trip.state.endgame.bosses[BOSS].clears==1
        assert set(completed_commissions(trip))==prior|{QUEST}
        cooldown = trip.snapshot()['fieldBosses'][BOSS]['waitTicks']
        assert cooldown>0
        result['runs'][name] = dict(battle=battle,report=trip.reports[-1],cooldown=cooldown,returns=trip.state.returns)
        if stop:
            save(trip,'legatus-complete')
    return result


if __name__=='__main__':
    result=run()
    (ROOT/'evidence/earned-fontaine-legatus.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(result)
