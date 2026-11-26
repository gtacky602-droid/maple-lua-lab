"""Sample the target the Lua frame actually exposes during a fresh campaign route."""
import json
from functools import cache
from math import floor
from runtime import ROOT, native

@cache
def worksite_art():
    return json.loads((ROOT/'content/worksite-props.json').read_bytes())['worksites']

def check_worksite_art(frame, quest, item):
    if not item or not item.point:
        return 0
    progress=frame.story.quests[quest]
    if progress.delivery:
        delivery=next(q for q in frame.storyGraph.quests.values() if q.id==quest)
        spec=delivery.delivery
        if frame.story.node==delivery.target:
            assert item.point==spec.cache.id
            art=[[-15,-24,30,24,'#5b3f2c'],[-12,-21,24,18,'#c48a56'],[-2,-21,4,18,'#f1d58e']]
        else:
            parcel=next(p for p in spec.packages.values() if p.id==item.point)
            art=[[-27,-32,54,32,'#62432e'],[-24,-27,48,21,'#916749'],[-28,-32,56,4,parcel.color]]
            if progress.delivery.delivered[item.point]:
                art.extend(native(parcel.stockRects))
    else:
        if not frame.storyWorksites or not frame.storyWorksites[quest]:
            return 0
        art=worksite_art()[quest][item.point]
    x=item.x-frame.camera
    if frame.story.quests[quest].sights:
        x=floor(x)
    expected=[(x+dx,item.y+dy,w,h,color) for dx,dy,w,h,color in art]
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
