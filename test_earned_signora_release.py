"""Compare two earned expert clears with and without releasing the left brazier in fire phase."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat


def replay(source, output, release):
    spec = next(row for row in read('content/weekly-boss-spawns.json')['weeklyBosses']
                if row['controller'] == 'signora')
    trip, slot, start, loadout, mode, key, prior = expert_rematch(source.resolve(), runtime(), spec)
    state, hero, boss = trip.state, trip.actor, slot.primary
    before = state.progression.total, state.mora
    hp_start = boss.hp
    phases, moths, frames = [], [], {}
    heat = {}
    recorded_release = None
    tornado = None
    recovery_damage = 0
    floor_snapshot = None
    rain_lock_x, comparison_tick = 203, 295

    def sample(label, tick):
        if label in frames:
            return
        card = slot.cast
        frames[label] = capture_scene(trip, tick, slot.stage, card.id if card else slot.stage,
                                      card.t if card else slot.stageTick)

    def floors():
        return [[tile.x, tile.y] for tile in slot.floors.values()]

    for tick in range(1, 60 * 510 + 1):
        stage, card, seal = slot.stage, slot.cast, slot.seal
        if not phases or phases[-1] != stage:
            phases.append(stage)
            sample({'cryo':'氷形態', 'seal':'氷の繭', 'transform':'焔蝶の羽化', 'pyro':'炎形態'}[stage], tick-1)
        dx = boss.x-hero.x
        direction = 1 if dx>=0 else -1
        goal = boss.x-direction*74
        if abs(goal-hero.x)<7 and dx*hero.dir<0:
            goal=hero.x+direction*24
        attack = not boss.invulnerable and abs(dx)<112 and dx*hero.dir>=0
        hold = False
        if stage=='seal' and not seal.tokens[state]:
            moth = min(seal.moths.values(),key=lambda m:abs(hero.x-m.x),default=None)
            goal,attack = (moth.x if moth else 330),False
        elif stage=='pyro' and tornado is None:
            goal,attack=rain_lock_x,False
            if floor_snapshot or card and card.id=='WS12' and card.t>=215:
                goal=70
            if release and not recorded_release and card and card.id=='WS12' and card.t>=215:
                hold=abs(hero.x-goal)<8
            if card and card.id=='WS14' and card.t>=400:
                goal=400

        if hero.ground and hero.y<475:
            trip.act('drop')
        seq=state.seq
        old_floor=floors() if stage=='pyro' and card and card.id=='WS12' else []
        old_temperature=slot.climates[state].temperature if slot.climates[state] else 0
        hp_before,boss_before=hero.hp,boss.hp
        trip.tick(1,trip.lua.table(left=hero.x>goal+5,right=hero.x<goal-5,attack=attack,interact=hold))
        if tornado and card and card.id=='WS14' and card.move.recovery<=card.t<card.move.total:
            recovery_damage+=boss_before-boss.hp
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp>0
        events=[event for event in state.events.values() if event.seq>seq]
        for event in events:
            if event.kind=='signora:moth-used':
                strength=next(e.value for e in events if e.kind=='signora:seal-hit')
                moths.append({'id':event.value,'damage':strength,'remaining':slot.seal.hp if slot.seal else 0})
                sample(f'紅蓮蛾の一撃 {len(moths)}',tick)
            elif event.kind=='signora:WS16:release':
                recorded_release=dict(device=event.value, moveTick=card.t, before=old_floor, after=floors(),
                                      beforeTemperature=old_temperature,afterTemperature=slot.climates[state].temperature)
                sample('左の霜眼を長押しして放出',tick)
        if card and card.id=='WS12' and not floor_snapshot:
            if card.t==181:
                sample('焼尽の雨で火床が残る',tick)
            if hp_before>hero.hp and any(e.kind=='signora:floor-damage' and e.actor==1 for e in events):
                heat['floorDamage']=hp_before-hero.hp
            if card.t==comparison_tick:
                floor_snapshot=floors()
                heat.update(t=card.t,temperature=slot.climates[state].temperature,
                            cooldown=max(0,slot.devices[1]-slot.clock),floors=floor_snapshot)
                sample('装置前の火床と温度',tick)
        if card and card.id=='WS14':
            if card.t==132:
                sample('灰燼の竜巻',tick)
            if card.t==420 and tornado is None:
                tornado=dict(tick=tick,moveTick=card.t,duration=card.move.total-card.move.recovery)
                sample('竜巻後の反撃開始',tick)
    else:
        raise AssertionError((phases, moths, heat, recorded_release, boss.hp))

    assert phases==['cryo','seal','transform','pyro']
    assert [record['damage'] for record in moths]==[25]*4, moths
    assert [record['remaining'] for record in moths]==[75,50,25,0]
    for index,moth in enumerate(moths,1):
        assert frames[f'紅蓮蛾の一撃 {index}']['view']['sealStrike']=={
            'source':'moth','damage':25,'remaining':moth['remaining']}
    assert tornado and recovery_damage>0, (tornado, recovery_damage, heat)
    assert bool(recorded_release)==release
    assert len(heat['floors'])==(1 if release else 2), (heat,recorded_release)
    if release:
        assert recorded_release['device']==1 and recorded_release['afterTemperature']==0
        assert len(recorded_release['before'])-len(recorded_release['after'])==1
        assert frames['左の霜眼を長押しして放出']['view']['deviceRelease']=={'side':1,'floors':1}
    reward=trip.frame().weeklyBoss.reward
    payout=dict(xp=reward.xp,mora=reward.mora,first=reward.first)
    verify_repeat(trip,before,start,mode,key,prior)
    case='signora-release' if release else 'signora-passive'
    label='霜眼を長押しして火床を消す' if release else '霜眼のそばで冷却する'
    (output/f'{case}-frames.json').write_text(json.dumps(
        frames,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
    print(case,tick,moths,heat,recorded_release,tornado,recovery_damage,flush=True)
    return dict(controller='signora',case=case,label=label,ticks=tick,sourceSha256=trip.source,
                bossHP=hp_start,loadout=loadout,phases=phases,moths=moths,heat=heat,
                release=recorded_release,tornado=tornado,recoveryDamage=recovery_damage,
                reward=payout,expertClears=[prior,prior+1])


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    fights=[replay(args.from_save,args.output_dir,release) for release in (True,False)]
    (args.output_dir/'weekly-mechanics.json').write_text(
        json.dumps(fights,ensure_ascii=False,indent=2)+'\n','utf8')
