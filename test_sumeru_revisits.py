"""Finish the remaining Sumeru side stories in the adventure that earned all Inazuma records."""
import json
import subprocess
import sys

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads(path.read_bytes())


source = ROOT/'work/sumeru-revisits-route/fontaine-save.json'
if not source.exists():
    subprocess.run([sys.executable,'test_sumeru_fresh_route.py','--after-revisits'],cwd=ROOT,check=True)
save = validate_save(read(source))
graph = read(ROOT/'content/story-graph.json')
exits = {n['id']: n['exits'] for n in graph['nodes']}
edges = {(node,e['to']): e for node,gates in exits.items() for e in gates}
lua, core = runtime()
s = core.restore(lua.table_from(save,recursive=True),12)
trail = TrailWalk(lua,core,s,edges,exits)
hub='sumeru-hub'


def act(key):
    core.action(s,key)


def fast(node):
    act('story_fast:'+node)
    assert s.story.node==node


def collect(x,y=480):
    trail.approach(x,y,'field interaction')
    act('story_collect')


def report(id):
    act('story_report:'+id)
    assert s.story.quests[id].status=='complete' and s.story.quests[id].cycles==1


def fight_level(y):
    inputs={dx:lua.table_from(dict(attack=True,left=dx<0,right=dx>0)) for dx in (-1,0,1)}
    for _ in range(3000):
        foes=[e for e in s.enemies.values() if e.hp>0 and e.y==y]
        if not foes:
            return
        actor=trail.actor
        assert actor.hp>0 and s.returns==0
        foe=min(foes,key=lambda e:abs(e.x-actor.x))
        dx=foe.x-actor.x
        core.step(s,1/60,inputs[0 if abs(dx)<33 else (1 if dx>0 else -1)])
    raise AssertionError((s.story.node,y,trail.actor.x,trail.actor.y))


def visit(*nodes):
    for node in nodes:
        trail.cross(node)


visitors='sum-fungus-visitors'
fast(hub)
act('story_accept:'+visitors)
collect(231)
visit('sum-visitors-meadow')
fight_level(480)
collect(1028)
tones=native(core.frame(s).storyAirflowCue.notes)
visit('sum-visitors-terrace')
fight_level(480)
for x,y in ((600,391),(875,299)):
    trail.approach(x,y,'root platform')
    fight_level(y)
collect(1152,299)
visit('sum-visitors-store')
fight_level(480)
for x in (919,1006,1124,1326):
    collect(x)
for _ in range(150):
    core.step(s,1/60,trail.idle)
collect(1006)
assert s.story.quests[visitors].count==11 and native(core.frame(s).storyAirflowCue.notes)==tones
visit(hub)
report(visitors)

kaveh='sum-kaveh-model'
act('story_accept:'+kaveh)
visit('sum-kaveh-workshop')
collect(450)
collect(450)
for station,field,value in [('shelves','shelf','wall'),('window','window','inward'),('seat','seat','aisle')]:
    act('story_model_move:'+station)
    act('story_model_set:'+field+':'+value)
assert core.frame(s).storyKavehModel.result.ready
act('story_model_confirm')
visit(hub)
report(kaveh)
visit('sumeru-sky-observatory','sum-kaveh-reading-room')
room=core.frame(s).storyKavehRoom
assert room.storage==8 and room.window=='inward'
fast(hub)

nahida='sum-nahida-map'
act('story_accept:'+nahida)
collect(950)
visit('sumeru-observation-stop','sum-nahida-dew-glade')
collect(620,394)
assert s.story.quests[nahida].discoveryDew
fast(hub)
collect(950)
for key,method in [('sky','canopy'),('dew','gleam'),('leaf','panel')]:
    act('story_discovery_pick:'+key)
    act('story_discovery_method:'+key+':'+method)
act('story_discovery_confirm')
report(nahida)
collect(950)
posted=core.frame(s).storyDiscoveryMap
assert posted.posted and posted.readOnly and posted.described==3
act('story_collect')
fast('fontaine-hub')
result=validate_save(native(core.checkpoint(s)))
required=['sumeru-leaf-crossing','sumeru-forest-levels','sumeru-observatory-map',
          'sum-wanderer-observation',visitors,'sum-collei-guide',kaveh,nahida]
for id in required:
    q=result['story']['quests'][id]
    assert q['status']=='complete' and q['cycles']==1
for id,q in save['story']['quests'].items():
    if id.startswith(('ina-','inazuma-')) or id=='ayaka-join':
        assert result['story']['quests'][id]==q
restored=core.restore(lua.table_from(result,recursive=True),12)
assert restored.story.node=='fontaine-hub'
core.action(restored,'story_accept:fontaine-moon-parcel')
assert restored.story.quests['fontaine-moon-parcel'].status=='active'
proof=dict(quests=required,chapterAndSideReports=8,inazumaRecordsPreserved=True,tones=tones,
           readingRoomStorage=room.storage,discoveryCards=posted.described,partyWipes=s.returns,
           level=result['progression']['level'],fontaineEntryConfirmed=True)
for name,data in [('sumeru-revisit-save',result),('sumeru-revisits-lua',proof)]:
    (ROOT/f'evidence/{name}.json').write_text(json.dumps(data,ensure_ascii=False,sort_keys=True,indent=2)+'\n','utf8')
print(proof)
