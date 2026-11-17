"""Meaningful acceptance/regression tests; no game catalog or production save is written."""
import contextlib
from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import shutil
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from .model import Store, DesignError, ROOT, can_travel
from .commands import compile_japanese, operation, connection, spawn
from .server import EditorServer
from .mcp import handle


class ModelTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)/'project.json'
        self.s = Store(self.path)
        self.a, self.b, self.c = 'teyvat:3', 'teyvat:7', 'teyvat:8'

    def propose(self, ops, **kwargs):
        return self.s.propose({'base_revision': self.s.data['revision'], 'reason': 'acceptance test', 'actor': 'ChatGPT', 'operations': ops, **kwargs})

    def apply(self, ops):
        p = self.propose(ops)
        return self.s.approve(p['proposal_id'], self.s.data['revision'], True)

    def monster(self, mid='mond-hilichurl', lv=5):
        v={'family_id':'hilichurl','region_id':'region-01','name':'ヒルチャール','base_level':lv,'hp':None,'attack':None,'defense':None,'exp':None,'drops':[],'behavior':None,'sprite':None,'animation':None,'element':None,'classification':'normal'}
        self.apply([{'collection':'monster_variants','id':mid,'changes':v}])
        return mid

    def test_official_51_coordinates_immutable_and_zero_edges(self):
        m=next(m for m in self.s.maps if m['map_id']=='region-01-map')
        ns=[self.s.nodes[i] for i in m['node_ids']]
        self.assertEqual(51,len(ns));self.assertEqual(45,sum(n['kind']=='waypoint' for n in ns));self.assertEqual(6,sum(n['kind']=='statue' for n in ns))
        self.assertFalse(self.s.data['field_edges'])
        catalog={n['id']:n for n in json.loads((ROOT/'content/map-catalog.json').read_text())['nodes']}
        self.assertEqual(catalog,self.s.nodes)
        with self.assertRaises(DesignError):self.propose([{'collection':'map_nodes','id':self.a,'changes':{'x':0}}])
        with self.assertRaises(DesignError):self.propose([{'collection':'field_definitions','id':self.a,'changes':{'x':0}}])

    def test_region_level_guides_not_individual_enemy_assignments(self):
        maps={m['region_id']:m for m in self.s.maps}
        self.assertEqual((1,20),(maps['region-01']['level_guide']['enemy_min'],maps['region-01']['level_guide']['enemy_max']))
        self.assertEqual((35,40,55,60),tuple(maps['branch-01']['level_guide'][k] for k in ('recommended','enemy_min','enemy_max','deepest')))
        self.assertEqual((150,155,170,175),tuple(maps['branch-06']['level_guide'][k] for k in ('recommended','enemy_min','enemy_max','deepest')))
        self.assertIsNone(self.s.data['field_definitions'][self.a]['recommended_level'])
        self.assertFalse(self.s.data['field_spawns'])

    def test_proposals_do_not_apply_or_escalate_approval(self):
        p=self.propose([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':8},'states':{'recommended_level':'verified'}}])
        self.assertIsNone(self.s.data['field_definitions'][self.a]['recommended_level'])
        self.assertEqual('proposed',p['diff'][0]['after_decision']['state'])
        self.assertIsNone(Store(self.path).data['field_definitions'][self.a]['recommended_level'])
        with self.assertRaises(DesignError):self.s.approve(p['proposal_id'],0)
        self.assertEqual(0,self.s.data['revision'])

    def test_approval_history_and_reopen(self):
        self.apply([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':8,'notes':'test reason'}}])
        s=Store(self.path);self.assertEqual(8,s.field(self.a)['recommended_level']);self.assertEqual(1,s.data['revision'])
        h=s.data['design_history'][0];self.assertEqual([self.a],h['field_ids']);self.assertEqual('ChatGPT',h['actor']);self.assertEqual('user',h['approved_by']);self.assertTrue(h['timestamp']);self.assertIsNone(next(x for x in h['changes'] if x['item']=='recommended_level')['before'])

    def test_stale_proposal_and_protected_approved_values(self):
        self.apply([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':8}}])
        p=self.propose([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':9}}])
        with self.assertRaises(DesignError):self.s.approve(p['proposal_id'],1)
        self.assertEqual(8,self.s.field(self.a)['recommended_level'])
        other=self.propose([{'collection':'field_definitions','id':self.b,'changes':{'recommended_level':10}}]);self.s.approve(other['proposal_id'],1)
        with self.assertRaises(DesignError):self.s.approve(p['proposal_id'],2,True)

    def test_editing_record_preserves_unchanged_item_provenance(self):
        self.apply([{'collection':'field_edges','id':'ab','changes':connection(self.a,self.b)}]);old=deepcopy(self.s.data['field_edges']['ab']['_meta']['direction'])
        updated=connection(self.a,self.b,notes='Only this note changed')
        p=self.propose([{'collection':'field_edges','id':'ab','changes':updated}])
        self.assertEqual(['notes'],[x['item'] for x in p['diff']]);self.s.approve(p['proposal_id'],1,True)
        self.assertEqual(old,self.s.data['field_edges']['ab']['_meta']['direction'])

    def test_no_nonfinite_invalid_levels_or_wrong_enemy_overrides(self):
        for value in (0,201,True,1.5,float('nan')):
            with self.subTest(value=value),self.assertRaises(DesignError):self.propose([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':value}}])
        mid=self.monster()
        with self.assertRaises(DesignError):self.propose([{'collection':'field_spawns','id':'bad','changes':spawn(self.a,mid,level_override=8)}])

    def test_connection_direction_conditions_endpoints_persist(self):
        self.apply([{'collection':'field_edges','id':'edge-test','changes':connection(self.a,self.b,direction='one_way',kind='level',conditions={'requires_discovery':True,'min_level':8})}])
        e=Store(self.path).data['field_edges']['edge-test'];self.assertEqual('one_way',e['direction']);self.assertEqual(8,e['conditions']['min_level'])
        for edge in [connection(self.a,'missing'),connection(self.a,self.b,conditions={}),connection(self.a,self.b,kind='quest')]:
            with self.assertRaises(DesignError):self.propose([{'collection':'field_edges','id':'bad','changes':edge}])
        self.assertFalse(can_travel(e,20,[],[],[],fast_travel=True));self.assertFalse(can_travel(e,7,[],[self.b],[]));self.assertTrue(can_travel(e,8,[],[self.b],[]));self.assertTrue(can_travel(e,8,[],[],[],fast_travel=False))

    def test_variant_reference_bulk_impact_and_special_preservation(self):
        mid=self.monster()
        self.apply([{'collection':'field_spawns','id':'normal','changes':spawn(self.a,mid,10)},{'collection':'field_spawns','id':'special','changes':spawn(self.b,mid,2,level_override=9,special=True)}])
        p=self.propose([{'collection':'monster_variants','id':mid,'changes':{'base_level':6}}])
        self.assertEqual([self.a],p['impact']['affected_fields']);self.assertEqual([self.b],p['impact']['preserved_override_fields'])
        self.assertEqual(5,self.s.field(self.a)['spawns'][0]['effective_level'])
        self.s.approve(p['proposal_id'],self.s.data['revision'],True)
        self.assertEqual(6,self.s.field(self.a)['spawns'][0]['effective_level']);self.assertEqual(9,self.s.field(self.b)['spawns'][0]['effective_level'])
        runtime=self.s.export('region-01-map','runtime');self.assertIn('normal',runtime['field_spawns']);self.assertEqual('normal',runtime['field_spawns']['normal']['spawn_id'])

    def test_family_inheritance_only_approved_properties_export(self):
        self.apply([{'collection':'monster_families','id':'hilichurl','changes':{'defaults':{'base_level':4,'hp':100}}}])
        mid=self.monster(lv=None)
        self.apply([{'collection':'field_spawns','id':'a','changes':spawn(self.a,mid)}])
        self.assertEqual(4,self.s.field(self.a)['spawns'][0]['effective_level'])
        self.assertEqual(100,self.s.export('region-01-map','runtime')['monster_variants'][mid]['hp'])
        self.propose([{'collection':'monster_families','id':'hilichurl','changes':{'defaults':{'base_level':99,'hp':9999}}}])
        self.assertEqual(100,self.s.export('region-01-map','runtime')['monster_variants'][mid]['hp'])

    def test_stat_changes_include_special_spawns_in_impact(self):
        mid=self.monster()
        self.apply([{'collection':'field_spawns','id':'normal','changes':spawn(self.a,mid)},{'collection':'field_spawns','id':'special','changes':spawn(self.b,mid,special=True,level_override=9)}])
        p=self.propose([{'collection':'monster_variants','id':mid,'changes':{'hp':200}}])
        self.assertEqual(2,p['impact']['affected_count']);self.assertEqual(2,len(p['impact']['spawn_changes']))
        self.assertEqual(9,next(x for x in p['impact']['spawn_changes'] if x['spawn_id']=='special')['after']['level'])

    def test_all_world_runtime_retains_cross_region_edge(self):
        other=next(i for i,f in self.s.data['field_definitions'].items() if f['region_id']=='region-02')
        self.apply([{'collection':'field_edges','id':'cross-region','changes':connection(self.a,other)}])
        self.assertNotIn('cross-region',self.s.export('region-01-map','runtime')['field_edges'])
        self.assertIn('cross-region',self.s.export('all','runtime')['field_edges'])

    def test_json_only_map_addition_adds_verified_nodes_without_code_changes(self):
        root=Path(self.tmp.name)/'repository';(root/'content').mkdir(parents=True);(root/'design/field-editor').mkdir(parents=True)
        for name in ('map-catalog.json','enemy-art-status.json'):shutil.copy2(ROOT/'content'/name,root/'content'/name)
        shutil.copytree(ROOT/'design/field-editor/maps',root/'design/field-editor/maps');shutil.copy2(ROOT/'design/field-editor/map-sources.json',root/'design/field-editor/map-sources.json')
        m={'map_id':'future-map','region_id':'future-region','name':'Future verified map','kind':'official_layer','official_map_id':99,'node_ids':['map99:12345'],'map_nodes':[{'id':'map99:12345','source_id':12345,'map_id':99,'kind':'waypoint','x':100,'y':200,'area_id':99,'region':'Future verified region'}],'level_guide':{'recommended':None,'enemy_min':None,'enemy_max':None,'deepest':None,'state':'unassigned','source':'test fixture'}}
        (root/'design/field-editor/maps/future.json').write_text(json.dumps(m));s=Store(root=root)
        self.assertIn('map99:12345',s.nodes);self.assertEqual('future-region',s.field('map99:12345')['region_id']);self.assertEqual(25,len(s.maps))

    def test_runtime_excludes_all_proposed_values_and_unapproved_edges(self):
        mid=self.monster()
        self.propose([{'collection':'field_spawns','id':'unapproved','changes':spawn(self.a,mid)},{'collection':'field_edges','id':'unapproved-edge','changes':connection(self.a,self.b)},{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':20}}])
        r=self.s.export('region-01-map','runtime');self.assertFalse(r['field_spawns']);self.assertFalse(r['field_edges']);self.assertNotIn('recommended_level',r['field_definitions'][self.a])

    def test_graph_layout_never_modifies_official_positions(self):
        before=deepcopy(self.s.nodes[self.a]);self.apply([{'collection':'graph_layouts','id':'layout-a','changes':{'view_id':'region-01-map','field_id':self.a,'x':500,'y':300}}])
        self.assertEqual(before,self.s.nodes[self.a]);self.assertEqual(500,Store(self.path).data['graph_layouts']['layout-a']['x'])

    def test_graph_reports_cycles_branches_returnability_and_exceptions(self):
        self.apply([{'collection':'field_edges','id':'ab','changes':connection(self.a,self.b,direction='one_way')},{'collection':'field_edges','id':'bc','changes':connection(self.b,self.c,direction='one_way')}])
        r=self.s.report(self.a);self.assertTrue(any(x['code']=='no_return' and x['target_id']==self.b for x in r['issues']))
        self.apply([{'collection':'field_edges','id':'ca','changes':connection(self.c,self.a,direction='one_way')}])
        self.assertFalse(any(x['code']=='no_return' and x['target_id'] in [self.a,self.b,self.c] for x in self.s.report(self.a)['issues']))
        self.apply([{'collection':'graph_exceptions','id':'exception','changes':{'code':'unreachable','target_id':'teyvat:9','reason':'Intentional secret room'}}])
        self.assertTrue(next(x for x in self.s.report(self.a)['issues'] if x['code']=='unreachable' and x['target_id']=='teyvat:9')['exception'])

    def test_rollback_creates_inverse_and_detects_later_conflicts(self):
        self.apply([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':8}}]);h=self.apply([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':9}}])
        p=self.s.rollback_proposal(h['change_id']);self.assertEqual(9,self.s.field(self.a)['recommended_level']);self.s.approve(p['proposal_id'],2,True);self.assertEqual(8,self.s.field(self.a)['recommended_level'])
        with self.assertRaises(DesignError):self.s.rollback_proposal(h['change_id'])

    def test_rollback_deleted_edge_and_redo(self):
        self.apply([{'collection':'field_edges','id':'ab','changes':connection(self.a,self.b)}])
        h=self.apply([{'collection':'field_edges','id':'ab','action':'delete'}]);p=self.s.rollback_proposal(h['change_id']);self.s.approve(p['proposal_id'],2,True);self.assertIn('ab',self.s.data['field_edges'])
        h=self.s.data['design_history'][-1];p=self.s.rollback_proposal(h['change_id']);self.s.approve(p['proposal_id'],3,True);self.assertNotIn('ab',self.s.data['field_edges'])

    def test_japanese_ambiguity_returns_coordinates_and_never_guesses(self):
        self.apply([{'collection':'field_definitions','id':i,'changes':{'location_alias':'望風山地'}} for i in [self.a,self.b]])
        r=compile_japanese(self.s,'モンドの望風山地にLv8の風スライムを10体配置する','region-01');self.assertEqual('needs_confirmation',r['status']);self.assertEqual(2,len(r['candidates']));self.assertIn('map_node',r['candidates'][0]);self.assertFalse(self.s.data['field_spawns'])
        self.assertEqual('ready',compile_japanese(self.s,'teyvat:3の推奨Lvを8にする')['status'])
        self.assertEqual('needs_monster',compile_japanese(self.s,'teyvat:3にLv8の風スライムを10体配置')['status'])

    def test_lifecycle_not_automatic(self):
        self.apply([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':8}}])
        self.apply([{'collection':'field_definitions','id':self.a,'states':{'recommended_level':'implemented'}}])
        self.assertEqual('implemented',self.s.field(self.a)['_meta']['recommended_level']['state'])
        self.apply([{'collection':'field_definitions','id':self.a,'states':{'recommended_level':'verified'}}])
        self.assertEqual('verified',self.s.field(self.a)['_meta']['recommended_level']['state'])

    def test_undo_unassigned_state_is_restored(self):
        h=self.apply([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':8}}]);p=self.s.rollback_proposal(h['change_id']);self.s.approve(p['proposal_id'],1,True)
        self.assertEqual('unassigned',self.s.field(self.a)['_meta']['recommended_level']['state']);self.assertNotIn('recommended_level',self.s.export('all','runtime')['field_definitions'][self.a])

    def test_external_edits_reloaded_and_two_processes_cannot_overwrite(self):
        self.s.persist(self.s.data);other=Store(self.path)
        self.apply([{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':8}}])
        with self.assertRaises(DesignError):other.propose({'base_revision':0,'reason':'stale external','operations':[{'collection':'field_definitions','id':self.a,'changes':{'recommended_level':9}}]})
        self.assertEqual(8,other.snapshot()['field_definitions'][self.a]['recommended_level'])

    def test_csv_markdown_json_and_api_operation(self):
        self.apply([{'collection':'field_definitions','id':self.a,'changes':{'name':'=SUM(A1)','recommended_level':8}}])
        self.assertIn("'=SUM(A1)",self.s.export('region-01-map','csv'));self.assertIn('rev',self.s.export('region-01-map','markdown'));self.assertEqual(51,len(self.s.export('region-01-map')['field_definitions']))
        result=operation(self.s,'get_field',{'field_id':self.a});self.assertEqual(8,result['recommended_level'])
        result=operation(self.s,'update_field',{'base_revision':1,'reason':'external tool','field_id':self.a,'changes':{'recommended_level':9}});self.assertEqual('proposed',result['status']);self.assertEqual(8,self.s.field(self.a)['recommended_level'])

    def test_published_json_schema_matches_data_and_rejects_unknown_fields(self):
        try:import jsonschema
        except ImportError:self.skipTest('Optional jsonschema package not installed')
        schema=json.loads((ROOT/'tools/field_editor/schemas/schema.json').read_text());jsonschema.validate(self.s.snapshot(),schema)
        bad=self.s.snapshot();bad['field_definitions'][self.a]['official_x']=0
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(bad,schema)
        for m in self.s.maps:jsonschema.Draft202012Validator({'$ref':'#/$defs/map_definition','$defs':schema['$defs']}).validate(m)


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.store=Store(Path(cls.tmp.name)/'project.json');cls.server=EditorServer(('127.0.0.1',0),cls.store,'test-proposal-token');cls.url='http://127.0.0.1:'+str(cls.server.server_port);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.tmp.cleanup()
    def req(self,path,body=None,headers=None):
        h={'Content-Type':'application/json',**(headers or {})};request=Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
        try:
            with urlopen(request,timeout=20) as r:return r.status,json.load(r)
        except HTTPError as e:return e.code,json.load(e)
    def test_auth_origin_approval_and_static_whitelist(self):
        self.assertEqual(401,self.req('/api/project')[0])
        self.assertEqual(200,self.req('/api/health')[0])
        self.assertEqual(403,self.req('/api/bootstrap')[0])
        status,boot=self.req('/api/bootstrap',headers={'Sec-Fetch-Site':'same-origin'});self.assertEqual(200,status);self.assertIn('ui_token',boot)
        status,data=self.req('/api/operations',{'operation':'get_field','arguments':{'field_id':'teyvat:3'}},{'Authorization':'Bearer test-proposal-token'});self.assertEqual(200,status);self.assertNotIn('ui_token',data)
        status,_=self.req('/api/approve',{'proposal_id':'none','revision':0},{'Authorization':'Bearer test-proposal-token','X-Editor-UI':self.server.ui_token});self.assertEqual(403,status)
        status,_=self.req('/api/operations',{'operation':'get_field','arguments':{'field_id':'teyvat:3'}},{'Authorization':'Bearer test-proposal-token','Origin':'https://evil.example'});self.assertEqual(403,status)
        self.assertEqual(404,self.req('/.env')[0]);self.assertEqual(404,self.req('/content/enemy-spawns.json')[0])
    def test_common_api_proposal_approval_reopen(self):
        headers={'Authorization':'Bearer test-proposal-token'}
        st,p=self.req('/api/operations',{'operation':'connect_fields','arguments':{'base_revision':self.store.data['revision'],'reason':'HTTP drag equivalent','from_field':'teyvat:3','to_field':'teyvat:7'}},headers);self.assertEqual(200,st);self.assertFalse(self.store.data['field_edges'])
        st,h=self.req('/api/approve',{'proposal_id':p['proposal_id'],'revision':self.store.data['revision']},{'X-Editor-UI':self.server.ui_token,'Origin':self.url});self.assertEqual(200,st);self.assertTrue(Store(self.store.path).data['field_edges'])
    def test_mcp_tools_share_operation_contract(self):
        r=handle({'jsonrpc':'2.0','id':1,'method':'initialize','params':{}});self.assertEqual('2024-11-05',r['result']['protocolVersion'])
        r=handle({'jsonrpc':'2.0','id':2,'method':'tools/list'});names=[x['name'] for x in r['result']['tools']];self.assertIn('connect_fields',names);self.assertNotIn('approve',names);self.assertEqual(16,len(names))
        with patch.dict(os.environ,{'FIELD_EDITOR_TOKEN':'test-proposal-token','FIELD_EDITOR_URL':self.url}):
            r=handle({'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'get_field','arguments':{'field_id':'teyvat:3'}}});self.assertNotIn('error',r);self.assertEqual('teyvat:3',json.loads(r['result']['content'][0]['text'])['field_id'])
            before=self.store.snapshot()['revision']
            r=handle({'jsonrpc':'2.0','id':4,'method':'tools/call','params':{'name':'update_field','arguments':{'base_revision':before,'reason':'MCP round trip','field_id':'teyvat:3','changes':{'recommended_level':8}}}});self.assertEqual('proposed',json.loads(r['result']['content'][0]['text'])['status']);self.assertEqual(before,self.store.snapshot()['revision'])


if __name__=='__main__':unittest.main(verbosity=2)
