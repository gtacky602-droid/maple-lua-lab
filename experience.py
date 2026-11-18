"""Shared runtime inputs for the provisional 50-hour curve and versioned saves."""
import json
from pathlib import Path

CURVE_ID = 'maplesea-reference-v02'
MODEL_PATH = Path(__file__).resolve().parent / 'docs/balance/EXPERIENCE_MONSTER_QUEST_V02.json'
MODEL = json.loads(MODEL_PATH.read_text(encoding='utf8'))
CAP = MODEL['cap']
LEVELS = MODEL['levels']
CAP_EXP = MODEL['reference_total_exp_to_cap']
MAX_SAVED_EXP = 2**53 - 1

spent = 0
for level, row in enumerate(LEVELS, 1):
    if (row['level'] != level or row['maple_reference_total_exp_to_reach'] != spent
            or row['normal_enemy_base_exp'] < 1
            or (row['required_exp_to_next'] > 0) != (level < CAP)):
        raise ValueError(f'Inconsistent EXP design row at level {level}')
    spent += row['required_exp_to_next']
if len(LEVELS) != CAP or spent != CAP_EXP or LEVELS[-1]['required_exp_to_next'] != 0:
    raise ValueError('Inconsistent EXP cap in design table')

RUNTIME_EXP = {
    'curve': CURVE_ID,
    'cap': CAP,
    'levels': LEVELS,
    'gap': MODEL['design']['level_gap_factors_draft'],
    'roles': MODEL['design']['role_multipliers_draft'],
    'legacyBossExp': 10,
    'trainingQuestExp': 500,
}

QUEST_EXP_VERSION = 'monster-quest-v02'
QUEST_REPORT_EXP = {}
CHAPTER_CLEAR_EXP = {}
for reward in MODEL['quest_rewards']:
    kind = reward['grant_type']
    key, amount = reward['id'], reward['base_exp_first_clear']
    if kind == 'one_time_quest_reward':
        amounts = QUEST_REPORT_EXP
    elif kind == 'independent_first_clear_subreward':
        amounts = CHAPTER_CLEAR_EXP
    else:
        continue
    if key in amounts or type(amount) is not int or not 0 < amount <= MAX_SAVED_EXP:
        raise ValueError(f'Invalid fixed EXP reward for {key}')
    amounts[key] = amount


def resolve_story_exp(graph):
    for quest in graph['quests']:
        design_id = quest.get('designId')
        amount = QUEST_REPORT_EXP.get(design_id)
        if amount is not None:
            if quest.get('repeatable'):
                raise ValueError(f"First-report EXP applied to repeatable quest {quest['id']}")
            quest['xp'] = amount
            quest['xpVersion'] = QUEST_EXP_VERSION
        if 'chapterClearCount' in quest:
            threshold = quest['chapterClearCount']
            amount = CHAPTER_CLEAR_EXP.get(f'{design_id}:BOSS_FIRST')
            if (quest.get('repeatable') or type(threshold) is not int
                    or not 1 <= threshold <= quest['goal'] or amount is None):
                raise ValueError(f"Invalid chapter clear for {quest['id']}")
            battle_step = (quest['kind'] in ('kill', 'rail', 'contest') or
                           quest['kind'] == 'itinerary' and threshold <= len(quest['itinerary'])
                           and quest['itinerary'][threshold - 1]['kind'] == 'boss')
            if not battle_step:
                raise ValueError(f"Chapter clear is not a battle step for {quest['id']}")
            quest['chapterClearXp'] = amount
    return graph
