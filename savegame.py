import json
from pathlib import Path
from daily_store import validate_daily_state
from experience import CAP, CAP_EXP, CURVE_ID, LEVELS, MAX_SAVED_EXP, WEEKLY_MODE_IDS
_STORY_GRAPH_PATH=Path(__file__).parent/'content/story-graph.json'
_FIELD_BOSSES={slot["id"]:slot for slot in json.loads((Path(__file__).parent/"content/field-boss-spawns.json").read_text(encoding="utf-8-sig"))["fieldBosses"]}
_DRAFT_FIELD_BOSS_HP = json.loads(
    (Path(__file__).parent/'content/field-balance-draft.json').read_text(encoding='utf8'))['fieldBossHp']
_WEEKLY_BOSSES={slot['id']:slot for slot in json.loads((Path(__file__).parent/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses']}
_LEGACY_LOOT_ZONES={'town','field','arena','anemo','electro','geo','oceanid','primo','maguu','array',
                    'thunder','farka','cryo_regisvine','pyro_regisvine'}
_IMPRINT_CAPS=json.loads((Path(__file__).parent/'content/imprint-settings.json').read_text(encoding='utf8'))['caps']
_ABYSS_MODES=json.loads((Path(__file__).parent/'content/abyss-settings.json').read_text(encoding='utf8'))['modes']
_ARTIFACT_SETS=json.loads((Path(__file__).parent/'content/artifact-sets.json').read_text(encoding='utf8'))
_ARTIFACT_DOMAIN_RANKS={
    f"{domain['id']}:{rank['id']}": (domain['node'],rank['limit'])
    for domain in json.loads((Path(__file__).parent/'content/artifact-domains.json').read_text(encoding='utf8'))['domains']
    for rank in domain['ranks']
}
_COMPANIONS=('amber','columbina','wanderer','beidou','ayaka','emilie','kachina','mitya')
_WEAPON_SETTINGS = json.loads((Path(__file__).parent/'content/weapon-settings.json').read_text(encoding='utf8'))
_WEAPONS = {item['id']: item for item in _WEAPON_SETTINGS['items']}
_TRAVELER_SKILLS = {f'SK{index:02}' for index in range(1, 61)}
_COMBAT_COOLDOWNS = {
    'normal', 'skill1', 'skill2', 'skill3', 'skill4', 'light', 'dodge',
    'swimPulse', 'swimReflect', 'swimSonar', 'swimGuard', 'swimBurst',
} | _TRAVELER_SKILLS
import math
import re
_STYGIAN_MODES={
    f"{id}:{mode['id']}":mode
    for id,match in json.loads((Path(__file__).parent/'content/stygian-matches.json').read_text(encoding='utf8'))['matches'].items()
    for mode in match['modes']
}
"""Versioned local checkpoint validation; this is not a production multiplayer save."""
FIELDS={'version','quest','count','mora','kills','hits','damage','gauge','active'}


def validate_steps_visited(steps, count, visited):
    for item in steps[:count]:
        # A path join records finished branches, whose own visits are checked in validate_paths.
        if item['kind'] == 'paths':
            continue
        places=[item, *item.get('alternatives',[])]
        if not any(place['node'] in visited for place in places):
            raise ValueError('未訪問の地点が調査済みになっています')


def validate_sweep(record, steps, visited):
    if 'sweep' not in record:
        return
    count=record['count']
    step=steps[count] if count<len(steps) else {}
    allowed=set(step.get('enemies',[])) if step.get('kind') in ('kill', 'break') else set()
    defeated=record['sweep']
    if (not isinstance(defeated,dict) or not defeated or not defeated.keys()<allowed
            or any(flag is not True for flag in defeated.values()) or step['node'] not in visited):
        raise ValueError('遠征の討伐記録が不正です')


def validate_discovery_map(record, quest, story):
    spec = quest.get('discoveryMap')
    fields = {'discoveryDraft', 'discoveryDew'}
    if not spec or record['count'] < 1:
        if fields.intersection(record):
            raise ValueError('Invalid discovery map progress')
        return
    if 'discoveryDew' in record and (record['discoveryDew'] is not True
            or spec['site']['node'] not in story['visited']):
        raise ValueError('Invalid dew discovery')

    draft = record.get('discoveryDraft', {})
    if not isinstance(draft, dict) or len(draft) > 3:
        raise ValueError('Invalid discovery map draft')
    cards = {card['id']: card for card in spec['cards']}
    for id_, method in draft.items():
        card = cards.get(id_)
        if not card or not isinstance(method, str) or (method and method not in {m['id'] for m in card['methods']}):
            raise ValueError('Invalid discovery map entry')
        evidence = card.get('evidence')
        if evidence:
            progress = story['quests'].get(evidence['quest'], {})
            known = isinstance(progress, dict) and type(progress.get('count')) is int and progress['count'] >= evidence['count']
        else:
            known = record.get('discoveryDew') is True
        if not known:
            raise ValueError('Undiscovered map entry')
    if record['count'] == quest['goal'] and (len(draft) != 3 or not all(draft.values())):
        raise ValueError('Incomplete discovery map')


def validate_iansan_training(record, quest, visited):
    spec, count = quest.get('iansanTraining'), record['count']
    if 'trainingLog' not in record:
        if spec and count >= 2:
            raise ValueError('訓練の初回記録がありません')
        return
    log = record['trainingLog']
    keys = {'baseline'}
    if count >= 3:
        keys.add('focus')
    if count == quest['goal']:
        keys.add('retest')
    if not spec or count < 2 or quest['target'] not in visited or not isinstance(log, dict) or set(log) != keys:
        raise ValueError('訓練の記録が不正です')
    if 'focus' in log and log['focus'] not in [option['id'] for option in spec['focus']]:
        raise ValueError('訓練の見直し項目が不正です')
    for key in ('baseline', 'retest'):
        if key not in log:
            continue
        attempt = log[key]
        if not isinstance(attempt, dict) or set(attempt) != {'ticks', 'hits', 'stopped'}:
            raise ValueError('訓練の試走記録が不正です')
        ticks, hits, stopped = attempt['ticks'], attempt['hits'], attempt['stopped']
        if (type(ticks) is not int or not 1 <= ticks <= 360000 or type(hits) is not int or not 0 <= hits <= ticks
                or not isinstance(stopped, list) or len(stopped) != len(spec['sectors'])
                or any(type(value) is not int or not 0 <= value <= ticks for value in stopped)
                or sum(stopped) > ticks):
            raise ValueError('訓練の計測値が不正です')


def validate_spring_course(record, quest, visited):
    spec, count = quest.get('springCourse'), record['count']
    if 'springRecord' not in record:
        if spec and count >= 2:
            raise ValueError('踏み台の試験記録がありません')
        return
    result = record['springRecord']
    if (not spec or count < 1 or spec['lab'] not in visited or not isinstance(result, dict)
            or set(result) - {'samples', 'draft', 'layout', 'best'} or 'samples' not in result):
        raise ValueError('踏み台の試走記録が不正です')
    samples = result['samples']
    kinds = spec['types']
    if (not isinstance(samples, dict) or not samples or set(samples) - kinds.keys()
            or count >= 2 and set(samples) != kinds.keys()
            or any(type(rise) is not int or not 1 <= rise <= 200 for rise in samples.values())):
        raise ValueError('踏み台の比較記録が不正です')
    slots = {section['id'] for section in spec['sections']}
    for key, minimum in (('draft', 2), ('layout', 3)):
        if key not in result:
            if key == 'layout' and count >= minimum:
                raise ValueError('確定した踏み台の配置がありません')
            continue
        layout = result[key]
        if (count < minimum or not isinstance(layout, dict) or not layout or set(layout) - slots
                or key == 'layout' and set(layout) != slots
                or any(not isinstance(value, str) or value not in kinds for value in layout.values())):
            raise ValueError('踏み台の組み合わせが不正です')
    if 'best' not in result:
        if count >= 4:
            raise ValueError('踏み台の試走完了記録がありません')
        return
    best = result['best']
    if (count < 4 or spec['course'] not in visited or not isinstance(best, dict) or not 1 <= len(best) <= 8
            or any(len(key.split('-')) != len(slots) or set(key.split('-')) - kinds.keys()
                   or type(ticks) is not int or not 1 <= ticks <= 360000 for key, ticks in best.items())):
        raise ValueError('踏み台の計測記録が不正です')


def validate_kinich_hunt(record, quest, visited):
    spec = quest.get('kinichHunt')
    finished = record['count'] == quest['goal']
    if 'huntNotes' not in record:
        if spec and finished:
            raise ValueError('巡り岩の討伐結果がありません')
        return
    notes = record['huntNotes']
    keys = {'tracks', 'branch', 'site', 'outcome'}
    if (not spec or not isinstance(notes, dict) or not notes or set(notes) - keys
            or record['count'] == 0 or quest['target'] not in visited):
        raise ValueError('巡り岩の調査記録が不正です')
    clues = ('tracks', 'branch')
    if any(key in notes and notes[key] is not True for key in clues):
        raise ValueError('巡り岩の調査記録が不正です')
    site = notes.get('site')
    if 'site' in notes and (site not in [option['id'] for option in spec['sites']]
                              or not all(notes.get(key) for key in clues)):
        raise ValueError('巡り岩の待ち伏せ先が不正です')
    outcome = notes.get('outcome')
    if (finished and (not isinstance(outcome, str) or outcome != 'direct' and outcome != site)
            or not finished and 'outcome' in notes):
        raise ValueError('巡り岩の討伐結果が不正です')


def validate_stone_pair(record, quest):
    spec = quest.get('stoneOrnaments')
    if 'stonePair' not in record:
        if spec and record['count'] == quest['goal']:
            raise ValueError('二人分の石飾りがありません')
        return
    pair = record['stonePair']
    if not spec or record['count'] < quest['goal'] - 1 or not isinstance(pair, dict) or set(pair) != {'color', 'pattern'}:
        raise ValueError('石飾りの進行が不正です')
    for field, options in (('color', spec['colors']), ('pattern', spec['patterns'])):
        if not any(option['id'] == pair[field] for option in options):
            raise ValueError('石飾りの色か並びが不正です')


def validate_group_photo(record, quest):
    spec = quest.get('groupPhoto')
    progress = record.get('groupPhoto')
    count = record['count']
    if 'groupPhoto' not in record:
        if spec and count >= spec['layoutAt']:
            raise ValueError('集合写真の構図がありません')
        return
    if not spec or count < spec['layoutAt'] - 1 or not isinstance(progress, dict):
        raise ValueError('集合写真の進行が不正です')
    keys = {'seat', 'riser', 'posted'} if count == quest['goal'] else {'seat', 'riser'}
    if set(progress) != keys:
        raise ValueError('集合写真の記録形式が不正です')
    seat = next((option for option in spec['seats'] if option['id'] == progress['seat']), None)
    riser = next((option for option in spec['risers'] if option['id'] == progress['riser']), None)
    if seat is None or riser is None:
        raise ValueError('集合写真の配置が不正です')
    gap = spec['faceGap']
    heads = spec['crew']
    if (count >= spec['layoutAt'] and abs(seat['x'] - riser['x']) < gap['x']
            and abs(riser['rise'] + heads[1]['head'] - heads[0]['head']) < gap['y']):
        raise ValueError('集合写真で顔が重なっています')
    if 'posted' in progress and not any(option['id'] == progress['posted'] for option in spec['prints']):
        raise ValueError('集合写真の掲示写真が不正です')


def validate_reading_model(record, quest):
    spec = quest.get('readingModel')
    value = record.get('roomLayout')
    if 'roomLayout' not in record:
        if spec and record['count'] == quest['goal']:
            raise ValueError('閲覧室の確定配置がありません')
        return
    if not spec or record['count'] == 0 or not isinstance(value, dict) or set(value) != {
        'station', 'visited', 'shelf', 'seat', 'window'
    }:
        raise ValueError('閲覧室の模型配置が不正です')
    stations = {station['id'] for station in spec['stations']}
    seen, here = value['visited'], value['station']
    if (not isinstance(seen, dict) or not isinstance(here, str) or set(seen) - stations
            or here not in seen or spec['start'] not in seen or any(checked is not True for checked in seen.values())):
        raise ValueError('閲覧室の模型の移動記録が不正です')
    choices = {
        field: next((option for option in spec['options'][field] if option['id'] == value[field]), None)
        for field in ('shelf', 'seat', 'window')
    }
    if not all(choices.values()):
        raise ValueError('閲覧室の模型の部品が不正です')
    if record['count'] == quest['goal']:
        shelf, seat, window = (choices[field] for field in ('shelf', 'seat', 'window'))
        if (set(seen) != stations or shelf['capacity'] < spec['minimumStorage'] or shelf.get('obstructsView')
                or seat.get('closeToWindow') and window.get('requiresClearance')):
            raise ValueError('閲覧室の確定配置が条件を満たしていません')


def validate_paths(record, quest, visited):
    paths=quest.get('paths')
    if not paths and 'pathProgress' not in record:
        return
    progress=record.get('pathProgress')
    if not paths or not isinstance(progress,dict) or progress.keys()!={path['id'] for path in paths}:
        raise ValueError('分岐の進行記録が不正です')
    join_index=next(i for i,step in enumerate(quest['itinerary']) if step['kind']=='paths')
    finished=[]
    for path in paths:
        steps=path['steps']
        branch=progress[path['id']]
        if (not isinstance(branch,dict) or set(branch)-{'sweep'}!={'count'}
                or type(branch['count']) is not int or not 0<=branch['count']<=len(steps)
                or (record['count']<join_index and (branch['count'] or 'sweep' in branch))):
            raise ValueError('分岐の進行記録が不正です')
        validate_steps_visited(steps,branch['count'],visited)
        validate_sweep(branch,steps,visited)
        finished.append(branch['count']==len(steps))
    joined=any(finished) if quest.get('anyPath') else all(finished)
    if joined!=(record['count']>join_index):
        raise ValueError('分岐と合流の記録が一致しません')


def validate_appraisal(record, quest, visited):
    spec, log = quest.get('appraisal'), record.get('appraisal')
    if not spec and 'appraisal' not in record:
        return
    if not spec or not isinstance(log, dict) or set(log) != {'gathered', 'measured', 'sorted'}:
        raise ValueError('お宝判定機の記録が不正です')
    ids = {item['id'] for item in spec['items']}
    gathered = log['gathered']
    if (not isinstance(gathered, dict)
            or any(item not in ids or flag is not True for item, flag in gathered.items())):
        raise ValueError('回収した部品の記録が不正です')
    progress = {'gather':len(gathered), 'measure':log['measured'], 'sort':log['sorted']}
    for index, step in enumerate(quest['itinerary']):
        stage = step.get('appraisalStage')
        if not stage:
            continue
        amount, count = progress[stage], record['count']
        if type(amount) is not int or not 0 <= amount <= len(ids):
            raise ValueError('お宝判定機の進行数が不正です')
        if ((count < index and amount) or (count == index and amount == len(ids))
                or (count > index and amount != len(ids)) or (amount and step['node'] not in visited)):
            raise ValueError('お宝判定機の進行順が不正です')

def validate_snow_match(record, quest, spec):
    if not spec or spec['quest'] != quest['id'] or record['count'] != quest['goal']:
        if 'snowMatchRecord' in record:
            raise ValueError('雪合戦の進行と記録が一致しません')
        return
    log = record.get('snowMatchRecord')
    totals = ('wins', 'losses', 'draws')
    scores = ('best', 'player', 'opponent')
    if (not isinstance(log, dict) or set(log) != set(totals + scores)
            or any(type(log[k]) is not int or not 0 <= log[k] <= 10**9 for k in totals)
            or any(type(log[k]) is not int or not 0 <= log[k] <= spec['score'] for k in scores)
            or log['best'] < log['player']):
        raise ValueError('雪合戦の得点記録が不正です')
    player, opponent = log['player'], log['opponent']
    result = 'wins' if player > opponent else 'losses' if player < opponent else 'draws'
    if not log[result] or (record['status'] == 'active' and sum(log[k] for k in totals) != 1):
        raise ValueError('雪合戦の勝敗記録が不正です')


def validate_firework(record, quest, visited):
    design = record.get('fireworkDesign')
    spec = quest.get('fireworks')
    if 'fireworkDesign' not in record and (not spec or record['count'] < quest['goal']):
        return
    if (not spec or record['count'] < quest['goal'] - 1 or quest['target'] not in visited
            or not isinstance(design, dict) or design.keys() != {'color', 'shape'}
            or any(design[field] not in [row['id'] for row in spec[choices]]
                   for field, choices in (('color','colors'),('shape','shapes')))):
        raise ValueError('花火の色・形と進行の記録が不正です')


def validate_stealth(record, quest, visited):
    if 'stealthEncounter' not in record:
        return
    steps = quest.get('itinerary', [])
    count = record['count']
    if (record['status'] != 'active' or count >= len(steps)
            or steps[count]['kind'] != 'stealthCheck' or steps[count]['node'] not in visited
            or record['stealthEncounter'] not in ('engaged', 'cleared')):
        raise ValueError('見回り役の記録が巡回の進行と一致しません')


def validate_itto_contest(record, quest, spec, visited):
    rounds_done = max(0, record['count'] - 1)
    if not spec or spec['quest'] != quest['id'] or not rounds_done:
        if 'ittoContest' in record:
            raise ValueError('三番勝負の記録が進行と一致しません')
        return
    log = record.get('ittoContest')
    if (quest['target'] not in visited or not isinstance(log, dict) or log.keys() != {'last', 'best', 'series'}
            or not isinstance(log['last'], list) or len(log['last']) != rounds_done
            or type(log['best']) is not int or not 0 <= log['best'] <= 3
            or type(log['series']) is not int or not 0 <= log['series'] <= 10**9):
        raise ValueError('三番勝負の成績が不正です')
    caps = (len(spec['flags']), len(spec['targets']), len(spec['relay']['marks']))
    for score, cap in zip(log['last'], caps):
        if (not isinstance(score, dict) or score.keys() != {'player', 'rival'}
                or any(type(points) is not int or not 0 <= points <= cap for points in score.values())):
            raise ValueError('三番勝負の得点が不正です')
    wins = sum(score['player'] > score['rival'] for score in log['last'])
    if (rounds_done < 3 and (log['series'] or log['best'])
            or rounds_done == 3 and (
                log['series'] < 1 or log['best'] < wins
                or log['series'] == 1 and log['best'] != wins
                or record['status'] == 'active' and log['series'] != 1
            )):
        raise ValueError('三番勝負の最多勝と完走回数が不正です')


def validate_endgame(data):
    record = data['endgame']
    if not isinstance(record, dict) or set(record)-{'goal','stygian','weekly','artifactDomains'} != {'abyss', 'bosses'}:
        raise ValueError('Invalid challenge records')
    if 'goal' in record and record['goal'] not in ('gear', 'discover', 'boss'):
        raise ValueError('Invalid selected adventure goal')
    growth = data.get('story', {}).get('growth', {})
    if not isinstance(growth, dict) or ('goal' in record) != (growth.get('postgame-goal') is True):
        raise ValueError('Inconsistent adventure goal')
    categories=[('abyss',_ABYSS_MODES),('bosses',set(_FIELD_BOSSES)|set(_WEEKLY_BOSSES)|{'farka'})]
    if 'stygian' in record:
        categories.append(('stygian',_STYGIAN_MODES))
    if 'weekly' in record:
        categories.append(('weekly', {f'{id}:{mode}' for id, spec in _WEEKLY_BOSSES.items()
                                     if not spec.get('original') for mode in WEEKLY_MODE_IDS}))
    if 'artifactDomains' in record:
        categories.append(('artifactDomains', _ARTIFACT_DOMAIN_RANKS))
    for category, known in categories:
        entries = record[category]
        fields = {'clears', 'bestTicks', 'companion'}
        if category=='abyss': fields.add('bestStars')
        if category=='stygian': fields.add('mainSkill')
        if not isinstance(entries, dict) or set(entries)-set(known):
            raise ValueError('Unknown challenge record')
        for id, entry in entries.items():
            if (not isinstance(entry, dict) or set(entry)!=fields or entry['companion'] not in _COMPANIONS
                    or type(entry['clears']) is not int or not 1<=entry['clears']<=1000000
                    or type(entry['bestTicks']) is not int or not 1<=entry['bestTicks']<=10**9):
                raise ValueError('Invalid challenge time')
            if category == 'stygian':
                key=entry['mainSkill']
                limit=known[id].get('limit')
                if (not isinstance(key,str) or not re.fullmatch(r'[A-Za-z0-9:_-]{1,48}',key)
                        or limit is not None and entry['bestTicks']>limit*60):
                    raise ValueError('Invalid Stygian result')
            if category == 'abyss':
                mode = known[id]
                ticks = entry['bestTicks']
                expected = 3 if ticks<=mode['threeStars']*60 else 2 if ticks<=mode['twoStars']*60 else 1
                if type(entry['bestStars']) is not int or entry['bestStars']!=expected or ticks>mode['limit']*60:
                    raise ValueError('Invalid chamber result')
            if category == 'artifactDomains':
                node, limit = known[id]
                if entry['bestTicks'] > limit*60 or not data.get('story', {}).get('visited', {}).get(node):
                    raise ValueError('Invalid artifact domain result')


def validate_party_combat(party, companion):
    if not isinstance(party, dict) or set(party) != {'traveler', 'companion', 'reserve', 'swap'}:
        raise ValueError('パーティの戦闘保存形式が不正です')
    if type(party['swap']) not in (int, float) or not 0 <= party['swap'] <= .8:
        raise ValueError('操作交代の残り時間が不正です')
    reserve = party['reserve']
    if not isinstance(reserve, dict) or set(reserve) - (set(_COMPANIONS) - {companion}):
        raise ValueError('控えの同行者が不正です')
    for actor in (party['traveler'], party['companion'], *reserve.values()):
        if not isinstance(actor, dict) or set(actor) != {'hp', 'cooldowns'}:
            raise ValueError('キャラの戦闘保存形式が不正です')
        if type(actor['hp']) not in (int, float) or not 0 <= actor['hp'] <= 10**9:
            raise ValueError('保存HPが不正です')
        cooldowns = actor['cooldowns']
        if (not isinstance(cooldowns, dict) or set(cooldowns) - _COMBAT_COOLDOWNS
                or any(type(value) not in (int, float) or not 0 < value <= 3600
                       for value in cooldowns.values())):
            raise ValueError('技の残り時間が不正です')


def validate_loadout(slots):
    if not isinstance(slots, list) or len(slots) != 8:
        raise ValueError('スキル枠は8個です')
    for slot in slots:
        if (not isinstance(slot, list) or len(slot) > 3
                or any(not isinstance(skill, str) or skill not in _TRAVELER_SKILLS for skill in slot)):
            raise ValueError('スキル枠が不正です')


def validate_party_presets(presets):
    if not isinstance(presets, dict) or set(presets) - {'1', '2', '3'}:
        raise ValueError('編成プリセットの枠が不正です')
    for record in presets.values():
        if (not isinstance(record, dict) or set(record)-{'weapons'} != {'companion', 'traveler', 'partner', 'loadout'}
                or record['companion'] not in _COMPANIONS):
            raise ValueError('編成プリセットの形式が不正です')
        validate_loadout(record['loadout'])
        if 'weapons' in record:
            pair = record['weapons']
            if not isinstance(pair, dict) or set(pair) != {'traveler', 'partner'}:
                raise ValueError('編成プリセットの武器枠が不正です')
            chosen = {}
            for role, owner in (('traveler', 'traveler'), ('partner', record['companion'])):
                if pair[role] != '':
                    chosen[owner] = pair[role]
            validate_weapon_slots(chosen)
        used = set()
        for gear in (record['traveler'], record['partner']):
            if not isinstance(gear, list) or len(gear) != 5:
                raise ValueError('編成プリセットの装備枠が不正です')
            for item_id in gear:
                if type(item_id) is not int or not 0 <= item_id < 10**9 or item_id in used:
                    raise ValueError('編成プリセットの装備参照が不正です')
                if item_id:
                    used.add(item_id)


def validate_weapon_slots(slots):
    if not isinstance(slots, dict):
        raise ValueError('武器の装備先が不正です')
    used = set()
    for owner, weapon_id in slots.items():
        weapon = _WEAPONS.get(weapon_id) if isinstance(weapon_id, str) else None
        if (not weapon or weapon['type'] != _WEAPON_SETTINGS['types'].get(owner)
                or weapon.get('bound', owner) != owner or weapon_id in used):
            raise ValueError('武器の装備先が不正です')
        used.add(weapon_id)


def validate_weapons(state, quests):
    if not isinstance(state, dict) or set(state) != {'upgrades', 'equipped'}:
        raise ValueError('武器の保存形式が不正です')
    upgrades = state['upgrades']
    if (not isinstance(upgrades, dict) or set(upgrades)-_WEAPONS.keys()
            or any(type(level) is not int or not 1 <= level <= _WEAPON_SETTINGS['enhancement']['cap']
                   for level in upgrades.values())):
        raise ValueError('武器の強化段階が不正です')
    validate_weapon_slots(state['equipped'])
    for weapon_id in set(upgrades) | set(state['equipped'].values()):
        quest_id = _WEAPONS[weapon_id].get('quest')
        quest = quests.get(quest_id, {})
        if quest_id and quest.get('status') != 'complete' and not quest.get('cycles', 0):
            raise ValueError('入手していない武器の保存情報です')


def validate_save(data):
    if not isinstance(data,dict) or set(data)-{'loadout','progression','inventory','companion','story','fieldBosses','weeklyBosses','daily','endgame','rankProof','partyCombat','partyPresets','weapons'}!=FIELDS:
        raise ValueError('保存データの項目が一致しません')
    if type(data['version']) is not int or data['version']!=1:
        raise ValueError('対応していない保存バージョンです')
    if data['quest'] not in ('available','hunt','boss','report','complete'):
        raise ValueError('依頼の状態が不正です')
    companion=data.get('companion','amber')
    if companion not in _COMPANIONS: raise ValueError('仲間が不正です')
    if 'partyCombat' in data:
        validate_party_combat(data['partyCombat'], companion)
    if 'partyPresets' in data:
        validate_party_presets(data['partyPresets'])
    # Earlier battles could leave cumulative damage as a Lua float after percentage HP costs.
    if type(data['damage']) is float and 0<=data['damage']<=10**15:
        data={**data,'damage':math.floor(data['damage'])}
    for key,maximum in [('count',8),('mora',10**12),('kills',10**9),('hits',10**12),('damage',10**15),('gauge',100),('active',2)]:
        if type(data[key]) is not int or not 0<=data[key]<=maximum:
            raise ValueError('保存数値が不正です: '+key)
    if data['active'] not in (1,2): raise ValueError('操作キャラが不正です')
    if 'daily' in data:
        validate_daily_state(data['daily'])
    q,n=data['quest'],data['count']
    if (q=='available' and n!=0) or (q=='hunt' and n>=8) or (q in ('boss','report','complete') and n!=8):
        raise ValueError('討伐数と依頼の状態が一致しません')
    if 'loadout' in data:
        validate_loadout(data['loadout'])
    if 'progression' in data:
        p=data['progression']
        legacy_fields={'level','xp','total','killXp','questXp','lastKills','questRewarded'}
        curve_fields={'curve','baseXp','overflowXp','curveAdjustment'}
        if not isinstance(p,dict) or set(p) not in (legacy_fields,legacy_fields | curve_fields):
            raise ValueError('経験値の保存項目が不正です')
        current='curve' in p
        numeric=(legacy_fields-{'questRewarded'}) | ({'baseXp','overflowXp'} if current else set())
        for key in numeric:
            if type(p[key]) is not int or not 0<=p[key]<=MAX_SAVED_EXP:
                raise ValueError('経験値の数値が不正です: '+key)
        level=p['level']
        if not 1<=level<=CAP:
            raise ValueError('検証範囲外のレベルです')
        if current:
            if (p['curve']!=CURVE_ID or type(p['curveAdjustment']) is not int
                    or abs(p['curveAdjustment'])>CAP_EXP
                    or not p['questXp']<=p['baseXp']<=p['total']):
                raise ValueError('経験値表または基礎累計が不正です')
            row=LEVELS[level-1]
            spent=row['maple_reference_total_exp_to_reach']
            if level==CAP:
                aligned=p['xp']==0
            else:
                aligned=p['overflowXp']==0 and p['xp']<row['required_exp_to_next']
            balanced=spent+p['xp']+p['overflowXp']==p['total']+p['curveAdjustment']
        else:
            needed=100+20*(level-1)**2
            spent=sum(100+20*(n-1)**2 for n in range(1,level))
            aligned=level==CAP or p['xp']<needed
            balanced=spent+p['xp']==p['total']
        if not aligned or not balanced or p['killXp']+p['questXp']!=p['total']:
            raise ValueError('レベルと累計経験値が一致しません')
        if type(p['questRewarded']) is not bool or p['questRewarded']!=(data['quest']=='complete') or p['lastKills']!=data['kills']:
            raise ValueError('経験値報酬の状態が一致しません')
    graph=json.loads(_STORY_GRAPH_PATH.read_text(encoding='utf8')) if 'story' in data else None
    if 'inventory' in data:
        bag=data['inventory']
        if not isinstance(bag,dict) or set(bag)-{'ground','targetSet','combatRng','upgradeOre'}!={'items','nextId','rng','sampleKit','message'}: raise ValueError('装備保存形式が不正です')
        ore=bag.get('upgradeOre',0)
        if type(ore) is not int or not 0<=ore<=10**9: raise ValueError('強化鉱石の所持数が不正です')
        if not isinstance(bag['items'],list) or len(bag['items'])>80: raise ValueError('バッグ上限を超えています')
        if type(bag['nextId']) is not int or not 1<=bag['nextId']<=10**9 or type(bag['rng']) is not int or not 1<=bag['rng']<2147483647: raise ValueError('装備ID/乱数状態が不正です')
        if type(bag['sampleKit']) is not bool or not isinstance(bag['message'],str) or len(bag['message'])>200: raise ValueError('装備状態が不正です')
        ground=bag.get('ground',[])
        if not isinstance(ground,list) or len(ground)>256: raise ValueError('未回収品が検証上限を超えています')
        if ground:
            if graph is None:
                graph=json.loads(_STORY_GRAPH_PATH.read_text(encoding='utf8'))
            loot_zones=_LEGACY_LOOT_ZONES | {'story:'+node['id'] for node in graph['nodes']}
        for drop in ground:
            if not isinstance(drop,dict) or set(drop)!={'item','x','y','zone'}: raise ValueError('地面品の形式が不正です')
            if drop['zone'] not in loot_zones: raise ValueError('地面品の地域が不正です')
            for axis in ('x','y'):
                if type(drop[axis]) not in (int,float) or not math.isfinite(drop[axis]) or not -1000<=drop[axis]<=5000: raise ValueError('地面品の座標が不正です')
            if not isinstance(drop['item'],dict) or drop['item'].get('owner')!=0: raise ValueError('地面品は装備できません')
        if bag.get('targetSet','gladiator') not in ('gladiator','troupe'): raise ValueError('対象セットが不正です')
        if type(bag.get('combatRng',1973)) is not int or not 1<=bag.get('combatRng',1973)<2147483647: raise ValueError('会心乱数が不正です')
        ids=set();equipped=set()
        for item in bag['items']+[d['item'] for d in ground]:
            optional={'locked','setId','subpair','companionId','imprintStars'}
            required={'id','slot','itemLv','rarity','enhance','owner'}
            if not isinstance(item,dict) or set(item)-optional!=required or any(type(item[k]) is not int for k in required): raise ValueError('聖遺物形式が不正です')
            if not 0<item['id']<bag['nextId'] or item['id'] in ids or not 1<=item['slot']<=5 or not 1<=item['itemLv']<=220 or item['rarity'] not in (3,4,5) or item['owner'] not in (0,1,2): raise ValueError('聖遺物の値が不正です')
            cap={3:12,4:16,5:20}[item['rarity']]
            if item['enhance'] not in range(0,cap+1,4): raise ValueError('強化値が不正です')
            stars=item.get('imprintStars',0)
            if (type(stars) is not int or not 0<=stars<=_IMPRINT_CAPS[str(item['rarity'])]
                    or (stars and item['enhance']!=cap)):
                raise ValueError('光界刻印の星数が不正です')
            bound=item.get('companionId',companion) if item['owner']==2 else None
            if 'companionId' in item and (item['owner']!=2 or item['companionId'] not in _COMPANIONS):
                raise ValueError('聖遺物の装備者が不正です')
            if 'setId' in item and (not isinstance(item['setId'],str) or item['setId'] not in _ARTIFACT_SETS):
                raise ValueError('セットが不正です')
            if 'subpair' in item and item['subpair'] not in ('atk_crit','hp_crit'): raise ValueError('サブ効果が不正です')
            if item.get('subpair')=='atk_crit' and item['slot']==3: raise ValueError('主効果とサブ効果の重複です')
            if 'locked' in item and type(item['locked']) is not bool: raise ValueError('装備ロックが不正です')
            ids.add(item['id']);slot=(item['owner'],bound,item['slot'])
            if item['owner'] and slot in equipped: raise ValueError('装備部位が重複しています')
            if item['owner']: equipped.add(slot)
    if 'story' in data:
        nodes={n['id']:n for n in graph['nodes']};quests={q['id']:q for q in graph['quests']}
        st=data['story']
        if not isinstance(st,dict) or set(st)-{'discovered','growth'}!={'active','node','visited','quests'} or type(st['active']) is not bool or st['node'] not in nodes: raise ValueError('Invalid story state')
        if not isinstance(st['visited'],dict) or not st['visited'].get('mond-town') or not st['visited'].get(st['node']) or any(k not in nodes or v is not True for k,v in st['visited'].items()): raise ValueError('Invalid visited stages')
        discovered=st.get('discovered',{})
        groups={n.get('hiddenGroup') for n in graph['nodes'] if n.get('hiddenGroup')}
        if not isinstance(discovered,dict) or any(k not in groups or v is not True for k,v in discovered.items()): raise ValueError('Invalid hidden discovery')
        if any(nodes[k].get('hiddenGroup') and not discovered.get(nodes[k]['hiddenGroup']) for k in st['visited']): raise ValueError('Undiscovered hidden visit')
        if not isinstance(st['quests'],dict): raise ValueError('Invalid story quests')
        growth = st.get('growth', {})
        known_growth = {objective['id'] for quest in quests.values() for category in ('lesson', 'bonusLesson')
                        for objective in quest.get(category, [])}
        if not isinstance(growth, dict) or any(key not in known_growth or value is not True for key, value in growth.items()):
            raise ValueError('Invalid growth evidence')
        for id,q in st['quests'].items():
            if id not in quests or not isinstance(q,dict) or set(q)-{'cycles','recovered','inspected','delivery','cooking','book','stone','construction','lantern','forest','sights','rest','roof','sweep','paperSouvenir','stagePlan','flagBestTicks','pathProgress','storyChoice','reflectAngle','appraisal','surveySupport','snowMatchRecord','fireworkDesign','stealthEncounter','ittoContest','colleiLetter','roomLayout','discoveryDraft','discoveryDew','groupPhoto','stonePair','huntNotes','springRecord','trainingLog'}!={'status','count'} or q['status'] not in ('active','complete') or type(q['count']) is not int or not 0<=q['count']<=quests[id]['goal'] or (q['status']=='complete' and q['count']!=quests[id]['goal']): raise ValueError('Invalid story quest progress')
            if 'cycles' in q and (type(q['cycles']) is not int or not 0<=q['cycles']<=10**9 or (not quests[id].get('repeatable') and q['cycles']>1) or (q['status']=='complete' and q['cycles']<1)): raise ValueError('Invalid quest cycle count')
            if 'recovered' in q:
                cargo = quests[id].get('cargo')
                found = q['recovered']
                if not cargo or not isinstance(found, dict):
                    raise ValueError('Invalid quest cargo')
                cargo_ids = {item['id'] for item in cargo}
                if any(item not in cargo_ids or flag is not True for item, flag in found.items()):
                    raise ValueError('Invalid quest cargo ID')
                if quests[id].get('recovery'):
                    if len(found) != min(q['count'], len(cargo_ids)):
                        raise ValueError('Invalid recovery progress')
                    if quests[id]['opensAfter'] not in st['quests']:
                        raise ValueError('Missing recovery prerequisite')
                elif (found and q['count'] < quests[id]['goal'] - 1
                        or q['count'] == quests[id]['goal'] and set(found) != cargo_ids):
                    raise ValueError('Invalid quest cargo progress')
            quest = quests[id]
            if quest.get('lesson') and (quest['hub'] not in st['visited']
                    or q['count'] != sum(objective['id'] in growth for objective in quest['lesson'])):
                raise ValueError('Invalid growth quest progress')
            if 'colleiLetter' in q and (not quest.get('guideLetter') or q['status']!='complete'
                    or q['colleiLetter'] not in ('held','delivered')):
                raise ValueError('コレイの手紙の記録が不正です')
            if quest.get('itinerary'):
                visited=st['visited']
                if quest['hub'] not in visited:
                    raise ValueError('未訪問の地点が調査済みになっています')
                validate_steps_visited(quest['itinerary'],q['count'],visited)
            validate_paths(q,quest,st['visited'])
            validate_reading_model(q,quest)
            validate_group_photo(q,quest)
            validate_stone_pair(q,quest)
            validate_iansan_training(q,quest,st['visited'])
            validate_spring_course(q,quest,st['visited'])
            validate_kinich_hunt(q,quest,st['visited'])
            validate_discovery_map(q,quest,st)
            validate_appraisal(q,quest,st['visited'])
            validate_snow_match(q,quest,nodes.get(quest.get('target'),{}).get('snowMatch'))
            validate_firework(q,quest,st['visited'])
            validate_stealth(q,quest,st['visited'])
            validate_itto_contest(q,quest,nodes.get(quest.get('target'),{}).get('ittoGames'),st['visited'])
            if 'flagBestTicks' in q:
                ticks=q['flagBestTicks']
                if not quest.get('flagTrial') or q['status']!='complete' or type(ticks) is not int or not 1<=ticks<=10**9:
                    raise ValueError('旗取りの計測記録が不正です')
            gifts = [gift['id'] for step in quest.get('itinerary',[])[:q['count']] for gift in step.get('paperSouvenir',[])]
            if (gifts and q.get('paperSouvenir') not in gifts) or (not gifts and 'paperSouvenir' in q):
                raise ValueError('折り紙飾りの記録が不正です')
            layouts = [choice['id'] for step in quest.get('itinerary',[])[:q['count']]
                       if step.get('airflow',{}).get('stagePlan') for choice in step['airflow']['choices']]
            if (layouts and q.get('stagePlan') not in layouts) or (not layouts and 'stagePlan' in q):
                raise ValueError('舞台設備の記録が不正です')
            itinerary = quest.get('itinerary', [])
            choices = [option['id'] for step in itinerary[:q['count']] for option in step.get('choices', [])
                       if step['kind'] == 'choice']
            if (choices and q.get('storyChoice') not in choices) or (not choices and 'storyChoice' in q):
                raise ValueError('聞き込みの記録が不正です')
            if 'reflectAngle' in q:
                next_step = itinerary[q['count']] if q['count'] < len(itinerary) else {}
                mirror, angle = next_step.get('reflect', {}), q['reflectAngle']
                if (not mirror.get('rememberAngle') or next_step['node'] not in st['visited']
                        or type(angle) is not int or not 1 <= angle <= len(mirror['faces'])
                        or (not mirror.get('record') and angle == mirror['align'])):
                    raise ValueError('反射板の向きが不正です')
            if 'surveySupport' in q:
                next_step = itinerary[q['count']] if q['count'] < len(itinerary) else {}
                rig, choice = next_step.get('surveyRig'), q['surveySupport']
                if (not rig or next_step['node'] not in st['visited']
                        or type(choice) is not int or not 1 <= choice <= len(rig['options'])):
                    raise ValueError('観測器の設置方法が不正です')
            validate_sweep(q,quest.get('itinerary',[]),st['visited'])
            if quest.get('requires'):
                predecessor = st['quests'].get(quest['requires'])
                if not isinstance(predecessor, dict) or predecessor.get('status') != 'complete':
                    raise ValueError('Incomplete story quest prerequisite')
            if quest.get('opensAfterAnyPath'):
                predecessor = st['quests'].get(quest['opensAfter'])
                routes = predecessor.get('pathProgress') if isinstance(predecessor, dict) else None
                if not isinstance(routes, dict) or not any(
                        isinstance(routes.get(path), dict) and type(routes[path].get('count')) is int
                        and routes[path]['count'] >= required for path, required in quest['opensAfterAnyPath'].items()):
                    raise ValueError('試作工房を開く挑戦の記録がありません')
            if 'opensAfterCount' in quest:
                predecessor = st['quests'].get(quest['opensAfter'])
                prior_count = predecessor.get('count') if isinstance(predecessor, dict) else None
                if type(prior_count) is not int or prior_count < quest['opensAfterCount']:
                    raise ValueError('同行の初対面記録がありません')
            if quest.get('trail') or 'inspected' in q:
                inspected = q.get('inspected')
                if not quest.get('trail') or not isinstance(inspected, dict):
                    raise ValueError('Invalid trail clues')
                clue_ids = {clue['id'] for clue in quest['trail']['clues']}
                meeting = quest['trail'].get('meeting')
                allowed = clue_ids | ({meeting['id']} if meeting else set())
                if any(key not in allowed or flag is not True for key, flag in inspected.items()):
                    raise ValueError('Invalid trail clue ID')
                if meeting and (bool(inspected.get(meeting['id'])) != (q['count'] >= 2)):
                    raise ValueError('Invalid trail meeting')
                if bool(clue_ids & inspected.keys()) != (q['count'] > 0):
                    raise ValueError('Invalid trail progress')
            if quest.get('level', 0) > data.get('progression', {}).get('level', 0):
                raise ValueError('Unmet story quest level')
            if 'sights' in q:
                spec, state = quest.get('sights'), q['sights']
                if not spec or not isinstance(state, dict) or set(state)-{'favorite'} != {'seen'}:
                    raise ValueError('Invalid town sight state')
                if quest['opensAfter'] not in st['quests']:
                    raise ValueError('Missing town sight prerequisite')
                seen = state['seen']
                ids = {place['id'] for place in spec['places']}
                if (not isinstance(seen,dict) or len(seen)!=min(q['count'],len(ids))
                        or any(key not in ids or value is not True for key,value in seen.items())):
                    raise ValueError('Invalid town sight progress')
                if q['count']==quest['goal']:
                    if not isinstance(state.get('favorite'),str) or state['favorite'] not in ids | {spec['bridge']['id']}:
                        raise ValueError('Invalid favorite sight')
                elif 'favorite' in state:
                    raise ValueError('Premature favorite sight')
            if quest.get('roof') or 'roof' in q:
                state=q.get('roof')
                fields={'ticks','falls'} | ({'bestTicks'} if q['count']==quest['goal'] else set())
                if (not quest.get('roof') or not isinstance(state,dict) or set(state)!=fields
                        or any(type(n) is not int or not 0<=n<=10**9 for n in state.values())
                        or ('bestTicks' in state and not 1<=state['bestTicks']<=state['ticks'])):
                    raise ValueError('風車の巡回記録が不正です')
            if quest.get('rest') or 'rest' in q:
                spec, state = quest.get('rest'), q.get('rest')
                if not spec or not isinstance(state,dict) or set(state)!={'defeated'}:
                    raise ValueError('Invalid roadside rest progress')
                guards, defeated = set(spec['guards']), state['defeated']
                if (not isinstance(defeated,dict) or any(k not in guards or v is not True for k,v in defeated.items())
                        or (q['count']>=1)!=(guards==defeated.keys())):
                    raise ValueError('Invalid roadside rest guards')
            if quest.get('forest') or 'forest' in q:
                spec, state = quest.get('forest'), q.get('forest')
                if not spec or not isinstance(state, dict) or set(state) != {'looped','defeated'}:
                    raise ValueError('Invalid forest quest state')
                if type(state['looped']) is not bool or (q['count']>0 and not state['looped']):
                    raise ValueError('Invalid torii loop progress')
                guards, defeated = set(spec['guards']), state['defeated']
                if not isinstance(defeated, dict) or any(key not in guards or flag is not True for key,flag in defeated.items()):
                    raise ValueError('Invalid forest fight state')
                if (q['count']<3 and defeated) or (q['count']>=4)!=(defeated.keys()==guards):
                    raise ValueError('Invalid forest fight progress')
            if quest.get('lantern') or 'lantern' in q:
                spec, state = quest.get('lantern'), q.get('lantern')
                if not spec or not isinstance(state, dict) or set(state) != {'inspected'}:
                    raise ValueError('Invalid lantern quest state')
                inspected = state['inspected']
                ids = {item['id'] for item in spec['clues']}
                if (not isinstance(inspected, dict) or len(inspected) != min(max(0,q['count']-1),len(ids))
                        or any(key not in ids or flag is not True for key,flag in inspected.items())):
                    raise ValueError('Invalid lantern clues')
            if quest.get('construction') or 'construction' in q:
                spec, state = quest.get('construction'), q.get('construction')
                if not spec or not isinstance(state, dict) or set(state)-{'plan'} != {'surveyed'}:
                    raise ValueError('Invalid route construction state')
                surveyed = state['surveyed']
                ids = {item['id'] for item in spec['surveys']}
                if (not isinstance(surveyed, dict) or len(surveyed) != min(q['count'], len(ids))
                        or any(key not in ids or value is not True for key, value in surveyed.items())):
                    raise ValueError('Invalid route survey progress')
                if q['count'] > len(ids):
                    if state.get('plan') not in [plan['id'] for plan in spec['plans']]:
                        raise ValueError('Invalid construction plan')
                elif 'plan' in state:
                    raise ValueError('Premature construction plan')
            if quest.get('stone') or 'stone' in q:
                spec, state = quest.get('stone'), q.get('stone')
                if not spec or not isinstance(state, dict) or set(state) != {'marked','sequence'}:
                    raise ValueError('Invalid stonemason quest state')
                marks = {item['id'] for item in spec['marks']}
                marked, sequence = state['marked'], state['sequence']
                if (not isinstance(marked, dict) or len(marked) != min(q['count'],len(marks))
                        or any(key not in marks or value is not True for key, value in marked.items())):
                    raise ValueError('Invalid stonemason marks')
                if type(sequence) is not int or not 0 <= sequence <= len(spec['order']):
                    raise ValueError('Invalid stonemason tile sequence')
                if (q['count'] < len(marks) and sequence != 0
                        or (q['count'] > len(marks)) != (sequence == len(spec['order']))):
                    raise ValueError('Invalid stonemason puzzle progress')
            if quest.get('book') or 'book' in q:
                case = quest.get('book')
                state = q.get('book')
                if not case or not isinstance(state, dict) or set(state) != {'defeated'}:
                    raise ValueError('Invalid book recovery state')
                defeated = state['defeated']
                guards = set(case['guards'])
                if not isinstance(defeated, dict) or any(key not in guards or flag is not True for key, flag in defeated.items()):
                    raise ValueError('Invalid book camp guard progress')
                if (q['count'] < 2 and defeated) or (q['count'] >= 3) != (defeated.keys() == guards):
                    raise ValueError('Invalid book recovery progress')
            if quest.get('cooking') or 'cooking' in q:
                recipe = quest.get('cooking')
                stock = q.get('cooking')
                if not recipe or not isinstance(stock, dict) or set(stock)-{'flavor'} != {'gathered','meals'}:
                    raise ValueError('Invalid cooking state')
                gathered = stock['gathered']
                ingredients = {item['id'] for item in recipe['ingredients']}
                if (not isinstance(gathered, dict) or len(gathered) != min(q['count'], len(ingredients))
                        or any(key not in ingredients or value is not True for key, value in gathered.items())):
                    raise ValueError('Invalid gathered ingredients')
                if q['count'] == quest['goal']:
                    if stock.get('flavor') not in [flavor['id'] for flavor in recipe['flavors']]:
                        raise ValueError('Invalid dish flavor')
                elif 'flavor' in stock:
                    raise ValueError('Premature dish flavor')
                cap = recipe['capacity'] if q['status'] == 'complete' else 0
                if type(stock['meals']) is not int or not 0 <= stock['meals'] <= cap:
                    raise ValueError('Invalid meal stock')
            if quest.get('delivery') or 'delivery' in q:
                state = q.get('delivery')
                if not quest.get('delivery') or not isinstance(state, dict) or set(state) != {'guardCleared','recovered','delivered'}:
                    raise ValueError('Invalid delivery state')
                if type(state['guardCleared']) is not bool or type(state['recovered']) is not bool or not isinstance(state['delivered'], dict):
                    raise ValueError('Invalid delivery fields')
                parcels = {parcel['id'] for parcel in quest['delivery']['packages']}
                delivered = state['delivered']
                if len(delivered) != q['count'] or any(key not in parcels or flag is not True for key, flag in delivered.items()):
                    raise ValueError('Invalid delivery progress')
                if (state['recovered'] and not state['guardCleared']
                        or quest['delivery']['cache']['id'] in delivered and not state['recovered']):
                    raise ValueError('Invalid recovered parcel')
    if 'fieldBosses' in data:
        slots=data['fieldBosses']
        if not isinstance(slots,dict):
            raise ValueError('フィールドボスの保存形式が不正です')
        for id, slot in slots.items():
            spec=_FIELD_BOSSES.get(id)
            if not spec or spec.get('manualRechallenge') or not isinstance(slot, dict):
                raise ValueError('フィールドボスの個体情報が不正です')
            max_hp = slot.get('maxHp', spec['hp'])
            if 'maxHp' in slot and (id not in _DRAFT_FIELD_BOSS_HP or type(max_hp) is not int
                                    or not 1 <= max_hp <= 10**9):
                raise ValueError('フィールドボスの最大HPが不正です')
            if (set(slot)-{'flags','elapsedTicks','maxHp'}!={'generation','hp','waitTicks'}
                    or any(type(slot[k]) is not int for k in ('generation','hp','waitTicks'))
                    or not 1<=slot['generation']<=10**9 or not 0<=slot['hp']<=max_hp
                    or not 0<=slot['waitTicks']<=spec['respawnTicks']
                    or bool(slot['hp'])==bool(slot['waitTicks'])):
                raise ValueError('フィールドボスの個体情報が不正です')
            if 'elapsedTicks' in slot and (not 0<slot['hp']<max_hp
                    or type(slot['elapsedTicks']) is not int or not 0<=slot['elapsedTicks']<=10**9):
                raise ValueError('フィールドボスの経過時間が不正です')
            if 'flags' in slot:
                flags=slot['flags']
                allowed=spec.get('saveFlags',[])
                if (not allowed or not isinstance(flags,dict) or set(flags)!=set(allowed)
                        or any(type(value) is not bool for value in flags.values())):
                    raise ValueError('フィールドボスの保存フラグが不正です')
    if 'weeklyBosses' in data:
        slots=data['weeklyBosses']
        if not isinstance(slots,dict): raise ValueError('週ボス保存形式が不正です')
        for id,slot in slots.items():
            spec=_WEEKLY_BOSSES.get(id)
            if (not spec or not isinstance(slot,dict) or set(slot)!={'generation','hp','waitTicks'}
                    or any(type(v) is not int for v in slot.values())
                    or not 1<=slot['generation']<=10**9
                    or not 0<=slot['waitTicks']<=spec['respawnTicks']
                    or slot['hp']!=(0 if slot['waitTicks'] else spec['hp'])):
                raise ValueError('週ボス個体情報が不正です')
    if 'endgame' in data:
        validate_endgame(data)
    elif 'postgame-goal' in data.get('story', {}).get('growth', {}):
        raise ValueError('Missing selected adventure goal')
    if 'weapons' in data:
        validate_weapons(data['weapons'], data.get('story', {}).get('quests', {}))
    save = data.copy()
    save.pop('rankProof', None)
    return save
