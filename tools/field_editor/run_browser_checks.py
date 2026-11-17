"""Run the requested Playwright acceptance checks against an isolated local test server."""
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from .model import ROOT, Store
from .server import EditorServer

def main():
    with tempfile.TemporaryDirectory(prefix='field-editor-qa-') as temp:
        server=EditorServer(('127.0.0.1',0),Store(Path(temp)/'project.json'))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        env={**os.environ,'FIELD_EDITOR_TEST_URL':f'http://127.0.0.1:{server.server_port}'}
        try:
            result=subprocess.run(['node',str(ROOT/'tools/field_editor/browser_check.mjs')],cwd=ROOT,env=env)
        finally:
            server.shutdown();server.server_close();thread.join()
        raise SystemExit(result.returncode)

if __name__=='__main__':main()
