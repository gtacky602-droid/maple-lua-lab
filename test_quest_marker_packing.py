"""Exercise compressed choice artwork at the actual itinerary stages."""
import json

from runtime import ROOT, native, runtime
from test_regional_quest_prop_packing import measure


def marker_cases(core, step):
    guide = step.get('surveyGuide')
    if guide:
        sprite = core.companionArt.wanderer
        yield guide['x'], sprite.left if guide.get('left') else sprite
    prop = step.get('scentProp')
    if prop in ('flower', 'dry', 'wood'):
        yield step['x'], core.emilieScentArt[prop]
    for choice in step.get('choices', []):
        if choice.get('scentArt'):
            yield choice['x'], core.emilieScentArt[choice['id']]
        if choice.get('detourGift'):
            yield choice['x'], core.coastalGifts[choice['id']]
    if any(face.get('moonSample') for face in step.get('reflect', {}).get('faces', [])):
        yield step['x'], core.appraisalArt.stone


def main():
    graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
    lua, core = runtime()
    for quest in graph['quests']:
        for count, step in enumerate(quest.get('itinerary', [])):
            cases = list(marker_cases(core, step))
            if not cases:
                continue
            state = core.new(12)
            core.action(state, 'story_start')
            state.story.quests[quest['id']] = lua.table_from(dict(status='active', count=count, cycles=0))
            core.enterStoryNode(state, step['node'])
            for x, art in cases:
                state.camera = max(0, min(state.worldwidth-960, x-480))
                for profile in ('legacy', 'h48c32', 'h32c16'):
                    result = measure(core, state, profile)
                    state.packRectArt = True
                    frame = core.frame(state, 'rect', profile)
                    expected = native(art.profiles[profile].runs)
                    assert any(d.kind == 'rect_runs' and native(frame.rectBatches[d.batch]) == expected
                               for d in frame.draws.values()), (quest['id'], count, x, profile)
                    state.packRectArt = None
                print(quest['id'], count, x, result['before'], result['after'])


if __name__ == '__main__':
    main()
