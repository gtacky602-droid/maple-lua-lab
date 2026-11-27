"""Report growth lessons using the expedition's earned companions, inventory and skills."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT,runtime
from test_earned_branch_quests import Journey,quests

parser = ArgumentParser(description=__doc__)
parser.add_argument('--from-save', type=Path)
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
if bool(args.from_save) != bool(args.output_dir):
    parser.error('--from-save and --output-dir must be provided together')
seed = args.from_save.resolve() if args.from_save else ROOT / 'evidence/hidden-expedition-save.json'
if args.output_dir:
    args.output_dir.mkdir(parents=True, exist_ok=True)
trip=Journey(seed,runtime(),select_traveler=True)
s=trip.state
act=trip.act
initial=trip.snapshot()
lessons=sorted((q for q in quests.values() if q.get('designId','').startswith('Q-G')),key=lambda q:q['designId'])
examples={2:('target_set:troupe','artifact_example:compare'),3:('artifact_example:upgrade',),
          4:('artifact_example:inherit',),5:('artifact_example:imprint',),6:('artifact_pair_preview:beidou',)}
for i,q in enumerate(lessons,1):
    key=q['id']
    if initial['story']['quests'].get(key,{}).get('status')=='complete':continue
    trip.warp(q['hub'])
    act('story_accept:'+key)
    assert s.story.quests[key],key
    for operation in examples.get(i,()):
        act(operation)
    if i in (7,8):
        companion,skill,node=('columbina','SK54','nod-field') if i==7 else ('beidou','SK57','snezhnaya-field')
        act('companion:'+companion)
        assert trip.core.configure(s,trip.lua.table_from([[skill]]+[[] for _ in range(7)],recursive=True))[0]
        trip.travel(node)
        enemy=next(e for e in s.enemies.values() if e.hp>0)
        trip.approach(enemy.x-45,enemy.y,key)
        act('slot1')
        trip.tick(90)
        trip.warp(q['hub'])
    if i==13:
        act('abyss_start:entry:troupe')
        act('auto')
        for _ in range(540):
            trip.tick(30)
            if s.endgameRun.status=='between':act('endgame_next')
            if s.endgameRun.status=='clear':break
        assert s.endgameRun.status=='clear'
        act('endgame_exit')
    if i==14:
        act('endgame_farka')
        for _ in range(1800):
            if s.story.quests[key].count>=1:break
            dx=s.farka.x-trip.actor.x
            moving=abs(dx)>48 or trip.actor.dir*dx<0
            trip.tick(1,trip.lua.table(left=moving and dx<0,right=moving and dx>0,attack=s.farka.phase=='recover'))
        act('endgame_exit')
    if i==15:
        if s.auto:act('auto')
        trip.travel('andrius-wolf-ring')
        boss,_=trip.core.currentWeeklyBoss(s)
        trip.approach(boss.primary.x-40,boss.primary.y,key)
        trip.tick(90,trip.lua.table(attack=True))
        trip.warp(q['hub'])
    assert s.story.quests[key].count==q['goal'],(i,key,s.story.quests[key].count,s.storyNotice)
    trip.report(key)
    print(i,key,flush=True)
act('companion:'+initial['companion'])
assert trip.core.configure(s,trip.lua.table_from(initial['loadout'],recursive=True))[0]
trip.warp('fontaine-hub')
trip.restore()
final=trip.snapshot()
assert all(final['story']['quests'][q['id']]['status']=='complete' for q in lessons)
assert all(final['story']['quests'][k]==v for k,v in initial['story']['quests'].items() if v['status']=='complete')
directory = args.output_dir or ROOT / 'evidence'
prior = sum(initial['story']['quests'].get(q['id'], {}).get('status') == 'complete' for q in lessons)
proof = dict(reports=trip.reports, lessons=len(lessons), prior=prior, returns=trip.state.returns,
             seed=seed.name, sourceSha256=trip.source)
for name, data in [('growth-expedition-save', final), ('growth-expedition-route', proof)]:
    (directory / f'{name}.json').write_text(json.dumps(data, ensure_ascii=False, sort_keys=True) + '\n', 'utf-8')
