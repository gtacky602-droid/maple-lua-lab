"""Complete the remaining two festival requests with the earned Lv120 adventure."""
import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk
from test_regional_quest_prop_packing import measure

def read(name):
    return json.loads((ROOT/name).read_bytes())

graph=read('content/story-graph.json')
quests={q['id']:q for q in graph['quests']}
exits={n['id']:n['exits'] for n in graph['nodes']}
edges={(n,e['to']):e for n,gates in exits.items() for e in gates}
source=validate_save(read('evidence/natlan-after-fontaine-save.json'))
lua,core=runtime()
s=core.restore(lua.table_from(source,recursive=True),12)
trail=TrailWalk(lua,core,s,edges,exits)
def act(key):
    core.action(s,key)
def ticks(n,controls=None):
    for _ in range(n):
        core.step(s,1/60,controls if controls is not None else trail.idle)
def near(x,y=480):
    trail.approach(x,y,'festival')
def collect(x,y=480):
    near(x,y)
    act('story_collect')
def until(condition,controls,limit=360):
    for _ in range(limit):
        if condition():
            return
        ticks(1,controls)
    raise AssertionError((s.story.node,trail.actor.x,trail.actor.y,s.storyNotice))
def report(id):
    act('story_report:'+id)
    assert s.story.quests[id].status=='complete' and s.story.quests[id].cycles==1

hub='natlan-hub'
act('story_fast:'+hub)
assert s.story.node==hub
springs='natlan-xilonen-springs'
training='natlan-iansan-self-test'
act('story_accept:'+springs)
collect(244)
trail.cross('natlan-xilonen-workshop')
for x in (235,442):
    collect(x)
    act('jump')
    ticks(90)
    assert not s.springRun
collect(650)
for slot,kind in [('rise','high'),('roof','low'),('reach','high')]:
    act('story_spring_pick:'+slot+':'+kind)
act('story_spring_confirm')
trail.cross('natlan-xilonen-course')
collect(139)
for index,section in enumerate(quests[springs]['springCourse']['sections'],1):
    until(lambda:trail.actor.x>=section['launch']['x']-2,trail.inputs['right'])
    act('jump')
    until(lambda:s.springRun.section>index,trail.inputs['right'])
until(lambda:not s.springRun,trail.inputs['right'])
assert s.springResult.retries==0
trail.cross(hub)
report(springs)

act('story_accept:'+training)
collect(715)
trail.cross('natlan-iansan-training')
attack=lua.table_from({'attack':True})
for lap in (1,2):
    collect(155)
    near(419,380)
    assert s.iansanRound.marker
    for target in s.enemies.values():
        if target.hp>0:
            near(target.x-40)
            until(lambda:target.hp==0,attack,400)
    if lap==1:
        near(1110)
        ticks(170)
        collect(1231)
    until(lambda:s.iansanPanel,trail.inputs['right'])
    if lap==1:
        act('story_iansan_focus:recovery')
act('story_iansan_close')
trail.cross(hub)
report(training)
saved = validate_save(native(core.checkpoint(s)))
old = source['story']['quests']
assert all(saved['story']['quests'][k]==v for k,v in old.items() if v['status']=='complete')
act('story_fast:nod-town')
assert s.story.node=='nod-town'
saved = validate_save(native(core.checkpoint(s)))
restored=core.restore(lua.table_from(saved,recursive=True),12)
assert restored.story.node=='nod-town'
core.action(restored,'story_accept:nod-first-treasure')
assert restored.story.quests['nod-first-treasure'].status=='active'
records=saved['story']['quests']
assert len([k for k in (springs,training,'natlan-kinich-ambush','natlan-mualani-surf','natlan-kachina-charms',
                        'natlan-ridge-flag','natlan-two-trials','natlan-sunset-duel') if records[k]['cycles']==1])==8
proof=dict(level=s.progression.level,partyWipes=s.returns,springs=records[springs]['springRecord'],
           training=records[training]['trainingLog'],completedMain=3,completedSide=5)
(ROOT/'evidence/natlan-revisit-save.json').write_bytes((json.dumps(saved,ensure_ascii=False,sort_keys=True)+'\n').encode('utf8'))
(ROOT/'evidence/natlan-revisits-lua.json').write_text(json.dumps(proof,ensure_ascii=False,sort_keys=True,indent=2)+'\n','utf8')
print(proof,flush=True)

# Fixed camera samples use the same earned quest choices across the three draw profiles.
packing={}
for node,camera in [('natlan-hub',0),('natlan-flag-summit',540),('natlan-river-turn-basin',230),
                    ('natlan-xilonen-workshop',150),('natlan-xilonen-course',370),
                    ('natlan-iansan-training',500),('natlan-surf-cove',110),('natlan-kinich-hunt',430),
                    ('natlan-sunset-rostrum',400)]:
    core.enterStoryNode(s,node)
    if node=='natlan-sunset-rostrum':
        near(847,390)
        assert len(core.frame(s,'sprite','legacy').storyFestivalLedger)==7
    s.camera=camera
    packing[node]={p:measure(core,s,p) for p in ('legacy','h48c32','h32c16')}
assert any(v['h32c16']['stamps']>v['h32c16']['batches'] for v in packing.values())
(ROOT/'evidence/natlan-festival-packing.json').write_text(json.dumps(packing,indent=2)+'\n','utf8')
print(packing,flush=True)
