"""Finish permanent quests and claim compatible dailies from earned checkpoints."""

import json

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey


OUT = ROOT/'work/quest-daily-fields'
OUT.mkdir(parents=True, exist_ok=True)
MOND = 'mond-watchtower-clear'
LIYUE = 'liyue-market-delivery'
INA = 'inazuma-moving-lantern'
ELITES = 'daily-mond-elites'
ROUTE = 'daily-liyue-route'
SCOUTS = 'daily-liyue-treasure-hoarders'
PATROL = 'daily-ina-short-patrol'


def journey(source):
    trip = Journey(ROOT/'work'/source, engine=runtime())
    trip.core.dailyBind(trip.state, 'f'*32, 20803, None)
    return trip


def daily(trip, id):
    return next(row for row in trip.state.daily.ledger.activeSlots.values() if row.id == id)


def finish_daily(trip, id, xp, mora):
    row = daily(trip, id)
    before = trip.state.progression.questXp, trip.state.mora
    trip.act('daily_claim:'+id)
    trip.core.dailySettle(trip.state)
    assert row.claimed
    assert (trip.state.progression.questXp, trip.state.mora) == (before[0]+xp, before[1]+mora)
    balances = trip.state.progression.questXp, trip.state.mora
    trip.act('daily_claim:'+id)
    trip.core.dailySettle(trip.state)
    assert (trip.state.progression.questXp, trip.state.mora)==balances
    return dict(id=id,kills=row.count,xp=xp,mora=mora)


def snapshot(trip, name):
    data = trip.snapshot()
    # Browser previews use their own server day and daily profile.
    data.pop('daily',None)
    (OUT/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False)+'\n','utf8')


def fight(trip, spawn):
    enemy = next(e for e in trip.state.enemies.values() if e.spawnId==spawn)
    trip.fight([enemy],trip.totals(),allow_collateral=True)


def locked_guide(trip, target, reason):
    path = trip.guide(target)
    assert path['status']=='blocked', (target,path)
    assert reason in path['reason'], (target,path['reason'])
    return path['reason']


def buffer_clear(trip, points):
    for x,y in points:
        for enemy in trip.state.enemies.values():
            assert abs(enemy.y-y)>=45 or x<=enemy.patrolMin-60 or x>=enemy.patrolMax+60, (
                trip.state.story.node, enemy.spawnId, x, y)


def patrol_ground(trip, id, goal):
    started = trip.state.t
    returns = trip.state.returns
    east = trip.lua.table(right=True,attack=True)
    west = trip.lua.table(left=True,attack=True)
    move = east
    while daily(trip,id).count < goal:
        assert trip.state.t-started<600, (id,daily(trip,id).count)
        assert trip.actor.y==480 and trip.state.returns==returns
        if trip.actor.x>=trip.state.worldwidth-105:
            move = west
        elif trip.actor.x<=110:
            move = east
        trip.tick(6,move)
    return round(trip.state.t-started,2)


def mondstadt():
    trip = journey('mondstadt-fresh-route/lv9-save.json')
    assert trip.state.progression.level==9 and trip.state.story.quests[MOND] is None
    trip.act('daily_accept:'+ELITES)
    snapshot(trip,'mond-before-commission')
    before = locked_guide(trip,'mond-watchtower','街道を取り戻せ！')
    trip.act('story_accept:'+MOND)
    trip.travel('mond-watchtower')
    entry = [(actor.x,actor.y) for actor in trip.state.actors.values()]
    buffer_clear(trip,entry)
    row = next(q for q in trip.core.dailyAtlasQuests(trip.state,'mond-watchtower').values() if q.id==ELITES)
    assert row.untilQuestClear=='街道を取り戻せ！' and list(row.targets.values())==['mond-watchtower-1']
    fight(trip,'mond-watchtower-2')
    assert daily(trip,ELITES).count==0 and trip.state.story.quests[MOND].count==0
    fight(trip,'mond-watchtower-1')
    assert daily(trip,ELITES).count==trip.state.story.quests[MOND].count==1
    assert not list(trip.core.dailyAtlasQuests(trip.state,'mond-watchtower').values())
    trip.travel('mond-restored-road')
    trip.travel('mond-town')
    trip.report(MOND)
    trip.restore()
    assert daily(trip,ELITES).count==1
    assert 'mond-watchtower' not in next(
        q for q in trip.frame().daily.activeSlots.values() if q.id==ELITES).targetNodes.values()
    snapshot(trip,'mond-after-commission')
    for location in ('mond-border','mond-old-ground'):
        trip.travel(location)
        elite = next(e for e in trip.state.enemies.values() if e.dailyElite)
        fight(trip,elite.spawnId)
    trip.travel('mond-town')
    payout = finish_daily(trip,ELITES,280,220)
    trip.restore()
    assert trip.state.story.quests[MOND].status=='complete' and daily(trip,ELITES).claimed
    return trip.proof() | {'lockedBefore':before,'sharedEliteCount':1,'activeArrival':entry,'reward':payout}


