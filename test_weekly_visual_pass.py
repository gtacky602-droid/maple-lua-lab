"""Check combat equivalence, opening geometry and the independently moving wings."""

from argparse import ArgumentParser
from collections import defaultdict
from math import hypot
from pathlib import Path
import json
import subprocess
import tempfile

import runtime as game
from test_coop_local import expand_rectangles


ROOT=game.ROOT
SPECS=json.loads((ROOT/'content/weekly-boss-spawns.json').read_bytes())['weeklyBosses']
SOURCES={
    'dvalin': 'dvalin-weekly-body', 'azhdaha': 'azhdaha-idle', 'raiden': 'raiden-weekly-normal',
    'apep': 'apep-dark-idle', 'narwhal': 'narwhal-idle', 'primal_fire': 'gosoythoth-idle',
    'childe': 'childe-idle', 'signora': 'signora-idle', 'knave': 'knave-weekly-single',
    'false_moon': 'false-moon-weekly-idle', 'heretic': 'heretic-weekly-idle',
}
ENLARGED={'dvalin','azhdaha','raiden','apep','narwhal','primal_fire'}
HUMAN={'childe','signora','raiden','knave','false_moon','heretic'}
WINGS=(
    {'#321b3f','#b94a38','#ffad56','#ffebaf'},
    {'#28234f','#594eb5','#a991ff','#d9ecff'},
)


class BaselineFiles:
    parent=ROOT.parent

    def __init__(self, override):
        self.override=override

    def __truediv__(self, name):
        path=self.override/name
        return path if path.is_file() else ROOT/name


def open_arena(core, node):
    state=core.new(12)
    core.action(state,'story_start')
    core.enterStoryNode(state,node)
    return state


def snapshot(core, state):
    frame=core.frame(state,'sprite','legacy')
    slot,_=core.currentWeeklyBoss(state)
    return dict(boss=game.native(frame.weeklyBoss),
                actors=[(a.x,a.y,a.hp,a.maxhp) for a in state.actors.values()],
                enemy=[(e.id,e.x,e.y,e.hitTop,e.hitBottom,e.hp,e.maxhp,e.invulnerable)
                       for e in state.enemies.values()],
                platforms=game.native(frame.platforms), events=game.native(frame.events),
                stage=slot.stage, damage=state.damage, returns=state.returns)


def body(core, state, prefix):
    return next(d for d in core.captureWeeklyScenery(state,'sprite','legacy').draws.values()
                if d.source and d.source.startswith(prefix))


def verify(old, current):
    encounters={}
    for spec in (row for row in SPECS if row['controller'] in SOURCES):
        key,node=spec['controller'],spec['node']
        prefix=SOURCES[key]
        lua,c=current
        previous=open_arena(old[1],node)
        state=open_arena(c,node)
        old_pose,new_pose=body(old[1],previous,prefix),body(c,state,prefix)
        assert old_pose.y==new_pose.y
        if key in HUMAN:
            assert old_pose.bodyBand is None and new_pose.bodyBand==.25, key
        if key in ENLARGED:
            assert new_pose.h>old_pose.h, key
        else:
            assert new_pose.h==old_pose.h, key
        prior=dict(x=old_pose.x,y=old_pose.y,h=old_pose.h,w=old_pose.w)
        pose=dict(x=new_pose.x,y=new_pose.y,h=new_pose.h,w=new_pose.w,bodyBand=new_pose.bodyBand)
        profiles=defaultdict(int)
        motion=set()
        tests=0
        for tick in range(601):
            if tick%30==0:
                assert snapshot(old[1],previous)==snapshot(c,state), (key,tick)
                tests+=1
            if tick in (0,12,24):
                d=body(c,state,prefix)
                motion.add((d.y,d.h,d.bodyBand))
            if tick in (0,30,180):
                for profile in ('legacy','h48c32','h32c16'):
                    state.packRectArt=None
                    plain=game.native(c.frame(state,'rect',profile)).get('draws',[])
                    state.packRectArt=True
                    frame=game.native(c.frame(state,'rect',profile))
                    state.packRectArt=None
                    assert list(expand_rectangles(frame))==plain, (key,tick,profile)
                    profiles[profile]+=1
            if tick==600:
                break
            controls=dict(right=tick%240<120,left=tick%240>=120,attack=True,jump=tick%180==0)
            for (vm,core),s in ((old,previous),(current,state)):
                core.step(s,1/60,vm.table_from(controls))
        assert len(motion)>1, key
        encounters[key]=dict(before=prior,after=pose,mechanicsCheckpoints=tests,
                             motionStates=len(motion),packRoundTrips=dict(profiles))
    return encounters


