import json
from pathlib import Path
from experience import CAP, CAP_EXP, CURVE_ID, LEVELS, MAX_SAVED_EXP
_STORY_GRAPH=json.loads((Path(__file__).parent/"content/story-graph.json").read_text(encoding="utf8"))
_FIELD_BOSSES={slot["id"]:slot for slot in json.loads((Path(__file__).parent/"content/field-boss-spawns.json").read_text(encoding="utf-8-sig"))["fieldBosses"]}
_WEEKLY_BOSSES={slot['id']:slot for slot in json.loads((Path(__file__).parent/'content/weekly-boss-spawns.json').read_text(encoding='utf8'))['weeklyBosses']}
_STORY_ZONES={"story:"+n["id"] for n in _STORY_GRAPH["nodes"]}
_IMPRINT_CAPS=json.loads((Path(__file__).parent/'content/imprint-settings.json').read_text(encoding='utf8'))['caps']
_COMPANIONS=('amber','columbina','wanderer','beidou','ayaka','emilie','kachina','mitya')
import math
"""Versioned local checkpoint validation; this is not a production multiplayer save."""
FIELDS={'version','quest','count','mora','kills','hits','damage','gauge','active'}


def validate_steps_visited(steps, count, visited):
    for item in steps[:count]:
        places=[item, *item.get('alternatives',[])]
        if not any(place['node'] in visited for place in places):
            raise ValueError('未訪問の地点が調査済みになっています')


def validate_sweep(record, steps, visited):
    if 'sweep' not in record:
        return
    count=record['count']
    step=steps[count] if count<len(steps) else {}
    allowed=set(step.get('enemies',[])) if step.get('kind')=='kill' else set()
    defeated=record['sweep']
    if (not isinstance(defeated,dict) or not defeated or not defeated.keys()<allowed
            or any(flag is not True for flag in defeated.values()) or step['node'] not in visited):
        raise ValueError('遠征の討伐記録が不正です')


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


