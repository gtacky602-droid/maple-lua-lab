"""Finish the three early detours left on the single regional adventure."""
import argparse
import json
from hashlib import sha256
import re

from runtime import ROOT, runtime
from test_earned_branch_quests import Journey, quests
from test_regional_quest_prop_packing import measure

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--at-station', action='store_true', help='Rehearse from the earlier Lv160 station save')
args = parser.parse_args()
seed = 'snez-revisit-save' if args.at_station else 'cap-revisit-save'
trip = Journey(ROOT/'evidence'/f'{seed}.json', runtime(), select_traveler=True)
level = trip.state.progression.level
assert level == (160 if args.at_station else 200)
initial = trip.snapshot()
chapters = {q['id']: q['designId'] for q in quests.values()
            if re.fullmatch(r'Q-(MON|LIY|INA|SUM|FON|NAT|NOD|SNE)-[MS]\d{2}', q.get('designId',''))}
box, banner, stone = 'mond-return-box-quest', 'mond-night-banner-quest', 'liyue-stone-marks'
pending = {q for q in chapters if initial['story']['quests'].get(q, {}).get('status') != 'complete'}
assert len(chapters) == 64 and pending == {box, banner, stone}

packing = {}
def sample(name):
    packing[name] = {profile:measure(trip.core,trip.state,profile) for profile in ('legacy','h48c32','h32c16')}

def accept(q):
    trip.act('story_accept:'+q)
    assert trip.state.story.quests[q].status == 'active'

def near(x, y=480):
    trip.approach(x, y, trip.state.story.node)

def collect(x, y=480):
    near(x, y)
    trip.act('story_collect')

def clear(q, goal):
    # Walk within range, face the target and jump for airborne slimes.
    for _ in range(3600):
        if trip.state.story.quests[q].count >= goal:
            return
        living = [e for e in trip.state.enemies.values() if e.hp > 0]
        if not living:
            trip.tick(1)
            continue
        target = min(living, key=lambda e: abs(e.x-trip.actor.x))
        dx = target.x-trip.actor.x
        moving = abs(dx)>42 or trip.actor.dir*dx<0
        trip.tick(1, trip.lua.table(left=moving and dx<0, right=moving and dx>=0,
                                    jump=bool(target.flying and target.y<trip.actor.y-50), attack=True))
    raise AssertionError((q, trip.actor.x, [(e.x,e.y,e.hp) for e in trip.state.enemies.values()]))

trip.warp('mond-town')
accept(box)
trip.mark(box,1)
trip.cross('mond-library-orchard')
for index in (2,3,4):
    trip.mark(box,index)
sample('orchard-chase')
for x in (1200,1400,1600):
    near(x)
    trip.tick(78)
assert trip.state.story.quests[box].count == 5
clear(box,6)
trip.mark(box,7)
trip.cross('mond-town')
trip.report(box)
collect(340)
assert '魔物観察記録' in trip.frame().storyNotice
sample('mond-archive')

accept(banner)
trip.mark(banner,1)
trip.cross('mond-night-hill')
for index in (2,3,4):
    trip.mark(banner,index)
clear(banner,5)
trip.mark(banner,6)
trip.mark(banner,7)
sample('night-hill-banner')
trip.cross('mond-town')
trip.report(banner)

trip.warp('liyue-harbor')
accept(stone)
trip.cross('liyue-river-trail')
collect(1250)
trip.cross('liyue-cliff-planks')
near(520,395)
near(520,305)
collect(905,305)
trip.cross('liyue-harbor')
trip.cross('liyue-quarry-post')
collect(420)
near(540,391)
near(540,305)
trip.cross('liyue-craftsmen-overlook')
collect(488,397)
for tile in ('cut','carry','build'):
    trip.act('story_stone_tile:'+stone+':'+tile)
near(550,312)
near(820,231)
collect(980,231)
trip.cross('liyue-quarry-post')
trip.cross('liyue-harbor')
trip.report(stone)
trip.warp('white-pass-station')
trip.cross('sne-snow-match')
near(178)
assert trip.frame().storySnowball.record.wins >= 1
sample('snow-match')
assert packing['snow-match']['h32c16']['stamps'] > packing['snow-match']['h32c16']['batches']
trip.cross('white-pass-station')
trip.restore()
final = trip.snapshot()
for q,record in initial['story']['quests'].items():
    if record['status'] == 'complete':
        assert final['story']['quests'][q] == record
by_region = {}
for q,code in sorted(chapters.items(),key=lambda item:item[1]):
    assert final['story']['quests'][q]['status'] == 'complete' and final['story']['quests'][q]['cycles'] >= 1
    by_region.setdefault(code.split('-')[1],[]).append({'design':code,'quest':q})
assert sorted(map(len,by_region.values())) == [8]*8
assert trip.state.progression.level == level and trip.state.returns == 0
def write(name, data):
    (ROOT/'evidence'/name).write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode('utf8'))
if args.at_station:
    (ROOT/'work/regional-chapters-station.json').write_text(json.dumps(final),encoding='utf8')
    (ROOT/'work/regional-chapters-station-packing.json').write_text(json.dumps(packing),encoding='utf8')
else:
    assert final['progression']['overflowXp'] > initial['progression']['overflowXp']
    write('regional-chapters-save.json', final)
    write('regional-chapters-packing.json',packing)
    write('regional-chapters-route.json', dict(level=level,completed=64,regions=by_region,reports=trip.reports,
          returns=trip.state.returns,source=seed,sourceSha256=sha256((ROOT/'evidence'/f'{seed}.json').read_text('utf8').encode('utf8')).hexdigest(),
          preserved=sum(rec['status']=='complete' for rec in initial['story']['quests'].values())))
print(level, len(chapters), trip.reports, flush=True)
