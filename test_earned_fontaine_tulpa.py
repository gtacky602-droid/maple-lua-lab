"""Replay Emilie's perfume quest and both Tulpa outcomes from the earned Lv91 save."""
from argparse import ArgumentParser
import json
from math import isclose

from runtime import ROOT, runtime
from test_earned_fontaine_generator import FIELD,HUB
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_baptist import completed_commissions,markers
from test_earned_survey_itineraries import SurveyJourney


WORK=ROOT/'work/earned-fontaine-tulpa'
SOURCE=ROOT/'work/earned-fontaine-generator/generator-complete.json'
EMILIE, ATELIER, SHORE='fon-emilie-scent','fon-emilie-atelier','fon-emilie-scent-shore'
ARENA,BOSS,QUEST='tulpa-field-grotto','boss-20051201','tulpa-commission'


def save(trip,name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def perfume(trip):
    trip.act('story_accept:'+EMILIE)
    trip.cross(ATELIER)
    trip.mark(EMILIE,1)
    trip.cross(SHORE)
    trip.mark(EMILIE,2)
    trip.mark(EMILIE,3)
    guards=list(trip.state.enemies.values())
    assert len(guards)==1
    trip.fight(guards,trip.totals())
    trip.mark(EMILIE,5)
    trip.cross(ATELIER)
    trip.mark(EMILIE,6)
    trip.mark(EMILIE,7)
    collect(trip,842)
    assert trip.state.story.quests[EMILIE].storyChoice=='pink'
    trip.mark(EMILIE,9)
    trip.cross(HUB)
    trip.report(EMILIE)
    trip.restore()
    q=trip.state.story.quests[EMILIE]
    assert q.status=='complete' and q.cycles==1 and q.storyChoice=='pink'
    trip.cross(ATELIER)
    collect(trip,565)
    assert trip.state.storyNotice.startswith('記念小瓶「花のやわらかさ」。')
    trip.cross(HUB)
    return dict(report=trip.reports[-1],recipe='花のやわらかさ',bottleAfterReload=True)


def compare_half(trip,remaining):
    def sample(f):
        bar,=[d for d in f.draws.values() if d.kind=='rect' and d.color=='#a6eee7' and d.h==3]
        return (f.fieldBoss.summon.x,f.fieldBoss.summonTicks,bar.x,bar.y,bar.w)
    raw=sample(trip.frame())
    assert raw[1]==remaining
    for profile in ('legacy','h48c32','h32c16'):
        assert sample(trip.core.frame(trip.state,'rect',profile))==raw
    return raw


def encounter(trip,stop):
    slot=trip.state.fieldSlots[BOSS]
    boss,player=slot.enemy,trip.actor
    trip.approach(boss.x-105,480,ARENA)
    before,start,hp=trip.totals(),trip.state.t,player.hp
    moves,recovered=set(),set()
    order,timer,half_totals=None,None,None
    outcome=None
    width=None
    counter=False
    controls={(dx,attack):trip.lua.table(left=dx<0,right=dx>0,jump=True,attack=attack)
              for dx in (-1,0,1) for attack in (False,True)}
    for _ in range(8200):
        if boss.hp<=0:
            break
        cast=slot.cast
        half=cast and cast.summon
        if half and half.hp<=0:
            half=None
        target=half if stop and half else boss
        dx=target.x-player.x
        turn=dx*player.dir<0
        move=dx
        attack=abs(dx)<(94 if target==half else 125) and not turn and (target==half or counter or len(recovered)==3)
        recovery=False
        if cast:
            m,t=cast.move,cast.tick
            recovery=t>=m.recover
            if t>=m.lock:
                moves.add(m.id)
            if t>=m.lock and not recovery:
                if m.kind=='spear' and t==76 and player.ground:
                    trip.act('jump')
                elif m.kind=='hammer':
                    if t==m.lock and order is None:
                        order=markers(trip,[1,2])
                    for x,w in zip(cast.points.values(),m.active.values()):
                        if w[1]-23<=t<w[2] and abs(player.x-x)<55:
                            move=175 if player.x>=x else -175
                            attack=False
                elif m.summon:
                    if stop and t<m.summon.spawn:
                        move=cast.summonStart-player.x
                    if t==m.summon.spawn and timer is None:
                        timer=compare_half(trip,120)
                        half_totals=(*trip.totals(),trip.state.mora)
                    if t==m.summon.merge and outcome is None:
                        outcome='blocked' if cast.summonStopped else 'merged'
                        assert outcome==('blocked' if stop else 'merged')
                        assert (*trip.totals(),trip.state.mora)==half_totals
                        assert trip.frame().fieldBoss.summonTicks is None
                        assert not cast.summon
                        width=round((m.absorbedWidth if cast.absorbed else m.width)*88,2)
                        frame=trip.frame()
                        band,=[d for d in frame.draws.values() if d.kind=='rect' and d.color=='#8de7ff'
                               and d.h==2 and d.y==474 and d.w>100]
                        assert isclose(band.w,width)
                    if t==179 and player.ground:
                        trip.act('jump')
            if recovery and m.id not in recovered:
                view=trip.frame().fieldBoss
                assert view.recovering and view.exposureTicks==m.total-t
                recovered.add(m.id)
        limit=57 if target==half else 103
        direction=1 if move>limit or (turn and move>0) else -1 if move<-limit or (turn and move<0) else 0
        if len(recovered)==3 and abs(dx)<125 and not turn and (not cast or recovery):
            attack=True
        prior=boss.hp
        trip.tick(1,controls[direction,attack])
        counter=counter or (recovery and attack and boss.hp<prior)
        assert player.hp>0 and trip.state.returns==before[2]
    assert slot.phase=='respawn' and trip.state.kills==before[0]+1
    assert moves==recovered=={'FHT01','FHT02','FHT03'} and counter and outcome and timer and order
    return dict(moves=sorted(moves),hammerOrder=order,summonTimer=timer,outcome=outcome,
                surgeWidth=width,halfPaysNoRewards=True,counterHit=counter,
                hpBefore=hp,hpAfter=player.hp,seconds=round(trip.state.t-start,2),xp=trip.state.progression.killXp-before[1])


def scenario(source,stop,prior):
    trip=SurveyJourney(source,runtime())
    if not stop:
        trip.act('hold_ally_fire')
    assert [stop['id'] for stop in trip.travel(ARENA)]==[FIELD,ARENA]
    fight=encounter(trip,stop)
    assert trip.state.story.quests[QUEST].count==1
    trip.travel(HUB)
    trip.report(QUEST)
    cooldown=trip.snapshot()['fieldBosses'][BOSS]
    trip.restore()
    assert cooldown['waitTicks']>0 and trip.snapshot()['fieldBosses'][BOSS]==cooldown
    assert trip.state.story.quests[QUEST].cycles==trip.state.endgame.bosses[BOSS].clears==1
    assert set(completed_commissions(trip))=={*prior,QUEST}
    if stop:
        save(trip,'tulpa-complete')
    return dict(fight=fight,report=trip.reports[-1],heldAllyFire=not stop,
                restoredCooldown=cooldown['waitTicks'],returns=trip.state.returns)


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(source,runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==91 and not trip.state.inventory.sampleKit
    prior=completed_commissions(trip)
    assert len(prior)==17
    record=perfume(trip)
    level=trip.state.progression.level
    trip.act('story_accept:'+QUEST)
    save(trip,'tulpa-ready')
    seed=WORK/'tulpa-ready.json'
    return dict(sourceSha256=trip.source,perfume=record,entryLevel=level,commissionCount=len(prior)+1,
                stopped=scenario(seed,True,prior),merged=scenario(seed,False,prior))


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-fontaine-tulpa.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(result)
