"""Measure JSON asset bytes requested by identical local Lua scenes before and after motion packing."""
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
import runtime

baseline='2321dbd1475e0c8cb78c9f4d1fc7acdfd95da053'
old={'__file__':str(root/'runtime.py'),'__name__':'baseline_runtime'}
source=subprocess.check_output(['git','show',baseline+':runtime.py'],cwd=root)
exec(compile(source,'baseline/runtime.py','exec'),old)

def measure(factory):
    reads=[]
    def recorded(method):
        def read(path,*args,**kwargs):
            result=method(path,*args,**kwargs)
            if path.is_relative_to(root/'assets') and path.suffix=='.json':
                reads.append((path.name,path.stat().st_size))
            return result
        return read
    stages={}
    def checkpoint(label):
        stages[label]={'files':len(reads),'bytes':sum(size for _,size in reads)}
        reads.clear()
    with patch.object(Path,'read_bytes',recorded(Path.read_bytes)),patch.object(Path,'read_text',recorded(Path.read_text)):
        lua,c=factory()
        checkpoint('runtime_init')
        s=c.new(16)
        c.action(s,'campaign')
        c.frame(s,'sprite','legacy')
        checkpoint('idle')
        for side in ('right','left'):
            images=set()
            for _ in range(24):
                c.step(s,1/60,lua.table_from({side:True}))
                for draw in c.frame(s,'sprite','legacy').draws.values():
                    if draw.source and draw.source.startswith('traveler-run-'):
                        images.add(draw.source)
            assert len(images)==4
            checkpoint('run_'+side)
        s=c.new(12)
        c.action(s,'story_start')
        s.story.quests['amber-join']=lua.table_from({'status':'complete','count':4,'cycles':1})
        s.story.visited['mond-road']=True
        c.action(s,'story_accept:mond-return-box-quest')
        assert s.story.quests['mond-return-box-quest'].status=='active'
        s.actors[1].x=340
        assert c.frame(s,'sprite','legacy').storyNearbyMilestone
        c.action(s,'story_collect')
        s.actors[1].x=758
        c.action(s,'story_nearby_portal')
        assert s.story.node=='mond-library-orchard'
        s.actors[1].x=600
        for _ in range(2):
            c.step(s,1/60,lua.table())
        stage=c.frame(s,'sprite','legacy')
        assert any(d.source and 'return-box' in d.source for d in stage.draws.values())
        c.frame(s,'rect','h32c16')
        checkpoint('quest_return_box')
        s=c.new(16)
        c.action(s,'campaign')
        c.action(s,'boss_oceanid')
        f=c.frame(s,'sprite','legacy')
        assert any(d.source and 'oceanid' in d.source for d in f.draws.values())
        c.frame(s,'rect','h32c16')
        checkpoint('oceanid_opening')
    return stages

report={'baseline':baseline,'unit':'asset JSON file bytes requested by Python; PNG and HTTP excluded',
        'before':measure(old['runtime']),'after':measure(runtime.runtime)}
for name in ('before','after'):
    report[name]['total']=sum(row['bytes'] for row in report[name].values())
assert report['after']['runtime_init']['bytes']<report['before']['runtime_init']['bytes']
assert report['after']['total']<report['before']['total']
(root/'evidence/motion-load.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report))
