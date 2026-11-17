#!/usr/bin/env python3
"""Build a reviewed local-editor proposal. Never writes canonical JSON.
Python 3.10+, standard library only. Generate ONE region against the current
revision, review/adopt it, then regenerate the next region. No automatic merge.
"""
from __future__ import annotations
import argparse,copy,hashlib,importlib.util,json,sys
from pathlib import Path
from typing import Any
HERE=Path(__file__).resolve().parent
COLS={'field_definitions':'field_id','field_edges':'edge_id','field_spawns':'spawn_id','monster_families':'family_id','monster_variants':'monster_id'}
ACCEPTED={'approved','implemented','verified'}
class Conflict(ValueError):pass

def read(path:Path)->Any:
    return json.loads(path.read_text(encoding='utf-8-sig'))

def build(project:dict,plan:dict,seed:dict,region:str,include_review:bool=False,review_note:str='',part:str='all',include_challenges:bool=False)->dict:
    if project.get('schema_version')!=1 or type(project.get('revision')) is not int or project['revision']<0:
        raise ValueError('Expected schema_version 1 and an integer nonnegative revision.')
    for c in COLS:
        if not isinstance(project.get(c),dict):raise ValueError('Missing collection '+c)
    if include_review and not review_note.strip():raise ValueError('--include-review requires --review-note; this is a proposal only, not evidence of walk verification.')
    regions={r['region_id']:r for r in plan['regions']}
    region=next((r['region_id'] for r in regions.values() if r['prefix'].lower()==region.lower()),region)
    if region.lower()=='cross':region='CROSS'
    if region!='CROSS' and region not in regions:raise ValueError('Unknown region. Use a catalog prefix, region_id, or CROSS.')
    if region in ('region-01','branch-01','branch-06'):raise ValueError('MON/DSP/DOP are preserved references; use the existing Mondstadt package.')
    if part not in ('all','fields','routes','enemies','challenges','classification'):raise ValueError('Unknown part')
    if part=='challenges' and not include_challenges:raise ValueError('--part challenges also requires --include-challenges')
    if include_challenges and not include_review:raise ValueError('Challenge access anchors are review-only; use --include-review with a review note.')
    allfields={f['field_id']:f for f in plan['fields']}
    selected=[f for f in plan['fields'] if f['placement_region_id']==region and f['corridor_ids'] and (f['import_enabled'] or include_review)]
    if region!='CROSS' and not selected:
        raise ValueError('No bound eligible fields. Unbound design slots cannot be imported as official fields. Review-only regions require explicit review selection.')
    fids={f['field_id'] for f in selected}
    edges=[e for e in plan['edges'] if ((e.get('crossing_id') and region=='CROSS') or (e['scope']==region and not e.get('crossing_id'))) and (e['default_import'] or include_review)]
    # An unbound slot is NEVER inferred or created, even with include-review.
    skipped_unbound=[e['edge_id'] for e in edges if e['from_field'].startswith('slot:') or e['to_field'].startswith('slot:')]
    edges=[e for e in edges if e['edge_id'] not in skipped_unbound]
    required=fids|{e[k] for e in edges for k in ('from_field','to_field')}
    if required-project['field_definitions'].keys():
        raise Conflict('Missing official field IDs. Update the live catalog; never invent coordinates: '+', '.join(sorted(required-project['field_definitions'].keys())))
    # A route can reference an existing field not edited by this proposal. Its unknown
    # placement/level is preserved. Crossings never mutate either country's field data.
    spawns=[s for s in plan['field_spawns'] if s['field_id'] in fids and (s['default_import'] or include_review)] if part in ('all','enemies') else []
    ecs=[e for e in plan['encounter_assignments'] if e['anchor_field_id'] in fids] if include_challenges else []
    els=[e for e in plan['elite_pockets'] if e['anchor_field_id'] in fids] if include_challenges else []
    used={s['monster_id'] for s in spawns}|{e['monster_id'] for e in ecs+els}
    variant_seed={v['monster_id']:v for v in seed['variants']}
    family_seed={v['family_id']:v for v in seed['families']}
    if used-variant_seed.keys():raise ValueError('Dependency seed lacks monsters: '+', '.join(used-variant_seed.keys()))
    conflicts=[];warnings=[];operations=[]
    def add(col:str,ident:str,values:dict,states:dict|None=None):
        old=project[col].get(ident);changes={};outstates={}
        for key,val in values.items():
            current=old.get(key) if old else None
            if old is not None and current==val:continue
            meta=(old or {}).get('_meta',{}).get(key,{})
            blank=current in (None,'',[]) or (key=='production_state' and current=='未着手')
            is_proposed_classification = (part=='classification' and col=='field_definitions' and key=='region_id' and old is not None and current==allfields[ident]['source_region_id'] and meta.get('state')=='unassigned')
            if old is not None and (meta.get('state') in ACCEPTED or not blank) and not is_proposed_classification:
                conflicts.append({'collection':col,'id':ident,'property':key,'existing':current,'proposed':val});continue
            changes[key]=copy.deepcopy(val)
            if states and key in states:outstates[key]=states[key]
            elif val is None or (key=='defaults' and val=={}):outstates[key]='unassigned'
        if old is None:
            changes=copy.deepcopy(values)
            outstates={k:'unassigned' for k,v in values.items() if v is None or (k=='defaults' and v=={})}
            outstates.update(states or {})
        if changes:
            op={'collection':col,'id':ident,'action':'upsert','changes':changes}
            if outstates:op['states']=outstates
            operations.append(op)
    for family_id in sorted({variant_seed[mid]['family_id'] for mid in used}):
        if family_id not in project['monster_families']:
            f=family_seed[family_id];add('monster_families',family_id,{k:v for k,v in f.items() if k not in ('family_id','_meta')})
    for mid in sorted(used):
        v=variant_seed[mid];old=project['monster_variants'].get(mid)
        if old:
            for k in ('family_id','region_id','name','base_level','classification'):
                if old.get(k)!=v[k]:conflicts.append({'collection':'monster_variants','id':mid,'property':k,'existing':old.get(k),'proposed':v[k]})
        else:add('monster_variants',mid,{k:x for k,x in v.items() if k not in ('monster_id','_meta')})
    if part=='classification':
        for f in selected:
            if f['placement_region_id']!=f['source_region_id']:
                add('field_definitions',f['field_id'],{'region_id':f['placement_region_id']})
    if part in ('all','fields','challenges'):
        for f in selected:
            notes='\n'.join([
                '[WORLDROUTE v2 / 設計案・実歩行未検証 / GAME_RUNTIME_BLOCKED]',
                f['terrain_note'],f['safe_zone_policy'],
                f"設計上の配置地域={f['placement_region_id']}。公式所属・正本region_idは変更していない。",
                f"通常敵: {f['layout_screens']}画面合計{f['ordinary_total']}体（1画面の同時数ではない）。",
                '敵のLvはVariant固定、上書きなし。実ポータル座標と敵出現座標は未設定。',
                'レビュー区分: '+f['review_status'],
                '詳細な経路根拠と未確認事項はplan.json / DESIGN.md / REVIEW_QUEUE.md。',
                '推奨Lvと通常敵Lvの差が大きい場合はBALANCE_GAPS.mdを確認。'
            ])
            values={} if part=='challenges' else {
                'name':f['name'],'location_alias':f['name'],'recommended_level':f['recommended_level'],
                'enemy_level_min':f['enemy_level_min'],'enemy_level_max':f['enemy_level_max'],
                'respawn_seconds':6 if f['spawns'] else None,'terrain':f['terrain_note'],
                'notes':notes,'production_state':'設計中'}
            if include_challenges:
                local=[x for x in ecs if x['anchor_field_id']==f['field_id']]
                pockets=[x for x in els if x['anchor_field_id']==f['field_id']]
                def text(x):return f"{x['monster_id']} {x['name']}（図鑑Lv{x['catalog_level']} / 任意の別区画・入口未検証）"
                legends=[text(x) for x in local if x['classification']=='local_legend']
                others=[text(x) for x in local if x['classification']!='local_legend']+[text(x) for x in pockets]
                if legends:values['local_legend']=' / '.join(legends)
                if others:values['elite']=' / '.join(others)
            if values:add('field_definitions',f['field_id'],values)
    if part in ('all','routes') or region=='CROSS':
        for e in edges:
            equivalents=[(i,x) for i,x in project['field_edges'].items() if i!=e['edge_id'] and {x.get('from_field'),x.get('to_field')}=={e['from_field'],e['to_field']}]
            if equivalents:
                conflicts.append({'collection':'field_edges','id':e['edge_id'],'reason':'Existing connection for this endpoint pair uses another ID. Reconcile manually; no duplicate route inserted.','existing_ids':[x[0] for x in equivalents]});continue
            conditions={'requires_discovery':True}
            if e['requires_route_flag']:conditions['expression']=e['requires_route_flag']
            values={'from_field':e['from_field'],'to_field':e['to_field'],'direction':e['direction'],'kind':e['kind'],
                    'conditions':conditions,'exit_position':{'x':0,'y':0},'entrance_position':{'x':0,'y':0},
                    'notes':'\n'.join(['[WORLDROUTE v2 / GAME_RUNTIME_BLOCKED: PORT_POSITIONS_UNASSIGNED]',e['label'],e['corridor'],
                    '移動種別: '+e['traversal_type'],'0,0は旧スキーマ互換の未設定値。実際のポータル座標として使用しない。',
                    '入口・階層確認: '+e['review_status'],'出典: '+', '.join(e['source_refs']),e['return_policy'],
                    '地理上の隣接性とゲームの国別解放条件は別。既存の国の解放条件は変更しない。'])}
            add('field_edges',e['edge_id'],values,{'exit_position':'unassigned','entrance_position':'unassigned'})
    intended={s['spawn_id'] for s in spawns}
    if spawns:
        for sid,s in project['field_spawns'].items():
            if s.get('field_id') in {x['field_id'] for x in spawns} and sid not in intended:
                conflicts.append({'collection':'field_spawns','id':sid,'reason':'Existing population on target field. Do not double-spawn; review existing entries.'})
    for s in spawns:
        v={k:copy.deepcopy(s[k]) for k in ('field_id','monster_id','count','level_override','special','respawn_seconds','area','conditions')}
        add('field_spawns',s['spawn_id'],v,{'area':'unassigned','conditions':'unassigned'})
    if conflicts:raise Conflict('Canonical data NOT written. Resolve conflicts then regenerate:\n'+json.dumps(conflicts,ensure_ascii=False,indent=2))
    if not operations:raise ValueError('No changes: matching existing records preserved, or this selection has no eligible records.')
    if len(operations)>2000:raise ValueError('More than 2000 operations. Split by --region, then --part, refreshing the revision after each adoption.')
    request={'schema_version':1,'base_revision':project['revision'],'actor':'ChatGPT',
             'reason':f"全地域ルートv2: {region} / {part}。設計室のレビュー用。未設定座標をゲームへ流用しない。",
             'source':f"WORLDROUTE v2.0-draft / current revision {project['revision']} / plan.json. Review inclusion={include_review}; note={review_note[:1200]}",
             'operations':operations}
    if len(json.dumps(request,ensure_ascii=False).encode('utf-8'))>4*1024*1024:raise ValueError('Local API 4MiB limit exceeded; split the selection.')
    return request

