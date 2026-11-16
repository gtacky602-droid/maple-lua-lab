from pathlib import Path
import zipfile,hashlib,json,shutil
P=Path(__file__).resolve().parent
dest=P/'sources/attachments';dest.mkdir(exist_ok=True)
manifest=[]
for name in ['miliastra_codex_full_handoff_20261113.zip','miliastra_simulation_package_v0_6.zip','miliastra_simulation_v0_6.xlsx']:
 src=Path.home()/'Downloads'/name
 target=dest/name
 if target.exists(): assert target.read_bytes()==src.read_bytes()
 else: shutil.copy2(src,target)
 record={'name':name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size}
 if name.endswith('.zip'):
  root=(dest/target.stem).resolve();root.mkdir(exist_ok=True)
  with zipfile.ZipFile(target) as z:
   assert sum(i.file_size for i in z.infolist())<100_000_000
   for i in z.infolist():
    p=(root/i.filename).resolve()
    assert p.is_relative_to(root),i.filename
   z.extractall(root)
   record['files']=z.namelist()
 manifest.append(record)
(P/'evidence/import-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
