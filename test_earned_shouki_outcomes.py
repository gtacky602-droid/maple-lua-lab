"""Exercise a direct chest hit and recovery from a missed trial on earned expert saves."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


def replay(source, output, skip):
    engine = runtime()
    spec = next(row for row in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if row['controller'] == 'shouki')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(source.resolve(), engine, spec)
    state, hero, boss = trip.state, trip.actor, slot.primary
    before = state.progression.total, state.mora
    frames, pods, stages = {}, [], []
    outcome = {}
    hp_before, damage_before, seq = hero.hp, state.damage, state.seq
    counter_damage = resumed_damage = 0
    returned = False

    def sample(label, tick, stage, move=None, move_tick=None):
        if label not in frames:
            frames[label] = capture_scene(trip, tick, stage, move or stage, move_tick or slot.stageTick)

    def observe(tick, stage, move, move_tick):
        nonlocal hp_before, damage_before, seq, counter_damage, resumed_damage, returned
        if not stages or stages[-1]['name'] != stage:
            stages.append(dict(name=stage, tick=tick, bossHp=boss.hp, armor=slot.shield))
            labels = {'p1':'くびれから上の開戦', 'rise':'装甲起動', 'p2':'装甲戦',
                      'trial':'滅度機の試練', 'failure':'試練の時間切れ', 'collapse':'胸部に射撃が命中'}
            sample(labels[stage], tick, stage, move, move_tick)
            if stage == 'p2' and 'damage' in outcome and not returned:
                returned = True
                outcome['resumedArmor'] = slot.shield
                outcome['resumedAttackable'] = not boss.invulnerable
                sample('装甲0で戦闘に戻る', tick, stage)
        if stage == 'trial' and slot.stageTick == 60:
            sample('再試練の滅度機4基' if returned else '滅度機4基が出現', tick, stage)
        for event in (e for e in state.events.values() if e.seq > seq):
            if event.kind == 'shouki:WN15:destroyed':
                pods.append(event.value)
                sample(f'滅度機を破壊 {len(pods)}', tick, stage)
            elif event.kind == 'shouki:WN14:fire':
                sample('端末を発射', tick, stage)
        if stage == 'failure' and slot.stageTick == spec['moves']['WN16']['windows'][0][0]:
            outcome.update(kind='timeout', tick=tick, damage=hp_before-hero.hp, remainingPods=slot.trialLeft)
            sample('刹那生滅が命中', tick, stage)
            assert frames['刹那生滅が命中']['view']['shouki']['trialResult']=={
                'kind':'timeout','damage':outcome['damage'],'remainingPods':2,'resumed':False}
        if stage == 'collapse' and slot.stageTick == 60:
            duration = trip.frame().weeklyBoss.shouki.exposure
            hit = dict(kind='core-hit',tick=tick,exposure=duration,remainingPods=slot.trialLeft)
            if returned:
                outcome['retry']=hit
            else:
                outcome.update(hit)
            sample('攻撃機会10秒', tick, stage)
            assert frames['攻撃機会10秒']['view']['shouki']['trialResult']=={'kind':'core-hit','resumed':False}
        if stage == 'collapse' and (outcome.get('kind')=='core-hit' or 'retry' in outcome):
            counter_damage += state.damage-damage_before
        if returned and stage == 'p2':
            resumed_damage += state.damage-damage_before
        if (counter_damage or resumed_damage) and state.damage > damage_before:
            sample('本体へ反撃', tick, stage, move, move_tick)
        hp_before, damage_before, seq = hero.hp, state.damage, state.seq

    driver = engine[0].execute((ROOT/'tools/earned_boss_driver.lua').read_text(encoding='utf8'))
    route = 'trial-timeout' if skip else 'mechanics'
    battle = native(driver(trip.core, state, slot, 'weekly', 60*420, route, trip.lua.table(sample=observe)))
    assert battle['status']=='clear' and counter_damage>0, (battle, outcome)
    if skip:
        assert (outcome['kind'],outcome['damage'],outcome['remainingPods'],outcome['resumedArmor'],
                outcome['resumedAttackable'])==('timeout',72,2,0,True), (stages,pods,outcome)
        assert resumed_damage>0 and sorted(pods[2:])==[1,2,3,4]
        assert outcome['retry']['exposure']==600, outcome
    else:
        assert sorted(pods)==[1,2,3,4]
        assert outcome['kind']=='core-hit' and outcome['exposure']==600, outcome
    reward = trip.frame().weeklyBoss.reward
    payout = dict(xp=reward.xp,mora=reward.mora,first=reward.first)
    verify_repeat(trip,before,start,mode,key,prior)
    case = 'shouki-timeout' if skip else 'shouki-core-hit'
    label = '試練の時間切れから戦闘に復帰' if skip else '滅度機4基を壊して胸部に命中'
    (output/f'{case}-frames.json').write_text(
        json.dumps(frames,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
    print(case,battle['ticks'],pods,outcome,counter_damage,flush=True)
    return dict(controller='shouki',case=case,label=label,sourceSha256=trip.source,
                bossHP=battle['maxHp'],ticks=battle['ticks'],loadout=loadout,stages=stages,
                pods=pods,outcome=outcome,counterDamage=counter_damage,resumedDamage=resumed_damage,
                reward=payout,expertClears=[prior,prior+1])


if __name__=='__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    fights = [replay(args.from_save,args.output_dir,skip) for skip in (False,True)]
    (args.output_dir/'weekly-mechanics.json').write_text(
        json.dumps(fights,ensure_ascii=False,indent=2)+'\n','utf8')
