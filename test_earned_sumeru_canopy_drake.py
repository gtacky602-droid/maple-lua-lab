"""Continue the earned Sumeru save through the canopy and the Aeonblight Drake."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_opening_bosses import HISTORY, LEAF
from test_earned_survey_itineraries import SurveyJourney


WORK = ROOT/'work/earned-sumeru-canopy-drake'
SOURCE = ROOT/'work/earned-sumeru-opening-bosses/electro-regisvine-complete.json'
HUB, FOREST = 'sumeru-hub', 'sumeru-field'
CANOPY, SKY = 'sumeru-forest-levels', 'sumeru-observatory-map'
JUNCTION, ROOTS, BRANCH, STOP = ('sumeru-canopy-junction','sumeru-root-slope',
                                'sumeru-branch-run','sumeru-observation-stop')
APPROACH, TERRACE, OBSERVATORY = ('sumeru-observatory-approach',
                                  'sumeru-observatory-terrace','sumeru-sky-observatory')
BOSS, ARENA, QUEST = 'boss-24030301','aeonblight-field-chamber','aeonblight-commission'
CORE_BAR_BACKGROUND = '#302235'
EARLIER = (*HISTORY, LEAF, 'jadeplume-commission', 'electro-regisvine-commission')


def save(trip, name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n',encoding='utf8')


def follow(trip, *nodes):
    for node in nodes:
        trip.cross(node)


def approach_gate(trip, target, need):
    if trip.state.story.node!=FOREST:
        trip.cross(FOREST)
    guide = trip.guide(target)
    assert guide['status']=='blocked' and guide['requiredLevel']==need
    trip.confirm_lock(target, f'必要レベル {need}')
    trip.cross(HUB)
    return dict(level=trip.state.progression.level, requires=need, target=target)


def canopy(trip):
    start = trip.state.progression.level
    trip.act('story_accept:'+CANOPY)
    quest = trip.state.story.quests[CANOPY]
    assert quest.status=='active'
    trip.cross(JUNCTION)
    collect(trip,330)
    collect(trip,726,388)
    assert trip.frame().storyAirflow.selection=='葉だけ開く'
    trip.act('story_airflow_commit')
    assert quest.count==1 and '両方' in trip.state.storyNotice
    collect(trip,726,388)
    collect(trip,726,388)
    trip.act('story_airflow_commit')
    assert quest.count==2 and any(p.leafBridge and not p.preview for p in trip.state.platforms.values())
    trip.cross(ROOTS)
    collect(trip,824,390)
    follow(trip,STOP,BRANCH)
    collect(trip,653,302)
    trip.cross(STOP)
    collect(trip,823,390)
    assert quest.count==5
    for target in (JUNCTION,STOP):
        guide = trip.guide(target)
        assert guide['status']=='ready' and guide['stops'][0]['id']==target
        assert any(e['to']==target and e.get('liftSeconds')==1.55 for e in trip.exits[trip.state.story.node])
        trip.cross(target)
    trip.cross(HUB)
    trip.report(CANOPY)
    return dict(startLevel=start,endLevel=trip.state.progression.level,wrongSettingRejected=True,
                routes=[ROOTS,BRANCH],liftSeconds=1.55,report=trip.reports[-1])


def fight_task(trip, quest, cleared_count, approach):
    trip.approach(*approach,'observatory fight')
    state, actor = trip.state, trip.actor
    controls = {(dx,jump):trip.lua.table(left=dx<0,right=dx>0,jump=jump,attack=True)
                for dx in (-1,0,1) for jump in (False,True)}
    for _ in range(2100):
        if quest.count==cleared_count:
            return
        assert actor.hp>0 and state.returns==0
        target=min((e for e in state.enemies.values() if e.hp>0),
                   key=lambda e:abs(e.x-actor.x)+abs(e.y-actor.y))
        dx=target.x-actor.x
        direction = 0 if abs(dx)<30 else (1 if dx>0 else -1)
        jump=direction==0 and target.y<actor.y-35
        trip.tick(1,controls[direction,jump])
    raise AssertionError((state.story.node,quest.count,actor.x,actor.y))


def observatory(trip):
    start = trip.state.progression.level
    trip.act('story_accept:'+SKY)
    quest = trip.state.story.quests[SKY]
    follow(trip,STOP,APPROACH)
    fight_task(trip,quest,1,(302,480))
    trip.cross(TERRACE)
    fight_task(trip,quest,2,(850,480))
    collect(trip,1525,390)
    trip.cross(OBSERVATORY)
    collect(trip,826,391)
    assert quest.count==4 and trip.state.endgame.bosses['original-canopy-fungus'].clears==1
    trip.cross(HUB)
    trip.report(SKY)
    trip.restore()
    assert trip.state.story.quests[SKY].cycles==1
    assert trip.state.endgame.bosses['original-canopy-fungus'].clears==1
    trip.cross(OBSERVATORY)
    collect(trip,826,391)
    assert '観測所の地図' in trip.state.storyNotice
    trip.cross(HUB)
    return dict(startLevel=start,endLevel=trip.state.progression.level,reportedQuest=trip.reports[-1],
                canopyBossClears=1,readback=True)


def fight_drake(trip):
    state, actor = trip.state, trip.actor
    slot = state.fieldSlots[BOSS]
    boss = slot.enemy
    assert boss.hp==1310
    trip.approach(boss.x-104,480,'drake')
    opening_hp, start, start_level = actor.hp,state.t,state.progression.level
    before, mora = trip.totals(),state.mora
    controls={(dx,attack):trip.lua.table(left=dx<0,right=dx>0,attack=attack)
              for dx in (-1,0,1) for attack in (False,True)}
    moves, recovered, bolts = {},set(),set()
    flying = False
    exposed = down = None
    pivot = None
    for _ in range(6600):
        if boss.hp<=0:
            break
        assert actor.hp>0 and state.returns==0
        cast=slot.cast
        recovering=bool(cast and cast.tick>=cast.move.recover)
        if cast:
            m,t=cast.move,cast.tick
            if t==m.lock:
                frame=trip.frame().fieldBoss
                if m.kind=='cannon':
                    if exposed is None:
                        assert frame.weakpoint and frame.coreWindowTicks==114
                        assert abs(frame.weakpoint.y-427.2)<.001
                        exposed=dict(ticks=frame.coreWindowTicks,worldX=frame.weakpoint.x)
                    pivot=cast.origin-cast.dir*112
                elif m.kind=='charge':
                    pivot=cast.origin-cast.dir*108
                else:
                    pivot=cast.origin+cast.dir*181
                moves.setdefault(m.id,dict(hpAtLock=actor.hp,lock=t,landing=cast.dest))
            if m.kind=='cannon':
                bolts.update(cast.projectiles.keys())
                bolts.update(cast.shots.keys())
                if t in (48, 90, 161, 162):
                    frame=trip.frame()
                    if t==162:
                        assert not frame.fieldBoss.coreWindowTicks and not boss.weakpoint
                    elif boss.weakpoint:
                        assert frame.fieldBoss.coreWindowTicks==162-t
                        assert any(d.color==CORE_BAR_BACKGROUND and d.w==32 for d in frame.draws.values())
            elif m.kind=='charge' and boss.y<420:
                flying = bool(trip.frame().fieldBoss.flying)
            if m.id in moves and not recovering:
                until=max(m.fire.values())+m.life if m.fire else max(w[2] for w in m.active.values())
                if t==until and 'hpAfterAttack' not in moves[m.id]:
                    moves[m.id]['hpAfterAttack']=actor.hp
            if recovering and m.id not in recovered:
                assert '反撃の隙' in trip.frame().fieldBoss.label
                recovered.add(m.id)
        else:
            pivot=None
        can_attack=len(recovered)==3
        dx=boss.x-actor.x
        aim_for_core=bool(can_attack and down is None and boss.weakpoint)
        if cast and not recovering and pivot is not None and not (can_attack and (aim_for_core or down is not None)):
            distance=pivot-actor.x
            direction=0 if abs(distance)<7 else (1 if distance>0 else -1)
            attack=False
        else:
            desired=68 if aim_for_core else 99
            distance=dx-(desired if dx>=0 else -desired)
            direction=(1 if distance>0 else -1) if abs(distance)>8 else 0
            if not direction and dx*actor.dir<0:
                direction=1 if dx>0 else -1
            attack=can_attack and (aim_for_core or down is not None) and abs(dx)<125 and dx*actor.dir>0
        trip.tick(1,controls[direction,attack])
        if boss.stagger>0 and down is None:
            frame=trip.frame().fieldBoss
            assert frame.label=='胸部コアで中断・ダウン' and not frame.coreWindowTicks
            assert not slot.cast and frame.downTicks in (149,150) and boss.y==480
            down=dict(ticks=frame.downTicks,interrupted=True)
    assert set(moves)=={'FAD01','FAD02','FAD03'} and len(recovered)==3, (moves,recovered)
    assert all('hpAfterAttack' in move for move in moves.values())
    assert bolts=={1,2,3} and flying and down and exposed
    assert slot.phase=='respawn' and state.kills==before[0]+1 and state.returns==before[2]
    return dict(levelAtEntry=start_level,levelAfterKill=state.progression.level,moves=moves,bolts=sorted(bolts),airborne=flying,
                chestCore=exposed,stagger=down,hpBefore=opening_hp,hpAfter=actor.hp,
                seconds=round(state.t-start,2),xp=state.progression.killXp-before[1],mora=state.mora-mora)


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(source,runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==62 and not trip.state.inventory.sampleKit
    assert all(trip.state.story.quests[q].status=='complete' for q in EARLIER)
    locks=[approach_gate(trip,ARENA,66)]
    save(trip,'canopy-ready')
    route1=canopy(trip)
    locks.append(approach_gate(trip,ARENA,66))
    route2=observatory(trip)
    assert trip.state.progression.level>=66
    trip.act('story_accept:'+QUEST)
    assert trip.state.story.quests[QUEST].status=='active'
    save(trip,'aeonblight-ready')
    stops=trip.travel(ARENA)
    assert [s['id'] for s in stops]==[FOREST,ARENA]
    combat=fight_drake(trip)
    assert trip.state.story.quests[QUEST].count==1
    trip.travel(HUB)
    trip.report(QUEST)
    cooldown=trip.snapshot()['fieldBosses'][BOSS]
    assert cooldown['hp']==0 and cooldown['waitTicks']>0
    trip.restore()
    assert trip.snapshot()['fieldBosses'][BOSS]==cooldown
    assert trip.state.story.quests[QUEST].cycles==1 and trip.state.endgame.bosses[BOSS].clears==1
    assert all(trip.state.story.quests[q].status=='complete' for q in (*EARLIER,CANOPY,SKY,QUEST))
    save(trip,'aeonblight-complete')
    return dict(sourceSha256=trip.source,forest=route1,observatory=route2,locks=locks,combat=combat,
                report=trip.reports[-1],restoredCooldown=cooldown['waitTicks'],returns=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-sumeru-canopy-drake.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(result)
