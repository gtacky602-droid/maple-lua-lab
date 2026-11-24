"""Play the four terrain quest chains with unmodified earned gear and movement."""

import json
import sys

from runtime import ROOT
from test_earned_branch_quests import Journey, lua, quests


BOSSES = {
    row['id']: row
    for row in json.loads((ROOT / 'content/field-boss-spawns.json').read_bytes())['fieldBosses']
}


def interact(trip, x, y=480, action='story_collect'):
    trip.approach(x, y, action)
    trip.act(action)


def start(quest, origin, file='lv165-save.json'):
    trip = Journey(file)
    trip.warp(origin)
    trip.travel(quests[quest]['hub'])
    assert trip.state.story.quests[quest] is None
    trip.act('story_accept:' + quest)
    return trip


def finish(trip, quest):
    legs = trip.travel(quests[quest]['hub'])
    trip.report(quest)
    return legs


def battle(trip, quest, index):
    mark = quests[quest]['itinerary'][index - 1]
    if boss := mark.get('boss'):
        slot = trip.state.fieldSlots[boss]
        trip.fight([slot.enemy], trip.totals(), rewarded=not BOSSES[boss].get('questRewardsOnly'))
        assert slot.phase == 'respawn'
    else:
        targets = mark.get('enemies') or [mark['enemy']]
        enemies = {e.spawnId: e for e in trip.state.enemies.values()}
        trip.fight([enemies[id] for id in targets], trip.totals())
    assert trip.state.story.quests[quest].count == index


def verify_reports(trip, *ids):
    trip.restore()
    assert all(trip.state.story.quests[id].status == 'complete' for id in ids)
    return trip.proof() | {'restoredReports': ids}


def enkanomiya():
    camp = 'enkanomiya-camp'
    shelf, room, gallery = 'enkan-guide-shelf', 'enkan-lamp-chamber', 'enkan-route-gallery'
    first, second, third = 'enkan-safety-leaflet', 'enkan-shadow-crossing', 'enkan-coverless-log'
    trip = start(first, 'inazuma-town')
    trip.confirm_lock(room, '報告')
    trip.travel(shelf)
    for index in (1, 2, 3):
        trip.mark(first, index)
    finish(trip, first)
    trip.act('story_accept:' + second)
    trip.travel(room)
    assert trip.frame().storyLocalLight.mode == 'bright' and len(trip.state.platforms) == 2
    trip.mark(second, 1)
    interact(trip, 224)
    assert trip.frame().storyLocalLight.mode == 'dark' and len(trip.state.platforms) == 3
    trip.mark(second, 2)
    trip.restore()
    assert trip.state.story.node == camp and trip.state.story.quests[second].count == 2
    trip.travel(room)
    assert trip.frame().storyLocalLight.mode == 'bright'
    interact(trip, 224)
    assert '灯りを消して' in trip.travel(gallery)[0]['hint']
    trip.mark(second, 3)
    finish(trip, second)
    trip.travel(gallery)
    trip.act('story_accept:' + third)
    trip.travel('enkan-tablet-hollow')
    battle(trip, third, 1)
    trip.mark(third, 2)
    trip.travel(gallery)
    trip.mark(third, 3)
    finish(trip, third)
    return verify_reports(trip, first, second, third)


def tunigi():
    camp, shelf, shop = 'tunigi-camp', 'tunigi-vent-shelf', 'tunigi-baffle-workshop'
    shelter, passage, vault = 'tunigi-return-shelter', 'tunigi-elite-passage', 'tunigi-fragment-vault'
    first, second, third = 'tunigi-vent-record', 'tunigi-return-design', 'tunigi-fragment-return'
    trip = start(first, 'sumeru-hub')
    trip.confirm_lock(shop, '報告')
    trip.travel(shelf)
    battle(trip, first, 1)
    for index in (2, 3, 4):
        mark = quests[first]['itinerary'][index - 1]
        trip.approach(mark['x'], mark['y'], first)
        for _ in range(mark['airflow']['correct']):
            trip.act('story_collect')
        assert trip.frame().storyAirflowCue.pattern == mark['airflow']['target']
        assert trip.state.story.quests[first].count == index
    finish(trip, first)
    trip.act('story_accept:' + second)
    trip.travel(shop)
    trip.approach(410, 480, second)
    for _ in range(3):
        trip.act('story_collect')
    trip.act('story_airflow_commit')
    trip.restore()
    assert trip.state.story.node == camp and trip.state.story.quests[second].count == 1
    trip.travel(shop)
    assert any(p.airflowDeck and not p.preview for p in trip.state.platforms.values())
    assert trip.travel(shelter)[0]['mode'] == 'lift' and trip.actor.y == 387
    trip.mark(second, 2)
    assert trip.travel(shop)[0]['mode'] == 'lift' and trip.actor.y == 393
    trip.travel(shelter)
    trip.mark(second, 3)
    finish(trip, second)
    trip.act('story_accept:' + third)
    trip.travel(passage)
    assert trip.guide(vault)['status'] == 'blocked'
    battle(trip, third, 1)
    trip.travel(vault)
    battle(trip, third, 2)
    trip.confirm_lock(passage, '崩れた壁')
    trip.mark(third, 3)
    assert '準備した退路' in trip.travel(camp)[0]['hint']
    trip.mark(third, 4)
    finish(trip, third)
    return verify_reports(trip, first, second, third)


