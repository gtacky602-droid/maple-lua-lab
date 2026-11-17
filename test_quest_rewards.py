"""Check the linked EXP amounts, report source, and legacy reward compatibility."""
from collections import defaultdict
from copy import deepcopy
import json

from experience import CAP_EXP, QUEST_EXP_VERSION, QUEST_REPORT_EXP
from runtime import ROOT, native, runtime
from savegame import validate_save

lua, core = runtime()
raw = json.loads((ROOT/'content/story-graph.json').read_text(encoding='utf8'))
linked = [q for q in raw['quests'] if q.get('designId') in QUEST_REPORT_EXP]
rows = []


def session(exp=0):
    s = core.new(12)
    core.action(s, 'story_start')
    core.grantExp(s, exp, 'quest')
    return s


def report(s, q):
    core.action(s, 'story_report:'+q['id'])


for q in linked:
    qid = q['id']
    goal = q['goal']
    amount = QUEST_REPORT_EXP[q['designId']]
    for starting_exp in (0, CAP_EXP):
        s = session(starting_exp)
        core.enterStoryNode(s,q['hub'])
        spec = next(quest for quest in core.frame(s).storyGraph.quests.values() if quest.id==qid)
        assert (spec.xp,spec.xpVersion,spec.mora)==(amount,QUEST_EXP_VERSION,q['mora'])
        # Simulate the report boundary. Per-quest tests play the actual objectives.
        ready = lua.table_from({'status':'active','count':goal-1,'cycles':0,'cooking':{}},recursive=True)
        s.story.quests[qid] = ready
        report(s,q)
        assert s.progression.questXp==starting_exp
        ready.count = goal
        cash = s.mora
        report(s,q)
        report(s,q)
        assert (s.progression.questXp,s.progression.baseXp,s.mora)==(starting_exp+amount,starting_exp+amount,cash+q['mora'])
        assert (ready.status,ready.cycles)==('complete',1)
        if starting_exp==CAP_EXP:
            assert s.progression.level==200 and s.progression.overflowXp==amount
    rows.append({'design_id':q['designId'],'quest_id':qid,'legacy_xp':q['xp'],'report_xp':amount})

# Before the curve change, a legitimate report could already have paid 1,000 EXP.
old_quest = next(q for q in linked if q['id']=='amber-join')
old = native(core.checkpoint(session()))
old['progression'] = {
    'level':5, 'xp':320, 'total':1000, 'killXp':0, 'questXp':1000,
    'lastKills':0, 'questRewarded':False,
}
old['story']['quests']['amber-join'] = {'status':'complete','count':4,'cycles':1}
old_complete = core.restore(lua.table_from(validate_save(old),recursive=True),12)
report(old_complete,old_quest)
assert old_complete.progression.questXp==1000 and core.frame(old_complete).storyJoined.amber
new_complete = validate_save(native(core.checkpoint(old_complete)))
old_complete = core.restore(lua.table_from(new_complete,recursive=True),12)
report(old_complete,old_quest)
assert old_complete.progression.questXp==1000

old_pending = deepcopy(old)
old_pending['kills'] = 9
old_pending['progression'].update(level=1,xp=90,total=90,killXp=90,questXp=0,lastKills=9)
old_pending['story']['quests']['amber-join'].update(status='active',cycles=0)
pending = core.restore(lua.table_from(validate_save(old_pending),recursive=True),12)
report(pending,old_quest)
assert pending.progression.questXp==76
saved = validate_save(native(core.checkpoint(pending)))
pending = core.restore(lua.table_from(saved,recursive=True),12)
report(pending,old_quest)
assert pending.progression.questXp==76

unlinked = next(q for q in raw['quests'] if q['id']=='mond-contract')
s = session()
trial = next(q for q in core.frame(s).storyGraph.quests.values() if q.id==unlinked['id'])
assert trial.xp==unlinked['xp'] and trial.xpVersion is None
by_region = defaultdict(lambda: {'linked':0,'legacy_xp':0,'report_xp':0})
for row in rows:
    region = by_region[row['design_id'].split('-')[1]]
    region['linked'] += 1
    region['legacy_xp'] += row['legacy_xp']
    region['report_xp'] += row['report_xp']

(ROOT/'evidence/quest-exp-rewards.json').write_text(json.dumps({
    'scope':'Lua report boundary at base and cap levels. Per-quest tests verify objective routes.',
    'version':QUEST_EXP_VERSION,
    'quests_tested':len(rows),
    'old_completed_not_reissued':True,
    'old_unreported_uses_current_preview':True,
    'unlinked_trial_fallback':True,
    'by_region':dict(by_region),
    'reports':rows,
},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(f'{len(rows)} fixed quest rewards at Lv1 and Lv200, plus legacy saves, passed')
