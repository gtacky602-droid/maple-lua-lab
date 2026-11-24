"""Play ranked encounters with the equipment and records earned from Lv1."""

from hashlib import sha256
import json

from runtime import ROOT, native, runtime
from savegame import validate_save
from tools.waypoint_test import TrailWalk


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def run():
    source = (ROOT / 'work/cap-fresh-route-draft/lv200-save.json').read_bytes()
    save = validate_save(json.loads(source))
    assert save['progression']['level'] == 200
    assert save['weapons']['equipped']['traveler'] == 'SW07'
    lua, core = runtime(draft_balance=True)
    exits = {node['id']: node['exits'] for node in read('content/story-graph.json')['nodes']}
    edges = {(origin, gate['to']): gate for origin, gates in exits.items() for gate in gates}
    advance = lua.eval('function(C,s,n) for _=1,n do C.step(s,1/60,{}) end end')
    fight = lua.eval('''function(C,s,b,status,mark)
        local phases, seen, moves = {}, {}, {}
        local first, contacts, lastSeq = nil, 0, s.seq
        local ticks = 0
        while ticks < 36000 and b.hp > 0 and s.returns == 0 and status() ~= 'failed' do
            local phase,move = mark()
            if phase and not seen[phase] then
                seen[phase]=true; phases[#phases+1]=phase
            end
            if move then moves[move]=true end
            local a=s.actors[s.active]
            local dx=b.x-a.x
            C.step(s,1/60,{
                attack=math.abs(dx)<122 and not b.invulnerable and not b.underground,
                left=dx < -63, right=dx > 63,
                jump=b.y<a.y-70 and a.ground and math.abs(dx)<130,
            })
            ticks=ticks+1
            local firstThisTick
            for i=#s.events,1,-1 do
                local e=s.events[i]
                if e.seq<=lastSeq then break end
                if e.kind=='hit' and e.target==b.id then
                    firstThisTick=e.value; contacts=contacts+1
                end
            end
            first=first or firstThisTick
            lastSeq=s.seq
        end
        if status()=='fighting' and b.hp<=0 then C.step(s,1/60,{}) end
        local rotation={}
        for move in pairs(moves) do rotation[#rotation+1]=move end
        table.sort(rotation)
        return {ticks=ticks, firstHit=first, contacts=contacts, phases=phases,
                moves=rotation, hpRemaining=b.hp, returns=s.returns}
    end''')

    def restore(data):
        state = core.restore(lua.table_from(data, recursive=True), 12)
        if state.active != 1:
            core.action(state, 'swap')
        if state.auto:
            core.action(state, 'auto')
        assert state.active == 1 and not state.auto
        return state

    def frame(state):
        return core.frame(state, 'sprite', 'legacy')

    def approach(state, origin, node):
        core.enterStoryNode(state, origin)
        trail = TrailWalk(lua, core, state, edges, exits)
        gate = edges[origin, node]
        trail.approach(gate['x'], gate.get('y', 480), node)
        assert frame(state).storyNearbyPortal.to == node
        return trail

    def totals(state):
        return state.progression.total, state.mora

    def rewards(state, before, xp, mora):
        assert totals(state) == (before[0] + xp, before[1] + mora)

    def checkpoint(state):
        return validate_save(native(core.checkpoint(state)))

    def play_weekly(state, key, node, preview_hp):
        before = totals(state)
        core.action(state, 'weekly_start:' + key)
        assert state.story.node == node
        slot = state.weeklySlots[key.split(':')[0]]
        assert frame(state).weeklyBoss.maxhp == slot.primary.maxhp == preview_hp
        result = native(fight(core, state, slot.primary, lambda: slot.phase,
                             lambda: (slot.stage or slot.form, slot.cast and (slot.cast.id or slot.cast.move.id))))
        result['maxHp'] = slot.primary.maxhp
        if slot.waitUntil:
            award = native(frame(state).weeklyBoss.reward)
            rewards(state, before, award['xp'], award['mora'])
            result['award'] = award
        return result

    def weekly(id, origin, node):
        rows = {}
        for index in range(1, 5):
            state = restore(save)
            approach(state, origin, node)
            desk = frame(state).weeklyDesk
            choice = desk.modes[index]
            assert choice.available and not choice.record
            key = f'{id}:{choice.id}'

            first = play_weekly(state, key, node, choice.hp)
            assert first['hpRemaining'] == 0 and 'award' in first, (key, first)
            first_award = first['award']
            assert first_award['first'] and first_award['xp'] == choice.xp + choice.firstXp
            assert first_award['mora'] == choice.mora + choice.firstMora
            state = restore(checkpoint(state))
            approach(state, origin, node)
            wait = frame(state).weeklyDesk.remaining
            assert wait > 0 and not frame(state).weeklyDesk.modes[index].available
            core.action(state, 'weekly_start:' + key)
            assert state.story.node == origin
            advance(core, state, int(wait * 60 + 2))
            retry = frame(state).weeklyDesk.modes[index]
            assert retry.available and retry.record.clears == 1
            again = play_weekly(state, key, node, retry.hp)
            assert again['hpRemaining'] == 0 and 'award' in again, (key, again)
            next_award = again['award']
            assert not next_award['first'] and next_award['xp'] == choice.xp
            assert next_award['mora'] == choice.mora
            assert checkpoint(state)['endgame']['weekly'][key]['clears'] == 2
            if choice.draftHp and choice.id == 'expert':
                expected = ['P1', 'INTERLUDE', 'P2'] if id == 'boss-29020101' else [1, 2, 3]
                assert first['phases'] == again['phases'] == expected, (key, first, again)
            if choice.draftHp and choice.id == 'advanced':
                transition = 'WA06' if id == 'boss-29020101' else 'WZ09'
                assert transition in first['moves'] and transition in again['moves'], (key, first, again)
            rows[choice.id] = dict(attackFactor=choice.attackFactor, remainingWaitAfterRestore=wait,
                                   first=first, repeat=again)
        return rows

    def entry_level_checks():
        rows = []
        for path, index in [('snez-fresh-route-draft/white-pass-save.json', 3),
                            ('cap-fresh-route-draft/lv180-save.json', 4)]:
            at_level = validate_save(read('work/' + path))
            for origin, node in [('mond-road', 'andrius-wolf-ring'),
                                 ('liyue-harbor', 'azhdaha-dragon-seal-arena')]:
                state = restore(at_level)
                approach(state, origin, node)
                desk = frame(state).weeklyDesk
                choice = desk.modes[index]
                assert choice.level == state.progression.level and choice.available
                if index == 3:
                    assert not desk.modes[4].available
                attack = [actor.atk for actor in state.actors.values()]
                result = play_weekly(state, f'{desk.id}:{choice.id}', node, choice.hp)
                assert result['hpRemaining'] == 0 and result['award']['first'], (node, result)
                rows.append(dict(node=node, mode=choice.id, level=choice.level, equippedAtk=attack, **result))
        return rows

    def shared_hp():
        rows = []
        for origin, node in [('mond-road', 'andrius-wolf-ring'),
                             ('liyue-harbor', 'azhdaha-dragon-seal-arena')]:
            host = restore(save)
            approach(host, origin, node)
            desk = frame(host).weeklyDesk
            hp = desk.modes[4].hp
            core.action(host, f'weekly_start:{desk.id}:expert')
            assert host.story.node == node
            room = core.newCoop(host)
            core.attachCoop(room, host)
            for _ in range(3):
                guest = restore(save)
                core.enterCoopNode(guest, node, 'expert')
                core.attachCoop(room, guest)
                assert frame(guest).weeklyBoss.maxhp == hp
                assert room.weeklySlot.primary.hp == room.weeklySlot.primary.maxhp == hp
            assert len(room.members) == 4
            rows.append(dict(node=node, maxHp=hp, participants=4))
        return rows

    def stygian():
        origin, node = 'mond-town', 'mond-stygian-dual-court'
        rows = {}
        for index in range(1, 5):
            state = restore(save)
            approach(state, origin, node).cross(node)
            choice = frame(state).stygianDesk.modes[index]
            assert choice.available and not choice.record
            key = 'farka:' + choice.id

            def play(state, artifact_set):
                before = totals(state)
                core.action(state, f'stygian_start:{key}:{artifact_set}')
                run = state.endgameRun
                result = native(fight(core, state, run.boss, lambda: run.status,
                                      lambda: (run.stage, run.cast and run.cast.key)))
                result['maxHp'] = run.boss.maxhp
                assert run.status == 'clear', (key, result, run.status)
                award = native(frame(state).endgameRun.matchReward)
                rewards(state, before, award['xp'], award['mora'])
                return result, award

            first, first_award = play(state, 'troupe')
            assert first_award['first'] and first_award['xp'] == choice.xp + choice.firstXp
            assert first_award['mora'] == choice.mora + choice.firstMora
            state = restore(checkpoint(state))
            approach(state, origin, node).cross(node)
            assert frame(state).stygianDesk.modes[index].record.clears == 1
            again, next_award = play(state, 'gladiator')
            assert not next_award['first'] and next_award['xp'] == choice.xp
            assert next_award['mora'] == choice.mora and next_award['set'] != first_award['set']
            assert checkpoint(state)['endgame']['stygian'][key]['clears'] == 2
            rows[choice.id] = dict(first=first | {'award':first_award}, repeat=again | {'award':next_award})
        return rows

    def normal():
        state = restore(save)
        id, origin, node = 'boss-20040201', 'anemo-approach', 'anemo-field-basin'
        approach(state, origin, node).cross(node)

        def play(state):
            slot = state.fieldSlots[id]
            before = totals(state)
            result = native(fight(core, state, slot.enemy, lambda: slot.phase,
                                 lambda: (slot.phase, slot.cast and slot.cast.move and slot.cast.move.id)))
            result['maxHp'] = slot.enemy.maxhp
            assert slot.phase == 'respawn' and result['hpRemaining'] == 0, result
            xp, mora = totals(state)
            return result | {'xp':xp - before[0], 'mora':mora - before[1]}

        first = play(state)
        prior_clears = checkpoint(state)['endgame']['bosses'][id]['clears']
        state = restore(checkpoint(state))
        approach(state, origin, node).cross(node)
        wait = frame(state).fieldBoss.remaining
        assert wait > 0 and state.fieldSlots[id].enemy.hp == 0
        advance(core, state, int(wait * 60 + 2))
        again = play(state)
        assert (first['xp'], first['mora']) == (again['xp'], again['mora'])
        assert checkpoint(state)['endgame']['bosses'][id]['clears'] == prior_clears + 1
        return dict(previousClears=prior_clears - 1, remainingWaitAfterRestore=wait,
                    first=first, repeat=again)

    state = restore(save)
    proof = dict(sourceSha256=sha256(source).hexdigest(), draftBalance=True, level=200,
                 weapon='SW07', companion=save['companion'],
                 equippedAtk=[actor.atk for actor in state.actors.values()],
                 anemoHypostasis=normal(),
                 andrius=weekly('boss-29020101', 'mond-road', 'andrius-wolf-ring'),
                 azhdaha=weekly('boss-29040101', 'liyue-harbor', 'azhdaha-dragon-seal-arena'),
                 stygianFarka=stygian(),
                 atEntryLevel=entry_level_checks(), sharedBossHp=shared_hp())
    (ROOT / 'evidence/cap-boss-encounters-draft.json').write_text(
        json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


if __name__ == '__main__':
    run()
