"""Regenerate the published JSON Schema, OpenAPI document and MCP tool contracts."""
from pathlib import Path
import json
from .model import COLLECTIONS, IDS, EDITABLE, NODE_KINDS, OPTIONAL, STATES
from .commands import READ_TOOLS, WRITE_TOOLS
P=Path(__file__).parent/'schemas'
S={'type':'string'}; NUM={'type':['number','null'],'minimum':0,'maximum':1e12}; LV={'type':['integer','null'],'minimum':1,'maximum':200}; OBJ={'type':'object'}
props={k:S for keys in EDITABLE.values() for k in keys}
for k in ('recommended_level','enemy_level_min','enemy_level_max','base_level','level_override'):props[k]=LV
for k in ('hp','attack','defense','exp','respawn_seconds'):props[k]=NUM
for k in ('behavior','sprite','animation','element'):props[k]={'type':['string','null']}
for k in ('drops','quests','required_route'):props[k]={'type':'array','items':{} if k=='drops' else S}
for k in ('conditions','area','defaults'):props[k]=OBJ
for k in ('exit_position','entrance_position'):props[k]={'type':'object','required':['x','y'],'properties':{'x':{'type':'number'},'y':{'type':'number'}},'additionalProperties':False}
for k in ('x','y'):props[k]={'type':'number','exclusiveMinimum':-1e7,'exclusiveMaximum':1e7}
props['waypoint_position']={'type':'object','required':['map_id','x','y'],'properties':{'map_id':S,'x':props['x'],'y':props['y']},'additionalProperties':False}
props['special']={'type':'boolean'};props['count']={'type':'integer','minimum':1,'maximum':10000}
props['direction']={'enum':['both','one_way']};props['kind']={'enum':['portal','level','quest','hidden','boat','temporary']}
props['classification']={'enum':['normal','elite','local_legend','boss','weekly_boss']}
props['production_state']={'enum':['未着手','設計中','制作中','完成']}
props['code']={'enum':['unreachable','dead_end','no_return','level_jump','quest_route']}
meta={'type':'object','required':['state','source','actor','updated_at'],'properties':{'state':{'enum':list(STATES)},'source':S,'actor':{'enum':['user','Codex','ChatGPT']},'updated_at':{'type':'string','format':'date-time'}},'additionalProperties':False}
defs={'decision':meta}
for c in COLLECTIONS:
 defs[c]={'type':'object','required':[IDS[c],*sorted(EDITABLE[c] - OPTIONAL.get(c, set())),'_meta'],'properties':{IDS[c]:S,**{k:props[k] for k in sorted(EDITABLE[c])},'_meta':{'type':'object','additionalProperties':{'$ref':'#/$defs/decision'}}},'additionalProperties':False}
defs['monster_variants']['properties']['drops']={'type':['array','null'],'items':{}}
props['drops']={'type':['array','null'],'items':{}}
op={'oneOf':[]}
for c in COLLECTIONS:
 patch={'type':'object','properties':{k:props[k] for k in EDITABLE[c]},'additionalProperties':False}
 op['oneOf'].append({'type':'object','required':['collection','id'],'properties':{'collection':{'const':c},'id':S,'action':{'enum':['upsert','delete']},'changes':patch,'states':{'type':'object','propertyNames':{'enum':sorted(EDITABLE[c])},'additionalProperties':{'enum':list(STATES)}}},'additionalProperties':False})
