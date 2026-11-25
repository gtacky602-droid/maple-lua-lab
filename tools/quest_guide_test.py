"""Sample the target the Lua frame actually exposes during a fresh campaign route."""
import json
from runtime import ROOT, native

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
        self.samples.append(dict(quest=quest, node=frame.story.node,
                                 count=frame.story.quests[quest].count, guide=native(item) if item else None))

    def save(self):
        (ROOT/'evidence'/('quest-field-guide-'+self.region+'.json')).write_text(
            json.dumps(self.samples,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