def bygone():
    camp, chamber, hall = 'bygone-camp', 'bygone-resonance-chamber', 'bygone-inscribed-hall'
    gallery, archive = 'bygone-listening-gallery', 'bygone-bell-archive'
    first, second, third = 'bygone-stone-rubbings', 'bygone-lit-passage', 'bygone-sound-book'
    trip = start(first, 'fontaine-hub')
    (ROOT / 'work/earned-bygone-camp.json').write_text(
        json.dumps(trip.snapshot(), ensure_ascii=False)+'\n', encoding='utf8')
    trip.confirm_lock(hall, '報告')
    shallows, channel, ruin, pier = 'bygone-wp-68600', 'bygone-wp-68599', 'fon-wp-68345', 'fon-wp-68341'
    out = trip.travel(shallows)[0]
    back = trip.travel(camp)[0]
    assert '浅い水路へ潜る' in out['hint'] and '入口拠点へ浮上' in back['hint']
    trip.travel(shallows)
    trip.travel(channel)
    assert 'ノストイ地区の遺構へ戻る' in trip.travel(ruin)[0]['hint']
    assert '島南の桟橋へ浮上' in trip.travel(pier)[0]['hint']
    assert '島南から遺構に潜る' in trip.travel(ruin)[0]['hint']
    assert '往日の海へ続く' in trip.travel(channel)[0]['hint']
    trip.travel(camp)
    assert trip.travel(chamber)[-1]['mode'] == 'water'
    for index in (1, 2, 3, 4):
        trip.mark(first, index)
    finish(trip, first)
    trip.act('story_accept:' + second)
    trip.travel(hall)
    for x, y in ((1305, 480), (545, 480), (960, 393)):
        interact(trip, x, y)
    assert trip.state.story.quests[second].count == 1
    trip.restore()
    trip.travel(hall)
    assert any(p.resonanceBridge for p in trip.state.platforms.values())
    trip.travel(gallery)
    trip.mark(second, 2)
    trip.mark(second, 3)
    finish(trip, second)
    trip.act('story_accept:' + third)
    trip.travel(archive)
    battle(trip, third, 1)
    trip.mark(third, 2)
    trip.travel(camp)
    trip.mark(third, 3)
    finish(trip, third)
    return verify_reports(trip, first, second, third)


def novo():
    camp, works, passage, vault = 'novokichev-camp', 'novo-frozen-works', 'novo-drift-passage', 'novo-ice-vault'
    first, second, third = 'novo-expedition-ready', 'novo-equipment-route', 'novo-return-report'
    trip = start(first, 'snezhnaya-hub', 'lv200-save.json')
    trip.confirm_lock(works, '報告')
    interact(trip, 450, action='story_expedition_trial')
    trip.mark(first, 1)
    finish(trip, first)
    trip.act('story_accept:' + second)
    trip.travel(works)
    trip.mark(second, 1)
    trip.approach(620, 388, '巻き上げ機の中段')
    trip.act('jump')
    trip.tick(14, lua.table(jump=True, right=True))
    trip.approach(705, 294, '巻き上げ機の上段')
    battle(trip, second, 2)
    trip.mark(second, 3)
    trip.restore()
    assert trip.state.story.node == camp and trip.state.story.quests[second].count == 3
    trip.travel(works)
    assert len(trip.state.enemies) == 1 and len(trip.state.platforms) == 4
    battle(trip, second, 4)
    trip.mark(second, 5)
    trip.confirm_lock(passage, '報告')
    assert finish(trip, second)[0]['gateX'] == 1435
    trip.act('story_accept:' + third)
    trip.travel(passage)
    battle(trip, third, 1)
    trip.travel(vault)
    battle(trip, third, 2)
    trip.mark(third, 3)
    assert len(trip.travel(camp)) == 1
    finish(trip, third)
    return verify_reports(trip, first, second, third)


if __name__ == '__main__':
    routes = {run.__name__: run for run in (enkanomiya, tunigi, bygone, novo)}
    selected = sys.argv[1:] or list(routes)
    proof = {}
    for name in selected:
        proof[name] = routes[name]()
        print(name, len(proof[name]['reports']), 'quests reported', flush=True)
    if selected == list(routes):
        (ROOT / 'evidence/earned-terrain-quests-lua.json').write_text(
            json.dumps(proof, ensure_ascii=False, indent=2, sort_keys=True)+'\n', encoding='utf8')
