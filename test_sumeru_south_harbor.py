"""Verify the Lv60 southern harbor connection from the earned Sumeru arrival."""
import json
from runtime import ROOT, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk

graph=json.loads((ROOT/'content/story-graph.json').read_bytes())
exits={n['id']:n['exits'] for n in graph['nodes']}
edges={(source,e['to']):e for source,gates in exits.items() for e in gates}
checkpoint=validate_save(json.loads((ROOT/'work/inazuma-fresh-route/sumeru-save.json').read_bytes()))
lua,core=runtime()
s=core.restore(lua.table_from(checkpoint,recursive=True),12)
trail=TrailWalk(lua,core,s,edges,exits)
hub,river,harbor='sumeru-hub','sumeru-river-roots','sum-wp-28720'
assert s.story.node==hub and s.progression.level==60
trail.cross(river)
trail.cross(harbor)
for dest in ['sum-wp-28719','sum-wp-28721']:
    trail.approach(edges[harbor,dest]['x'],480,dest)
    portal=core.frame(s).storyNearbyPortal
    assert portal.to==dest and not portal.available
    core.action(s,'story_nearby_portal')
    assert s.story.node==harbor and not s.lift
trail.cross(river)
trail.cross(hub)
assert s.progression.level==60
print('Lv60 earned save: hub -> river -> south harbor -> river -> hub. Lv62 and Lv67 exits stayed locked.')
