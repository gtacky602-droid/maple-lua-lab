"""Play the first Fontaine delivery using the earned Lv80 arrival save."""
from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_baptist import completed_commissions
from test_earned_survey_itineraries import SurveyJourney


WORK = ROOT/'work/earned-fontaine-delivery'
SOURCE = ROOT/'work/earned-sumeru-frontier/fontaine-arrival.json'
HUB, COUNTER, QUAY = 'fontaine-hub', 'fontaine-parcel-counter', 'fontaine-delivery-quay'
HALL, LOFT = 'fontaine-old-scenery-door', 'fontaine-moon-fly-loft'
QUEST = 'fontaine-moon-parcel'
SAND_SURVEYS = ('sum-mapped-desert-wind', 'sum-mapped-tunigi-water', 'tunigi-survey')


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n','utf8')


def investigate(trip):
    trip.act('story_accept:'+QUEST)
    trip.cross(COUNTER)
    collect(trip,320)
    trip.cross(QUAY)
    quest = trip.state.story.quests[QUEST]
    assert quest.count==1
    assert not any(gate.to==HALL for gate in trip.frame().storyPortals.values())
    for x,index in ((508,2),(900,3)):
        collect(trip,x)
        assert quest.count==index
    trip.approach(1038,480,'行先の照合台')
    proposals = ('水路に沈んだ','今の倉庫へ運んだ','旧搬入口へ運んだ')
    for index,proposal in enumerate(proposals):
        trip.act('story_collect')
        assert trip.frame().storyAirflow.selection==proposal
        trip.act('story_airflow_commit')
        assert quest.count==(4 if index==2 else 3)
    return list(proposals)


def wait_for_cart(trip):
    collect(trip,1178)
    started = trip.frame()
    assert started.storyTheaterCart.phase=='starting'
    assert not any(d.text=='メカの出発ベル' for d in started.draws.values())
    trip.approach(270,480,'搬送メカから離れる')
    trip.tick(90)
    frozen = trip.frame()
    cart = frozen.storyTheaterCart
    assert cart.phase=='waitingForPlayer' and cart.x-frozen.camera>960
    guide = frozen.storyHunts[QUEST]
    assert guide.x==cart.x and guide.action=='近づいて合流'
    trip.tick(180)
    assert trip.frame().storyTheaterCart.x==cart.x
    caption = 'メカが待機中 →'
    sign, = [d for d in frozen.draws.values() if d.kind=='text' and d.text==caption]
    for profile in ('legacy','h48c32','h32c16'):
        frame = trip.core.frame(trip.state,'rect',profile)
        other, = [d for d in frame.draws.values() if d.kind=='text' and d.text==caption]
        assert (other.x,other.y,other.color)==(sign.x,sign.y,sign.color)
    trip.approach(cart.x-110,480,'待機位置まで合流')
    assert trip.frame().storyTheaterCart.phase=='following'
    assert trip.frame().storyTheaterCart.x>cart.x
    return dict(cartX=cart.x,screenX=cart.x-frozen.camera,caption=caption,heldTicks=180)


def follow_from_bell(trip):
    trip.restore()
    assert trip.state.story.node==HUB and trip.state.story.quests[QUEST].count==4
    trip.cross(COUNTER)
    trip.cross(QUAY)
    assert trip.frame().storyTheaterCart.phase=='waiting'
    assert trip.frame().storyHunts[QUEST].name=='メカの出発ベル'
    collect(trip,1178)
    for x in (1270,1400,1540,1650):
        trip.approach(x,480,'搬送メカ')
        trip.tick(100)
    assert trip.state.story.quests[QUEST].count==5
    assert trip.frame().storyTheaterCart.phase=='parked' and trip.state.theaterShutter is None
    trip.cross(HALL)


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip = SurveyJourney(source,runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==80 and not trip.state.inventory.sampleKit
    commissions = completed_commissions(trip)
    assert len(commissions)==14
    proposals = investigate(trip)
    branch = wait_for_cart(trip)
    follow_from_bell(trip)
    guards = list(trip.state.enemies.values())
    assert {e.spawnId for e in guards}=={'fontaine-old-door-patrol-1','fontaine-old-door-patrol-2'}
    trip.fight(guards,trip.totals())
    assert trip.state.story.quests[QUEST].count==6
    trip.cross(LOFT)
    collect(trip,863,391)
    assert trip.state.story.quests[QUEST].count==7
    trip.cross(HUB)
    before = trip.state.inventory.upgradeOre
    trip.report(QUEST)
    reward = dict(trip.reports[-1],ore=trip.state.inventory.upgradeOre-before)
    assert (reward['xp'],reward['mora'],reward['ore'])==(1329885,3100,3)
    trip.restore()
    assert trip.state.story.quests[QUEST].cycles==1 and trip.state.story.node==HUB
    assert trip.state.story.quests[QUEST].status=='complete'
    assert completed_commissions(trip)==commissions
    assert all(trip.state.story.quests[key].status=='complete' for key in SAND_SURVEYS)
    trip.cross(LOFT)
    collect(trip,863,391)
    assert trip.state.storyNotice.startswith('搬送記録')
    trip.cross(HUB)
    save(trip,'delivery-complete')
    return dict(sourceSha256=trip.source,startLevel=80,finishLevel=trip.state.progression.level,
                proposals=proposals,waiting=branch,returnedToBellAfterReload=True,guardBattle=trip.battles[-1],
                reported=reward,commissionCount=len(commissions),recordAfterReload=True,returns=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-fontaine-delivery.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
    print(result)
