"""Play the Dendro Hypostasis and the Matrix from the continuous earned Sumeru save."""

from argparse import ArgumentParser
import json

from runtime import ROOT, runtime
from test_earned_inazuma_bosses import collect
from test_earned_sumeru_canopy_drake import EARLIER, CANOPY, SKY, QUEST as DRAKE
from test_earned_survey_itineraries import SurveyJourney


SOURCE=ROOT/'work/earned-sumeru-canopy-drake/aeonblight-complete.json'
WORK=ROOT/'work/earned-sumeru-dendro-matrix'
HUB, FOREST, ENTRY='sumeru-hub','sumeru-field','sumeru-entry'
COLLEI='sum-collei-guide'
BOSSES=(
    ('dendro-hypostasis', 'boss-20040701', 'dendro-hypostasis-field-den', FOREST,
     ('FHD01','FHD02','FHD03')),
    ('asimon', 'boss-24050101', 'asimon-field-ruins', ENTRY,
     ('FMT01','FMT02','FMT03')),
)


def save(trip,name):
    (WORK/f'{name}.json').write_text(json.dumps(trip.snapshot(),ensure_ascii=False)+'\n',encoding='utf8')


def collei(trip):
    state=trip.state
    before=state.progression.level
    trip.act('story_accept:'+COLLEI)
    assert state.story.quests[COLLEI].status=='active'
    collect(trip,515)
    trip.cross('sum-collei-trail')
    collect(trip,647,396)
    assert state.story.quests[COLLEI].count==1
    collect(trip,441)
    collect(trip,982)
    trip.cross('sum-collei-rainfork')
    collect(trip,331)
    collect(trip,802)
    trip.cross('sum-collei-welcome')
    collect(trip,512)
    trip.cross(HUB)
    trip.report(COLLEI)
    trip.restore()
    assert trip.state.story.quests[COLLEI].cycles==1
    return dict(levelBefore=before,levelAfter=trip.state.progression.level,report=trip.reports[-1])


def fight(trip,boss_id,expected):
    slot,actor=trip.state.fieldSlots[boss_id],trip.actor
    state,boss=trip.state,slot.enemy
    trip.approach(boss.x-104,480,'encounter approach')
    started_level, hp, mora, start=state.progression.level, actor.hp, state.mora, state.t
    before=trip.totals()
    moves,recoveries,bolts={},set(),set()
    matrix=boss_id==BOSSES[1][1]
    fixed_positions={}
    aerial=counter=cloaked=hit_during_cloak=False
    core_window=None
    pivot=None
    controls={(d,a):trip.lua.table(left=d<0,right=d>0,attack=a)
              for d in (-1,0,1) for a in (False,True)}
    for _ in range(6600):
        if boss.hp<=0:
            break
        assert actor.hp>0 and state.returns==before[2]
        cast=slot.cast
        recovering=bool(cast and cast.tick>=cast.move.recover)
        during_cloak=False
        if cast:
            m,t=cast.move,cast.tick
            if t==m.lock:
                frame=trip.frame()
                assert frame.fieldBoss.move==m.id
                points=list(cast.points.values()) if cast.points else [cast.dest] if cast.dest else []
                fixed_positions[m.id]=points
                moves.setdefault(m.id, dict(lock=t, points=points, hpAtLock=actor.hp))
                if m.kind in ('plunge','cloak'):
                    pivot=cast.dest-cast.dir*130
                elif m.kind=='pillars':
                    assert [d.text for d in frame.draws.values() if d.kind=='text' and d.color=='#fff5d2']==['1','2','3']
                    pivot=points[1]+cast.dir*151
                elif m.kind=='seeds':
                    pivot=cast.origin-cast.dir*118
                else:
                    pivot=cast.origin+cast.dir*(238 if m.kind=='ray' else 168)
            if m.kind=='seeds':
                bolts.update(cast.projectiles.keys())
                bolts.update(cast.shots.keys())
            if m.kind=='plunge' and boss.y<420:
                aerial=bool(trip.frame().fieldBoss.flying)
            if m.kind=='cloak' and m.travel[1]<=t<m.travel[2]:
                field=trip.frame().fieldBoss
                assert field.cloaked and field.label=='透影移動・核に攻撃可能'
                assert field.destination==cast.dest and not boss.invulnerable
                cloaked = during_cloak = True
            if m.id in fixed_positions and t>=m.lock:
                assert fixed_positions[m.id]==(list(cast.points.values()) if cast.points else [cast.dest] if cast.dest else [])
            if m.id in moves and not recovering:
                end=max(m.fire.values())+m.life if m.fire else max(w[2] for w in m.active.values())
                if t==end:
                    moves[m.id].setdefault('hpAfterAttack',actor.hp)
            if recovering and m.id not in recoveries:
                frame=trip.frame()
                assert frame.fieldBoss.recovering and '反撃の隙' in frame.fieldBoss.label
                if m.kind=='plunge':
                    assert frame.fieldBoss.coreWindowTicks==m.total-t and boss.y==480
                    assert any(d.kind=='rect' and d.w==32 and d.color=='#302235' for d in frame.draws.values())
                    core_window=frame.fieldBoss.coreWindowTicks
                recoveries.add(m.id)
        else:
            pivot=None
        ready=len(recoveries)==3
        dx=boss.x-actor.x
        if not ready and cast and not recovering and pivot is not None:
            offset=pivot-actor.x
            direction=0 if abs(offset)<7 else (1 if offset>0 else -1)
            attack=False
        else:
            offset=dx-(90 if dx>0 else -90)
            direction=0 if abs(offset)<8 else (1 if offset>0 else -1)
            if not direction and dx*actor.dir<0:
                direction=1 if dx>0 else -1
            attack=ready and (not matrix or during_cloak or hit_during_cloak) and abs(dx)<125 and dx*actor.dir>0
        old_hp,old_cd=boss.hp,actor.cd.normal or 0
        trip.tick(1,controls[direction,attack])
        ordinary_hit=attack and (actor.cd.normal or 0)>old_cd and boss.hp<old_hp
        counter=counter or (recovering and ordinary_hit)
        hit_during_cloak=hit_during_cloak or (during_cloak and ordinary_hit)
    assert slot.phase=='respawn' and state.kills==before[0]+1 and state.returns==before[2]
    assert set(moves)==set(expected)==recoveries and counter
    if boss_id==BOSSES[0][1]:
        assert aerial and bolts=={1,2,3} and core_window==144
    else:
        assert cloaked and hit_during_cloak
    return dict(levelAtEntry=started_level,levelAfterKill=state.progression.level,moves=moves,
                recoveryLabels=sorted(recoveries),coreWindowTicks=core_window,bolts=sorted(bolts),
                airborne=aerial,cloaked=cloaked,normalHitDuringCloak=hit_during_cloak,counterHit=counter,
                hpBefore=hp,hpAfter=actor.hp,seconds=round(state.t-start,2),
                xp=state.progression.killXp-before[1],mora=state.mora-mora)