def liyue():
    trip = journey('mondstadt-fresh-route/liyue-save.json')
    assert trip.state.progression.level==20 and trip.state.story.quests[LIYUE] is None
    for id in (ROUTE,SCOUTS):
        trip.act('daily_accept:'+id)
    snapshot(trip,'liyue-before-commission')
    before = locked_guide(trip,'liyue-loading-yard','港に着いたら、ひと仕事！')
    trip.act('story_accept:'+LIYUE)
    for item,x in (('pot',245),('vessel',615)):
        trip.approach(x,480,item)
        trip.act('story_deliver:'+LIYUE+':'+item)
    trip.travel('liyue-loading-yard')
    buffer_clear(trip,[(735,380)])
    fight(trip,'liyue-loading-yard-1')
    assert trip.state.story.quests[LIYUE].delivery.guardCleared
    assert daily(trip,ROUTE).count>=1 and daily(trip,SCOUTS).count==0
    trip.approach(735,380,'荷箱')
    assert trip.frame().storyNearbyParcel.name=='車輪の荷箱'
    trip.act('story_collect')
    assert trip.state.story.quests[LIYUE].delivery.recovered
    fight(trip,'liyue-loading-yard-daily-scout')
    assert daily(trip,ROUTE).count>1 and daily(trip,SCOUTS).count>=1
    trip.travel('liyue-harbor')
    trip.approach(1050,480,'車輪')
    trip.act('story_deliver:'+LIYUE+':wheel')
    trip.report(LIYUE)
    counters = [daily(trip,id).count for id in (ROUTE,SCOUTS)]
    trip.restore()
    assert [daily(trip,id).count for id in (ROUTE,SCOUTS)]==counters
    snapshot(trip,'liyue-after-commission')
    trip.travel('liyue-loading-yard')
    trip.approach(958,380,'仮置き場の中段')
    trip.approach(958,290,'仮置き場の上段')
    trip.approach(780,480,'仮置き場の地上')
    seconds = patrol_ground(trip,SCOUTS,40)
    seconds += patrol_ground(trip,ROUTE,80)
    trip.travel('liyue-harbor')
    payouts = [finish_daily(trip,ROUTE,1700,340),finish_daily(trip,SCOUTS,1550,310)]
    trip.restore()
    assert trip.state.story.quests[LIYUE].status=='complete' and all(daily(trip,id).claimed for id in (ROUTE,SCOUTS))
    return trip.proof() | {'lockedBefore':before,'counterAtReport':counters,'upperShelfReached':True,'cargoBuffer':True,
                          'huntSeconds':round(seconds,2),'rewards':payouts}


def inazuma():
    trip = journey('liyue-fresh-route/inazuma-save.json')
    assert trip.state.progression.level==40 and trip.state.story.quests[INA] is None
    trip.act('story_accept:'+INA)
    trip.travel('inazuma-town')
    trip.act('daily_accept:'+PATROL)
    snapshot(trip,'inazuma-before-lantern')
    before = locked_guide(trip,'inazuma-lantern-trail','その灯籠、今、動きました？')
    trip.travel('inazuma-port')
    trip.approach(410,480,'綾華の灯籠')
    trip.act('story_collect')
    assert trip.state.story.quests[INA].count==1
    trip.travel('inazuma-lantern-trail')
    buffer_clear(trip,[(305,480),(670,391),(1100,480)])
    for id,x,y,count in (('box-leaf',305,480,2),('stone-shadow',670,391,3),('eaten-nuts',1100,480,4)):
        trip.approach(x,y,id)
        assert trip.frame().storyNearbyLantern.id==id
        trip.act('story_collect')
        assert trip.state.story.quests[INA].count==count
        if count==2:
            if daily(trip,PATROL).count==0:
                fight(trip,'inazuma-lantern-trail-1')
            assert daily(trip,PATROL).count==1 and trip.state.story.quests[INA].count==2
    trip.travel('inazuma-lantern-clearing')
    trip.approach(680,480,'中央の灯籠')
    trip.act('story_collect')
    trip.act('story_collect')
    assert trip.state.story.quests[INA].count==6
    trip.travel('inazuma-port')
    trip.report(INA)
    trip.restore()
    assert daily(trip,PATROL).count>=1
    trip.travel('inazuma-town')
    snapshot(trip,'inazuma-after-commission')
    trip.travel('inazuma-lantern-trail')
    trip.approach(755,391,'灯隠れの中段')
    trip.approach(755,306,'灯隠れの上段')
    trip.approach(990,480,'灯隠れの地上')
    seconds = patrol_ground(trip,PATROL,60)
    trip.travel('inazuma-town')
    payout = finish_daily(trip,PATROL,5280,390)
    trip.restore()
    assert trip.state.story.quests[INA].status=='complete' and daily(trip,PATROL).claimed
    return trip.proof() | {'lockedBefore':before,'upperShelfReached':True,'clueBuffers':3,'huntSeconds':seconds,'reward':payout}


if __name__=='__main__':
    proof = {}
    for run in (mondstadt,liyue,inazuma):
        proof[run.__name__] = run()
        assert proof[run.__name__]['returns']==0
        print(run.__name__, 'permanent and daily quests completed and restored',flush=True)
    (OUT/'earned-quest-daily-fields.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n','utf8')
