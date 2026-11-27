"""Accept, replay and report the outstanding boss commissions on the atlas save."""
from argparse import ArgumentParser
import json
from pathlib import Path

from runtime import ROOT,runtime
from story_scope import suspended_stage_returns
from test_earned_branch_quests import graph,quests
from test_earned_survey_itineraries import SurveyJourney

def read(path):
    return json.loads((ROOT/path).read_bytes())

def write(path,data):
    (ROOT/path).write_bytes((json.dumps(data,ensure_ascii=False,sort_keys=True)+'\n').encode())

parser = ArgumentParser(description=__doc__)
parser.add_argument('--from-save', type=Path)
parser.add_argument('--output-dir', type=Path)
args = parser.parse_args()
if bool(args.from_save) != bool(args.output_dir):
    parser.error('--from-save and --output-dir must be provided together')
source = args.from_save.resolve() if args.from_save else ROOT / 'evidence/northern-gates-save.json'
if args.output_dir:
    args.output_dir.mkdir(parents=True, exist_ok=True)
engine=runtime()
trip=SurveyJourney(source,engine,select_traveler=True)
fight=trip.lua.execute((ROOT/'tools/earned_boss_driver.lua').read_text('utf8'))
field={b['storyChallenge']:b for b in read('content/field-boss-spawns.json')['fieldBosses'] if b.get('storyChallenge')}
weekly={b['storyChallenge']:b for b in read('content/weekly-boss-spawns.json')['weeklyBosses']}
matches=read('content/stygian-matches.json')['matches']
start=trip.snapshot()
suspended = suspended_stage_returns(graph)
cases=[q for q in quests.values() if q['kind']=='boss' and q['hub'] not in suspended and q['target'] not in suspended
       and not q.get('legacyOnly') and start['story']['quests'].get(q['id'],{}).get('status')!='complete']
rows=[]
for q in cases:
    hub,key,target=q['hub'],q['id'],q['target']
    if trip.state.story.visited[hub]:
        trip.warp(hub)
    else:
        trip.travel(hub)
    trip.act('story_accept:'+key)
    s=trip.state
    assert s.story.quests[key], (key, s.storyNotice)
    bag=s.inventory
    if len(bag.ground)>=8:
        items=list(bag['items'].values())
        spare=sorted((a for a in items if not a.locked and a.owner==0),key=lambda a:(a.rarity,a.itemLv,a.id))
        for a in spare[:max(0,len(items)+len(bag.ground)+2-80)]:
            trip.act('artifact_sell:'+str(a.id))
        trip.act('artifact_recover')
    if target in field:
        kind='field'
        b=field[target]
        trip.travel(b['node'])
        slot=s.fieldSlots[b['id']]
        for tick in range(18000):
            if s.story.quests[key].count>=q['goal']:break
            enemy=slot.enemy
            if not enemy or enemy.hp<=0:
                trip.tick(30)
                continue
            dx=enemy.x-trip.actor.x
            move=abs(dx)>55 or dx*trip.actor.dir<0
            if tick%45==0:trip.act('skill1')
            if tick%90==0:trip.act('skill2')
            trip.tick(1,trip.lua.table(left=move and dx<0,right=move and dx>0,jump=enemy.y<trip.actor.y-50,attack=True))
            assert s.story.node==b['node']
    else:
        if target in weekly:
            kind='weekly'
            b=weekly[target]
            if b.get('original'):
                trip.travel(b['node'])
                mode = None
            else:
                origin,gate=next((n['id'],g) for n in graph['nodes'] for g in n['exits'] if g['to']==b['node'])
                trip.travel(origin)
                trip.approach(gate['x'],gate.get('y',480),b['node'])
                mode=trip.frame().weeklyDesk.modes[1]
                trip.act('weekly_start:'+b['id']+':'+mode.id)
            encounter=s.weeklySlots[b['id']]
        else:
            kind='stygian'
            match=target.removeprefix('stygian-')
            b=matches[match]
            trip.travel(b['hub'])
            trip.cross(b['node'])
            mode=trip.frame().stygianDesk.modes[1]
            trip.act('stygian_start:'+match+':'+mode.id+':troupe')
            encounter=s.endgameRun
        assert (mode is None or mode.available) and encounter,key
        outcome=fight(trip.core,s,encounter,kind,60*240,'mechanics')
        assert outcome.status=='clear',(key,outcome.status)
    assert s.story.quests[key].count==q['goal'],(key,s.story.quests[key].count)
    if kind=='stygian':trip.restore()
    trip.warp(hub)
    trip.report(key)
    trip.restore()
    assert trip.state.story.quests[key].status=='complete'
    rows.append(dict(**trip.reports[-1],kind=kind,node=b['node'],name=q['name'],hub=hub))
    if args.output_dir:
        write(args.output_dir.resolve() / 'commission-save.json', trip.snapshot())
        write(args.output_dir.resolve() / 'commission-proof.json', dict(seed=source.name, sourceSha256=trip.source, reports=rows))
    print('report',len(rows),key,flush=True)
save=trip.snapshot()
assert all(save['story']['quests'][r['quest']]['status']=='complete' for r in rows)
assert {q['id'] for q in cases}=={r['quest'] for r in rows}
assert all(save['story']['visited'].get(n) for n in start['story']['visited'])
assert all(save['story']['quests'][key] == record for key, record in start['story']['quests'].items()
           if record['status'] == 'complete')
if not args.output_dir:
    write('evidence/boss-commission-tour-save.json',save)
    write('evidence/boss-commission-tour-route.json',dict(seed=source.relative_to(ROOT).as_posix(),reports=rows))
