"""Verify chapter rewards respect existing battle milestones in old saves."""
from copy import deepcopy
import json

from experience import CHAPTER_CLEAR_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
graph = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
fixture_names = {
    'Q-MON-M03':'mondstadt-m03',
    'Q-LIY-M03':'liyue-m03',
    'Q-INA-M03':'inazuma-m03',
}
checked = []
for q in graph['quests']:
    if q.get('designId') not in fixture_names:
        continue
    asset = fixture_names[q['designId']]
    fixture_path = ROOT/f'work/{asset}-fixture.json'
    assert fixture_path.exists(), f'Run test_{asset.replace("-","_")}.py first'
    fixture = json.loads(fixture_path.read_text(encoding='utf8'))
    for count,status in {(q['chapterClearCount'],'active'),(q['goal'],'active'),(q['goal'],'complete')}:
        before = deepcopy(fixture)
        before['story']['quests'][q['id']] = {
            'status':status,'count':count,'cycles':1 if status=='complete' else 0,
        }
        s = core.restore(lua.table_from(validate_save(before),recursive=True),12)
        expected = s.progression.questXp
        core.enterStoryNode(s,q['target'])
        core.step(s,1/60,lua.table())
        assert not core.frame(s).storyFirstClear
        assert s.progression.questXp==expected and len(s.enemies)==0
        core.enterStoryNode(s,q['hub'])
        xp = next(item.xp for item in core.frame(s).storyGraph.quests.values() if item.id==q['id'])
        core.action(s,'story_report:'+q['id'])
        core.action(s,'story_report:'+q['id'])
        expected += xp if status=='active' and count==q['goal'] else 0
        assert s.progression.questXp==expected
        saved = validate_save(native(core.checkpoint(s)))
        s = core.restore(lua.table_from(saved,recursive=True),12)
        assert s.progression.questXp==expected and not core.frame(s).storyFirstClear
    checked.append({
        'design_id':q['designId'],'first_clear_count':q['chapterClearCount'],
        'first_clear_xp':CHAPTER_CLEAR_EXP[q['designId']+':BOSS_FIRST'],
        'old_battle_won_and_reported_saves_not_reissued':True,
    })

assert len(checked)==3
(ROOT/'evidence/chapter-first-clear-exp.json').write_text(
    json.dumps({'legacy_saved_milestones':checked,'validated_quest_routes':['test_mondstadt_m03.py','test_liyue_m03.py','test_inazuma_m03.py']},
               ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Three legacy chapter wins, report boundaries and save round trips passed')
