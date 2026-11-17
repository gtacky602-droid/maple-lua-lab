"""Independent HTTP editor. Start with python -m tools.field_editor.server."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import math
import os
import secrets
import threading
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from .model import ROOT, Store, DesignError, require
from .commands import operation, compile_japanese
from .remote_mcp import RemoteMCP

WEB = Path(__file__).parent / 'web'
MAX_BODY = 4 * 1024 * 1024
TILE_LOCK = threading.Lock()


class EditorServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, store, token=None, *, remote_mcp=None):
        self.store = store
        self.remote_mcp = remote_mcp
        self.ui_token = secrets.token_urlsafe(32)
        self.api_token = token or os.getenv('FIELD_EDITOR_TOKEN')
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = 'FieldDesign/1'

    def log_message(self, fmt, *args):
        # Paths/body/tokens from design conversations are not logged.
        pass

    def send(self, status, body, mime='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf8')
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store' if mime.startswith('application/json') else 'private, max-age=300')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'")
        self.end_headers(); self.wfile.write(body)

    def check_origin(self):
        host = urlparse('//' + self.headers.get('Host', '')).hostname
        allowed = {'localhost', '127.0.0.1', '::1'} | {h.strip() for h in os.getenv('FIELD_EDITOR_TRUSTED_HOSTS', '').split(',') if h.strip()}
        if host not in allowed: raise DesignError('Untrusted Host; use loopback or explicitly configure a trusted authenticated proxy', 403)
        origin = self.headers.get('Origin')
        if origin:
            parsed = urlparse(origin)
            if parsed.scheme not in ('http', 'https') or parsed.netloc != self.headers.get('Host'): raise DesignError('Cross-origin access denied', 403)
        if self.headers.get('Sec-Fetch-Site') in ('cross-site', 'same-site'): raise DesignError('Cross-site access denied', 403)

    def authorize(self, approve=False):
        self.check_origin()
        bearer = self.headers.get('Authorization')
        if approve:
            if bearer: raise DesignError('API/MCP tokens cannot approve decisions', 403)
            if not secrets.compare_digest(self.headers.get('X-Editor-UI', ''), self.server.ui_token): raise DesignError('Approval requires the local editor session', 403)
            return
        if bearer:
            if self.server.api_token is None or not secrets.compare_digest(bearer, 'Bearer ' + self.server.api_token): raise DesignError('Invalid API token', 401)
        else:
            if not secrets.compare_digest(self.headers.get('X-Editor-UI', ''), self.server.ui_token): raise DesignError('Use editor session or a configured API token', 401)

    def request_json(self):
        require(self.headers.get('Content-Type', '').split(';')[0] == 'application/json', 'Content-Type must be application/json')
        length = int(self.headers.get('Content-Length', 0))
        require(0 < length <= MAX_BODY, 'Invalid request size (maximum 4 MiB)')
        def bad_constant(value): raise ValueError('Non-finite JSON number')
        value = json.loads(self.rfile.read(length), parse_constant=bad_constant)
        require(isinstance(value, dict), 'JSON must be an object')
        return value

    def chatgpt_status(self):
        remote = self.server.remote_mcp
        status = remote.status() if remote else {
            'enabled': False, 'endpoint': None, 'tunnel_id': None, 'allow_proposals': False,
            'last_contact': None, 'authentication': 'unconfigured',
        }
        return {**status, 'revision': self.server.store.snapshot()['revision']}

    def do_GET(self):
        try:
            self.check_origin()
            u = urlparse(self.path); path = u.path; q = parse_qs(u.query)
            store = self.server.store
            if path == '/api/health': return self.send(200, {'ok': True, 'revision': store.data['revision']})
            if path == '/api/chatgpt/session':
                if self.headers.get('Authorization') or self.headers.get('Sec-Fetch-Site') != 'same-origin':
                    raise DesignError('Open the local ChatGPT settings page', 403)
                return self.send(200, {'ui_token': self.server.ui_token})
            if path == '/api/bootstrap':
                # Browser-only bootstrap. Bearer agents receive no approval credential.
                if self.headers.get('Authorization') or self.headers.get('Sec-Fetch-Site') != 'same-origin': raise DesignError('Open the local editor page to initialize a UI session; agents use documented API operations', 403)
                return self.send(200, {'ui_token': self.server.ui_token, 'maps': store.maps, 'map_sources': store.sources, 'map_nodes': store.nodes, 'catalog': {k: store.catalog[k] for k in ('version', 'source', 'captured_at', 'complete_world_verified')}, 'project': store.snapshot()})
            if path.startswith('/tiles/'):
                return self.tile(path)
            if path.startswith('/api/'):
                self.authorize(approve=path == '/api/chatgpt/status')
                if path == '/api/chatgpt/status': return self.send(200, self.chatgpt_status())
                if path == '/api/project': return self.send(200, store.snapshot())
                if path == '/api/fields': return self.send(200, store.list_fields(q.get('region_id', [None])[0], q.get('query', [''])[0]))
                if path.startswith('/api/fields/'): return self.send(200, store.field(unquote(path[len('/api/fields/'):])) )
                if path == '/api/history': return self.send(200, operation(store, 'get_change_history', {'field_id': q.get('field_id', [None])[0]}))
                if path == '/api/report': return self.send(200, store.report(q.get('start', [None])[0]))
                if path == '/api/export':
                    fmt = q.get('format', ['json'])[0]; out = store.export(q.get('map_id', ['region-01-map'])[0], fmt)
                    return self.send(200, out.encode('utf8') if isinstance(out, str) else out, {'markdown': 'text/markdown; charset=utf-8', 'csv': 'text/csv; charset=utf-8'}.get(fmt, 'application/json; charset=utf-8'))
                return self.send(404, {'error': 'Unknown API route'})
            assets = {'/': ('index.html', 'text/html; charset=utf-8'), '/index.html': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/map.js': ('map.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8'), '/favicon.ico': ('favicon.svg', 'image/svg+xml'), '/favicon.svg': ('favicon.svg', 'image/svg+xml')}
            assets.update({
                '/chatgpt': ('chatgpt.html', 'text/html; charset=utf-8'),
                '/chatgpt.js': ('chatgpt.js', 'text/javascript; charset=utf-8'),
            })
            if path in assets:
                file, mime = assets[path]; return self.send(200, (WEB / file).read_bytes(), mime)
            if path in ('/schema.json', '/openapi.json'):
                return self.send(200, (Path(__file__).parent / 'schemas' / path[1:]).read_bytes())
            return self.send(404, {'error': 'Not found'})
        except Exception as e: self.error(e)

    def do_POST(self):
        try:
            path = urlparse(self.path).path
            self.authorize(approve=path in ('/api/approve', '/api/undo', '/api/chatgpt/test', '/api/chatgpt/stop'))
            req = self.request_json(); store = self.server.store
            if path in ('/api/chatgpt/test', '/api/chatgpt/stop'):
                remote = self.server.remote_mcp
                if remote is None:
                    raise DesignError('ChatGPT MCP is not configured', 409)
                if path == '/api/chatgpt/stop':
                    remote.stop_access()
                    return self.send(200, self.chatgpt_status())
                return self.send(200, {'ok': remote.test_access(), **self.chatgpt_status()})
            if path == '/api/proposals': return self.send(201, store.propose(req))
            if path == '/api/approve': return self.send(200, store.approve(req['proposal_id'], req['revision'], req.get('overwrite_approved', False)))
            if path == '/api/operations': return self.send(200, operation(store, req['operation'], req.get('arguments', {})))
            if path == '/api/compile':
                result = compile_japanese(store, **{k: v for k, v in req.items() if k in ('text', 'region_id', 'selected_field_id', 'target_field_id')})
                if result['status'] == 'ready':
                    result['proposal'] = store.propose({'base_revision': req.get('base_revision'), 'reason': req['text'], 'source': '設計チャット（オフライン構文変換）: ' + req['text'], 'actor': 'user', 'operations': result['operations']})
                return self.send(200, result)
            if path == '/api/rollback': return self.send(201, store.rollback_proposal(req['change_id']))
            if path == '/api/undo':
                # Explicit Ctrl+Z/Ctrl+Y is a local user action on an already reviewed transaction.
                with store.lock:
                    require(req['revision'] == store.snapshot()['revision'], 'Undo revision changed; refresh first')
                    p = store.rollback_proposal(req['change_id'])
                    return self.send(200, store.approve(p['proposal_id'], store.data['revision'], True))
            if path == '/api/validate-travel':
                from .model import can_travel
                return self.send(200, {'allowed': can_travel(store.snapshot()['field_edges'][req['edge_id']], req['level'], req.get('completed_quests', []), req.get('discovered_fields', []), req.get('temporary_conditions', []), req.get('fast_travel', False))})
            return self.send(404, {'error': 'Unknown API route'})
        except Exception as e: self.error(e)

    def error(self, e):
        if isinstance(e, (BrokenPipeError, ConnectionResetError)): return
        if isinstance(e, DesignError): return self.send(e.status, {'error': str(e), **e.details})
        if isinstance(e, (ValueError, TypeError, KeyError, AttributeError, json.JSONDecodeError)): return self.send(400, {'error': 'Invalid request: ' + str(e)})
        self.send(500, {'error': 'Internal error; no design transaction was committed'})

    def tile(self, path):
        parts = path.split('/')
        require(len(parts) == 6, 'Invalid tile path')
        mid, z, x, y = map(int, parts[2:])
        meta = self.server.store.sources.get(str(mid))
        require(meta is not None and bool(meta.get('map_version')), 'No official terrain available for this map')
        require(meta['min_zoom'] <= z <= meta['max_zoom'] and -6 <= z <= 0, 'Invalid tile zoom')
        size = 256 / 2 ** z
        require(0 <= x < math.ceil(meta['total_size'][0] / size) and 0 <= y < math.ceil(meta['total_size'][1] / size), 'Tile out of bounds')
        suffix = ('N' if z < 0 else 'P') + str(abs(z))
        url = meta['tile_template'].format(map_id=mid, map_version=meta['map_version'], x=x, y=y, suffix=suffix)
        require(urlparse(url).hostname == 'act-webstatic.hoyoverse.com' and url.startswith('https://act-webstatic.hoyoverse.com/map_manage/map/'), 'Unapproved tile host')
        cache = self.server.store.root / 'work/field-editor-tiles' / str(mid) / meta['map_version']
        cache.mkdir(parents=True, exist_ok=True)
        target = cache / f'{x}_{y}_{suffix}.webp'
        if target.exists(): return self.send(200, target.read_bytes(), 'image/webp')
        try:
            with urlopen(Request(url, headers={'User-Agent': 'FieldDesignEditor/1 (local design preview)'}), timeout=15) as response:
                raw = response.read(2 * 1024 * 1024)
            require(raw[:4] == b'RIFF' and raw[8:12] == b'WEBP', 'Invalid terrain image')
        except (HTTPError, URLError, TimeoutError) as e:
            return self.send(502, {'error': 'Official terrain unavailable; use manual image import', 'source': url})
        with TILE_LOCK:
            target.write_bytes(raw)
            target.with_suffix('.source.json').write_text(json.dumps({'url': url, 'map_version': meta['map_version'], 'sha256': hashlib.sha256(raw).hexdigest()}, indent=2), encoding='utf8')
        return self.send(200, raw, 'image/webp')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=int(os.getenv('PORT', '8770')))
    parser.add_argument('--data', type=Path, help='Alternate isolated project JSON (tests/preview)')
    parser.add_argument('--strictPort', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--mcp-port', type=int, help='Enable private Streamable HTTP on 127.0.0.1:PORT')
    parser.add_argument('--mcp-allow-proposals', action='store_true', help='Expose the pending-proposal tool')
    parser.add_argument('--tunnel-id', help='Show the Secure MCP Tunnel ID in local settings')
    args = parser.parse_args()
    if args.mcp_port is not None and args.host not in ('127.0.0.1', 'localhost'):
        parser.error('ChatGPT MCP requires the editor UI to bind to loopback')
    if args.mcp_port is None and (args.mcp_allow_proposals or args.tunnel_id):
        parser.error('--mcp-allow-proposals and --tunnel-id require --mcp-port')

    store = Store(args.data)
    remote = None
    if args.mcp_port is not None:
        try:
            remote = RemoteMCP(args.mcp_port, store, os.getenv('FIELD_EDITOR_MCP_TOKEN'),
                               allow_proposals=args.mcp_allow_proposals, tunnel_id=args.tunnel_id)
        except (OSError, ValueError) as exc:
            parser.error(str(exc))
    try:
        with EditorServer((args.host, args.port), store, remote_mcp=remote) as server:
            if remote:
                thread = threading.Thread(target=remote.serve_forever, daemon=True)
                thread.start()
                print(f'ChatGPT MCP (local relay target): {remote.endpoint}', flush=True)
            print(f'Field editor: http://{args.host}:{server.server_port}', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                if remote:
                    remote.shutdown()
    finally:
        if remote:
            remote.server_close()


if __name__ == '__main__': main()