defs['operation']=op
defs['proposal_request']={'type':'object','required':['base_revision','reason','operations'],'properties':{'schema_version':{'const':1},'base_revision':{'type':'integer','minimum':0},'reason':{'type':'string','minLength':1,'maxLength':2000},'actor':{'enum':['user','Codex','ChatGPT']},'source':S,'operations':{'type':'array','minItems':1,'maxItems':2000,'items':{'$ref':'#/$defs/operation'}}},'additionalProperties':False}
schema={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'https://local.field-design/schema.json','title':'Field design repository contract','oneOf':[{'$ref':'#/$defs/project'},{'$ref':'#/$defs/proposal_request'}],'$defs':defs}
defs['project']={'type':'object','required':['schema_version','revision','updated_at',*COLLECTIONS,'design_history','proposals'],'properties':{'schema_version':{'const':1},'revision':{'type':'integer','minimum':0},'updated_at':{'type':'string','format':'date-time'},**{c:{'type':'object','additionalProperties':{'$ref':'#/$defs/'+c}} for c in COLLECTIONS},'design_history':{'type':'array','items':{'type':'object','required':['change_id','revision','field_ids','changes','reason','actor','approved_by','approval_state','timestamp']}},'proposals':{'type':'object','additionalProperties':{'type':'object','required':['proposal_id','base_revision','reason','actor','source','operations','diff','status','created_at','impact']}}},'additionalProperties':False}
# A map file can add both known catalogue nodes and new verified official layers.
defs['map_definition']={'type':'object','required':['map_id','region_id','name','kind','official_map_id','node_ids','level_guide'],'properties':{'map_id':S,'region_id':S,'name':S,'kind':{'enum':['main','high_level_branch','hidden_world','official_layer']},'official_map_id':{'type':['integer','null']},'node_ids':{'type':'array','items':S,'uniqueItems':True},'map_nodes':{'type':'array','items':{'type':'object','required':['id','source_id','map_id','kind','x','y','area_id','region'],'properties':{'id':S,'source_id':{'type':'integer'},'map_id':{'type':'integer'},'kind':{'enum':list(NODE_KINDS)},'x':{'type':'number'},'y':{'type':'number'},'area_id':{'type':'integer'},'region':S}}},'map_source':OBJ,'level_guide':OBJ,'layers':{'type':'array','items':S},'temporary':{'type':'boolean'},'membership_source':S,'membership_state':{'enum':list(STATES)},'exclude_from_normal':{'type':'array','items':S}},'additionalProperties':False}
# Exact per-operation MCP schemas (no arbitrary filesystem paths, no approval tool).
common={'base_revision':{'type':'integer','minimum':0},'reason':{'type':'string','minLength':1},'actor':{'enum':['user','Codex','ChatGPT']},'source':S}
def arg(p,req):return {'type':'object','properties':p,'required':req,'additionalProperties':False}
tools={
 'get_field':arg({'field_id':S},['field_id']),
 'list_fields':arg({'region_id':S,'query':S,'min_level':LV,'max_level':LV},[]),
 'compare_fields':arg({'field_ids':{'type':'array','items':S}},['field_ids']),
 'export_map':arg({'map_id':S,'format':{'enum':['json','markdown','csv','edges','runtime']}},['map_id']),
 'get_change_history':arg({'field_id':S},[]),
 'check_connections':arg({'start_field_id':S},[]),
}
for n,c,idkey in [('update_field','field_definitions','field_id'),('register_monster_family','monster_families','family_id'),('register_monster_variant','monster_variants','monster_id'),('update_monster_variant','monster_variants','monster_id')]:
 tools[n]=arg({**common,idkey:S,'changes':{'type':'object','properties':{k:props[k] for k in EDITABLE[c]},'additionalProperties':False}},['base_revision','reason','changes']+([idkey] if n.startswith('update') else []))
