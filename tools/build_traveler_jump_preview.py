"""Sample actual campaign jump poses and foot positions at 20 Hz."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runtime import ROOT, runtime

lua, core = runtime()
result = {}
for side in ("right", "left"):
    phases = {art.source: index for index, art in core.travelerRunArt[side].items()}
    result[side] = {}
    for motion, held_ticks in (("tap", 1), ("hold", 60)):
        state = core.new(16)
        core.action(state, "campaign")
        actor = state.actors[1]
        actor.x = 450
        samples = []
        for tick in range(90):
            if tick == 9:
                core.action(state, "jump")
            core.step(state, 1 / 60, lua.table_from({side: True, "jump": 9 <= tick < 9 + held_ticks}))
            if tick % 3:
                continue
            frame = core.frame(state, "sprite", "legacy")
            draw = next(d for d in frame.draws.values() if d.source in phases)
            if not samples:
                ground = draw.y
                start = actor.x
            samples.append({"pose": phases[draw.source], "lift": round(ground - draw.y, 2),
                            "distance": round(actor.x - start, 2), "ground": bool(actor.ground)})
            if tick > 15 and actor.ground:
                break
        assert samples[-1]["ground"] and any(not s["ground"] for s in samples)
        result[side][motion] = samples
    assert max(s["lift"] for s in result[side]["hold"]) > max(s["lift"] for s in result[side]["tap"])
(ROOT / "content/traveler-jump-preview.json").write_text(json.dumps(result, separators=(",", ":")) + "\n")
