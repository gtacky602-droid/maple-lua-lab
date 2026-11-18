"""Local daily-period authority and reward entitlements for the Lua lab."""
from contextlib import contextmanager
import json
from pathlib import Path
import re
import sqlite3
import time


DAILY_RULES = json.loads((Path(__file__).parent/'content/daily-quests.json').read_text(encoding='utf8'))
DAILY_QUESTS = {quest['id']: quest for quest in DAILY_RULES['quests']}
PROFILE = re.compile(r'[a-f0-9]{32}')


def period_at(unix_time=None):
    settings = DAILY_RULES['period']
    local_time = time.time() if unix_time is None else unix_time
    shifted = local_time + settings['offsetMinutes'] * 60 - settings['resetHour'] * 3600
    return int(shifted // 86400)


def valid_profile(value):
    return isinstance(value, str) and PROFILE.fullmatch(value) is not None


def validate_daily_state(daily):
    if (not isinstance(daily, dict) or set(daily) != {'profile', 'paidXp', 'paidMora', 'ledger'}
            or not valid_profile(daily['profile'])):
        raise ValueError('日次依頼の保存形式が不正です')
    ledger = daily['ledger']
    if not isinstance(ledger, dict) or set(ledger) != {
            'period', 'activeSlots', 'carrySlots', 'seen', 'earnedXp', 'earnedMora'}:
        raise ValueError('日次依頼の記録が不正です')
    if type(ledger['period']) is not int or not 1 <= ledger['period'] <= 365250:
        raise ValueError('日次依頼の期間が不正です')
    seen = ledger['seen']
    if (not isinstance(seen, dict) or not set(seen) <= DAILY_QUESTS.keys()
            or any(value is not True for value in seen.values())):
        raise ValueError('日次依頼の会話記録が不正です')
    for key in ('activeSlots', 'carrySlots'):
        slots = ledger[key]
        if not isinstance(slots, list) or len(slots) > sum(DAILY_RULES['limits'].values()):
            raise ValueError('日次依頼の枠数が不正です')
        kinds = {'main': 0, 'extra': 0}
        used = set()
        for slot in slots:
            if not isinstance(slot, dict) or not isinstance(slot.get('id'), str):
                raise ValueError('日次依頼の枠が不正です')
            id_ = slot['id']
            quest = DAILY_QUESTS.get(id_)
            species = quest.get('observation') if quest else None
            fields = {'id', 'count', 'claimed', 'recorded'} if species else {'id', 'count', 'claimed'}
            if (not quest or set(slot) != fields or id_ in used or id_ not in seen or type(slot['count']) is not int
                    or not 0 <= slot['count'] <= quest['goal'] or type(slot['claimed']) is not bool
                    or slot['claimed'] and slot['count'] != quest['goal']
                    or key == 'carrySlots' and (slot['claimed'] or slot['count'] != quest['goal'])):
                raise ValueError('日次依頼の進行が不正です')
            if species:
                recorded = slot['recorded']
                if (not isinstance(recorded, dict) or len(recorded) != slot['count']
                        or not recorded.keys() <= {target['art'] for target in species}
                        or any(value is not True for value in recorded.values())):
                    raise ValueError('日次観察の記録が不正です')
            used.add(id_)
            kinds[quest['kind']] += 1
        if any(count > DAILY_RULES['limits'][kind] for kind, count in kinds.items()):
            raise ValueError('日次依頼の枠数が不正です')
    paid_slots = [DAILY_QUESTS[slot['id']] for slot in ledger['activeSlots'] if slot['claimed']]
    for reward, paid, earned in [('xp', 'paidXp', 'earnedXp'), ('mora', 'paidMora', 'earnedMora')]:
        applied, total = daily[paid], ledger[earned]
        if (type(applied) is not int or type(total) is not int or not 0 <= applied <= total <= 10**12
                or total < sum(quest[reward] for quest in paid_slots)):
            raise ValueError('日次依頼の受取記録が不正です')


class DailyStore:
    def __init__(self, path):
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        # Different local lab processes can share this database.
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.connection.execute(
            'CREATE TABLE IF NOT EXISTS daily_profiles (profile TEXT PRIMARY KEY, ledger TEXT NOT NULL)')

    def load(self, profile):
        row = self.connection.execute(
            'SELECT ledger FROM daily_profiles WHERE profile = ?', (profile,)).fetchone()
        return json.loads(row[0]) if row else None

    @contextmanager
    def transaction(self):
        with self.connection:
            self.connection.execute('BEGIN IMMEDIATE')
            yield

    def save(self, profile, ledger):
        payload = json.dumps(ledger, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        self.connection.execute(
            'INSERT INTO daily_profiles (profile, ledger) VALUES (?, ?) '
            'ON CONFLICT(profile) DO UPDATE SET ledger=excluded.ledger', (profile, payload))

    def close(self):
        self.connection.close()
