"""Measure one cold Lua decode per fresh VM using actual files saved by the lab."""
import argparse
import hashlib
import json
import platform
import statistics
import time
from pathlib import Path

from lupa.lua53 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
TIERS = (4096, 4608, 5120, 5632, 6144)


def measure(codec, module, expected):
    lua = LuaRuntime(encoding=None)
    ctx = lua.table()
    lua.execute(codec)(ctx)
    scenes = lua.execute(module)
    _, scene = next(iter(scenes.items()))
    ctx[b'profiles'][1] = scene[b'base']
    ctx[b'scenerySplits'][b'selected'] = scene[b'details']
    decode = lua.eval("function(c) return c.refinedScenery('selected',c.profile(1)) end")
    collect_kib = lua.eval("function() collectgarbage('collect'); return collectgarbage('count') end")
    before = collect_kib()
    start = time.perf_counter_ns()
    decoded = decode(ctx)
    elapsed_ms = (time.perf_counter_ns() - start) / 1e6
    retained_kib = collect_kib() - before
    assert decoded[b'width'] == 512 and decoded[b'height'] == 288
    assert len(decoded[b'runs']) == expected
    return elapsed_ms, retained_kib


def benchmark(codec, manifests, downloads, repetitions):
    scenes = [scene for manifest in manifests
              for scene in json.loads(manifest.read_text(encoding='utf8'))['scenes']]
    if len({row['node'] for row in scenes}) != len(scenes):
        raise ValueError('Duplicate location across input manifests')
    files = {}
    for scene in scenes:
        stem = scene['source'].removesuffix('-background-v1.png')
        for tier in TIERS:
            path = downloads / f'{stem}-{tier}.lua'
            files[scene['node'], tier] = path.read_bytes()
    samples = {key: [] for key in files}
    # Alternate traversal order to reduce systematic timing effects across tiers.
    for repeat in range(repetitions):
        keys = list(files) if repeat % 2 == 0 else reversed(files)
        for key in keys:
            samples[key].append(measure(codec, files[key], key[1]))
    result = {}
    for (node, tier), pairs in samples.items():
        times, sizes = zip(*pairs)
        result.setdefault(node, {})[tier] = {
            'fileBytes': len(files[node, tier]),
            'medianDecodeMs': round(statistics.median(times), 2),
            'minDecodeMs': round(min(times), 2),
            'maxDecodeMs': round(max(times), 2),
            'medianRetainedLuaKiB': round(statistics.median(sizes), 1),
        }
    bundles = [m.with_name(m.name.replace('-background-generation.json','-native-backgrounds.lua'))
               for m in manifests]
    return {
        'bundleSha256': {b.name:hashlib.sha256(b.read_bytes()).hexdigest() for b in bundles},
        'runtime': LuaRuntime().lua_implementation,
        'system': platform.system() + ' ' + platform.machine(),
        'freshVMsPerFile': repetitions,
        'codecSha256': hashlib.sha256(codec).hexdigest(),
        'timingScope': 'Base and refinement decode only. VM setup, file I/O, module loading and drawing excluded.',
        'memoryScope': 'Lua heap delta after full GC while the decoded profile and codec are retained.',
        'scenes': result,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifests', type=Path, nargs='+')
    parser.add_argument('output', type=Path)
    parser.add_argument('--downloads', type=Path, default=ROOT/'work/scenery-download-check')
    parser.add_argument('--repetitions', type=int, default=7)
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error('--repetitions must be positive')
    report = benchmark((ROOT/'assets/MapleCodec.lua').read_bytes(), args.manifests, args.downloads, args.repetitions)
    args.output.write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(f"{len(report['scenes'])} scenes, {len(TIERS)} tiers, {args.repetitions} independent decodes per file.")
