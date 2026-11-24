"""Observe real acceptance, reports and reloads beyond the design-ID quest suite."""

from collections import defaultdict
from contextlib import contextmanager
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from runtime import ROOT
from test_quest_design_playthrough import content, run_playthrough


SCENARIOS = {
    'regional_surveys': (
        'mondstadt_waypoints', 'liyue_waypoints', 'inazuma_waypoints', 'sumeru_waypoints',
        'fontaine_waypoints', 'natlan_waypoints', 'nod_waypoints', 'snezhnaya_waypoints',
        'chasm_waypoints',
    ),
    'field_routes': (
        'threadline', 'snow_rail', 'fontaine_bubbles', 'fontaine_corrouge', 'natlan_cliff_trials',
        'natlan_toyac_legends', 'natlan_north_trials', 'natlan_wayob_duo', 'natlan_atocpan_totem',
        'natlan_northwest_legends', 'natlan_final_legends', 'natlan_highland_legends',
        'nod_first_field_legends', 'nod_north_field_legends', 'snez_first_field_legends',
        'snez_late_field_legends', 'final_field_legends',
    ),
    'weekly': (
        'dvalin_weekly', 'andrius_weekly', 'childe_weekly', 'azhdaha_weekly',
        'signora_weekly', 'raiden_weekly', 'shouki_weekly', 'apep_weekly',
        'narwhal_weekly', 'knave_weekly', 'primal_fire_weekly', 'gate_weekly',
        'false_moon_weekly', 'heretic_weekly', 'tide_surveyor', 'twin_shuttle_loom',
    ),
    'stygian': (
        'stygian_farka', 'stygian_wanderer', 'stygian_ronova', 'stygian_rerir',
        'stygian_xbalanque', 'stygian_capitano', 'stygian_beidou',
    ),
}


def evidence(name):
    return json.loads((ROOT / 'evidence' / name).read_text(encoding='utf8'))


@contextmanager
def redirect_scenario_outputs():
    write_text = Path.write_text
    with TemporaryDirectory(prefix='maple-quest-playthrough-') as folder:
        def scenario_write(path, data, *args, **kwargs):
            if path.is_relative_to(ROOT):
                relative = path.relative_to(ROOT)
                if relative.parts[0] in ('evidence', 'work'):
                    path = Path(folder) / relative
                    path.parent.mkdir(parents=True, exist_ok=True)
            return write_text(path, data, *args, **kwargs)

        with patch.object(Path, 'write_text', scenario_write):
            yield


def main():
    quests = {q['id']: q for q in content('story-graph.json')['quests']}
    legacy = {id for id, quest in quests.items() if quest.get('legacyOnly')}
    previous = evidence('quest-design-playthrough.json')
    normal = evidence('normal-boss-lifecycle-lua.json')
    prior = {row['quest_id'] for row in previous['quest_playthroughs'].values() if row['scripts']} | {
        row['commission'] for row in normal['cases'].values() if row['commission']
    }
    daily = {q['id'] for q in content('daily-quests.json')['quests']}
    assert daily <= prior
    prior_story = prior & quests.keys()
    study = {id: q for id, q in quests.items() if id not in prior_story | legacy}
    reported, restored = defaultdict(list), defaultdict(list)
    with redirect_scenario_outputs():
        for group in SCENARIOS.values():
            for name in group:
                print(f'Running test_{name}.py', flush=True)
                run_playthrough(name, study, reported, restored)

    route_trials = {name: sorted(evidence(name)['cases']) for name in (
        'visit-quest-round-trips-lua.json',
        'hunt-quest-round-trips-lua.json',
        'fontaine-access-surveys-lua.json',
    )}
    routes = {id for cases in route_trials.values() for id in cases}
    active = set(quests) - legacy
    linked = prior_story | set(reported) | routes
    legacy_trials = evidence('hunt-quest-round-trips-lua.json')['legacyCases']
    assert set(legacy_trials) == legacy
    assert linked <= active
    result = {
        'scope': 'The listed Lua scenarios accepted each new quest and reported with full objective progress and a payout. Reload evidence means the scenario also restored a completed quest after observing payout. Scenarios may use prepared levels, visits or combat states.',
        'authored_story_quests': len(quests),
        'newly_acceptable_story_quests': len(active),
        'legacy_save_only': legacy_trials,
        'daily_quests_with_report_links': len(daily),
        'prior_story_report_links': len(prior_story),
        'new_quest_reports': {
            id: {'goal': study[id]['goal'], 'scripts': scripts, 'restore_scripts': restored[id]}
            for id, scripts in sorted(reported.items())
        },
        'direct_route_trials': route_trials,
        'story_quests_with_report_links': len(linked),
        'story_quests_without_report_links': sorted(active - linked),
    }
    (ROOT / 'evidence/authored-quest-playthrough.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8',
    )
    print(f'{len(linked)}/{len(active)} story quests linked to report evidence, plus {len(legacy)} legacy saves and {len(daily)} daily quests.')


if __name__ == '__main__':
    main()
