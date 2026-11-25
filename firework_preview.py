"""Render reference and packed sparks at the same instant without a player session."""
import json
from functools import lru_cache
from threading import Lock

from runtime import ROOT, LuaRuntime, native

_lock = Lock()


@lru_cache(maxsize=1)
def _renderer():
    graph = json.loads((ROOT / 'content/story-graph.json').read_bytes())
    spec = next(q['fireworks'] for q in graph['quests'] if q['id'] == 'ina-window-fireworks')
    lua = LuaRuntime(unpack_returned_tuples=True)
    module = lua.execute((ROOT / 'story-fireworks.lua').read_text(encoding='utf8'))(lua.table(), None)
    return lua, module.bloom, spec


def firework_comparison(request):
    beat = request.get('beat', 40)
    if type(beat) is not int or not 0 <= beat <= 100:
        raise ValueError('花火の開き具合は0〜100で指定してください')
    with _lock:
        lua, bloom, spec = _renderer()
        paint = next((c for c in spec['colors'] if c['id'] == request.get('color', 'sunset')), None)
        shape = request.get('shape', 'fan')
        if paint is None or shape not in [s['id'] for s in spec['shapes']]:
            raise ValueError('色か形を選び直してください')
        result = dict(colors=spec['colors'], shapes=spec['shapes'], beat=beat)
        for packed, name in ((False, 'reference'), (True, 'packed')):
            commands = lua.table()
            bloom(commands, beat / 100, shape, lua.table_from(paint), packed)
            result[name] = native(commands)
        return result
