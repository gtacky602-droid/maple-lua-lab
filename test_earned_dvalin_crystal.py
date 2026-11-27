"""Play two earned expert clears with different first crystal windows."""

from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import runtime
from test_earned_weekly_mechanics import capture_scene, expert_rematch, read, verify_repeat
from tools.dvalin_test_driver import drive_dvalin


def replay(source, output, use_first_window):
    spec=next(boss for boss in read('content/weekly-boss-spawns.json')['weeklyBosses']
              if boss['controller']=='dvalin')
    trip, slot, start, loadout, mode, key, prior=expert_rematch(source.resolve(),runtime(),spec)
    state, hero, boss=trip.state, trip.actor, slot.primary
    before=state.progression.total,state.mora
    start_hp=boss.hp
    frames={}
    moves=set()
    windows=[]
    pad_ticks=[]
    observed_hazards=set()
    rewarning=None
    landed=False
    down_hp=None

    def sample(label, tick):
        card=slot.cast
        frames[label]=capture_scene(trip,tick,slot.stage,card.move.id if card else 'idle',
                                    card.tick if card else 0)

    sample('開戦',0)
    jump=lambda:trip.act('jump')
    for tick in range(1,60*480+1):
        card=slot.cast
        move=card.move.id if card else None
        move_tick=card.tick if card else 0
        if move:
            moves.add(move)
        if slot.stage=='perch' and '前脚・体勢への攻撃' not in frames:
            sample('前脚・体勢への攻撃',tick-1)
        if slot.hazard:
            observed_hazards.add(slot.hazard.zone)
            if slot.hazard.warning==60 and slot.cycle and rewarning is None:
                rewarning=tick-1
        if move=='WD08':
            first=slot.breaks==1
            if move_tick==0:
                down_hp=boss.hp
                landed=False
            if move_tick==42:
                label=f'結晶の露出・{slot.breaks}回目'
                sample(label,tick-1)
                assert frames[label]['view']['crystal']['remaining']==420
            if not landed and hero.ground and abs(hero.y-spec['stepY'])<1:
                landed=True
                pad_ticks.append({'window':slot.breaks,'moveTick':move_tick})
            if move_tick==462:
                windows.append({'number':slot.breaks,'damage':down_hp-boss.hp,'landed':landed})
                label=f'踏み場が降下・{slot.breaks}回目'
                sample(label,tick-1)
                assert frames[label]['view']['crystal']['damage']==windows[-1]['damage']
                assert 'remaining' not in frames[label]['view']['crystal']
            if move_tick==500 and first:
                assert slot.padY>spec['stepY']
                sample('足元の床まで降下中',tick-1)
        else:
            first=False

        controls=drive_dvalin(slot,hero,spec,jump,attack_crystal=use_first_window or not first)
        hp=boss.hp
        trip.tick(1,trip.lua.table(**controls))
        if move=='WD08' and boss.hp<hp and '首の結晶に命中' not in frames and not slot.waitUntil:
            assert 42<=move_tick<462
            sample('首の結晶に命中',tick)
        if slot.waitUntil:
            break
        assert not state.returns and hero.hp>0 and slot.falls==0,(tick,move,hero.hp,slot.falls)
    else:
        raise AssertionError((tick,sorted(moves),windows,boss.hp,hero.hp))

    assert windows and windows[0]['number']==1 and windows[0]['landed']
    assert (windows[0]['damage']>0)==use_first_window
    assert slot.breaks>=2 and boss.hp==0 and pad_ticks
    assert observed_hazards and rewarning
    assert '首の結晶に命中' in frames and '結晶の露出・2回目' in frames
    reward=trip.frame().weeklyBoss.reward
    payout=dict(xp=reward.xp,mora=reward.mora,first=reward.first)
    breaks=slot.breaks
    verify_repeat(trip,before,start,mode,key,prior)
    case='dvalin-hit-first' if use_first_window else 'dvalin-wait-next'
    label='最初の露出で結晶を攻撃' if use_first_window else '次の露出まで待つ'
    (output/f'{case}-frames.json').write_text(json.dumps(
        frames,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
    print(case,tick,windows,pad_ticks,rewarning,breaks,payout,flush=True)
    return dict(controller='dvalin',case=case,label=label,ticks=tick,sourceSha256=trip.source,
                bossHp=start_hp,loadout=loadout,moves=sorted(moves),completedWindows=windows,
                padLandings=pad_ticks,floorRewarningTick=rewarning,breaks=breaks,reward=payout,
                expertClears=[prior,prior+1])


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    fights=[replay(args.from_save,args.output_dir,first) for first in (True,False)]
    (args.output_dir/'weekly-mechanics.json').write_text(
        json.dumps(fights,ensure_ascii=False,indent=2)+'\n','utf8')
