"""Start the local editor and the official Secure MCP Tunnel client together."""
import argparse
from getpass import getpass, GetPassWarning
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
import warnings

from .model import ROOT


def wait_for_editor(editor, url):
    opener = build_opener(ProxyHandler({}))
    for _ in range(60):
        if editor.poll() is not None:
            break
        try:
            with opener.open(url + '/api/health', timeout=0.5):
                return
        except (URLError, OSError):
            time.sleep(0.2)
    raise SystemExit('設計室を起動できませんでした。起動メッセージとポートの使用状況を確認してください。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', type=Path, required=True, help='Path to official tunnel-client.exe')
    parser.add_argument('--tunnel-id', required=True)
    parser.add_argument('--data', type=Path, help='Use this existing project JSON as the source of truth')
    parser.add_argument('--ui-port', type=int, default=8770)
    parser.add_argument('--mcp-port', type=int, default=8771)
    parser.add_argument('--health-port', type=int, default=8772)
    parser.add_argument('--allow-proposals', action='store_true')
    args = parser.parse_args()

    client = args.client.resolve()
    if not client.is_file():
        parser.error('--client must point to the official tunnel-client executable')
    if not re.fullmatch(r'tunnel_[A-Za-z0-9_-]{1,100}', args.tunnel_id):
        parser.error('Invalid Tunnel ID')
    ports = {args.ui_port, args.mcp_port, args.health_port}
    if len(ports) != 3 or not all(1 <= p <= 65535 for p in ports):
        parser.error('The three ports must be distinct and between 1 and 65535')
    if args.data and not args.data.is_file():
        parser.error('--data must point to an existing project JSON')

    ui = f'http://127.0.0.1:{args.ui_port}'
    relay_token = secrets.token_urlsafe(32)
    editor_env = {**os.environ, 'FIELD_EDITOR_MCP_TOKEN': relay_token}
    editor_command = [
        sys.executable, '-m', 'tools.field_editor.server',
        '--port', str(args.ui_port), '--mcp-port', str(args.mcp_port), '--tunnel-id', args.tunnel_id,
    ]
    if args.data:
        editor_command += ['--data', str(args.data.resolve())]
    if args.allow_proposals:
        editor_command.append('--mcp-allow-proposals')

    # Fall back to an error if the terminal cannot hide input.
    with warnings.catch_warnings():
        warnings.simplefilter('error', GetPassWarning)
        try:
            key = getpass('Secure MCP Tunnel の Runtime API key（入力は非表示）: ').strip()
        except (GetPassWarning, EOFError):
            parser.error('Run this command in an interactive Windows terminal')
    if not key:
        parser.error('A tunnel runtime API key is required')
    tunnel_env = {**editor_env, 'FIELD_EDITOR_TUNNEL_RUNTIME_KEY': key}
    del key
    flags = [
        '--control-plane.base-url', 'https://api.openai.com',
        '--control-plane.tunnel-id', args.tunnel_id,
        '--control-plane.api-key', 'env:FIELD_EDITOR_TUNNEL_RUNTIME_KEY',
        '--mcp.server-url', f'http://127.0.0.1:{args.mcp_port}/mcp',
        '--mcp.oauth-discovery', 'disabled',
        '--mcp.extra-headers', 'X-Field-MCP-Token: env:FIELD_EDITOR_MCP_TOKEN',
        '--health.listen-addr', f'127.0.0.1:{args.health_port}',
        '--allow-remote-ui=false', '--log.http-raw-unsafe=false',
    ]
    editor = subprocess.Popen(editor_command, cwd=ROOT, env=editor_env)
    try:
        wait_for_editor(editor, ui)
        subprocess.run([str(client), 'doctor', '--explain', *flags], cwd=ROOT, env=tunnel_env, check=True)
        print(f'ChatGPT連携設定: {ui}/chatgpt', flush=True)
        print(f'トンネルの準備状況: http://127.0.0.1:{args.health_port}/readyz', flush=True)
        subprocess.run([str(client), 'run', *flags], cwd=ROOT, env=tunnel_env, check=True)
    except KeyboardInterrupt:
        pass
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f'tunnel-client が終了しました（コード {exc.returncode}）。表示された診断を確認してください。')
    finally:
        if editor.poll() is None:
            editor.terminate()
        editor.wait()


if __name__ == '__main__':
    main()
