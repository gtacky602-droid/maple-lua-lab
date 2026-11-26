"""Pose filenames and authored attachment points for the Stygian encounters."""
import json


def read(root, path):
    return json.loads((root/path).read_bytes())


def stygian_parts(root):
    def facings(pattern):
        return {side: pattern.format(side=side) for side in ('left','right')}
    beidou = read(root,'assets/beidou-stygian-generation-v1.json')['poses']
    farka = read(root,'content/farka-idle-layers.json')
    return {
        'Beidou': {'guard': {side:pose['encoding'] for side,pose in beidou.items()}},
        'Capitano': {kind:facings(f'capitano-{kind}-{{side}}-sprites-v1.json')
                     for kind in ('coat','battle','strike')} | {'sword':'capitano-ice-sword-sprites-v1.json'},
        'Xbalanque': {kind:facings(f'xbalanque-{kind}-{{side}}-sprites-v1.json')
                      for kind in ('idle','guard','punch')},
        'Rerir': facings('rerir-idle-{side}-sprites-v1.json'),
        'Ronova': facings('ronova-idle-{side}-sprites-v1.json') | {'wings':'ronova-wings-sprites-v1.json'},
        'Farka': {side:layer['body'] for side,layer in farka['facings'].items()} | {'sword':farka['sword']['file']},
    }


def stygian_overrides(root):
    """Apply the battle-specific scale and grip to the packed battle copies."""
    out = {}
    for pose in read(root,'assets/beidou-stygian-generation-v1.json')['poses'].values():
        filename = pose['encoding']
        crown,_,sole = pose['crownChinSoleY']
        height = read(root,'assets/'+filename)['box'][3]
        out[filename] = {'heightScale':height/(sole-crown)}
    sword = read(root,'content/farka-idle-layers.json')['sword']
    x,y,w,h = read(root,'assets/'+sword['file'])['box']
    gx,gy = sword['grip']
    out[sword['file']] = {'anchorX':(gx-x)/w, 'anchorY':(gy-y)/h}
    return out
