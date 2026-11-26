"""Walk the atlas to field arenas and carry confirmed first clears into one save."""
import json
from runtime import ROOT,runtime
from test_earned_branch_quests import Journey,graph

def read(file):
    return json.loads((ROOT/file).read_bytes())

def write(file,value):
    (ROOT/file).write_bytes((json.dumps(value,ensure_ascii=False,sort_keys=True)+'\n').encode())

hubs=dict(zip(('モンド','璃月','稲妻','スメール','フォンテーヌ','ナタ','ナド・クライ','スネージナヤ','ドラゴンスパイン','淵下宮','層岩巨淵・地下鉱区','沈玉の谷','ドーンマンポート','ノヴォキッチェヴ（仮構造）'),
              ('mond-town','liyue-harbor','inazuma-town','sumeru-hub','fontaine-hub','natlan-hub','nod-town','snezhnaya-hub','dragonspine-camp','enkanomiya-camp','liyue-harbor','chenyu-camp','dornman-camp','novokichev-camp')))
regions={n['id']:n['region'] for n in graph['nodes']}
roster=[s for s in read('content/field-boss-spawns.json')['fieldBosses'] if not s['id'].startswith(('legend-','original-'))]
source='evidence/growth-expedition-save.json'
checkpoint='work/field-expedition-progress.json'
engine=runtime()
rows,missed=[],[]
for spec in roster:
    trip=Journey(ROOT/source,engine,select_traveler=True)
    s=trip.state
    id,node=spec['id'],spec['node']
    start=trip.snapshot()
    if start['endgame']['bosses'].get(id,{}).get('clears',0)>0:continue
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
        before=(s.progression.total,s.mora)
        for tick in range(7200):
            if slot.phase=='respawn':break
            enemy=slot.enemy
            dx=enemy.x-trip.actor.x
            moving=abs(dx)>60 or dx*trip.actor.dir<0
            if tick%45==0:trip.act('skill1')
            if tick%90==0:trip.act('skill2')
            trip.tick(1,trip.lua.table(left=moving and dx<0,right=moving and dx>0,jump=enemy.y<trip.actor.y-60,attack=True))
            assert s.story.node==node,(node,'returned')
        assert slot.phase=='respawn',(node,'survived',round(slot.enemy.hp))
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
        missed.append(dict(id=id,node=node,reason=str(error)))
        print('pending',node,str(error)[:160],flush=True)
assert len(rows)==len(roster) and not missed,missed
write('evidence/field-expedition-save.json',read(checkpoint))
write('evidence/field-expedition-route.json',dict(seed='growth-expedition-save',catalog=len(roster),newClears=rows,pending=missed))
