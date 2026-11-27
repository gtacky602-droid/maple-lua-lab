"""Shared setup and persistence checks for earned Stygian rematches."""

from runtime import native, runtime
from test_earned_survey_itineraries import SurveyJourney
from test_earned_weekly_mechanics import equipment, read, rectangle_frame


class StygianRematch(SurveyJourney):
    def __init__(self, source, match):
        super().__init__(source.resolve(), runtime(), select_traveler=True)
        self.match = match
        self.spec = read('content/stygian-matches.json')['matches'][match]
        self.before = self.snapshot()
        self.loadout = equipment(self)
        self.bag = self.state.inventory['items']
        if len(self.bag) == 80:
            spare = min((item for item in self.bag.values() if not item.owner and not item.locked),
                        key=lambda item: (item.rarity, item.itemLv, item.id))
            self.act(f'artifact_sell:{spare.id}')
        self.old_items = {item.id for item in self.bag.values()}
        self.warp(self.spec['hub'])
        self.travel(self.spec['node'])
        self.mode = next(row for row in self.frame().stygianDesk.modes.values() if row.id == 'extreme')
        assert self.mode.available and self.mode.record.clears > 0
        self.prior = self.mode.record.clears
        self.currencies = self.state.progression.total, self.state.mora
        self.act(f'stygian_start:{match}:extreme:troupe')
        self.run = self.state.endgameRun
        self.frames = {}

    def capture(self, label, tick, cast):
        frame = self.frame()
        self.frames[label] = dict(
            tick=tick, node=self.state.story.node, camera=frame.camera, platforms=native(frame.platforms),
            stage=str(self.run.stage), move=cast.key, moveTick=cast.t, view=native(frame.endgameRun),
            png=native(frame.draws),
            profiles={key: rectangle_frame(self, key) for key in ('h48c32', 'h32c16')},
        )

    def verify_clear(self):
        reward = native(self.frame().endgameRun.matchReward)
        assert not reward['first'] and reward['bag']
        assert (reward['xp'], reward['mora']) == (self.mode.xp, self.mode.mora)
        xp, mora = self.currencies
        assert (self.state.progression.total - xp, self.state.mora - mora) == (self.mode.xp, self.mode.mora)
        new_items = [item for item in self.bag.values() if item.id not in self.old_items]
        assert len(new_items) == 1 and new_items[0].setId == 'troupe'
        self.restore()
        saved = self.snapshot()
        assert saved['endgame']['stygian'][f'{self.match}:extreme']['clears'] == self.prior + 1
        assert saved['story']['quests'] == self.before['story']['quests']
        assert saved['story']['visited'] == self.before['story']['visited']
        return reward