def wing_motion(lua,core):
    state=open_arena(core,'primal-fire-sundered-forge')
    slot,_=core.currentWeeklyBoss(state)
    slot.rest=9000
    trajectory=[]
    minimum=float('inf')
    for _ in range(15):
        views=[game.native(core.captureWeeklyScenery(state,m,q)).get('draws',[])
               for m,q in (('sprite','legacy'),('rect','legacy'),('rect','h32c16'))]
        # Wing draws precede the body in each rendering path.
        wings=[[d for d in draws[:100] if d.get('color') in WINGS[0]|WINGS[1]] for draws in views]
        assert len(wings[0])==100 and wings[0]==wings[1]==wings[2]
        groups=[[d for d in wings[0] if d['color'] in colors] for colors in WINGS]
        assert [len(group) for group in groups]==[50,50]
        trajectory.append(tuple((min(d['x'] for d in group),min(d['y'] for d in group)) for group in groups))
        # body runs are emitted between the wing strokes and the separate weapons.
        pose=next(d for d in views[0] if d.get('source','').startswith('gosoythoth-idle'))
        art=core.primalWeeklyArt.idle
        temp=lua.table(draws=lua.table())
        core.drawFieldDisplayArt(temp,art,pose['x'],pose['y'],pose['h'],'rect','legacy',pose['flip'])
        body_runs=game.native(temp.draws)
        for wing in wings[0]:
            for rect in body_runs:
                dx=max(rect['x']-wing['x']-wing['w'],wing['x']-rect['x']-rect['w'],0)
                dy=max(rect['y']-wing['y']-wing['h'],wing['y']-rect['y']-rect['h'],0)
                if dx<minimum and dy<minimum:
                    minimum=min(minimum,hypot(dx,dy))
        for _ in range(6):
            core.step(state,1/60,lua.table())
    assert min(len(set(side)) for side in zip(*trajectory))>4
    assert len({right[1]-left[1] for left,right in trajectory})>1
    assert minimum>2, minimum
    return dict(frameCount=len(trajectory),rectanglesPerWing=50,minimumGapPx=round(minimum,2),
                trajectories=trajectory)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--visual-change', required=True,
                        help='Commit that introduced the visuals to remove from the comparison runtime')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    visual_change=subprocess.check_output(
        ['git','rev-parse','--verify',f'{args.visual_change}^{{commit}}'],text=True).strip()
    # Replay the old weekly poses on today's renderer, including its later field-boss fixes.
    # The original controllers still use the ordinary draw call for unbanded sprites.
    visual_files=[f'{visual_change}^',visual_change,'--','weekly-*.lua',
                  'content/weekly-boss-spawns.json']
    files=subprocess.check_output(
        ['git','diff','--name-only','--no-renames',*visual_files],text=True).splitlines()
    patch=subprocess.check_output(['git','diff','--no-ext-diff','--no-color','--no-renames',*visual_files])
    with tempfile.TemporaryDirectory() as folder:
        override=Path(folder)
        for file in files:
            path=override/file
            path.parent.mkdir(exist_ok=True,parents=True)
            path.write_bytes((ROOT/file).read_text(encoding='utf8').encode('utf8'))
        # Keep later combat and map changes in both runtimes. Fail if a weekly
        # pose hunk conflicts with a later change to the same controller.
        subprocess.run(['git','apply','--reverse','--whitespace=nowarn'],
                       cwd=override,input=patch,check=True)
        game.ROOT=BaselineFiles(override)
        try:
            old=game.runtime()
        finally:
            game.ROOT=ROOT
    current=game.runtime()
    head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    record=dict(testedCommit=head,removedVisualChange=visual_change,
                encounters=verify(old,current),wingMotion=wing_motion(*current))
    args.output.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n','utf8')
    print(len(record['encounters']), 'bosses;', record['wingMotion']['minimumGapPx'], 'px minimum wing gap')
