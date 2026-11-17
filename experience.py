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
