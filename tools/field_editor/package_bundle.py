"""Package the standalone standard-library editor without game runtime or terrain images."""
import argparse
from pathlib import Path
import zipfile
from .model import ROOT


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'work/teyvat-field-editor.zip')
    args=parser.parse_args();args.output.parent.mkdir(parents=True,exist_ok=True)
    files=[]
    for folder in ('tools/field_editor','design/field-editor','docs/field-editor'):
        files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.lock','.tmp','.pyc') and 'node_modules' not in p.parts)
    files.extend(ROOT/'content'/n for n in ('map-catalog.json','enemy-art-status.json'))
    files.append(ROOT / 'build_map_catalog.py')
    with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(files):z.write(p,p.relative_to(ROOT).as_posix())
        z.writestr('Start-Field-Editor.cmd','@echo off\r\ncd /d "%~dp0"\r\npython -m tools.field_editor.server\r\npause\r\n')
        z.writestr('README.md','# テイワット・フィールド設計室\n\nPython 3.10以上が必要です。ZIPを展開したフォルダで `python -m tools.field_editor.server` を実行し、http://127.0.0.1:8770 を開きます。Windowsは Start-Field-Editor.cmd も利用できます。\n\n操作と構造・API/MCPは docs/field-editor/README.md を参照。ゲーム本体・公式地形画像は含みません。公式地形は実行時に読み込みます。未承認のデータを本番へ自動反映しません。ソース: https://github.com/gtacky602-droid/maple-lua-lab\n')
    with zipfile.ZipFile(args.output) as z:
        if z.testzip() is not None:raise RuntimeError('Bundle integrity check failed')
        print(f'Bundle: {args.output} ({len(z.namelist())} files, {args.output.stat().st_size} bytes; no terrain images)')


if __name__=='__main__':main()
