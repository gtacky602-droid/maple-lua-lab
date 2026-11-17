"""HTTP MCP acceptance tests using a disposable copy of the actual project."""
import io
import json
from pathlib import Path
import secrets
import shutil
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .commands import connection, spawn
from .model import ROOT, Store
from .remote_mcp import ACCEPT, PROTOCOLS, TOKEN_HEADER, RemoteMCP
from .server import EditorServer
from .start_chatgpt import wait_for_tunnel


class ChatGPTLauncherTests(unittest.TestCase):
    def test_local_readiness_is_not_successful_openai_polling(self):
        tunnel = Mock()
        tunnel.poll.return_value = None
        health_url = 'http://127.0.0.1:8772/health?details=true'

        def snapshot(status, **details):
            return io.StringIO(json.dumps({'ready': True, 'components': {
                'control-plane': {'status': status, 'details': details}
            }}))

        with patch('tools.field_editor.start_chatgpt.build_opener') as opener, \
                patch('tools.field_editor.start_chatgpt.time.sleep'):
            probes = opener.return_value.open
            probes.side_effect = [
                snapshot('unknown'),
                snapshot('ok', last_success='2026-11-17T10:00:00Z'),
            ]
            wait_for_tunnel(tunnel, health_url)
            self.assertEqual(2, probes.call_count)
            for status in (401, 403):
                with self.subTest(status=status):
                    probes.side_effect = [snapshot('degraded', http_status=status)]
                    with self.assertRaisesRegex(SystemExit, str(status)):
                        wait_for_tunnel(tunnel, health_url)


class ChatGPTMCPTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        project = Path(temp.name) / 'project.json'
        shutil.copyfile(ROOT / 'design/field-editor/project.json', project)
        self.store = Store(project)
        self.token = secrets.token_urlsafe(32)
        self.remote = self.start(RemoteMCP(0, self.store, self.token))
        self.editor = self.start(EditorServer(('127.0.0.1', 0), self.store, 'local-api-fixture',
                                              remote_mcp=self.remote))
        self.editor_url = f'http://127.0.0.1:{self.editor.server_port}'

    def start(self, server):
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server

    def request(self, url, *, body=None, headers=None, method=None):
        req = Request(url, body, headers or {}, method=method)
        try:
            with urlopen(req, timeout=8) as response:
                return response.status, response.read()
        except HTTPError as error:
            with error:
                return error.code, error.read()

    def rpc(self, method, params=None, *, headers=None, id=1, body=None):
        payload = {'jsonrpc': '2.0', 'method': method, 'params': params or {}}
        if id is not None:
            payload['id'] = id
        return self.request(self.remote.endpoint, body=body or json.dumps(payload).encode(), headers={
            'Content-Type': 'application/json', 'Accept': ACCEPT, TOKEN_HEADER: self.token, **(headers or {}),
        })

    def tool(self, name, arguments=None):
        status, payload = self.rpc('tools/call', {'name': name, 'arguments': arguments or {}})
        self.assertEqual(200, status)
        result = json.loads(payload)['result']
        return result.get('isError', False), json.loads(result['content'][0]['text'])

    def control(self, action, body=None, headers=None):
        return self.request(self.editor_url + '/api/chatgpt/' + action, body=body,
                            headers={'Content-Type': 'application/json', **(headers or {})})

    def test_read_tools_mondstadt_and_lifecycle(self):
        status, payload = self.rpc('initialize', {'protocolVersion': PROTOCOLS[0]})
        self.assertEqual(200, status)
        self.assertEqual(PROTOCOLS[0], json.loads(payload)['result']['protocolVersion'])
        self.assertEqual((202, b''), self.rpc('notifications/initialized', id=None))
        listed = json.loads(self.rpc('tools/list')[1])['result']['tools']
        self.assertTrue(all(t['annotations']['readOnlyHint'] for t in listed))
        self.assertEqual(8, len(listed))
        self.assertTrue(self.tool('create_proposal')[0])
        rev = self.store.snapshot()['revision']
        self.assertEqual(rev, self.tool('get_revision')[1]['revision'])
        regions = self.tool('list_regions')[1]['regions']
        mond = next(m for m in regions if m['map_id'] == 'region-01-map')
        self.assertEqual(51, mond['field_count'])
        _, data = self.tool('list_fields', {'map_id': mond['map_id']})
        self.assertEqual((51, 51, rev), (data['total'], len(data['items']), data['revision']))
        first = self.tool('list_fields', {'map_id': mond['map_id'], 'limit': 50})[1]
        self.assertEqual(50, first['next_offset'])
        self.assertEqual(1, len(self.tool('list_fields', {'map_id': mond['map_id'], 'offset': 50})[1]['items']))
        field = self.tool('get_field', {'field_id': 'teyvat:3'})[1]['field']
        self.assertEqual((373.5, 145.5), (field['map_node']['x'], field['map_node']['y']))
        self.assertEqual(field['spawns'], self.store.field('teyvat:3')['spawns'])
        graph = self.tool('get_connection_graph', {'map_id': mond['map_id']})[1]
        self.assertTrue({f['field_id'] for f in data['items']} <= set(graph['node_ids']))
        monsters = self.tool('list_monsters', {'region_id': 'region-01'})[1]
        self.assertGreater(len(monsters['families']), 0)
        self.assertEqual(rev, self.tool('get_change_history')[1]['revision'])
        self.assertEqual(rev, self.tool('check_design', {'map_id': mond['map_id']})[1]['revision'])

    def test_proposal_is_pending_then_local_approval_advances_revision(self):
        self.remote.proposals = True
        listing = json.loads(self.rpc('tools/list')[1])['result']['tools']
        self.assertEqual(['create_proposal'], [t['name'] for t in listing if not t['annotations']['readOnlyHint']])
        revision = self.store.snapshot()['revision']
        args = {
            'base_revision': revision, 'reason': 'QA placement proposal', 'operations': [
                {'collection': 'field_definitions', 'id': 'teyvat:3',
                 'changes': {'recommended_level': 8, 'enemy_level_min': 2, 'enemy_level_max': 4}},
                {'collection': 'field_edges', 'id': 'qa-chatgpt-edge',
                 'changes': connection('teyvat:3', 'teyvat:7')},
                {'collection': 'monster_variants', 'id': 'qa-chatgpt-variant',
                 'changes': {'family_id': 'hilichurl', 'region_id': 'region-01', 'name': 'QA Variant',
                             'base_level': 6, 'classification': 'normal',
                             **dict.fromkeys(('hp', 'attack', 'defense', 'exp', 'drops', 'behavior',
                                              'sprite', 'animation', 'element'))}},
                {'collection': 'field_spawns', 'id': 'qa-chatgpt-spawn',
                 'changes': spawn('teyvat:3', 'qa-chatgpt-variant')},
            ],
        }
        error, proposal = self.tool('create_proposal', args)
        self.assertFalse(error, proposal)
        self.assertEqual('proposed', proposal['status'])
        self.assertEqual(proposal, self.tool('create_proposal', args)[1])
        self.assertEqual(revision, self.tool('get_revision')[1]['revision'])
        self.assertNotIn('qa-chatgpt-variant', self.store.snapshot()['monster_variants'])
        approval = json.dumps({'proposal_id': proposal['proposal_id'], 'revision': revision,
                               'overwrite_approved': True}).encode()
        self.assertEqual(403, self.request(
            self.editor_url + '/api/approve', body=approval,
            headers={'Authorization': 'Bearer local-api-fixture', 'Content-Type': 'application/json'},
        )[0])
        self.assertEqual(200, self.request(
            self.editor_url + '/api/approve', body=approval,
            headers={'X-Editor-UI': self.editor.ui_token, 'Content-Type': 'application/json'},
        )[0])
        self.assertEqual(revision + 1, self.tool('get_revision')[1]['revision'])
        graph = self.tool('get_connection_graph', {'map_id': 'region-01-map'})[1]
        self.assertIn('qa-chatgpt-edge', {e['edge_id'] for e in graph['items']})
        monsters = self.tool('list_monsters', {'region_id': 'region-01', 'family_id': 'hilichurl'})[1]
        self.assertIn('qa-chatgpt-variant', {v['variant']['monster_id'] for v in monsters['items']})
        spawns = self.tool('get_field', {'field_id': 'teyvat:3'})[1]['field']['spawns']
        self.assertEqual(6, next(s for s in spawns if s['spawn_id'] == 'qa-chatgpt-spawn')['effective_level'])
        issues = self.tool('check_design', {'map_id': 'region-01-map'})[1]['issue_counts']
        self.assertIn('outside_field_enemy_level_range', issues)
        history = self.tool('get_change_history', {'field_id': 'teyvat:3'})[1]['items']
        self.assertEqual(revision + 1, history[0]['revision'])
        rejected, error = self.tool('create_proposal', args)
        self.assertTrue(rejected)
        self.assertEqual(revision + 1, error['current_revision'])
        self.assertTrue(self.tool('approve')[0])
        self.assertTrue(self.tool('undo')[0])
        self.assertTrue(self.tool('redo')[0])

    def test_auth_isolation_request_limits_and_stop(self):
        ui = {'X-Editor-UI': self.editor.ui_token}
        self.assertEqual(403, self.control('session')[0])
        self.assertEqual(403, self.control('status', headers={'Authorization': 'Bearer local-api-fixture'})[0])
        self.assertEqual(401, self.rpc('ping', headers={TOKEN_HEADER: 'wrong'})[0])
        self.assertEqual(403, self.rpc('ping', headers={'Origin': 'https://untrusted.example'})[0])
        self.assertEqual(403, self.rpc('ping', headers={'Host': 'untrusted.example'})[0])
        self.assertEqual(404, self.request(self.remote.endpoint[:-3] + 'api/approve',
                                          body=b'{}', headers={TOKEN_HEADER: self.token})[0])
        self.assertEqual(405, self.request(self.remote.endpoint, headers={TOKEN_HEADER: self.token})[0])
        self.assertEqual(400, self.rpc('ping', headers={'MCP-Protocol-Version': 'unknown'})[0])
        self.assertEqual(406, self.rpc('ping', headers={'Accept': 'text/plain'})[0])
        self.assertEqual(413, self.rpc('ping', body=b' ' * (128 * 1024 + 1))[0])
        self.assertEqual(400, self.rpc('ping', body=b'[]')[0])
        test = json.loads(self.control('test', body=b'{}', headers=ui)[1])
        self.assertTrue(test['ok'])
        self.assertIsNone(test['last_contact'])
        self.assertNotIn(self.token, json.dumps(test))
        self.assertEqual(200, self.rpc('ping')[0])
        self.assertIsNotNone(json.loads(self.control('status', headers=ui)[1])['last_contact'])
        with self.remote.lock:
            self.remote.requests.extend([float('inf')] * 120)
        self.assertEqual(429, self.rpc('ping')[0])
        self.assertEqual(403, self.control('stop', body=b'{}')[0])
        self.assertFalse(json.loads(self.control('stop', body=b'{}', headers=ui)[1])['enabled'])
        self.assertEqual(503, self.rpc('ping')[0])
        self.assertFalse(json.loads(self.control('test', body=b'{}', headers=ui)[1])['ok'])


if __name__ == '__main__':
    unittest.main()
