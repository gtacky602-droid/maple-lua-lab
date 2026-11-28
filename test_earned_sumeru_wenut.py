"""Continue the earned Lv70 Sumeru save through both projects and the Wenut."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_canopy_drake import EARLIER, CANOPY, SKY, QUEST as DRAKE
from test_earned_survey_itineraries import SurveyJourney


SOURCE=ROOT/'work/earned-sumeru-dendro-matrix/asimon-complete.json'
WORK=ROOT/'work/earned-sumeru-wenut'
HUB, ENTRY='sumeru-hub','sumeru-entry'
SHOP, OBSERVATORY, ROOM='sum-kaveh-workshop','sumeru-sky-observatory','sum-kaveh-reading-room'
STOP, GLADE='sumeru-observation-stop','sum-nahida-dew-glade'
KAVEH, NAHIDA='sum-kaveh-model','sum-nahida-map'
BOSS, ARENA, QUEST='boss-26130101','wenut-field-cavern','wenut-commission'
EARLY=(*EARLIER,CANOPY,SKY,DRAKE,'dendro-hypostasis-commission','asimon-commission','sum-collei-guide')


def save(trip,name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n',encoding='utf8')


def kaveh(trip):
    initial=trip.state.progression.level
    trip.act('story_accept:'+KAVEH)
    trip.cross(SHOP)
    collect(trip,450)
    progress=trip.state.story.quests[KAVEH]
    assert progress.count==1
    trip.act('story_collect')
    assert trip.frame().storyKavehModel.here.id=='entrance'
    for station,part,value in (('shelves','shelf','wall'),('window','window','inward'),('seat','seat','view')):
        trip.act('story_model_move:'+station)
        assert trip.frame().storyKavehModel.here.id==station
        trip.act(f'story_model_set:{part}:{value}')
    assert not trip.frame().storyKavehModel.result.clear
    trip.act('story_model_confirm')
    assert progress.count==1
    trip.act('story_model_set:seat:aisle')
    assert trip.frame().storyKavehModel.result.ready
    trip.act('story_model_confirm')
    assert progress.count==2
    trip.cross(HUB)
    trip.report(KAVEH)
    trip.restore()
    trip.cross(OBSERVATORY)
    trip.cross(ROOM)
    installed=trip.frame().storyKavehRoom
    assert (installed.shelf,installed.window,installed.seat)==('wall','inward','aisle')
    assert not trip.state.enemies[1]
    trip.cross(OBSERVATORY)
    trip.cross(HUB)
    return dict(levelBefore=initial,levelAfter=trip.state.progression.level,wrongSeatRejected=True,
                restoredLayout=dict(shelf='wall',window='inward',seat='aisle'),report=trip.reports[-1])


def nahida(trip):
    initial=trip.state.progression.level
    trip.act('story_accept:'+NAHIDA)
    collect(trip,950)
    assert trip.state.story.quests[NAHIDA].count==1
    trip.cross(STOP)
    trip.cross(GLADE)
    collect(trip,620,394)
    assert trip.state.story.quests[NAHIDA].discoveryDew
    trip.cross(STOP)
    trip.cross(HUB)
    collect(trip,950)
    assert all(card.known for card in trip.frame().storyDiscoveryMap.cards.values())
    selected=dict(sky='canopy',dew='gleam',leaf='panel')
    for item,method in selected.items():
        trip.act('story_discovery_pick:'+item)
        trip.act(f'story_discovery_method:{item}:{method}')
    trip.act('story_discovery_confirm')
    assert trip.state.story.quests[NAHIDA].count==2
    trip.report(NAHIDA)
    trip.restore()
    collect(trip,950)
    view=trip.frame().storyDiscoveryMap
    assert view.posted and view.readOnly
    assert {card.id:card.method for card in view.cards.values() if card.method}==selected
    trip.act('story_discovery_close')
    return dict(levelBefore=initial,levelAfter=trip.state.progression.level,dewElevation=394,
                restoredPostedMap=selected,report=trip.reports[-1])


def lock(trip):
    trip.cross(ENTRY)
    guide=trip.guide(ARENA)
    assert guide['status']=='blocked' and guide['requiredLevel']==72
    trip.confirm_lock(ARENA,'必要レベル 72')
    trip.cross(HUB)
    return dict(level=trip.state.progression.level,needed=72)


def fight(trip):
    slot,actor=trip.state.fieldSlots[BOSS],trip.actor
    state,boss=trip.state,slot.enemy
    assert boss.hp==1080
    trip.approach(boss.x-102,480,'wenut approach')
    before=trip.totals()
    opening_level,hp,mora,start=state.progression.level,actor.hp,state.mora,state.t
    moves,timers,orbs={},{},set()
    recovery=set()
    counter=False
    pivot=None
    controls={(dx,attack):trip.lua.table(left=dx<0,right=dx>0,attack=attack)
              for dx in (-1,0,1) for attack in (False,True)}
    for _ in range(6600):
        if boss.hp<=0:
            break
        assert actor.hp>0 and state.returns==0
        cast=slot.cast
        resting=bool(cast and cast.tick>=cast.move.recover)
        if cast:
            m,t=cast.move,cast.tick
            if t==m.lock:
                assert trip.frame().fieldBoss.move==m.id
                pivot=cast.dest-cast.dir*120 if m.hidden else cast.origin+cast.dir*(242 if m.kind=='stream' else 184)
                moves.setdefault(m.id,dict(lock=t,position=cast.dest,hpAtLock=actor.hp))
            if m.hidden and t in (54,78,98,113,114):
                frame=trip.frame()
                field=frame.fieldBoss
                if t==114:
                    assert not field.emergeTicks and not field.underground and boss.x==cast.dest
                else:
                    assert field.emergeTicks==114-t and field.emergeX==cast.dest
                    assert moves[m.id]['position']==cast.dest
                    assert any(d.color=='#302235' and d.w==32 for d in frame.draws.values())
                    assert bool(field.underground)==(t>=78)
                    if field.underground:
                        assert not trip.core.canTargetEnemy(boss)
                        assert not any(d.source=='wenut-field-poses-source-v1.png' for d in frame.draws.values())
                timers.setdefault(t,field.emergeTicks or 0)
            if m.fire:
                orbs.update(cast.projectiles.keys())
                orbs.update(cast.shots.keys())
            if m.id in moves and not resting:
                last=max(m.fire.values())+m.life if m.fire else max(w[2] for w in m.active.values())
                if t==last:
                    moves[m.id].setdefault('hpAfterAttack',actor.hp)
            if resting and m.id not in recovery:
                field=trip.frame().fieldBoss
                assert field.recovering and '反撃の隙' in field.label
                recovery.add(m.id)
        else:
            pivot=None
        ready=len(recovery)==3
        dx=boss.x-actor.x
        if not ready and cast and not resting and pivot is not None:
            delta=pivot-actor.x
            direction=0 if abs(delta)<8 else (1 if delta>0 else -1)
            attack=False
        else:
            reach=90 if ready else 100
            delta=dx-(reach if dx>0 else -reach)
            direction=0 if abs(delta)<8 else (1 if delta>0 else -1)
            if not direction and dx*actor.dir<0:
                direction=1 if dx>0 else -1
            attack=ready and not boss.underground and abs(dx)<125 and dx*actor.dir>0
        prior=boss.hp
        trip.tick(1,controls[direction,attack])
        counter=counter or (resting and attack and boss.hp<prior)
    assert slot.phase=='respawn' and state.kills==before[0]+1 and state.returns==before[2]
    assert set(moves)=={'FWN01','FWN02','FWN03'}==recovery and orbs=={1,2} and counter
    assert set(timers)=={54,78,98,113,114}
    return dict(levelAtEntry=opening_level,levelAfterKill=state.progression.level,moves=moves,
                emergenceTimer=timers,orbs=sorted(orbs),counterHit=counter,hpBefore=hp,hpAfter=actor.hp,
                seconds=round(state.t-start,2),xp=state.progression.killXp-before[1],mora=state.mora-mora)


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(source,runtime())
    assert trip.state.story.node==HUB and trip.state.progression.level==70 and not trip.state.inventory.sampleKit
    assert all(trip.state.story.quests[q].status=='complete' for q in EARLY)
    locks=[lock(trip)]
    save(trip,'kaveh-ready')
    workshop=kaveh(trip)
    locks.append(lock(trip))
    save(trip,'nahida-ready')
    discoveries=nahida(trip)
    assert trip.state.progression.level==72
    trip.act('story_accept:'+QUEST)
    assert trip.state.story.quests[QUEST].status=='active'
    save(trip,'wenut-ready')
    stops=trip.travel(ARENA)
    assert [step['id'] for step in stops]==[ENTRY,ARENA]
    combat=fight(trip)
    assert trip.state.story.quests[QUEST].count==1
    trip.travel(HUB)
    trip.report(QUEST)
    cooldown=trip.snapshot()['fieldBosses'][BOSS]
    assert cooldown['hp']==0 and cooldown['waitTicks']>0
    trip.restore()
    assert trip.snapshot()['fieldBosses'][BOSS]==cooldown
    assert trip.state.story.quests[QUEST].cycles==1 and trip.state.endgame.bosses[BOSS].clears==1
    assert all(trip.state.story.quests[q].status=='complete' for q in (*EARLY,KAVEH,NAHIDA,QUEST))
    save(trip,'wenut-complete')
    return dict(sourceSha256=trip.source,gateChecks=locks,workshop=workshop,discoveries=discoveries,
                combat=combat,report=trip.reports[-1],restoredCooldown=cooldown['waitTicks'],returns=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-sumeru-wenut.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(result)
