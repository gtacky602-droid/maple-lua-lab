import hashlib
import json

from PIL import Image
from runtime import ROOT, runtime

_, core = runtime()
state = core.new(16)
core.action(state, 'campaign')
core.action(state, 'companion:ayaka')
actor = state.actors[2]
state.camera = 28
checks = []

for side, direction in [('left', -1), ('right', 1)]:
    filename = f'ayaka-idle-{side}-sprites-v4.json'
    art = json.loads((ROOT / 'assets' / filename).read_text(encoding='utf8'))
    source = ROOT / 'assets' / art['source']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == art['sha256']
    with Image.open(source) as image:
        alpha = image.getchannel('A')
        left, top, right, bottom = alpha.point(lambda a: 255 if a >= 128 else 0).getbbox()
        assert alpha.getextrema()[0] == 0 and art['box'] == [left, top, right - left, bottom - top]

    actor.dir = direction
    for profile in ('legacy', 'h48c32', 'h32c16'):
        frame = core.frame(state, 'sprite', profile)
        draws = [draw for draw in frame.draws.values() if draw.source and draw.source.startswith('ayaka-idle-')]
        assert len(draws) == 1
        draw = draws[0]
        assert (draw.source, draw.flip, draw.x, draw.y, draw.h, draw.anchorX) == (
            art['source'], False, actor.x - state.camera, actor.y, 88, art['anchorX'],
        )
        assert abs(draw.w / draw.h - art['box'][2] / art['box'][3]) < 1e-9
        visible = sum(d.kind == 'rect' for d in core.frame(state, 'rect', profile).draws.values())
        actor.hp = 0
        assert not any(d.source == art['source'] for d in core.frame(state, 'sprite', profile).draws.values())
        hidden = sum(d.kind == 'rect' for d in core.frame(state, 'rect', profile).draws.values())
        actor.hp = actor.maxhp
        assert visible - hidden == len(art['profiles'][profile]['runs'])
        checks.append({'side': side, 'profile': profile, 'source': draw.source, 'rectangles': visible - hidden})

(ROOT / 'evidence/ayaka-art-test.json').write_text(json.dumps({
    'hash_alpha': True, 'facings_profiles': checks, 'foot_anchor': True, 'dead_hidden': True,
}, indent=2), encoding='utf8')
print('Ayaka directional idle art passed in PNG and all three rectangle profiles')
