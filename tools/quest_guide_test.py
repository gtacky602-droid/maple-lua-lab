"""Sample the target the Lua frame actually exposes during a fresh campaign route."""
import json
from functools import cache
from runtime import ROOT, native

@cache
def worksite_art():
    return json.loads((ROOT/'content/worksite-props.json').read_bytes())['worksites']

def check_worksite_art(frame, quest, item):
    if not item or not item.point or not frame.storyWorksites or not frame.storyWorksites[quest]:
        return 0
    art=worksite_art()[quest][item.point]
    expected=[(item.x-frame.camera+dx,item.y+dy,w,h,color) for dx,dy,w,h,color in art]
    draws=[(d.x,d.y,d.w,d.h,d.color) for d in frame.draws.values() if d.kind=='rect']
    assert any(draws[i:i+len(expected)]==expected for i in range(len(draws))), (quest,item.point)
    return len(art)

class GuideChecks:
    def __init__(self, region):
        self.region = region
        self.samples = []

    def expect(self, frame, quest, *, spawns=(), point=None, xy=None, name=None, absent=False):
        guides = frame.storyHunts
        item = guides and guides[quest]
        if absent:
            assert not item, (quest, native(item))
        else:
            assert item, (quest, frame.story.node, frame.story.quests[quest].count)
            if spawns:
                assert item.spawn in spawns and not item.action, (quest,native(item),spawns)
            else:
                assert item.action and not item.spawn, (quest,native(item))
            if point is not None:
                assert item.point == point, (quest,native(item),point)
            if xy is not None:
                assert (item.x,item.y) == xy, (quest,native(item),xy)
            if name is not None:
                assert item.name == name, (quest,native(item),name)
        sample=dict(quest=quest,node=frame.story.node,count=frame.story.quests[quest].count,
                    guide=native(item) if item else None)
        rectangles=check_worksite_art(frame,quest,item)
        if rectangles:
            sample['checkedPropRectangles']=rectangles
        self.samples.append(sample)

    def save(self):
        (ROOT/'evidence'/('quest-field-guide-'+self.region+'.json')).write_text(
            json.dumps(self.samples,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