def main()->int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan', type=Path, default=HERE / 'plan.json', help='Optional candidate subset for validation')
    p.add_argument('--project',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--region',required=True,help='One prefix e.g. LIY, INA, CHY, or CROSS. MON/DSP/DOP excluded.')
    p.add_argument('--part',choices=['all','fields','routes','enemies','challenges','classification'],default='all')
    p.add_argument('--include-review',action='store_true',help='Include review-only CANDIDATES for local preview, not verified paths.')
    p.add_argument('--review-note',default='');p.add_argument('--include-challenges',action='store_true')
    p.add_argument('--check-with-repo',type=Path,help='Optional real Store.simulate on a copy. No propose()/approve() call.')
    a=p.parse_args()
    try:
        src=a.project.resolve();dst=a.out.resolve()
        if src==dst or dst.exists():raise ValueError('Output must be a NEW file and cannot be canonical project.json.')
        before=src.read_bytes();digest=hashlib.sha256(before).hexdigest()
        project=json.loads(before.decode('utf-8-sig'))
        result=build(project,read(a.plan),read(HERE/'monster_dependencies.json'),a.region,a.include_review,a.review_note,a.part,a.include_challenges)
        if a.check_with_repo:
            root=a.check_with_repo.resolve();spec=importlib.util.spec_from_file_location('world_route_model_check',root/'tools/field_editor/model.py')
            if not spec or not spec.loader:raise ValueError('Cannot load editor model.')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            store=module.Store(path=src,root=root)
            store.simulate(copy.deepcopy(project),result['operations'],'proposed','ChatGPT',result['source'])
        if hashlib.sha256(src.read_bytes()).hexdigest()!=digest:raise Conflict('Project changed during generation; read the latest revision and retry.')
        dst.parent.mkdir(parents=True,exist_ok=True)
        with dst.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2,allow_nan=False);f.write('\n')
        print(f"Generated {dst}; revision={result['base_revision']}; operations={len(result['operations'])}")
        print('Canonical data unchanged. Import/review in the local UI. NOT runtime data. Refresh before the next region.')
        return 0
    except (OSError,ValueError,KeyError,TypeError,ImportError) as e:
        print(str(e),file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
