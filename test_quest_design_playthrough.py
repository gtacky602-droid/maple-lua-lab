"""Collect acceptance and payout evidence from the existing quest playthroughs."""

from collections import defaultdict
import json
import runpy
import traceback

import runtime
from runtime import ROOT


PLAYTHROUGHS = {
    'mondstadt': (
        'mondstadt_m01', 'mondstadt_m02', 'mondstadt_m03', 'mondstadt_s01',
        'mond_return_box', 'mondstadt_s03', 'mond_night_banner', 'mondstadt_s05',
    ),
    'liyue': (
        'liyue_m01', 'liyue_m02', 'liyue_m03', 'liyue_s01', 'liyue_s02',
        'liyue_s03', 'liyue_s04', 'liyue_s05',
    ),
    'inazuma': (
        'inazuma_m01', 'inazuma_m02', 'inazuma_m03', 'inazuma_s01',
        'ina_window_fireworks', 'ina_sayu_route', 'ina_itto_three_games', 'ina_walking_teahouse',
    ),
    'sumeru': (
        'sumeru_canopy', 'sumeru_wanderer_survey', 'sumeru_observation_visitors',
        'sumeru_collei_guide', 'sumeru_kaveh_model', 'sumeru_nahida_map',
    ),
    'fontaine': (
        'fontaine_delivery', 'fontaine_understage', 'fontaine_finale', 'fontaine_emilie_scent',
        'fontaine_furina_cues', 'fontaine_navia_photo', 'fontaine_lyney_magic', 'fontaine_freminet_dive',
    ),
    'natlan': (
        'natlan_flag_course', 'natlan_two_trials', 'natlan_sunset_duel', 'natlan_kachina_charms',
        'natlan_mualani_surf', 'natlan_kinich_ambush', 'natlan_xilonen_course', 'natlan_iansan_training',
    ),
    'nod_krai': (
        'nod_shallows', 'nod_moon_paths', 'nod_moon_vault', 'columbina_detour', 'nod_appraisal',
        'nod_moon_rumor', 'nod_moon_bloom', 'nod_lantern_patrol',
    ),
    'snezhnaya': ('white_pass_chapter', 'sne_mitya_observation', 'sne_snow_match'),
    'high_difficulty': (
        'spine_observation', 'chenyu_tea_route', 'enkan_lamp_route', 'tunigi_excavation',
        'bygone_resonance', 'windward_branch', 'cap_stopover', 'moonlit_garden', 'ice_expedition',
    ),
    'hidden_worlds': ('golden_island_route', 'veluriyam_trolley', 'simulanka_folds'),
    'growth': ('growth_foundations', 'growth_practice', 'growth_light', 'growth_endgame'),
    'daily': tuple('daily_' + name for name in (
        'mondstadt', 'liyue', 'inazuma', 'sumeru', 'fontaine', 'natlan', 'nod_krai', 'snezhnaya',
    )),
}

OBSERVE_ACTIONS = """
return function(C, observe)
 local action,restore=C.action,C.restore
 local function slot(rows,id)
  for _,r in ipairs(rows) do if r.id==id then return r end end
 end
 function C.restore(data,density)
  local s=restore(data,density)
  if s.story and s.story.quests then
   for id,record in pairs(s.story.quests) do
    if record.status=='complete' then observe('restored',id,record.count) end
   end
  end
  return s
 end
 function C.action(s,key)
  local source,command,id=key:match('^(%a+)_(%a+):([%w%-]+)$')
  if source=='story' and (command=='accept' or command=='report') then
   local before=s.story and s.story.quests and s.story.quests[id]
   local status=before and before.status
   local count=before and before.count
   local xp,mora=s.progression and s.progression.questXp,s.mora
   action(s,key)
   local after=s.story.quests[id]
   if command=='accept' and not status and after and after.status=='active' then
    observe('accepted',id,after.count)
   elseif command=='report' and status=='active' and after.status=='complete'
       and (s.progression.questXp>xp or s.mora>mora) then
    observe('paid',id,count,s)
   end
  elseif source=='daily' and (command=='accept' or command=='claim' or command=='carry') and s.daily then
   local ledger=s.daily.ledger
   local rows=command=='carry' and ledger.carrySlots or ledger.activeSlots
   local known=slot(rows,id)
   local xp=ledger.earnedXp
   action(s,key)
   local after=slot(rows,id)
   if command=='accept' and not known and after then
    observe('accepted',id,after.count)
   elseif known and ledger.earnedXp>xp then
    observe('paid',id,known.count)
   end
  else return action(s,key) end
 end
end
"""


def content(name):
    return json.loads((ROOT / 'content' / name).read_text(encoding='utf8'))


def run_playthrough(name, quests, coverage, restored=None, *, after_report=None):
    script = ROOT / f'test_{name}.py'
    events = defaultdict(dict)
    original = runtime.runtime

    def observe(event, id, count):
        if id not in quests:
            return
        if event == 'paid':
            assert count == quests[id]['goal'], (script.name, id, count)
        if event == 'restored' and 'paid' not in events[id]:
            return
        events[id][event] = count

    def instrumented_runtime(**options):
        lua, core = original(**options)

        def observe_session(event, id, count, state=None):
            observe(event, id, count)
            if after_report and state is not None and 'accepted' in events.get(id, {}):
                after_report(lua, core, state, id)

        lua.execute(OBSERVE_ACTIONS)(core, observe_session)
        return lua, core

    runtime.runtime = instrumented_runtime
    try:
        runpy.run_path(str(script), run_name='__main__')
    finally:
        runtime.runtime = original

    for id, observed in events.items():
        if {'accepted', 'paid'} <= observed.keys():
            coverage[id].append(script.name)
            if restored is not None and observed.get('restored') == quests[id]['goal']:
                restored[id].append(script.name)


def main():
    quests = {q['id']: q for q in content('story-graph.json')['quests'] + content('daily-quests.json')['quests']
              if 'designId' in q}
    assert len(quests) == 153
    coverage = defaultdict(list)
    restored = defaultdict(list)
    failed = []
    for scripts in PLAYTHROUGHS.values():
        for name in scripts:
            print(f'Running test_{name}.py', flush=True)
            try:
                run_playthrough(name, quests, coverage, restored)
            except Exception:
                traceback.print_exc()
                failed.append(name)
    missing = [q['designId'] for id, q in quests.items() if not coverage[id]]
    result = {
        'scope': 'Acceptance and payout at the Lua action boundaries in the same scenario script. Restore links cover story quests observed complete after payout in that script. Scenario fixtures can supply level, prior progress, positioning or combat conditions.',
        'quest_count': len(quests),
        'scenario_count': sum(map(len, PLAYTHROUGHS.values())),
        'quest_playthroughs': {
            q['designId']: {
                'quest_id': id, 'goal': q['goal'], 'scripts': coverage[id], 'restore_scripts': restored[id],
            }
            for id, q in sorted(quests.items(), key=lambda item: item[1]['designId'])
        },
    }
    if missing or failed:
        result.update(missing=sorted(missing), failed_scripts=failed)
    output = 'work/quest-design-playthrough-incomplete.json' if missing or failed else 'evidence/quest-design-playthrough.json'
    (ROOT / output).write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    assert not missing and not failed, f'Incomplete playthroughs: {sorted(missing)}; failed scripts: {failed}'
    print(f'Observed acceptance and Lua payout for {len(quests)} mapped quests.')


if __name__ == '__main__':
    main()
