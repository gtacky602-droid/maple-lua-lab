"""Play the earned Fontaine finale and field generator commission."""
from argparse import ArgumentParser
import json

from experience import CHAPTER_CLEAR_EXP, QUEST_REPORT_EXP
from runtime import ROOT, runtime
from test_earned_fontaine_seahorse import FURINA, HUB
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_baptist import completed_commissions
from test_earned_survey_itineraries import SurveyJourney


WORK=ROOT/'work/earned-fontaine-generator'
SOURCE=ROOT/'work/earned-fontaine-seahorse/seahorse-complete.json'
CHAPTER,WATCH,BOOTH,RUNWAY,STAGE=('fontaine-grand-finale','fontaine-stage-watch','fontaine-scenery-booth',
    'fontaine-grand-stage-approach','fontaine-grand-stage')
STAGE_BOSS='original-grand-finale'
FIELD,ARENA,BOSS,QUEST=('fontaine-field','field-generator-field-chamber','boss-24080101','field-generator-commission')


def save(trip,name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def curtain_call(trip):
    trip.act('story_accept:'+CHAPTER)
    trip.cross(WATCH)
    trip.mark(CHAPTER,1)
    trip.cross(BOOTH)
    trip.approach(700,480,'舞台設備を選ぶ')
    for _ in range(2):
        trip.act('story_collect')
    assert trip.frame().storyAirflow.selection=='床板を伸ばして上段を広げる'
    trip.act('story_airflow_commit')
    trip.restore()
    assert trip.state.story.node==WATCH and trip.state.story.quests[CHAPTER].stagePlan=='deck'
    trip.cross(BOOTH)
    trip.cross(RUNWAY)
    assert trip.frame().storyStageLayout=='deck'
    trip.approach(571,480,'幕前の足場')
    trip.act('jump')
    right=trip.lua.table(right=True,jump=True)
    for _ in range(90):
        if trip.actor.ground and trip.actor.y==391 and trip.actor.x>=740:
            break
        trip.tick(1,right if trip.actor.x<740 else trip.inputs['jump'])
    else:
        raise AssertionError((trip.actor.x,trip.actor.y))
    trip.fight(list(trip.state.enemies.values()),trip.totals())
    q=trip.state.story.quests[CHAPTER]
    assert q.count==3
    trip.cross(STAGE)
    enemy,=list(trip.state.enemies.values())
    assert enemy.fieldBoss==STAGE_BOSS
    prior=trip.state.progression.questXp
    trip.fight([enemy],trip.totals(),rewarded=False)
    first=trip.state.progression.questXp-prior
    assert first==CHAPTER_CLEAR_EXP['Q-FON-M03:BOSS_FIRST'] and q.count==4
    trip.mark(CHAPTER,5)
    trip.approach(1447,390,'幕の合図灯')
    trip.act('story_collect')
    trip.act('story_collect')
    assert q.count==5 and 'まだ合図の前' in trip.state.storyNotice
    trip.tick(95)
    assert trip.frame().storyTheaterPerformance.phase=='cue'
    trip.act('story_collect')
    assert q.count==6
    phases=[]
    for delay,expected in ((0,'lights'),(41,'wave'),(46,'bow')):
        if delay:
            trip.tick(delay)
        staged=trip.frame().storyFurinaFinale
        assert staged.phase==expected
        phases.append(expected)
    trip.cross(HUB,gate_x=1602)
    trip.report(CHAPTER)
    report=trip.reports[-1]
    assert report['xp']==QUEST_REPORT_EXP['Q-FON-M03']
    trip.restore()
    assert trip.state.story.quests[CHAPTER].cycles==1
    assert trip.state.endgame.bosses[STAGE_BOSS].clears==1
    trip.cross(STAGE)
    collect(trip,1447,390)
    assert trip.state.storyNotice.startswith('主舞台の記録') and not list(trip.state.enemies.values())
    trip.cross(HUB,gate_x=1602)
    return dict(stagePlan='deck',firstClearXp=first,report=report,rehearsedPhases=phases,recordAfterReload=True)


def jump_height(trip,observe=None):
    start=apex=trip.actor.y
    trip.act('jump')
    for _ in range(140):
        trip.tick(1,trip.inputs['jump'])
        if observe:
            observe()
        apex=min(apex,trip.actor.y)
        if trip.actor.ground and apex<start:
            return round(start-apex,2)
    raise AssertionError('Jump did not finish')


def compare_pulse_display(trip):
    def sample(frame):
        return [(d.text,d.x,d.y,d.color) for d in frame.draws.values()
                if d.kind=='text' and d.text in ('1','2','3') and d.size==13]
    frame=trip.frame()
    order=sample(frame)
    assert [d[0] for d in order]==['1','2','3']
    assert frame.fieldBoss.gravityTicks==144 and frame.fieldBoss.gravity.factor==.55
    for profile in ('legacy','h48c32','h32c16'):
        assert sample(trip.core.frame(trip.state,'rect',profile))==order
    return order


def generator(trip):
    slot=trip.state.fieldSlots[BOSS]
    boss,player=slot.enemy,trip.actor
    trip.approach(boss.x-104,480,ARENA)
    before,start,hp=trip.totals(),trip.state.t,player.hp
    normal=jump_height(trip)
    moves,bolts,recoveries=set(),set(),set()
    pulses=[]
    low=None
    order=[]
    ended=False
    counter=False

    def observe_pulse():
        cast=slot.cast
        if cast.move.kind=='quake' and cast.tick in (114,146,178):
            frame=trip.frame()
            active=[int(d.text) for d in frame.draws.values()
                    if d.kind=='text' and d.size==13 and d.color=='#fff1c4' and d.text in ('1','2','3')]
            assert active==[1+(cast.tick-114)//32], (cast.tick,active)
            pulses.append(cast.tick)

    controls={(dx,attack):trip.lua.table(left=dx<0,right=dx>0,attack=attack,jump=True)
              for dx in (-1,0,1) for attack in (False,True)}
    for _ in range(7800):
        if boss.hp<=0:
            break
        cast=slot.cast
        recovery=False
        dx=boss.x-player.x
        move=dx
        if cast:
            m,t=cast.move,cast.tick
            recovery=t>=m.recover
            if t>=m.lock:
                moves.add(m.id)
            if m.fire:
                bolts.update(cast.projectiles.keys())
                bolts.update(cast.shots.keys())
            if cast.field:
                if t==72 and not order:
                    order=compare_pulse_display(trip)
                if not ended:
                    observe_pulse()
                if t==90 and not low and player.ground:
                    prior=player.hp
                    low=jump_height(trip,observe_pulse)
                    assert player.hp==prior
                if t==215:
                    assert trip.frame().fieldBoss.gravityTicks==1
                if t==216:
                    assert trip.frame().fieldBoss.gravity is None and trip.frame().fieldBoss.gravityTicks is None
                    ended=True
                if t<188:
                    move=0
            elif t>=m.lock and not recovery:
                move=dx-cast.dir*98
            if recovery and m.id not in recoveries:
                assert trip.frame().fieldBoss.recovering
                recoveries.add(m.id)
        turn=dx*player.dir<0
        direction=1 if move>108 or (turn and move>0) else -1 if move<-108 or (turn and move<0) else 0
        if cast and not cast.field and cast.tick>=cast.move.lock and not recovery:
            direction=1 if move>9 else -1 if move<-9 else 0
        prior=boss.hp
        attack=ended and abs(dx)<125 and not turn and (not cast or recovery)
        trip.tick(1,controls[direction,attack])
        counter=counter or (attack and recovery and boss.hp<prior)
        assert trip.state.returns==before[2] and player.hp>0
    assert slot.phase=='respawn' and trip.state.kills==before[0]+1
    assert moves==recoveries=={'FFG01','FFG02','FFG03'} and bolts=={1,2} and ended and counter
    assert set(pulses)=={114,146,178} and low>normal*1.7
    return dict(moves=sorted(moves),order=order,bolts=sorted(bolts),pulseTicks=sorted(set(pulses)),
                jumpHeight=dict(normal=normal,inside=low),gravityEnded=ended,counterHit=counter,
                hpBefore=hp,hpAfter=player.hp,seconds=round(trip.state.t-start,2),xp=trip.state.progression.killXp-before[1])


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(source,runtime())
    assert trip.state.progression.level==85 and trip.state.story.node==HUB
    assert trip.state.story.quests[FURINA].status=='complete'
    prior=completed_commissions(trip)
    assert len(prior)==16
    trip.cross(FIELD)
    assert trip.guide(ARENA)['status']=='blocked'
    trip.confirm_lock(ARENA,'必要レベル 86')
    trip.cross(HUB)
    chapter=curtain_call(trip)
    level=trip.state.progression.level
    assert level==90
    trip.act('story_accept:'+QUEST)
    save(trip,'generator-ready')
    assert [stop['id'] for stop in trip.travel(ARENA)]==[FIELD,ARENA]
    combat=generator(trip)
    assert trip.state.story.quests[QUEST].count==1
    trip.travel(HUB)
    trip.report(QUEST)
    cooldown=trip.snapshot()['fieldBosses'][BOSS]
    trip.restore()
    assert trip.state.story.quests[QUEST].cycles==trip.state.endgame.bosses[BOSS].clears==1
    assert cooldown['waitTicks']>0 and trip.snapshot()['fieldBosses'][BOSS]==cooldown
    assert set(completed_commissions(trip))=={*prior,QUEST}
    save(trip,'generator-complete')
    return dict(sourceSha256=trip.source,gateChecks=trip.locks,chapter=chapter,entryLevel=level,
                finishLevel=trip.state.progression.level,combat=combat,report=trip.reports[-1],
                restoredCooldown=cooldown['waitTicks'],commissionCount=len(prior)+1,returns=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-fontaine-generator.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(result)
