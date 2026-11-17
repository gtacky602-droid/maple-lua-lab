import json
from runtime import runtime, ROOT, native
from savegame import validate_save
lua, c = runtime()
s = c.new(12)
c.action(s, 'story_start')
c.grantExp(s, sum(c.expNeeded(i) for i in range(1,140)), 'quest')
assert s.progression.level == 140
c.enterStoryNode(s, 'snezhnaya-hub')
save = native(c.checkpoint(s))
validate_save(save)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/wingspan-fixture.json').write_text(json.dumps(save),encoding='utf8')
