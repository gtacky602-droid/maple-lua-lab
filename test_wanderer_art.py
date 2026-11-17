import hashlib
import json

from PIL import Image
from runtime import ROOT, runtime

lua, core = runtime()
state = core.new(16)
core.action(state, 'campaign')
core.action(state, 'companion:wanderer')
actor = state.actors[2]
arts = {}
for side in ('left', 'right'):
    path = ROOT / 'assets' / f'wanderer-idle-{side}-sprites-v3.json'
    art = arts[side] = json.loads(path.read_text(encoding='utf8'))
    image_path = ROOT / 'assets' / art['source']
    assert hashlib.sha256(image_path.read_bytes()).hexdigest() == art['sha256']
    with Image.open(image_path) as image:
        assert image.getchannel('A').getextrema()[0] == 0


def verify_pose(side):
    art = arts[side]
    checks = []
    for profile in ('legacy', 'h48c32', 'h32c16'):
        frame = core.frame(state, 'sprite', profile)
        sprite, = [d for d in frame.draws.values() if d.source and d.source.startswith('wanderer-idle-')]
        assert (sprite.source, sprite.flip, sprite.x, sprite.y, sprite.h, sprite.anchorX) == (
            art['source'], False, actor.x - state.camera, actor.y, 88, art['anchorX'],
        )
        assert abs(sprite.w / sprite.h - art['box'][2] / art['box'][3]) < 1e-9
        count = sum(d.kind == 'rect' for d in core.frame(state, 'rect', profile).draws.values())
        hp = actor.hp
        actor.hp = 0
        assert not any(d.source == art['source'] for d in core.frame(state, 'sprite', profile).draws.values())
        hidden = sum(d.kind == 'rect' for d in core.frame(state, 'rect', profile).draws.values())
        actor.hp = hp
        assert count - hidden == len(art['profiles'][profile]['runs'])
        checks.append({'side': side, 'profile': profile, 'anchor_y': sprite.y, 'rectangles': count - hidden})
    return checks


ground_checks = []
for side, direction in [('left', -1), ('right', 1)]:
    actor.dir = direction
    ground_checks.extend(verify_pose(side))

core.action(state, 'swap')
core.action(state, 'skill1')
for _ in range(60):
    core.step(state, 1 / 60, lua.table())
assert actor.y == 380 and not actor.ground
float_checks = []
for side in ('left', 'right'):
    core.step(state, 1 / 60, lua.table_from({side: True}))
    float_checks.extend(verify_pose(side))

(ROOT / 'evidence/wanderer-art-test.json').write_text(json.dumps({
    'ground': ground_checks, 'float': float_checks, 'hash_alpha': True, 'dead_hidden': True,
}, indent=2), encoding='utf8')
print('Wanderer directional art passed on ground and in the air, in PNG and all rectangle profiles')