def validate_save(data):
    if not isinstance(data,dict) or set(data)-{'loadout','progression','inventory','companion','story','fieldBosses','weeklyBosses'}!=FIELDS:
        raise ValueError('保存データの項目が一致しません')
    if type(data['version']) is not int or data['version']!=1:
        raise ValueError('対応していない保存バージョンです')
    if data['quest'] not in ('available','hunt','boss','report','complete'):
        raise ValueError('依頼の状態が不正です')
    companion=data.get('companion','amber')
    if companion not in _COMPANIONS: raise ValueError('仲間が不正です')
    for key,maximum in [('count',8),('mora',10**12),('kills',10**9),('hits',10**12),('damage',10**15),('gauge',100),('active',2)]:
        if type(data[key]) is not int or not 0<=data[key]<=maximum:
            raise ValueError('保存数値が不正です: '+key)
    if data['active'] not in (1,2): raise ValueError('操作キャラが不正です')
    q,n=data['quest'],data['count']
    if (q=='available' and n!=0) or (q=='hunt' and n>=8) or (q in ('boss','report','complete') and n!=8):
        raise ValueError('討伐数と依頼の状態が一致しません')
    if 'loadout' in data:
        slots=data['loadout']
        if not isinstance(slots,list) or len(slots)!=8: raise ValueError('スキル枠は8個です')
        for slot in slots:
            if not isinstance(slot,list) or len(slot)>3 or any(x not in ('SK01','SK02','SK03','SK04','SK05','SK06','SK07','SK08','SK09','SK10','SK11','SK12','SK13','SK14','SK15','SK16','SK17','SK18','SK19','SK20','SK21','SK22','SK23','SK24','SK25','SK26','SK27','SK28','SK29','SK30','SK31','SK32','SK33','SK34','SK35','SK36','SK37','SK38','SK39','SK40','SK41','SK42','SK43','SK44','SK45','SK46','SK47','SK48','SK49','SK50','SK51','SK52','SK53','SK54','SK55','SK56','SK57','SK58','SK59','SK60') for x in slot):
                raise ValueError('スキル枠が不正です')
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
        for drop in ground:
            if not isinstance(drop,dict) or set(drop)!={'item','x','y','zone'}: raise ValueError('地面品の形式が不正です')
            if drop['zone'] not in {'town','field','arena','anemo','electro','geo','oceanid','primo','maguu','array','thunder','farka','cryo_regisvine','pyro_regisvine'} | _STORY_ZONES: raise ValueError('地面品の地域が不正です')
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
            if 'setId' in item and item['setId'] not in ('gladiator','troupe'): raise ValueError('セットが不正です')
            if 'subpair' in item and item['subpair'] not in ('atk_crit','hp_crit'): raise ValueError('サブ効果が不正です')
            if item.get('subpair')=='atk_crit' and item['slot']==3: raise ValueError('主効果とサブ効果の重複です')
            if 'locked' in item and type(item['locked']) is not bool: raise ValueError('装備ロックが不正です')
            ids.add(item['id']);slot=(item['owner'],bound,item['slot'])
            if item['owner'] and slot in equipped: raise ValueError('装備部位が重複しています')
            if item['owner']: equipped.add(slot)
    if 'story' in data:
        import json
        from pathlib import Path
        graph=json.loads((Path(__file__).parent/'content/story-graph.json').read_text(encoding='utf8'))
        nodes={n['id']:n for n in graph['nodes']};quests={q['id']:q for q in graph['quests']}
        st=data['story']
        if not isinstance(st,dict) or set(st)-{'discovered'}!={'active','node','visited','quests'} or type(st['active']) is not bool or st['node'] not in nodes: raise ValueError('Invalid story state')
        if not isinstance(st['visited'],dict) or not st['visited'].get('mond-town') or not st['visited'].get(st['node']) or any(k not in nodes or v is not True for k,v in st['visited'].items()): raise ValueError('Invalid visited stages')
        discovered=st.get('discovered',{})
        groups={n.get('hiddenGroup') for n in graph['nodes'] if n.get('hiddenGroup')}
        if not isinstance(discovered,dict) or any(k not in groups or v is not True for k,v in discovered.items()): raise ValueError('Invalid hidden discovery')
        if any(nodes[k].get('hiddenGroup') and not discovered.get(nodes[k]['hiddenGroup']) for k in st['visited']): raise ValueError('Undiscovered hidden visit')
        if not isinstance(st['quests'],dict): raise ValueError('Invalid story quests')
        for id,q in st['quests'].items():
            if id not in quests or not isinstance(q,dict) or set(q)-{'cycles','recovered','inspected','delivery','cooking','book','stone','construction','lantern','forest','sights','rest','roof','sweep','paperSouvenir','stagePlan','flagBestTicks','pathProgress','storyChoice','reflectAngle','appraisal'}!={'status','count'} or q['status'] not in ('active','complete') or type(q['count']) is not int or not 0<=q['count']<=quests[id]['goal'] or (q['status']=='complete' and q['count']!=quests[id]['goal']): raise ValueError('Invalid story quest progress')
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
            if quest.get('itinerary'):
                visited=st['visited']
                if quest['hub'] not in visited:
                    raise ValueError('未訪問の地点が調査済みになっています')
                validate_steps_visited(quest['itinerary'],q['count'],visited)
            validate_paths(q,quest,st['visited'])
            validate_appraisal(q,quest,st['visited'])
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
                        or angle == mirror['align']):
                    raise ValueError('反射板の向きが不正です')
            validate_sweep(q,quest.get('itinerary',[]),st['visited'])
            if quest.get('requires'):
                predecessor = st['quests'].get(quest['requires'])
                if not isinstance(predecessor, dict) or predecessor.get('status') != 'complete':
                    raise ValueError('Incomplete story quest prerequisite')
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
            if (not spec or not isinstance(slot,dict) or set(slot)-{'flags'}!={'generation','hp','waitTicks'}
                    or any(type(slot[k]) is not int for k in ('generation','hp','waitTicks'))
                    or not 1<=slot['generation']<=10**9 or not 0<=slot['hp']<=spec['hp']
                    or not 0<=slot['waitTicks']<=spec['respawnTicks']
                    or bool(slot['hp'])==bool(slot['waitTicks'])):
                raise ValueError('フィールドボスの個体情報が不正です')
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
    return data.copy()
