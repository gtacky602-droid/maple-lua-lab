"""Private Streamable HTTP listener. Expose only /mcp through a trusted relay."""
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

from .chatgpt_tools import call_tool, tool_list
from .model import DesignError, now

TOKEN_HEADER = 'X-Field-MCP-Token'
PROTOCOLS = ('2025-11-25', '2025-06-18', '2025-03-26')
MAX_BODY = 128 * 1024
MAX_RESPONSE = 2 * 1024 * 1024
RATE = 120
PROPOSAL_RATE = 10
ACCEPT = 'application/json, text/event-stream'


def encode(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')


def rpc_error(code, message, mid=None):
    return {'jsonrpc': '2.0', 'id': mid, 'error': {'code': code, 'message': message}}


def result_message(mid, result):
    return {'jsonrpc': '2.0', 'id': mid, 'result': result}


def tool_result(result, error=False):
    return {'content': [{'type': 'text', 'text': encode(result).decode('utf-8')}],
            **({'isError': True} if error else {})}


class RemoteMCP(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, store, token, *, allow_proposals=False, tunnel_id=None):
        if not token or not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', token):
            raise ValueError('Set FIELD_EDITOR_MCP_TOKEN to a random URL-safe token (32–256 characters)')
        if tunnel_id and not re.fullmatch(r'tunnel_[A-Za-z0-9_-]{1,100}', tunnel_id):
            raise ValueError('Invalid tunnel ID')
        self.store = store
        self.token = token
        self.test_token = secrets.token_urlsafe(32)
        self.proposals = allow_proposals
        self.tunnel_id = tunnel_id
        self.enabled = True
        self.last_contact = None
        self.lock = threading.Lock()
        self.requests = deque()
        self.proposal_requests = deque()
        self.slots = threading.BoundedSemaphore(12)
        super().__init__(('127.0.0.1', port), RemoteHandler)

    @property
    def endpoint(self):
        return f'http://127.0.0.1:{self.server_port}/mcp'

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()

    def handle_error(self, request, address):
        # Do not dump request details or any credential into logs.
        pass

    def status(self):
        with self.lock:
            return {'enabled': self.enabled, 'endpoint': self.endpoint, 'tunnel_id': self.tunnel_id,
                    'allow_proposals': self.proposals, 'last_contact': self.last_contact,
                    'authentication': 'local_token_configured'}

    def stop_access(self):
        with self.lock:
            self.enabled = False

    def test_access(self):
        opener = build_opener(ProxyHandler({}))
        try:
            for method, params in (
                ('initialize', {'protocolVersion': PROTOCOLS[0], 'capabilities': {},
                                'clientInfo': {'name': 'field-editor-local-test', 'version': '1'}}),
                ('tools/call', {'name': 'get_revision'}),
            ):
                req = Request(self.endpoint, encode({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}),
                              headers={'Content-Type': 'application/json', 'Accept': ACCEPT,
                                       'MCP-Protocol-Version': PROTOCOLS[0], TOKEN_HEADER: self.token,
                                       'X-Field-MCP-Local-Test': self.test_token})
                with opener.open(req, timeout=5) as response:
                    result = json.load(response)['result']
                    if result.get('isError'):
                        return False
        except HTTPError as exc:
            exc.close()
            return False
        except (URLError, OSError, ValueError, KeyError):
            return False
        return True

    def admit(self, queue, limit):
        current = time.monotonic()
        while queue and current - queue[0] >= 60:
            queue.popleft()
        if len(queue) >= limit:
            return False
        queue.append(current)
        return True

    def dispatch(self, msg):
        mid, method, params = msg.get('id'), msg['method'], msg.get('params', {})
        if method == 'initialize':
            requested = params.get('protocolVersion')
            result = {
                'protocolVersion': requested if requested in PROTOCOLS else PROTOCOLS[0],
                'capabilities': {'tools': {}},
                'serverInfo': {'name': 'teyvat-field-design', 'version': '1.0.0'},
                'instructions': 'Read the field editor’s current revision and IDs before proposing changes. '
                                'Use map_id region-01-map to read all 51 Mondstadt map points. '
                                'Local approval is required to adopt a proposal. Null means unset.',
            }
        elif method == 'ping':
            result = {}
        elif method == 'tools/list':
            result = {'tools': tool_list(self.proposals)}
        elif method == 'tools/call':
            name = params.get('name')
            if not isinstance(name, str):
                return rpc_error(-32602, 'Tool name must be a string', mid)
            try:
                result = tool_result(call_tool(self.store, name, params.get('arguments', {}), self.proposals))
            except DesignError as exc:
                result = tool_result({'error': str(exc), **exc.details}, error=True)
            except (KeyError, ValueError, TypeError, OverflowError, RecursionError):
                result = tool_result({'error': 'Invalid tool arguments or project data'}, error=True)
        else:
            return rpc_error(-32601, 'Method not found', mid)
        return result_message(mid, result)


class RemoteHandler(BaseHTTPRequestHandler):
    server_version = 'FieldMCP/1'

    def setup(self):
        self.request.settimeout(8)
        super().setup()

    def log_message(self, fmt, *args):
        pass

    def respond(self, status, body=None, headers=None):
        payload = b'' if body is None else encode(body)
        if len(payload) > MAX_RESPONSE:
            payload = encode(result_message(body.get('id'), tool_result(
                {'error': 'Response too large. Narrow the filter or request a smaller page.'}, error=True)))
        self.send_response(status)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(payload)))
        if payload:
            self.send_header('Content-Type', 'application/json; charset=utf-8')
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    def error(self, status, message, *, code=-32600, headers=None):
        self.respond(status, rpc_error(code, message), headers)

    def check_request(self):
        server = self.server
        hosts = {f'127.0.0.1:{server.server_port}', f'localhost:{server.server_port}'}
        hosts_received = self.headers.get_all('Host', [])
        origins = self.headers.get_all('Origin', [])
        if (len(hosts_received) != 1 or hosts_received[0] not in hosts
                or len(origins) > 1 or (origins and origins[0] != 'http://' + hosts_received[0])
                or self.headers.get('Sec-Fetch-Site') in ('cross-site', 'same-site')):
            self.error(403, 'Untrusted Host or Origin')
            return False
        if self.path != '/mcp':
            self.error(404, 'Not found')
            return False
        credentials = self.headers.get_all(TOKEN_HEADER, [])
        if (len(credentials) != 1 or not credentials[0].isascii()
                or not secrets.compare_digest(credentials[0], server.token)):
            self.error(401, 'MCP relay authentication required')
            return False
        return True

    def do_GET(self):
        if self.check_request():
            self.error(405, 'Use POST for this stateless MCP endpoint', headers={'Allow': 'POST'})

    do_DELETE = do_GET
    do_OPTIONS = do_GET
    do_PUT = do_GET
    do_PATCH = do_GET
    do_HEAD = do_GET

    def do_POST(self):
        if not self.check_request():
            return
        server = self.server
        test_token = self.headers.get('X-Field-MCP-Local-Test', '')
        local_test = test_token.isascii() and secrets.compare_digest(test_token, server.test_token)
        with server.lock:
            enabled = server.enabled
            admitted = local_test or server.admit(server.requests, RATE)
        if not enabled:
            return self.error(503, 'MCP access has been stopped')
        if not admitted:
            return self.error(429, 'MCP request limit reached', headers={'Retry-After': '60'})
        protocol = self.headers.get('MCP-Protocol-Version', '2025-03-26')
        if protocol not in PROTOCOLS:
            return self.error(400, 'Unsupported MCP protocol version')
        accept = {media.split(';', 1)[0].strip().lower()
                  for media in self.headers.get('Accept', '').split(',')}
        if not {'application/json', 'text/event-stream'} <= accept:
            return self.error(406, 'Accept must include application/json and text/event-stream')
        if self.headers.get_content_type() != 'application/json':
            return self.error(415, 'Content-Type must be application/json')
        lengths = self.headers.get_all('Content-Length', [])
        if self.headers.get_all('Transfer-Encoding') or len(lengths) != 1 or not re.fullmatch(r'[0-9]{1,10}', lengths[0]):
            return self.error(400, 'A single valid Content-Length is required')
        length = int(lengths[0])
        if not 0 < length <= MAX_BODY:
            return self.error(413, 'Request exceeds MCP body limit')
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                return self.error(400, 'Incomplete request body')
            msg = json.loads(raw.decode('utf-8'), parse_constant=reject_constant)
        except (ValueError, RecursionError):
            return self.error(400, 'Invalid JSON', code=-32700)
        except TimeoutError:
            return self.error(408, 'Request timed out')
        if (not isinstance(msg, dict) or msg.get('jsonrpc') != '2.0'
                or not isinstance(msg.get('method'), str) or not isinstance(msg.get('params', {}), dict)
                or ('id' in msg and type(msg['id']) not in (int, str))):
            return self.error(400, 'Invalid JSON-RPC request')
        params = msg.get('params', {})
        if local_test and not (msg['method'] == 'initialize' or
                               (msg['method'] == 'tools/call' and params.get('name') == 'get_revision')):
            return self.error(400, 'Invalid local test request')

        status, value, headers = 200, None, None
        # Serialize dispatch with stop_access. A completed stop closes the gate to queued requests.
        with server.lock:
            if not server.enabled:
                status, value = 503, rpc_error(-32600, 'MCP access has been stopped')
            elif 'id' not in msg:
                if msg['method'].startswith('notifications/'):
                    status = 202
                else:
                    status, value = 400, rpc_error(-32600, 'Invalid JSON-RPC notification')
            elif (server.proposals and msg['method'] == 'tools/call'
                  and params.get('name') == 'create_proposal'
                  and not server.admit(server.proposal_requests, PROPOSAL_RATE)):
                status, value, headers = 429, rpc_error(-32600, 'Proposal request limit reached'), {'Retry-After': '60'}
            else:
                try:
                    value = server.dispatch(msg)
                except Exception:
                    value = rpc_error(-32603, 'MCP operation failed', msg['id'])
                if not local_test and 'result' in value:
                    server.last_contact = now()
        self.respond(status, value, headers)


def reject_constant(_value):
    raise ValueError('Non-finite JSON number')
