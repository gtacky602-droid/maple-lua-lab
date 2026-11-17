"""Start the local editor and the official Secure MCP Tunnel client together."""
import argparse
from getpass import getpass, GetPassWarning
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, build_opener
import warnings
import webbrowser

from .model import ROOT


def wait_for_http(process, url, seconds):
    opener = build_opener(ProxyHandler({}))
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline and process.poll() is None:
        try:
            with opener.open(url, timeout=0.5) as response:
                if response.status == 200:
                    return True
        except HTTPError as exc:
            exc.close()
        except (URLError, OSError):
            pass
        time.sleep(0.25)
    return False


def wait_for_tunnel(tunnel, health_url, seconds=75):
    opener = build_opener(ProxyHandler({}))
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline and tunnel.poll() is None:
        try:
            with opener.open(health_url, timeout=1) as response:
                snapshot = json.load(response)
        except HTTPError as exc:
            exc.close()
        except (URLError, OSError, ValueError):
            pass
        else:
            control_plane = snapshot.get('components', {}).get('control-plane', {})
            details = control_plane.get('details', {})
            if details.get('http_status') == 401:
                raise SystemExit('OpenAIがRuntime API keyを拒否しました（401）。起動し直してキーを1回だけ入力してください。')
            if details.get('http_status') == 403:
                raise SystemExit('OpenAIがトンネルへのアクセスを拒否しました（403）。対象の組織とTunnels Read + Use権限を確認してください。')
            if snapshot.get('ready') and control_plane.get('status') == 'ok' and details.get('last_success'):
                return
        time.sleep(0.5)
    if tunnel.poll() is not None:
        raise SystemExit(f'tunnel-client が終了しました（コード {tunnel.returncode}）。表示された診断を確認してください。')
    raise SystemExit('OpenAIへのトンネル接続を確認できませんでした。表示された診断を確認してください。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', type=Path, required=True, help='Path to official tunnel-client.exe')
    parser.add_argument('--tunnel-id', help='Tunnel ID. Prompts when omitted.')
    parser.add_argument('--data', type=Path, help='Use this existing project JSON as the source of truth')
    parser.add_argument('--ui-port', type=int, default=8770)
    parser.add_argument('--mcp-port', type=int, default=8771)
    parser.add_argument('--health-port', type=int, default=8772)
    parser.add_argument('--allow-proposals', action='store_true')
    parser.add_argument('--open-chatgpt', action='store_true', help='Open setup pages in the default browser')
    args = parser.parse_args()

    client = args.client.resolve()
    if not client.is_file():
        parser.error('--client must point to the official tunnel-client executable')
    ports = {args.ui_port, args.mcp_port, args.health_port}
    if len(ports) != 3 or not all(1 <= p <= 65535 for p in ports):
        parser.error('The three ports must be distinct and between 1 and 65535')
    if args.data and not args.data.is_file():
        parser.error('--data must point to an existing project JSON')

    tunnel_id = args.tunnel_id
    if tunnel_id is None:
        print('OpenAI Platformでトンネルを用意してください。')
        print('https://platform.openai.com/settings/organization/tunnels')
        if args.open_chatgpt:
            webbrowser.open('https://platform.openai.com/settings/organization/tunnels')
        try:
            tunnel_id = input('Tunnel ID（tunnel_ から始まるID）: ').strip()
        except (KeyboardInterrupt, EOFError):
            return
    if not re.fullmatch(r'tunnel_[A-Za-z0-9_-]{1,100}', tunnel_id):
        parser.error('Invalid Tunnel ID')

    ui = f'http://127.0.0.1:{args.ui_port}'
    health_url = f'http://127.0.0.1:{args.health_port}/health?details=true'
    relay_token = secrets.token_urlsafe(32)
    editor_env = {**os.environ, 'FIELD_EDITOR_MCP_TOKEN': relay_token}
    editor_command = [
        sys.executable, '-m', 'tools.field_editor.server',
        '--port', str(args.ui_port), '--mcp-port', str(args.mcp_port), '--tunnel-id', tunnel_id,
    ]
    if args.data:
        editor_command += ['--data', str(args.data.resolve())]
    if args.allow_proposals:
        editor_command.append('--mcp-allow-proposals')

    # Fall back to an error if the terminal cannot hide input.
    with warnings.catch_warnings():
        warnings.simplefilter('error', GetPassWarning)
        try:
            key = getpass('Runtime API key（1回だけ貼り付けてEnter。入力は非表示）: ').strip()
        except KeyboardInterrupt:
            return
        except (GetPassWarning, EOFError):
            parser.error('Run this command in an interactive Windows terminal')
    if not key or any(not 33 <= ord(char) <= 126 for char in key):
        parser.error('Runtime API keyを1つ入力してください。キーに空白を含めないでください。')
    tunnel_env = {**editor_env, 'FIELD_EDITOR_TUNNEL_RUNTIME_KEY': key}
    del key
    flags = [
        '--control-plane.base-url', 'https://api.openai.com',
        '--control-plane.tunnel-id', tunnel_id,
        '--control-plane.api-key', 'env:FIELD_EDITOR_TUNNEL_RUNTIME_KEY',
        '--mcp.server-url', f'http://127.0.0.1:{args.mcp_port}/mcp',
        '--mcp.oauth-discovery', 'disabled',
        '--mcp.extra-headers', 'X-Field-MCP-Token: env:FIELD_EDITOR_MCP_TOKEN',
        '--health.listen-addr', f'127.0.0.1:{args.health_port}',
        '--allow-remote-ui=false', '--log.http-raw-unsafe=false',
        '--log.level', 'warn',
    ]
    editor = subprocess.Popen(editor_command, cwd=ROOT, env=editor_env)
    tunnel = None
    try:
        if not wait_for_http(editor, ui + '/api/health', 15):
            raise SystemExit('設計室を起動できませんでした。起動メッセージとポートの使用状況を確認してください。')
        subprocess.run([str(client), 'doctor', '--explain', *flags], cwd=ROOT, env=tunnel_env, check=True)
        print(f'ChatGPT連携設定: {ui}/chatgpt', flush=True)
        print('OpenAIへのトンネル接続を確認しています。', flush=True)
        tunnel = subprocess.Popen([str(client), 'run', *flags], cwd=ROOT, env=tunnel_env)
        wait_for_tunnel(tunnel, health_url)
        print('OpenAIへのトンネル接続を確認しました。', flush=True)
        if args.open_chatgpt:
            webbrowser.open(ui + '/chatgpt')
            webbrowser.open('https://chatgpt.com/plugins')
        code = tunnel.wait()
        if code:
            raise subprocess.CalledProcessError(code, 'tunnel-client run')
    except KeyboardInterrupt:
        pass
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f'tunnel-client が終了しました（コード {exc.returncode}）。表示された診断を確認してください。')
    finally:
        if tunnel is not None:
            if tunnel.poll() is None:
                tunnel.terminate()
            tunnel.wait()
        if editor.poll() is None:
            editor.terminate()
        editor.wait()


if __name__ == '__main__':
    main()
