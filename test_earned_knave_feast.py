"""Replay the Knave's expert Red Feast from the campaign save using player inputs."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


def replay(source, output, interrupt):
    spec=next(row for row in read('content/weekly-boss-spawns.json')['weeklyBosses']
              if row['controller']=='knave')
    trip, slot, start, loadout, mode, key, prior=expert_rematch(source.resolve(),runtime(),spec)
    state, hero, boss=trip.state, trip.actor, slot.primary
    before=state.progression.total,state.mora
    hp_start=boss.hp
    frames={}
    forms=[]
    first_payment=None
    first_debt=None
    feast_started=False
    handoff=None
    result=None
    exposure_damage=0
    exposure_ticks=0
    feast_hits=[]

    def sample(label,tick):
        card=slot.cast
        frames[label]=capture_scene(trip,tick,slot.form,card.key if card else 'idle',card.t if card else 0)

    for tick in range(1,60*480+1):
        card=slot.cast
        move=card.key if card else None
        move_tick=card.t if card else 0
        debt=slot.actors[hero]
        if not forms or forms[-1]!=slot.form:
            forms.append(slot.form)
            sample('片鎌' if slot.form==1 else '凶月・双鎌',tick-1)
        dx=boss.x-hero.x
        facing=1 if dx>=0 else -1
        goal=boss.x-facing*70
        if abs(goal-hero.x)<7 and dx*hero.dir<0:
            goal=hero.x+facing*24
        attack=(not boss.invulnerable and abs(dx)<108 and dx*hero.dir>=0)
        hold=False
        if not result:
            if debt.debt>0 and not debt.feather and move!='WK17':
                goal=spec['lamps']['x'][0]
                hold=abs(hero.x-goal)<7 and hero.ground
                attack=False
            if slot.form==2 and move!='WK17':
                attack=False
            if move=='WK15' and debt.feather:
                if not feast_started:
                    feast_started=True
                    sample('赤宴・前方奔流の予兆',tick-1)
                if move_tick>=96 and handoff is None:
                    handoff={'tick':tick-1,'moveTick':move_tick,
                             'hp':hero.hp,'debt':debt.debt,'feather':True}
                    sample('羽印で中断できる時間',tick-1)
                if interrupt:
                    if 96<=move_tick<165 and 24<=abs(dx)<105 and dx*hero.dir>=0:
                        trip.act('encounter_interact')
                elif move_tick>=96:
                    goal=card.origin-card.dir*145
                if not interrupt and move_tick==180:
                    sample('前方奔流の判定中',tick-1)
            if move=='WK17':
                attack=slot.phase=='exposure' and attack and boss.hp>hero.atk*4
                if slot.phase=='exposure':
                    exposure_ticks+=1
                    if move_tick==36:
                        sample('断宴・3.6秒の反撃',tick-1)
        if hero.ground and hero.y<475:
            trip.act('drop')
        hp_before, seq=boss.hp,state.seq
        trip.tick(1,trip.lua.table(left=hero.x>goal+5,right=hero.x<goal-5,attack=attack,interact=hold))
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp>0,(tick,move,hero.hp)
        for event in state.events.values():
            if event.seq<=seq:
                continue
            if event.actor==hero.id and event.kind=='knave:WK08:debt' and first_debt is None:
                first_debt={'tick':tick,'amount':event.value,'maxHp':hero.maxhp}
                sample('旅人に命の契約',tick)
            elif handoff and not result and event.actor==hero.id and event.kind=='knave:WK15:hit':
                feast_hits.append(event.value)
            elif event.actor==hero.id and event.kind=='knave:WK08:lamp' and first_payment is None:
                first_payment={'tick':tick,'amount':event.value}
                sample('返済灯で契約を返済',tick)
            elif event.actor==hero.id and event.kind=='knave:WK08:feather' and '完済して羽印を取得' not in frames:
                sample('完済して羽印を取得',tick)
        if move=='WK17' and 36<=move_tick<252:
            exposure_damage+=hp_before-boss.hp
            if move_tick==36:
                assert frames['断宴・3.6秒の反撃']['view']['knave']['exposure']==216
            if move_tick==251:
                result={'tick':tick,'interrupted':True,'hp':hero.hp,'debt':debt.debt,
                        'feather':bool(debt.feather)}
        if move=='WK15' and move_tick==246 and not interrupt and handoff and not result:
            result={'tick':tick,'interrupted':False,'hp':hero.hp,'debt':debt.debt,
                    'feather':bool(debt.feather)}
            sample('前方奔流が収まる',tick)
    else:
        raise AssertionError((tick,forms,first_debt,first_payment,feast_started,handoff,result,move,boss.hp,hero.hp,hero.x,boss.x))

    assert forms==[1,2] and first_debt and first_payment and feast_started and handoff and result
    assert first_debt['amount']==first_debt['maxHp']*.25
    assert first_payment['amount']==first_debt['maxHp']*.05
    assert not feast_hits and result['debt']==handoff['debt'] and result['hp']>0, (handoff,result,feast_hits)
    assert result['feather'] is not interrupt
    if interrupt:
        assert frames['断宴・3.6秒の反撃']['view']['knave']['feastResult']=={
            'kind':'interrupted','actor':1}
    else:
        assert frames['前方奔流が収まる']['view']['knave']['feastResult']=={'kind':'ended'}
    assert (exposure_ticks,exposure_damage>0)==((216,True) if interrupt else (0,False))
    reward=trip.frame().weeklyBoss.reward
    payout=dict(xp=reward.xp,mora=reward.mora,first=reward.first)
    verify_repeat(trip,before,start,mode,key,prior)
    case='knave-interrupt' if interrupt else 'knave-evade'
    label='羽印で赤宴を中断' if interrupt else '赤宴の範囲から離れる'
    (output/f'{case}-frames.json').write_text(json.dumps(
        frames,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
    print(case,tick,handoff,result,exposure_ticks,exposure_damage,payout,flush=True)
    return dict(controller='knave',case=case,label=label,ticks=tick,sourceSha256=trip.source,
                bossHp=hp_start,loadout=loadout,forms=forms,contract=first_debt,firstPayment=first_payment,
                handoff=handoff,result=result,feastHits=feast_hits,exposureTicks=exposure_ticks,exposureDamage=exposure_damage,
                reward=payout,expertClears=[prior,prior+1])


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    fights=[replay(args.from_save,args.output_dir,interrupt) for interrupt in (True,False)]
    (args.output_dir/'weekly-mechanics.json').write_text(
        json.dumps(fights,ensure_ascii=False,indent=2)+'\n','utf8')
