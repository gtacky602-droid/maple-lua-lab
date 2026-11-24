"""Check save and duplicate-report behavior for authored quests lacking a restore link."""

from collections import defaultdict
import json

from runtime import ROOT, native
from savegame import validate_save
from test_authored_quest_playthrough import redirect_scenario_outputs
from test_quest_design_playthrough import content, run_playthrough


def reward_state(state):
    return state.progression.questXp, state.mora, state.inventory.upgradeOre


def check_restart(lua, core, state, quest):
    paid = state.story.quests[quest]
    snapshot = validate_save(native(core.checkpoint(state)))
    restored = core.restore(lua.table_from(snapshot, recursive=True), 12)
    record = restored.story.quests[quest]
    assert record.status == 'complete' and record.count == paid.count and record.cycles == paid.cycles
    assert reward_state(restored) == reward_state(state), quest
    checkpoint = restored.story.node
    if checkpoint != state.story.node:
        core.enterStoryNode(restored, state.story.node)
    core.action(restored, 'story_report:' + quest)
    assert reward_state(restored) == reward_state(state), quest
    assert record.status == 'complete' and record.count == paid.count and record.cycles == paid.cycles
    return dict(questCount=record.count, reportNode=state.story.node, restoredAt=checkpoint,
                paidCycles=record.cycles, duplicateReward=False)


def main():
    quests = {q['id']: q for q in content('story-graph.json')['quests']}
    evidence = ROOT / 'evidence'
    authored = json.loads((evidence / 'authored-quest-playthrough.json').read_text(encoding='utf8'))
    design = json.loads((evidence / 'quest-design-playthrough.json').read_text(encoding='utf8'))
    links = dict(authored['new_quest_reports'])
    links.update((row['quest_id'], row) for row in design['quest_playthroughs'].values()
                 if row['quest_id'] in quests)
    by_script = defaultdict(set)
    for quest, row in links.items():
        if not row['restore_scripts']:
            by_script[row['scripts'][0]].add(quest)
    results = {}
    with redirect_scenario_outputs():
        for script, ids in sorted(by_script.items()):
            print(f'Checking the saved report in {script}', flush=True)
            coverage = defaultdict(list)

            def after_report(lua, core, state, quest):
                results[quest] = check_restart(lua, core, state, quest) | {'script': script}

            run_playthrough(script.removeprefix('test_').removesuffix('.py'),
                            {id: quests[id] for id in ids}, coverage, after_report=after_report)
            assert ids <= results.keys() and ids <= coverage.keys(), (script, ids - coverage.keys())
    report = {
        'scope': 'Each existing report scenario is replayed. The observed payout is saved through the checkpoint validator, restored in a separate state, and the report is retried at the same hub.',
        'tested': len(results),
        'cases': dict(sorted(results.items())),
    }
    (evidence / 'quest-report-restart-lua.json').write_text(
        json.dumps(report, indent=2) + '\n', encoding='utf8',
    )
    print(f'{len(results)} quests restored without duplicate payout.')


if __name__ == '__main__':
    main()
