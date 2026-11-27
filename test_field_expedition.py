"""Walk the atlas to field arenas and carry confirmed first clears into one save."""
import argparse
from hashlib import sha256
import json
from pathlib import Path

from runtime import ROOT,runtime
from test_earned_branch_quests import graph
from test_earned_survey_itineraries import SurveyJourney

def read(file):
    return json.loads((ROOT/file).read_bytes())

def write(file,value):
    (ROOT/file).write_bytes((json.dumps(value,ensure_ascii=False,sort_keys=True)+'\n').encode())

hubs=dict(zip(('モンド','璃月','稲妻','スメール','フォンテーヌ','ナタ','ナド・クライ','スネージナヤ','ドラゴンスパイン','淵下宮','層岩巨淵・地下鉱区','沈玉の谷','ドーンマンポート','ノヴォキッチェヴ（仮構造）'),
              ('mond-town','liyue-harbor','inazuma-town','sumeru-hub','fontaine-hub','natlan-hub','nod-town','snezhnaya-hub','dragonspine-camp','enkanomiya-camp','liyue-harbor','chenyu-camp','dornman-camp','novokichev-camp')))
regions={n['id']:n['region'] for n in graph['nodes']}
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--legends',action='store_true')
parser.add_argument('--from-save', type=Path)
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
if bool(args.from_save) != bool(args.output_dir):
    parser.error('--from-save and --output-dir must be provided together')
legends=args.legends
hubs.update({'霜月':'nod-town','往日の海':'bygone-camp','古の聖山':'natlan-hub','オシカ・ナタ':'ochkanatlan-dock','空の神殿':'natlan-hub'})
roster=[s for s in read('content/field-boss-spawns.json')['fieldBosses']
        if not s['id'].startswith('original-') and s['id'].startswith('legend-')==legends]
prefix='legend' if legends else 'field'
seed='challenge-expedition-save' if legends else 'growth-expedition-save'
source=f'evidence/{seed}.json'
checkpoint=f'work/{prefix}-expedition-progress.json'
directory = args.output_dir.resolve() if args.output_dir else ROOT / 'evidence'
if args.from_save:
    directory.mkdir(parents=True, exist_ok=True)
    source = args.from_save.resolve()
    seed = source.name
    checkpoint = directory / 'expedition-progress.json'
source_hash = sha256((ROOT / source).read_bytes()).hexdigest()
initial = read(source)
engine=runtime()
rows,missed=[],[]
already = 0
for spec in roster:
    trip=SurveyJourney(ROOT/source,engine,select_traveler=True)
    s=trip.state
    id,node=spec['id'],spec['node']
    start=trip.snapshot()
    if start['endgame']['bosses'].get(id,{}).get('clears',0)>0:
        already += 1
        continue
    hub=hubs[regions[node]]
    try:
        trip.warp(hub)
        bag=s.inventory
        if len(bag.ground)>=8:
            items=list(bag['items'].values())

            spare=sorted((a for a in items if a.owner==0 and not a.locked),key=lambda a:(a.rarity,a.itemLv,a.id))
            for a in spare[:max(0,len(items)+len(bag.ground)-80)]:trip.act('artifact_sell:'+str(a.id))
            trip.act('artifact_recover')
        legs=trip.travel(node)
        slot=s.fieldSlots[id]
        assert slot and slot.enemy,(node,'spawn')
        finished='cleared' if spec.get('manualRechallenge') else 'respawn'
        before=(s.progression.total,s.mora)
        for tick in range(7200):
            if slot.phase==finished:break
            enemy=slot.enemy
            dx=enemy.x-trip.actor.x
            moving=abs(dx)>60 or dx*trip.actor.dir<0
            if tick%45==0:trip.act('skill1')
            if tick%90==0:trip.act('skill2')
            trip.tick(1,trip.lua.table(left=moving and dx<0,right=moving and dx>0,jump=enemy.y<trip.actor.y-60,attack=True))
            assert s.story.node==node,(node,'returned')
        assert slot.phase==finished,(node,'survived',slot.phase)
        earned=(s.progression.total-before[0],s.mora-before[1])
        assert earned[0]>0 and earned[1]>0,(id,earned)
        trip.warp(hub)
        trip.restore()
        after=trip.snapshot()
        assert after['endgame']['bosses'][id]['clears']==1
        assert all(after['endgame']['bosses'][k]['clears']>=v['clears'] for k,v in start['endgame']['bosses'].items())
        rows.append(dict(id=id,name=spec['name'],region=regions[node],node=node,route=[leg['id'] for leg in legs],xp=earned[0],mora=earned[1]))
        write(checkpoint,after)
        source=checkpoint
        print('clear',len(rows),spec['name'],flush=True)
    except AssertionError as error:
        detail=error.args[0] if error.args else ''
        reason=detail[2].get('reason') if isinstance(detail,tuple) and len(detail)>2 and isinstance(detail[2],dict) else str(detail)
        missed.append(dict(id=id,node=node,reason=reason or '経路未確認'))
        print('pending',node,str(error)[:160],flush=True)
assert len(rows)+len(missed)+already==len(roster)
if not legends:assert not missed,missed
final = read(source)
assert final['story']['quests'] == initial['story']['quests']
write(directory/f'{prefix}-expedition-save.json', final)
write(directory/f'{prefix}-expedition-route.json',
      dict(seed=seed,sourceSha256=source_hash,catalog=len(roster),alreadyCleared=already,newClears=rows,pending=missed))
