"""Check the complete atlas against two legitimately exclusive hauling choices."""
import json
from runtime import ROOT,runtime
from test_earned_branch_quests import Journey

def read(path):
    return json.loads((ROOT/path).read_bytes())
def write(path,data):
    (ROOT/path).write_bytes((json.dumps(data,sort_keys=True,ensure_ascii=False)+'\n').encode())

graph=read('content/story-graph.json')
atlas=read('content/world-atlas.json')
main=read('evidence/northern-gates-save.json')
visited={n for n,v in main['story']['visited'].items() if v}
catalog={n['id'] for n in graph['nodes']}
points=[p['id'] for r in atlas['regions'] for p in r['points']]
assert len(points)==len(catalog)==len(set(points)) and set(points)==catalog
lift='liyue-cart-lift'
assert catalog-visited=={lift}
trip=Journey(ROOT/'evidence/liyue-alternate-lift-save.json',runtime(),select_traveler=True)
trip.cross(lift)
trip.cross('liyue-field')
trip.warp('liyue-harbor')
trip.restore()
alternate=trip.snapshot()
assert alternate['story']['visited'][lift]
for save,plan in [(main,'ground'),(alternate,'lift')]:
    assert save['story']['quests']['liyue-hauling-shortcut']['construction']['plan']==plan
write('evidence/visited-lift-survey-save.json',alternate)
areas=[]
for region in atlas['regions']:
    places={p['id'] for p in region['points']}
    areas.append(dict(name=region['name'],id=region['id'],total=len(places),visited=len(places&visited)))
write('evidence/complete-atlas-survey.json',dict(total=len(catalog),visited=len(visited),regions=areas,
      alternateNode=lift,questReports=sum(v['status']=='complete' for v in main['story']['quests'].values())))
print(len(visited),'on ground plan, lift visited on the alternate plan;',len(catalog),'unique maps')
