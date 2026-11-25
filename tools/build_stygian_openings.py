"""Capture the shared opening of each duel across four difficulties immediately after the reception desk starts it."""
import json

from build_field_boss_openings import sprite_files
from build_group_legend_openings import ROOT, read, runtime
from experience import LEVELS
from runtime import native


def capture(lua, core, state, mode, profile):
    # Mark the host draw list to retain both the rear and foreground ranges.
    marker = {'kind': 'host'}
    layer = lua.table_from({'draws': [marker], 'endgameRun': {}}, recursive=True)
    core.observeStygianMatch(layer, state, mode, profile)
    commands = native(layer.draws)
    at = commands.index(marker)
    rear, front = commands[:at], commands[at+1:]
    full = native(core.frame(state, mode, profile).draws)
    assert full[:len(rear)] == rear and (not front or full[-len(front):] == front)
    return rear + front


def start_match(core, spec, nodes, match, mode):
    state = core.new(12)
    core.action(state, 'story_start')
    core.grantExp(state, LEVELS[-1]['maple_reference_total_exp_to_reach'], 'quest')
    core.enterStoryNode(state, spec['hub'])
    door = next(e for e in nodes[spec['hub']]['exits'] if e['to'] == spec['node'])
    actor = state.actors[state.active]
    actor.x, actor.y = door['x'], door.get('y', 480)
    core.action(state, 'story_nearby_portal')
    desk = core.frame(state).stygianDesk
    assert desk.id == match
    core.action(state, 'stygian_start:'+match+':'+mode+':troupe')
    assert state.endgameRun.status == 'fighting' and state.endgameRun.rules.id == mode
    return state


def build():
    lua, core = runtime()
    by_image = sprite_files()
    gallery = {r['file']: r for r in read('content/boss-art-gallery.json')['items']}
    nodes = {row['id']: row for row in read('content/story-graph.json')['nodes']}
    work = ROOT/'work/stygian-openings'
    work.mkdir(exist_ok=True, parents=True)
    scenes = {}
    for match, spec in read('content/stygian-matches.json')['matches'].items():
        state = start_match(core, spec, nodes, match, 'normal')
        camera = state.camera
        png = capture(lua, core, state, 'sprite', 'legacy')
        indices = [i for i,d in enumerate(png) if d['kind'] == 'boss_sprite']
        assert indices
        parts = []
        scene = dict(match=match, name=spec['name'], parts=parts)
        ground = nodes[spec['node']]['platforms'][0]
        if indices[0]:
            scene['stageMarks'] = [dict(m,x=m['x']+camera) for m in png[:indices[0]]]
        for j,i in enumerate(indices):
            d = png[i]
            files = by_image[d['source'],tuple(d['box'])]
            assert len(files) == 1, (match,files)
            file = files[0]
            name = (['奥の剣','ファルカ','手前の剣'][j] if match == 'farka' else
                    ['ロノヴァの翼','ロノヴァ'][j] if match == 'ronova' else spec['name'].split('・')[0])
            key = 'stygian-'+match+'-'+str(j+1)
            species = 'boss-'+gallery[file]['id'] if file in gallery else 'opening-stygian-'+file.split('-sprites')[0]
            part = dict(id=key,name=name,species=species,x=d['x']+camera,y=ground['y'],hover=ground['y']-d['y'],
                        h=d['h'],anchorX=d['anchorX'],flip=d['flip'])
            if file not in gallery:
                part.update(file=file,box=d['box'])
            for k in ('rotation','anchorY','opacity'):
                if k in d:
                    part[k]=d[k]
            end = indices[j+1] if j+1 < len(indices) else len(png)
            marks = png[i+1:end]
            if marks:
                assert not d['flip'] and all(m['kind']=='rect' for m in marks)
                if match == 'beidou':
                    part['weaponMarks'] = True
                part['marks'] = [dict(m,x=m['x']-d['x'],y=m['y']-d['y']) for m in marks]
            parts.append(part)
        ref = dict(camera=camera,png=png)
        for profile in ('legacy','h48c32','h32c16'):
            ref[profile]=capture(lua,core,state,'rect',profile)
        scene['modes'] = []
        for rule in spec['modes']:
            if rule['id'] != 'normal':
                state = start_match(core, spec, nodes, match, rule['id'])
                assert state.camera == camera
                for key in ('png','legacy','h48c32','h32c16'):
                    mode = 'sprite' if key == 'png' else 'rect'
                    assert capture(lua, core, state, mode, 'legacy' if key == 'png' else key) == ref[key], (match,rule['id'],key)
            scene['modes'].append(dict(id=rule['id'],name=rule['name'],level=rule['level'],hp=state.endgameRun.boss.maxhp))
        (work/(spec['node']+'.json')).write_text(json.dumps(ref,separators=(',',':')),'utf8')
        scenes[spec['node']]=scene
    (ROOT/'content/stygian-openings.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2)+'\n','utf8')


if __name__=='__main__':
    build()
