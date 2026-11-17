"""Compile all14 retained Andrius key poses with their audited roots and dimensions."""
import hashlib,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
audit=json.loads((ROOT/'evidence/andrius-weekly-art-audit.json').read_text(encoding='utf8'))
for source in {row['source'] for row in audit['poses'].values()}:
 if hashlib.sha256((ROOT/'assets'/source).read_bytes()).hexdigest()!=audit['outputs'][source]:
  raise ValueError('Atlas differs from audited input: '+source)
for pose,row in audit['poses'].items():
 subprocess.run([sys.executable,str(ROOT/'compile_boss_assets.py'),'--source',row['source'],
  '--output',f'andrius-weekly-{pose}-sprites-v1.json','--height',str(row['height']),
  '--anchor-x',str(row['anchor']),'--crop',*map(str,row['crop']),
  '--accent-color','#74ddff','--accent-color','#b9f4d9'],cwd=ROOT,check=True)
