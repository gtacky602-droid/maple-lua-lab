"""MCP stdio adapter. All tools call the same HTTP API; no filesystem mutations."""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from .commands import READ_TOOLS, WRITE_TOOLS


def handle(message):
    method = message.get('method')
    if 'id' not in message: return None
    mid = message['id']
    try:
        if method == 'initialize':
            result = {'protocolVersion': '2024-11-05', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'field-design-editor', 'version': '1.0.0'}}
        elif method == 'ping': result = {}
        elif method == 'tools/list':
            from pathlib import Path
            schemas = json.loads((Path(__file__).parent / 'schemas/tools.json').read_text())
            result = {'tools': [{'name': n, 'description': ('Read current repository design. ' if n in READ_TOOLS else 'Create a proposal for local user review; does not approve or apply. ') + n, 'inputSchema': schemas[n], 'annotations': {'readOnlyHint': n in READ_TOOLS, 'destructiveHint': False, 'idempotentHint': n in READ_TOOLS}} for n in READ_TOOLS + WRITE_TOOLS]}
        elif method == 'tools/call':
            p = message['params']; name = p['name']
            if name not in READ_TOOLS + WRITE_TOOLS: raise ValueError('Unknown tool')
            token = os.getenv('FIELD_EDITOR_TOKEN')
            if not token: raise ValueError('Set FIELD_EDITOR_TOKEN in both editor server and MCP client')
            url = os.getenv('FIELD_EDITOR_URL', 'http://127.0.0.1:8770').rstrip('/') + '/api/operations'
            req = Request(url, data=json.dumps({'operation': name, 'arguments': p.get('arguments', {})}).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
            try:
                with urlopen(req, timeout=30) as response: value = json.load(response)
                result = {'content': [{'type': 'text', 'text': json.dumps(value, ensure_ascii=False)}]}
            except HTTPError as e:
                result = {'isError': True, 'content': [{'type': 'text', 'text': e.read().decode()}]}
        else: return {'jsonrpc': '2.0', 'id': mid, 'error': {'code': -32601, 'message': 'Method not found'}}
        return {'jsonrpc': '2.0', 'id': mid, 'result': result}
    except Exception as e:
        return {'jsonrpc': '2.0', 'id': mid, 'error': {'code': -32602, 'message': str(e)}}


def main():
    for line in sys.stdin:
        try:
            if len(line) > 4 * 1024 * 1024: raise ValueError('Message too large')
            out = handle(json.loads(line))
        except Exception:
            out = {'jsonrpc': '2.0', 'id': None, 'error': {'code': -32700, 'message': 'Invalid JSON-RPC'}}
        if out is not None: print(json.dumps(out, ensure_ascii=False), flush=True)


if __name__ == '__main__': main()