tools['add_enemy']=arg({**common,'spawn_id':S,**{k:props[k] for k in EDITABLE['field_spawns']}},['base_revision','reason','field_id','monster_id'])
tools['remove_enemy']=arg({**common,'spawn_id':S},['base_revision','reason','spawn_id'])
tools['set_enemy_level']=arg({**common,'spawn_id':S,'level':LV},['base_revision','reason','spawn_id','level'])
tools['set_elite']=arg({**common,'field_id':S,'name':S,'classification':{'enum':['elite','local_legend']}},['base_revision','reason','field_id','name'])
tools['connect_fields']=arg({**common,'edge_id':S,**{k:props[k] for k in EDITABLE['field_edges']}},['base_revision','reason','from_field','to_field'])
tools['delete_connection']=arg({**common,'edge_id':S},['base_revision','reason','edge_id'])
paths={}
for route,verb,summary in [('/api/health','get','Read server health'),('/api/project','get','Bulk repository snapshot'),('/api/fields','get','List fields by region_id or query'),('/api/fields/{field_id}','get','Get field with resolved enemies and connections'),('/api/history','get','Read item-level change history'),('/api/report','get','Check graph and regional level consistency'),('/api/export','get','Export map design, Markdown, CSV, graph or approved runtime JSON'),('/api/proposals','post','Validate and persist a proposal without applying it'),('/api/proposals/remove-connection','post','Remove a new connection from a pending proposal in the local editor'),('/api/compile','post','Compile supported Japanese commands or return candidate IDs'),('/api/rollback','post','Create a reviewed inverse proposal; reject conflicts'),('/api/operations','post','Common ChatGPT/MCP operation gateway'),('/api/approve','post','Local UI only; explicit user review; API token is rejected'),('/api/undo','post','Local UI Ctrl+Z/Ctrl+Y; inverse of an already reviewed transaction; keeps audit history'),('/api/validate-travel','post','Check travel conditions; discovery is required for fast travel only')]:
 spec={'summary':summary,'operationId':route.replace('/api/','').replace('/','_').replace('{','').replace('}',''),'responses':{'200':{'description':'Success'},'400':{'description':'Validation failed; no mutation'},'409':{'description':'Stale revision, protected decision or rollback conflict'}},'security':[{'bearerAuth':[]}]}
 spec['responses'].update({'401':{'description':'Invalid or missing API token'},'403':{'description':'Untrusted Host/Origin or local-only approval permission'}})
 if route=='/api/fields/{field_id}':spec['parameters']=[{'name':'field_id','in':'path','required':True,'schema':S}]
 if route=='/api/fields':spec['parameters']=[{'name':k,'in':'query','schema':S} for k in ['region_id','query']]
 if route=='/api/history':spec['parameters']=[{'name':'field_id','in':'query','schema':S}]
 if route=='/api/report':spec['parameters']=[{'name':'start','in':'query','schema':S}]
 if route=='/api/export':spec['parameters']=[{'name':'map_id','in':'query','required':True,'schema':S},{'name':'format','in':'query','schema':{'enum':['json','markdown','csv','edges','runtime']}}]
 body=None
 if route=='/api/proposals':body={'$ref':'#/components/schemas/ProposalRequest'};spec['responses']['201']={'description':'Proposal persisted'}
 if route=='/api/operations':body={'oneOf':[arg({'operation':{'const':n},'arguments':tools[n]},['operation','arguments']) for n in READ_TOOLS+WRITE_TOOLS]}
 if route=='/api/compile':body=arg({'text':S,'region_id':S,'selected_field_id':{'type':['string','null']},'target_field_id':{'type':['string','null']},'base_revision':{'type':'integer'}},['text','base_revision'])
 if route=='/api/rollback':body=arg({'change_id':S},['change_id'])
 if route=='/api/validate-travel':body=arg({'edge_id':S,'level':{'type':'integer','minimum':1,'maximum':200},'completed_quests':{'type':'array','items':S},'discovered_fields':{'type':'array','items':S},'temporary_conditions':{'type':'array','items':S},'fast_travel':{'type':'boolean'}},['edge_id','level'])
 if route=='/api/proposals/remove-connection':
  spec['security']=[{'localUI':[]}];body=arg({'proposal_id':S,'edge_id':S},['proposal_id','edge_id'])
 if route=='/api/undo':
  spec['security']=[{'localUI':[]}];body=arg({'change_id':S,'revision':{'type':'integer'}},['change_id','revision'])
 if route=='/api/approve':
  spec['security']=[{'localUI':[]}];body=arg({'proposal_id':S,'revision':{'type':'integer'},'overwrite_approved':{'type':'boolean'}},['proposal_id','revision'])
 if body:spec['requestBody']={'required':True,'content':{'application/json':{'schema':body}}}
 paths[route]={verb:spec}
# Resolve the shared schema refs into OpenAPI component names.
proposal=json.loads(json.dumps(defs['proposal_request']).replace('#/$defs/operation','#/components/schemas/Operation'))
openapi={'openapi':'3.1.0','info':{'title':'Teyvat Field Design API','version':'1.0.0','description':'Repository is canonical. Bearer/MCP agents may read and propose. Only the local editor review can approve. Not an official HoYoLAB API. Never directly writes game runtime.'},'servers':[{'url':'http://127.0.0.1:8770'}],'paths':paths,'components':{'securitySchemes':{'bearerAuth':{'type':'http','scheme':'bearer'},'localUI':{'type':'apiKey','in':'header','name':'X-Editor-UI','description':'Ephemeral local editor credential. Not distributed to AI integrations.'}},'schemas':{'ProposalRequest':proposal,'Operation':op}}}
P.mkdir(exist_ok=True)
for name,value in [('schema.json',schema),('tools.json',tools),('openapi.json',openapi)]: (P/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('JSON Schema, OpenAPI and',len(tools),'MCP tool schemas generated')
