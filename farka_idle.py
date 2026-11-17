"""Read-only Lua draw commands for the layered Farka art inspection."""

import json
from functools import lru_cache
from threading import Lock

from runtime import ROOT, LuaRuntime, native

MODES = ('png', 'legacy', 'h48c32', 'h32c16')
LOCK = Lock()


@lru_cache(maxsize=1)
def _renderer():
    pose = json.loads((ROOT / 'content/farka-idle-layers.json').read_text(encoding='utf8'))
    files = {pose['sword']['file']}
    for facing in pose['facings'].values():
        files.update((facing['reference'], facing['body']))
    sprites = {}
    for file in files:
        art = json.loads((ROOT / 'assets' / file).read_text(encoding='utf8'))
        sprites[file] = {
            'box': art['box'], 'anchorX': art.get('anchorX', .5),
            'counts': {profile: len(data['runs']) for profile, data in art['profiles'].items()},
        }
    lua = LuaRuntime(unpack_returned_tuples=True)
    bind = lua.execute((ROOT / 'farka-idle.lua').read_text(encoding='utf8'))
    return lua, bind(lua.table_from(pose, recursive=True), lua.table_from(sprites, recursive=True))


def render_farka_idle(request):
    side = request.get('side', 'right')
    mode = request.get('mode', 'png')
    if side not in ('left', 'right') or mode not in MODES:
        raise ValueError('invalid facing or render mode')
    options = {'side': side, 'mode': mode}
    for layer in ('front', 'back', 'body'):
        visible = request.get(layer, True)
        if type(visible) is not bool:
            raise ValueError(f'{layer} must be a boolean')
        options[layer] = visible
    for key in ('frontAngle', 'backAngle'):
        angle = request.get(key, 0)
        if type(angle) not in (int, float) or not -25 <= angle <= 25:
            raise ValueError(f'{key} must be a number from -25 to 25')
        options[key] = angle

    with LOCK:
        lua, draw = _renderer()
        frame = native(draw(lua.table_from(options)))
    frame['draws'] = frame['draws'] or []
    return frame
