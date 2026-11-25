"""Compare the daily eligibility of heavy patrols and the optional elite rooms."""
from tools.domain_terrain_test import core, start, write

cases = {
    'fontaine': ('fontaine-hub', 151, '54430774ef7c4e43bfc0a8095844aa27', 20804,
                 'daily-fon-patrol', 'daily-fon-land-elites',
                 {f'branch-hunt-{n}': (1,0) for n in (68600,68603,68607)}),
    'liyue': ('liyue-harbor', 86, 'd72ac5349dd6498f9e25ea3dfff820e1', 20801,
              'daily-liyue-cargo', 'daily-liyue-relics',
              {'branch-hunt-64825': (1,0), 'branch-hunt-64825-pocket-1': (1,1),
               'branch-hunt-64824': (1,0), 'branch-hunt-64824-pocket-1': (1,1),
               'branch-hunt-64824-pocket-2': (0,0), 'branch-hunt-64824-pocket-3': (0,0)})
}
report = {}
for hub,level,profile,day,main,elite,stages in cases.values():
    for stage,expected in stages.items():
        state=start(level, [], hub)
        core.dailyBind(state, profile, day, None)
        for quest in (main,elite):
            core.action(state,'daily_accept:'+quest)
        slots={row.id:row for row in state.daily.ledger.activeSlots.values()}
        core.enterStoryNode(state,stage)
        enemy=state.enemies[1]
        assert core.defeatEnemy(state,enemy,1)
        assert (slots[main].count,slots[elite].count)==expected,stage
        report[stage]={'placement':enemy.spawnId,main:slots[main].count,elite:slots[elite].count}
write('evidence/branch-courts-daily-lua.json',report)
print('All nine hunts and rooms credited their regional commissions correctly.')
