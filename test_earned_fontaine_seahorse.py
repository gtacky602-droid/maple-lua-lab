"""Report Furina's rehearsal and replay two earned Seahorse clears."""
from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_fontaine_emperor import FIELD, HUB, REHEARSAL
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_baptist import completed_commissions
from test_earned_survey_itineraries import SurveyJourney


WORK = ROOT/'work/earned-fontaine-seahorse'
SOURCE = ROOT/'work/earned-fontaine-emperor/emperor-complete.json'
FURINA='fon-furina-cues'
ARENA,BOSS,QUEST='seahorse-field-cavern','boss-26180101','seahorse-commission'


def save(trip,name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def rehearse(trip):
    trip.act('story_accept:'+FURINA)
    trip.cross(REHEARSAL)
    collect(trip,245)
    collect(trip,454)
    for cue in ('curtain','lamp','wave'):
        trip.act('story_rehearsal:'+cue)
    assert trip.state.story.quests[FURINA].count==2
    trip.restore()
    assert trip.state.story.node==REHEARSAL and trip.state.story.quests[FURINA].count==2
    collect(trip,454)
    trip.act('story_rehearsal:pair')
    early=trip.frame().storyFurinaRehearsal
    assert not early.curtain and '一拍待ち' in early.message
    trip.tick(300)
    trip.act('story_rehearsal:pair')
    paired=trip.frame().storyFurinaRehearsal
    assert paired.curtain and paired.light and not paired.wave
    trip.tick(75)
    trip.act('story_rehearsal:wave')
    assert trip.state.story.quests[FURINA].count==3
    collect(trip,245)
    assert trip.state.story.quests[FURINA].count==4
    trip.cross(HUB)
    trip.report(FURINA)
    trip.restore()
    assert trip.state.story.quests[FURINA].cycles==1 and trip.state.story.quests[FURINA].status=='complete'
    return dict(earlyCueRejected=True,restoredFirstRehearsal=True,report=trip.reports[-1])


def compare_timer(trip,key,expected):
    def sample(frame):
        timer, = [d for d in frame.draws.values() if d.kind=='rect' and d.color=='#a6eee7' and d.h==3]
        return (frame.fieldBoss[key],timer.x,timer.y,timer.w)
    old=sample(trip.frame())
    assert old[0]==expected
    for profile in ('legacy','h48c32','h32c16'):
        assert sample(trip.core.frame(trip.state,'rect',profile))==old
    return list(old)


def encounter(trip,interrupt):
    slot=trip.state.fieldSlots[BOSS]
    boss,player=slot.enemy,trip.actor
    trip.approach(boss.x-99,480,ARENA)
    before,start,hp=trip.totals(),trip.state.t,player.hp
    assert boss.maxhp==1010
    moves,bolts=set(),set()
    opening,wait=None,None
    progress=set()
    flight,stopped,landed,counter=False,False,False,False
    jumps={'FSH01':(76,),'FSH02':(79,127),'FSH03':(109,)}
    inputs={(dx,attack):trip.lua.table(left=dx<0,right=dx>0,attack=attack,jump=True)
            for dx in (-1,0,1) for attack in (False,True)}
    for _ in range(7800):
        if boss.hp<=0:
            break
        cast=slot.cast
        allow=counter or stopped or landed
        if cast:
            m,t=cast.move,cast.tick
            if t==m.lock:
                moves.add(m.id)
            if m.fire:
                bolts.update(cast.projectiles.keys())
                bolts.update(cast.shots.keys())
            if m.air:
                if t==m.lock and opening is None:
                    opening=compare_timer(trip,'coreWindowTicks',m.air[1]-m.lock)
                    view=trip.frame()
                    target, = [d for d in view.draws.values() if d.text=='着地点']
                    assert view.fieldBoss.destinationX==cast.dest and target.x==cast.dest-view.camera
                if boss.weakpoint:
                    progress.add(boss.weakpoint.hits)
                    allow=interrupt
                if boss.flying:
                    flight=True
                if cast.interrupted and not stopped:
                    assert boss.form=='dim' and boss.x==cast.origin and not boss.flying
                    view=trip.frame()
                    assert view.fieldBoss.destinationX is None
                    assert not any(d.text=='着地点' for d in view.draws.values())
                    assert not cast.seen[1]
                    stopped=True
                if t==m.active[1][1] and not cast.interrupted:
                    assert boss.x==cast.dest and boss.y==480 and not boss.flying
                    landed=True
                if t>=m.recover and wait is None:
                    wait=compare_timer(trip,'exposureTicks',m.total-t)
                    assert '消灯・反撃' in trip.frame().fieldBoss.label
            if t in jumps[m.id] and player.ground:
                trip.act('jump')
        dx=boss.x-player.x
        turn=dx*player.dir<0
        direction=1 if dx>106 or (turn and dx>0) else -1 if dx<-106 or (turn and dx<0) else 0
        attack=allow and abs(dx)<125 and not turn
        prior=boss.hp
        dim=boss.form=='dim'
        trip.tick(1,inputs[direction,attack])
        counter=counter or (dim and attack and boss.hp<prior)
        assert trip.state.returns==before[2] and player.hp>0
    assert slot.phase=='respawn' and trip.state.kills==before[0]+1
    assert moves==set(jumps) and counter and bolts=={1,2} and opening and wait, (moves,counter,bolts,opening,wait)
    assert stopped==interrupt and landed==flight==(not interrupt), (stopped,flight,landed)
    assert 0 in progress and progress<={0,1}, progress
    if interrupt:
        assert 1 in progress
    else:
        assert progress=={0}
    return dict(moves=sorted(moves),weakpoint=opening,recovery=wait,pearlProgress=sorted(progress),
                interrupted=stopped,landed=landed,hitDuringRecovery=counter,bolts=sorted(bolts),
                hpBefore=hp,hpAfter=player.hp,seconds=round(trip.state.t-start,2),xp=trip.state.progression.killXp-before[1])


def campaign_clear(source,interrupt,prior):
    trip=SurveyJourney(source,runtime())
    assert trip.state.story.quests[FURINA].status=='complete'
    if not interrupt:
        trip.act('hold_ally_fire')
    route=trip.travel(ARENA)
    assert [leg['id'] for leg in route]==[FIELD,ARENA]
    fight=encounter(trip,interrupt)
    assert trip.state.story.quests[QUEST].count==1
    trip.travel(HUB)
    trip.report(QUEST)
    cooldown=trip.snapshot()['fieldBosses'][BOSS]
    trip.restore()
    assert cooldown['waitTicks']>0 and trip.snapshot()['fieldBosses'][BOSS]==cooldown
    assert trip.state.story.quests[QUEST].cycles==trip.state.endgame.bosses[BOSS].clears==1
    assert set(completed_commissions(trip))=={*prior,QUEST}
    if interrupt:
        save(trip,'seahorse-complete')
    return dict(fight=fight,heldAllyFire=not interrupt,report=trip.reports[-1],
                restoredCooldown=cooldown['waitTicks'],returns=trip.state.returns)


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(source,runtime())
    assert trip.state.progression.level==84 and trip.state.story.node==HUB
    prior=completed_commissions(trip)
    assert len(prior)==15
    rehearsal=rehearse(trip)
    trip.act('story_accept:'+QUEST)
    save(trip,'seahorse-ready')
    start=WORK/'seahorse-ready.json'
    return dict(sourceSha256=trip.source,furina=rehearsal,entryLevel=trip.state.progression.level,
                interrupted=campaign_clear(start,True,prior),landed=campaign_clear(start,False,prior),
                commissionCount=len(prior)+1)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-fontaine-seahorse.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(result)