def run(source):
    WORK.mkdir(parents=True,exist_ok=True)
    trip=SurveyJourney(source,runtime())
    history=(*EARLIER,CANOPY,SKY,DRAKE)
    assert trip.state.story.node==HUB and trip.state.progression.level==69 and not trip.state.inventory.sampleKit
    assert all(trip.state.story.quests[q].status=='complete' for q in history)
    _,_,matrix,approach,_=BOSSES[1]
    trip.travel(approach)
    guide=trip.guide(matrix)
    assert guide['status']=='blocked' and guide['requiredLevel']==70
    trip.confirm_lock(matrix,'必要レベル 70')
    trip.travel(HUB)
    results={}
    progression=None
    for index,(name,boss,arena,approach,expected) in enumerate(BOSSES):
        if index:
            save(trip,'collei-ready')
            progression=collei(trip)
            assert trip.state.progression.level==70
        quest=name+'-commission'
        trip.act('story_accept:'+quest)
        assert trip.state.story.quests[quest].status=='active'
        save(trip,name+'-ready')
        assert [step['id'] for step in trip.travel(arena)]==[approach,arena]
        result=fight(trip,boss,expected)
        assert trip.state.story.quests[quest].count==1
        trip.travel(HUB)
        trip.report(quest)
        cooldown=trip.snapshot()['fieldBosses'][boss]
        assert cooldown['hp']==0 and cooldown['waitTicks']>0
        trip.restore()
        assert trip.state.endgame.bosses[boss].clears==1 and trip.state.story.quests[quest].cycles==1
        assert trip.snapshot()['fieldBosses'][boss]==cooldown
        results[name]=dict(result,report=trip.reports[-1],restoredCooldown=cooldown['waitTicks'])
    assert all(trip.state.story.quests[q].status=='complete' for q in (*history,COLLEI))
    save(trip,'asimon-complete')
    return dict(sourceSha256=trip.source,matrixGate=dict(lockedAt=69,requires=70),progression=progression,
                trials=results,returns=trip.state.returns)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',default=str(SOURCE))
    result=run(parser.parse_args().from_save)
    (ROOT/'evidence/earned-sumeru-dendro-matrix.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(result)
