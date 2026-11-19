"""Drive story gates using the same movement, jump and portal actions as the browser."""

class TrailWalk:
    def __init__(self, lua, core, state, edges, exits):
        self.core, self.state, self.edges, self.exits = core, state, edges, exits
        self.inputs = {d: lua.table_from({d: True}) for d in ('left', 'right', 'jump')}
        self.idle = lua.table()
        self.crossings = set()

    @property
    def actor(self):
        return self.state.actors[self.state.active]

    def approach(self, x, y, target):
        origin = self.state.story.node
        for _ in range(750):
            actor = self.actor
            assert actor.hp > 0 and self.state.story.node == origin, (origin, target, actor.hp)
            if abs(actor.x - x) > 9:
                movement = self.inputs['left' if actor.x > x else 'right']
                self.core.step(self.state, 1 / 60, movement)
                continue
            if abs(actor.y - y) < 10 and actor.ground:
                return
            if actor.ground:
                self.core.action(self.state, 'jump' if actor.y > y else 'drop')
            movement = self.inputs['jump'] if actor.y > y else self.idle
            self.core.step(self.state, 1 / 60, movement)
        raise AssertionError((origin, target, x, y, actor.x, actor.y, actor.ground))

    def cross(self, target):
        origin = self.state.story.node
        edge = self.edges[origin, target]
        self.approach(edge['x'], edge.get('y', 480), target)
        self.core.action(self.state, 'story_nearby_portal')
        if any(k in edge for k in ('boatSeconds', 'liftSeconds', 'waterwaySeconds')):
            ride = self.state.lift
            assert ride is not None and ride.destination == target, (origin, target, self.state.storyNotice)
            assert bool(ride.boat) == ('boatSeconds' in edge)
            assert bool(ride.waterway) == ('waterwaySeconds' in edge)
            for _ in range(360):
                if self.state.lift is None:
                    break
                self.core.step(self.state, 1 / 60, self.idle)
        assert self.state.story.node == target and self.state.lift is None, (
            origin, target, self.state.story.node, self.state.storyNotice)
        if 'arrivalX' in edge:
            assert (self.actor.x, self.actor.y) == (edge['arrivalX'], edge.get('arrivalY', 480))
        self.crossings.add((origin, target))

    def explore(self):
        visited = {self.state.story.node}

        def follow():
            origin = self.state.story.node
            for gate in self.exits[origin]:
                target = gate['to']
                pair = origin, target
                if pair not in self.edges or pair in self.crossings:
                    continue
                self.cross(target)
                if target not in visited:
                    visited.add(target)
                    follow()
                self.cross(origin)

        follow()
        return visited
