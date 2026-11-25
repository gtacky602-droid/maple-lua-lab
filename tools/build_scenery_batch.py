"""Build five portable scenery tiers and verify their pixels with the lab's Lua decoder."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import struct
import zlib

import numpy as np
from lupa.lua53 import LuaRuntime
from PIL import Image

from fit_background_detail import compare
from pack_native_13bit import encode
from pack_patch_planes import smallest
from pack_scenery_patches import pack
from pack_variable91 import convert_literals
from plan_scenery_patches import paint

ROOT = Path(__file__).resolve().parents[1]
TIERS = (4096, 4608, 5120, 5632, 6144)


def decode(codec, base, details):
    vm = LuaRuntime(encoding=None)
    ctx = vm.table()
    vm.execute(codec)(ctx)
    ctx[b'profiles'][1] = vm.table_from([512, 288, b'treeBits', base])
    ctx[b'scenerySplits'][b'scene'] = details
    runs = ctx[b'refinedScenery'](b'scene', ctx[b'profile'](1))[b'runs']
    pixels = np.zeros((288, 512, 3), np.uint8)
    tiers = {}
    assert len(runs) == TIERS[-1]
    for i in range(1, len(runs) + 1):
        x, y, w, h, color = (runs[i][j] for j in range(1, 6))
        pixels[y:y+h, x:x+w] = list(bytes.fromhex(color[1:].decode()))
        if i in TIERS:
            tiers[i] = pixels.copy()
    return tiers


def encode_scene(scene, codec, work, assets):
    source = assets / scene['source']
    compare(source, work)
    stem = source.stem
    packed = base64.b85decode((work / (stem+'.b85')).read_bytes()[1:])
    inflater = zlib.decompressobj(-15)
    inflater.decompress(packed)
    assert inflater.eof
    base = encode(packed[:len(packed) - len(inflater.unused_data)])
    with Image.open(work / (stem+'-reference.png')) as im:
        reference = np.array(im)
    with Image.open(work / (stem+'-after.png')) as im:
        fitted = np.array(im)
    refined, patches = paint(reference, fitted)
    assert len(patches) == TIERS[-1] - TIERS[0]
    raw = b''.join(struct.pack('<HHBBBBB', *rect) for rect in patches)
    details = smallest(raw, pack(raw, allow_partial=True))
    selected = [convert_literals(b'"'+block+b'"')[1:-1] for block in (base, details)]
    fixed = decode(codec, base, details)
    tiers = decode(codec, *selected)
    for tier in TIERS:
        np.testing.assert_array_equal(tiers[tier], fixed[tier])
    np.testing.assert_array_equal(tiers[TIERS[0]], fitted)
    np.testing.assert_array_equal(tiers[TIERS[-1]], refined)

    preview = assets / scene['preview']
    Image.fromarray(refined).save(preview, optimize=True)
    sheet = Image.new('RGB', (1024, 576))
    for i, tier in enumerate(TIERS[:-1]):
        sheet.paste(Image.fromarray(tiers[tier]), (i % 2 * 512, i // 2 * 288))
    sheet_path = preview.with_name(preview.name.replace('-preview-v1.png', '-tiers-v1.webp'))
    sheet.save(sheet_path, lossless=True, method=6)
    with Image.open(sheet_path) as im:
        np.testing.assert_array_equal(np.array(im), np.array(sheet))
    report = {
        'sourceBytes': source.stat().st_size, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'preview': preview.name, 'rawDimensions': [512, 288],
        'baseFixed13Bytes': len(base), 'baseSelectedBytes': len(selected[0]),
        'detailFixed13Bytes': len(details), 'detailSelectedBytes': len(selected[1]),
        'fixedVsSelectedDifferingPixels': 0, 'comparedPixels': 512 * 288 * len(TIERS),
        'tiers': [{'rectangles': n, 'meanAbsoluteRgbErrorToReference': float(np.abs(pixels.astype(float)-reference).mean()),
                   'rgbSha256': hashlib.sha256(pixels.tobytes()).hexdigest()} for n, pixels in tiers.items()],
    }
    record = (b'["'+source.name.encode()+b'"]={base={512,288,"treeBits","'+selected[0]
              +b'"},details="'+selected[1]+b'",count=2048},\n')
    return record, report


def build(batch):
    assets = ROOT / 'assets'
    scenes = json.loads((assets / f'{batch}-background-generation.json').read_text('utf8'))['scenes']
    work = ROOT / 'work' / (batch+'-background-fit')
    work.mkdir(parents=True, exist_ok=True)
    codec = (assets / 'MapleCodec.lua').read_bytes()
    report = {'codec':'MapleCodec.lua with the R61C variable-width reader',
              'codecSha256': hashlib.sha256(codec).hexdigest(), 'scenes': {}}
    records = []
    for scene in scenes:
        record, measures = encode_scene(scene, codec, work, assets)
        records.append(record)
        report['scenes'][scene['source']] = measures
        print(scene['source'], flush=True)
    (assets / f'{batch}-native-backgrounds.lua').write_bytes(b'return {\n'+b''.join(records)+b'}\n')
    (ROOT / 'evidence' / f'{batch}-background-compression.json').write_text(json.dumps(report, indent=2)+'\n','utf8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batch', help='Prefix of the generation manifest in assets, for example ina-islands')
    build(parser.parse_args().batch)
