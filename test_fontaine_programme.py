"""Measure theatre draw packets without moving the camera between render modes."""
import json
from runtime import ROOT, native, runtime
from savegame import validate_save
from test_regional_quest_prop_packing import measure

lua, core = runtime()

results = {}
exhibits = {}
for path, size in [('work/fontaine-revisits-route/three-exhibits.json', 3),
                   ('evidence/fontaine-revisit-save.json', 5)]:
    save = validate_save(json.loads((ROOT/path).read_bytes()))
    state = core.restore(lua.table_from(save, recursive=True), 12)
    core.enterStoryNode(state, 'fontaine-grand-stage')
    # Capture fixed scene positions. The separate browser check walks to the shelf.
    actor = state.actors[state.active]
    actor.x, actor.y, state.camera = 350, 480, 0
    frame = core.frame(state, 'sprite', 'legacy')
    rows = native(frame.storyTheaterProgramme.entries)
    assert len(rows) == size
    exhibits[str(size)] = rows
    assert all('asset' in row and (ROOT/'assets'/(row['asset']+'-sprites-v1.json')).is_file() for row in rows)
    results[str(size)] = {p:measure(core,state,p) for p in ('legacy','h48c32','h32c16')}
    if size == 5:
        details = ' '.join(row['detail'] for row in rows)
        assert all(choice in details for choice in ('逆光の影絵','菓子を囲む休憩写真','珊瑚のくぼみ','木のぬくもり'))
        before = state.progression.total, state.mora
        core.action(state, 'story_photo_print')
        print_view = core.frame(state,'sprite','legacy').storyNaviaPhoto
        assert print_view.panel=='read' and print_view.posted=='candid'
        assert len(print_view.preview.candid)==6 and print_view.preview.formal is None
        core.action(state, 'story_photo_close')
        assert (state.progression.total,state.mora)==before and state.photoPanel is None
        state.camera = 725
        assert core.frame(state, 'sprite', 'legacy').storyTheaterProgramme is None
        results['grand-stage'] = {p:measure(core,state,p) for p in ('legacy','h48c32','h32c16')}
# Separate fixture for a chapter completed before any optional reports.
for quest in ('fon-furina-cues','fon-lyney-magic','fon-navia-photo','fon-freminet-dive','fon-emilie-scent'):
    state.story.quests[quest]=None
state.camera=0
assert len(core.frame(state,'sprite','legacy').storyTheaterProgramme.entries)==0
core.action(state,'story_photo_print')
assert not state.photoPanel
# The three identical painted waves in the initial stage flat should share one batch.
state = core.new(12)
core.action(state,'story_start')
core.enterStoryNode(state,'fontaine-stage-wings')
state.camera=435
results['stage-wings']={p:measure(core,state,p) for p in ('legacy','h48c32','h32c16')}
assert all(r['stamps']>r['batches'] for r in results['stage-wings'].values())
(ROOT/'evidence/fontaine-theater-packing.json').write_text(json.dumps(results,indent=2)+'\n','utf8')
(ROOT/'evidence/fontaine-theater-exhibits.json').write_text(json.dumps(exhibits,ensure_ascii=False,indent=2)+'\n','utf8')
print(json.dumps(results,indent=2))
