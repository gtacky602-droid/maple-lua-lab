"""Play Fontaine's second chapter and the Emperor from the earned Lv81 save."""
from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_fontaine_delivery import HUB, LOFT, QUEST as DELIVERY
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_baptist import completed_commissions, markers
from test_earned_survey_itineraries import SurveyJourney


WORK = ROOT/'work/earned-fontaine-emperor'
SOURCE = ROOT/'work/earned-fontaine-delivery/delivery-complete.json'
WINGS,CATWALK,FLOOR,STORE,REHEARSAL = ('fontaine-stage-wings','fontaine-lift-catwalk',
    'fontaine-understage-workfloor','fontaine-parcel-storeroom','fontaine-rehearsal-room')
CHAPTER='fontaine-understage-crew'
FIELD, ARENA, BOSS, QUEST = 'fontaine-field','emperor-field-cove','boss-26160302','emperor-commission'


def save(trip,name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def reject_then_accept(trip,x,count,wrong,right):
    trip.approach(x,480,CHAPTER)
    for text,expected in ((wrong,count),(right,count+1)):
        trip.act('story_collect')
        assert trip.frame().storyAirflow.selection==text
        trip.act('story_airflow_commit')
        assert trip.state.story.quests[CHAPTER].count==expected


def backstage(trip):
    trip.act('story_accept:'+CHAPTER)
    trip.cross(LOFT)
    trip.cross(WINGS)
    assert trip.state.theaterShutter
    trip.mark(CHAPTER,1)
    trip.mark(CHAPTER,2)
    assert not trip.state.theaterShutter
    trip.approach(870,400,'足場の一段目')
    trip.approach(1060,321,'足場の二段目')
    trip.cross(CATWALK)
    trip.approach(575,390,'昇降台の中段')
    for stage in (FLOOR,CATWALK,FLOOR):
        trip.cross(stage)
    trip.approach(552,480,'波板の回転盤')
    exposed=trip.actor.hp
    trip.tick(360)
    assert trip.actor.hp<exposed and not trip.state.theaterWaveWall
    reject_then_accept(trip,552,2,'板を寝かせる','板を立てる')
    assert trip.state.theaterWaveWall and trip.frame().storyTheaterWave.raised
    protected=trip.actor.hp
    trip.tick(360)
    assert trip.actor.hp==protected
    trip.approach(621,480,'波板の手前')
    trip.act('jump')
    controls=trip.lua.table(right=True,jump=True)
    for _ in range(90):
        if trip.actor.ground and trip.actor.y==390 and trip.actor.x>=760:
            break
        trip.tick(1,controls if trip.actor.x<760 else trip.inputs['jump'])
    else:
        raise AssertionError((trip.actor.x,trip.actor.y))
    guards=list(trip.state.enemies.values())
    trip.fight(guards,trip.totals())
    assert trip.state.story.quests[CHAPTER].count==4
    trip.cross(STORE)
    assert not trip.state.theaterWaveWall
    for index in (5,6):
        trip.mark(CHAPTER,index)
    trip.restore()
    assert trip.state.story.node==STORE and trip.state.story.quests[CHAPTER].count==6
    trip.mark(CHAPTER,7)
    reject_then_accept(trip,1008,7,'受領の前に盗まれた','旧劇場宛てとして受け取った')
    trip.mark(CHAPTER,9)
    trip.cross(REHEARSAL)
    trip.mark(CHAPTER,10)
    trip.cross(HUB)
    ore=trip.state.inventory.upgradeOre
    trip.report(CHAPTER)
    reward=dict(trip.reports[-1],ore=trip.state.inventory.upgradeOre-ore)
    assert (reward['xp'],reward['mora'],reward['ore'])==(1921946,3900,4)
    trip.restore()
    trip.cross(REHEARSAL)
    collect(trip,764)
    assert trip.state.storyNotice.startswith('稽古場の記録')
    trip.cross(HUB)
    return dict(reward=reward,checkpoint='fontaine-parcel-storeroom',hpBeforeCover=exposed,
                hpWithCover=protected,guards=trip.battles[-1],readback=True)


def encounter(trip):
    slot=trip.state.fieldSlots[BOSS]
    boss=slot.enemy
    player=trip.actor
    assert boss.hp==980
    trip.approach(boss.x-104,480,ARENA)
    before, start, hp=trip.totals(),trip.state.t,player.hp
    moves,recoveries=set(),set()
    order,timers=[],{}
    counter=False
    jumps={'FEC01':(83,),'FEC02':(90,138),'FEC03':(96,)}
    controls={(dx,attack):trip.lua.table(left=dx<0,right=dx>0,jump=True,attack=attack)
              for dx in (-1,0,1) for attack in (False,True)}
    for _ in range(7800):
        if boss.hp<=0:
            break
        cast=slot.cast
        exposed=boss.form=='exposed'
        if cast:
            m,t=cast.move,cast.tick
            if t==m.lock:
                moves.add(m.id)
                if m.kind=='fire':
                    order=markers(trip,[1,2])
                    assert [x+trip.state.camera for _,x,_ in order]==list(cast.points.values())
            if m.kind=='fire' and t in (m.active[1][1],m.active[2][1]):
                markers(trip,[2] if t==m.active[1][1] else [])
            if t==m.recover:
                assert trip.frame().fieldBoss.recovering
                recoveries.add(m.id)
            if exposed and t in (168,216):
                f=trip.frame()
                remaining=f.fieldBoss.exposureTicks
                assert remaining==m.total-t and '正面から反撃' in f.fieldBoss.label
                assert any(d.kind=='rect' and d.color=='#a6eee7' and d.w==30*remaining/144 for d in f.draws.values())
                timers[t]=remaining
            if t in jumps[m.id] and player.ground:
                trip.act('jump')
        dx=boss.x-player.x
        turn=dx*player.dir<0
        direction=1 if dx>108 or (turn and dx>0) else -1 if dx<-108 or (turn and dx<0) else 0
        attack=len(timers)==2 and abs(dx)<125 and not turn
        prior=boss.hp
        trip.tick(1,controls[direction,attack])
        counter=counter or (exposed and attack and boss.hp<prior)
        assert player.hp>0 and trip.state.returns==before[2]
    assert slot.phase=='respawn' and trip.state.kills==before[0]+1
    assert moves==recoveries==set(jumps) and timers=={168:144,216:96} and counter and order
    return dict(moves=sorted(moves),order=order,timers=timers,hitExposed=counter,
                hpBefore=hp,hpAfter=player.hp,seconds=round(trip.state.t-start,2),xp=trip.state.progression.killXp-before[1])


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(source,runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==81
    previous=completed_commissions(trip)
    assert len(previous)==14 and trip.state.story.quests[DELIVERY].status=='complete'
    trip.cross(FIELD)
    assert trip.guide(ARENA)['status']=='blocked'
    trip.confirm_lock(ARENA,'必要レベル 82')
    trip.cross(HUB)
    chapter=backstage(trip)
    level=trip.state.progression.level
    assert level==84
    trip.act('story_accept:'+QUEST)
    save(trip,'emperor-ready')
    route=trip.travel(ARENA)
    assert [stop['id'] for stop in route]==[FIELD,ARENA]
    combat=encounter(trip)
    assert trip.state.story.quests[QUEST].count==1
    trip.travel(HUB)
    trip.report(QUEST)
    cooldown=trip.snapshot()['fieldBosses'][BOSS]
    trip.restore()
    assert cooldown['waitTicks']>0 and trip.snapshot()['fieldBosses'][BOSS]==cooldown
    assert trip.state.story.quests[QUEST].cycles==trip.state.endgame.bosses[BOSS].clears==1
    assert set(completed_commissions(trip))=={*previous,QUEST}
    save(trip,'emperor-complete')
    return dict(sourceSha256=trip.source,gateChecks=trip.locks,chapter=chapter,
                entryLevel=level,combat=combat,report=trip.reports[-1],
                restoredCooldown=cooldown['waitTicks'],commissionCount=len(previous)+1,returns=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-fontaine-emperor.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(result)
