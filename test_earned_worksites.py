"""Play the harbor stall, stone puzzle and alternative lift from earned Liyue saves."""
import json

from runtime import ROOT,native,runtime
from test_earned_branch_quests import Journey
from tools.quest_guide_test import GuideChecks

HUB,RIVER,CLIFF,POST,OVERLOOK='liyue-harbor','liyue-river-trail','liyue-cliff-planks','liyue-quarry-post','liyue-craftsmen-overlook'
MEAL,STONE,WORK='liyue-harbor-meal','liyue-stone-marks','liyue-hauling-shortcut'
saves=ROOT/'work/liyue-fresh-route'
engine=runtime()
checks=GuideChecks('liyue-worksites')

def pending(trip,quest):
    sites=trip.frame().storyWorksites
    return {p.point for p in sites[quest].values()} if sites and sites[quest] else set()

def near(trip,x,y=480):
    trip.approach(x,y,'worksite')

def collect(trip,quest,point,x,y=480):
    near(trip,x,y)
    before=pending(trip,quest)
    count=trip.state.story.quests[quest].count
    checks.expect(trip.frame(),quest,point=point,xy=(x,y))
    trip.act('story_collect')
    assert trip.state.story.quests[quest].count==count+1
    assert pending(trip,quest)==before-{point}

def enter_overlook(trip):
    near(trip,540,391)
    near(trip,540,305)
    trip.cross(OVERLOOK)

def play_marks_and_meal():
    trip=Journey(saves/'earned-worksites-start.json',engine)
    for quest in (STONE,MEAL):
        trip.act('story_accept:'+quest)
        assert len(pending(trip,quest))==3
    trip.cross(RIVER)
    collect(trip,STONE,'cut-wall',1250)
    collect(trip,MEAL,'fish',365)
    (saves/'earned-worksites-partial.json').write_text(json.dumps(trip.snapshot()),encoding='utf8')
    trip.restore()
    assert pending(trip,STONE)=={'tool-mark','paving-mark'} and pending(trip,MEAL)=={'herb','mushroom'}
    trip.cross(CLIFF)
    near(trip,520,395)
    near(trip,520,305)
    collect(trip,MEAL,'herb',560,305)
    collect(trip,STONE,'tool-mark',905,305)
    trip.cross(HUB)
    trip.cross('liyue-field')
    collect(trip,MEAL,'mushroom',270)
    trip.cross(HUB)
    near(trip,245)
    checks.expect(trip.frame(),MEAL,name='香菱の屋台',xy=(245,480))
    trip.act('story_cook:'+MEAL+':spicy')
    trip.report(MEAL)
    trip.cross(POST)
    collect(trip,STONE,'paving-mark',420)
    enter_overlook(trip)
    checks.expect(trip.frame(),STONE,point='craft-mural',xy=(488,397))
    near(trip,488,397)
    trip.act('story_collect')
    tile=lambda key:trip.act('story_stone_tile:'+STONE+':'+key)
    tile('build')
    assert trip.state.story.quests[STONE].stone.sequence==0
    tile('cut')
    tile('carry')
    trip.restore()
    assert trip.state.story.quests[STONE].stone.sequence==2
    trip.cross(POST)
    enter_overlook(trip)
    near(trip,488,397)
    hint=trip.frame().storyHunts[STONE]
    assert hint.point=='craft-mural' and '組み立て' not in hint.action
    tile('build')
    checks.expect(trip.frame(),STONE,point='overlook-model',xy=(980,231))
    near(trip,550,312)
    near(trip,820,231)
    collect(trip,STONE,'overlook-model',980,231)
    trip.cross(POST)
    trip.cross(HUB)
    trip.report(STONE)
    trip.restore()
    for q in (STONE,MEAL):
        assert trip.state.story.quests[q].status=='complete'
        checks.expect(trip.frame(),q,absent=True)
    return dict(source=trip.source,reports=trip.reports,returns=trip.state.returns)

def alternate_lift():
    trip=Journey(saves/'earned-worksite-plan.json',engine)
    near(trip,875)
    checks.expect(trip.frame(),WORK,point='work-plan')
    trip.act('story_construction_plan:'+WORK+':lift')
    assert trip.state.story.quests[WORK].construction.plan=='lift'
    checks.expect(trip.frame(),WORK,absent=True)
    trip.cross(POST)
    near(trip,1535)
    checks.expect(trip.frame(),WORK,xy=(1535,480))
    trip.act('story_collect')
    trip.restore()
    assert trip.state.story.quests[WORK].count==5
    trip.cross(POST)
    near(trip,1535)
    assert trip.frame().storyHunts[WORK].action=='Gで資材を渡す'
    trip.act('story_collect')
    trip.cross(HUB)
    trip.report(WORK)
    trip.restore()
    assert trip.state.story.quests[WORK].construction.plan=='lift'
    (saves/'earned-shortcut-lift.json').write_text(json.dumps(trip.snapshot()),encoding='utf8')
    trip.cross('liyue-cart-lift')
    heights=set()
    for _ in range(240):
        cart=trip.frame().storyHaulCart
        assert cart and cart.route=='lift'
        heights.add(round(cart.y))
        trip.tick(2)
    assert min(heights)==350 and max(heights)>=478
    trip.cross('liyue-field')
    return dict(source=trip.source,reports=trip.reports,opened='liyue-cart-lift',destination=trip.state.story.node,returns=trip.state.returns)

if __name__=='__main__':
    report=dict(stoneAndMeal=play_marks_and_meal(),lift=alternate_lift(),samples=checks.samples)
    assert all(report[key]['returns']==0 for key in ('stoneAndMeal','lift'))
    (ROOT/'evidence/earned-worksites.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print('Earned stone puzzle, pre-market cooking and alternate lift passed.')
