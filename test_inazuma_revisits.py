"""Play the five side-quest revisits on one earned Inazuma chapter save."""
import json
import subprocess
import sys

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk
from test_coop_local import expand_rectangles


def load_json(path):
    return json.loads(path.read_bytes())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2)+'\n', encoding='utf8')


work = ROOT/'work/inazuma-fresh-route'
if not (work/'boat-ready-save.json').exists():
    subprocess.run([sys.executable, 'test_inazuma_fresh_route.py'], cwd=ROOT, check=True)
for script in ('test_ina_window_fireworks.py', 'test_ina_itto_three_games.py'):
    subprocess.run([sys.executable, script, '--epilogue'], cwd=ROOT, check=True)
save = validate_save(load_json(work/'epilogue-all.json'))
lua, core = runtime()
s = core.restore(lua.table_from(save, recursive=True), 12)
exits = {n['id']: n['exits'] for n in load_json(ROOT/'content/story-graph.json')['nodes']}
edges = {(node, e['to']): e for node, gates in exits.items() for e in gates}
trail = TrailWalk(lua, core, s, edges, exits)
frame = lambda: core.frame(s, 'sprite', 'legacy')
town, cape = 'inazuma-town', 'inazuma-shiomi-cape'
chapter = 'inazuma-lantern-contest'

def select_ayaka():
    core.action(s, 'story_select_joined:ayaka-join')
    assert s.companion == 'ayaka'

def fast(node):
    core.action(s, 'story_fast:'+node)
    assert s.story.node == node, s.storyNotice

def near(x):
    trail.approach(x, 480, 'revisit')

def quiet_ticks(count):
    for _ in range(count):
        core.step(s, 1/60, trail.idle)

def records():
    return native(s.story.quests), s.progression.questXp, s.mora

# The normal save interface accepts this start state, with Ayaka already selected in town.
assert s.story.node == town and s.companion == 'amber'
near(790)
assert frame().storyAyakaMemory is None
select_ayaka()
start = validate_save(native(core.checkpoint(s)))
main_ids = ('inazuma-moving-lantern','inazuma-torii-maze',chapter)
side_ids = ('ayaka-join','ina-window-fireworks','ina-sayu-quiet-route','ina-itto-three-games','ina-walking-teahouse')
assert all(start['story']['quests'][qid]['status']=='complete' and start['story']['quests'][qid]['cycles']==1
           for qid in (*main_ids,*side_ids))
write(ROOT/'evidence/inazuma-revisit-save.json', start)
baseline = records()
lines = {}
for node, x, expected in [(town,790,'屋根越しの高台'),('ina-firework-beach',475,'藤の紫'),
                          ('ina-sayu-watchpath',1943,'柵'),('ina-festival-games',838,'応援'),
                          ('ina-tea-landing',600,'車輪')]:
    if node != town:
        fast(town)
        if node == 'ina-tea-landing':
            fast(node)
        else:
            trail.cross(node)
    near(x)
    lines[node] = frame().storyAyakaMemory
    assert expected in lines[node], (node, lines[node])
    if node == 'ina-firework-beach':
        assert '扇' in lines[node]
    near(x-130)
    assert frame().storyAyakaMemory is None

fast(town)
trail.cross('inazuma-forest-shore')
trail.cross('inazuma-sea-cave')
trail.cross(cape)
def pose():
    return frame().storyContest.greeting
assert pose() == 'lantern'
near(628)
assert pose() == 'sway'
core.action(s,'pause')
quiet_ticks(120)
assert pose() == 'sway'
core.action(s,'pause')
quiet_ticks(30)
assert pose() == 'unmask'
quiet_ticks(65)
assert pose() == 'rest'
s.packRectArt = True
packed = core.frame(s,'rect','h32c16')
s.packRectArt = None
assert list(expand_rectangles(dict(draws=native(packed.draws),rectBatches=native(packed.rectBatches)))) == native(core.frame(s,'rect','h32c16').draws)
near(675)
core.action(s,'story_collect')
assert frame().storyContest.vista
core.action(s,'story_collect')
near(470)
assert pose() == 'lantern'
assert records() == baseline

fast(town)
trail.cross('sumeru-entry')
trail.cross('sumeru-hub')
journey = validate_save(native(core.checkpoint(s)))
assert journey['story']['quests'] == start['story']['quests'] and journey['companion']=='ayaka'
write(work/'epilogue-sumeru.json', journey)

# Verify the chapter gate, the local reward gate and the legacy (pre-sightbook) bridge independently.
fast(town)
near(790)
chapter_state=s.story.quests[chapter]
chapter_state.status='active'
assert frame().storyAyakaMemory is None
chapter_state.status='complete'
bridge=s.story.quests['ayaka-join']
bridge.status='active'
assert frame().storyAyakaMemory is None
bridge.status='complete'
bridge.sights.favorite='sakura'
assert '桜並木' in frame().storyAyakaMemory
bridge.sights=None
assert frame().storyAyakaMemory is None
trail.cross('ina-firework-beach')
near(475)
design=s.story.quests['ina-window-fireworks'].fireworkDesign
design.color,design.shape='sea','ring'
assert '海の青' in frame().storyAyakaMemory and '輪' in frame().storyAyakaMemory
fast(town)
trail.cross('ina-festival-games')
near(838)
last=s.story.quests['ina-itto-three-games'].ittoContest.last[3]
last.player=0
assert frame().storyAyakaMemory != lines['ina-festival-games']
s.actors[2].hp=0
assert frame().storyAyakaMemory is None
assert len(set(lines.values())) == 5
proof = dict(startLevel=start['progression']['level'],lines=lines,chapterAndLocalGates=True,
             completedMain=main_ids,completedSide=side_ids,alternateChoices=True,
             sameSaveAllFive=True,legacyBridgeSilent=True,noRepeatRewards=True,
             cape=['lantern','sway','unmask','rest'],pauseAndRearm=True)
write(ROOT/'evidence/inazuma-revisits-lua.json', proof)
print(proof)
