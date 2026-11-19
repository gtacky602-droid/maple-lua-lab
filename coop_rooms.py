"""Room membership and server clock for the local Lua cooperative preview."""

from dataclasses import dataclass, field
import json
import secrets

from runtime import ROOT, native


RULES = json.loads((ROOT / 'content/coop-preview.json').read_text(encoding='utf8'))
TICK = 1 / 60
MAX_TICKS = 6


@dataclass
class Room:
    code: str
    lua: object
    core: object
    world: object
    last: float
    members: list = field(default_factory=list)
    lag: float = 0


def location(env):
    story = env['state'].story
    return story.node if story and story.active else None


class CoopRooms:
    def __init__(self):
        self.rooms = {}

    def attach(self, room, env):
        env['coop_room'] = room
        env['coop_member'] = room.core.attachCoop(room.world, env['state'])
        if not env.get('coop_rng_seeded'):
            env['state'].inventory.rng = secrets.randbelow(2147483646) + 1
            env['coop_rng_seeded'] = True
        room.members.append(env)
        env['coop_notice'] = '協力部屋に入りました。'

    def detach(self, env, notice=None):
        room = env.pop('coop_room', None)
        if room is None:
            return
        member = env.pop('coop_member')
        room.core.detachCoop(member)
        room.members[:] = [row for row in room.members if row is not env]
        if not room.members:
            self.rooms.pop(room.code)
        env['coop_notice'] = notice or '協力部屋から出ました。'

    def leave_field(self, env):
        room = env.get('coop_room')
        if room and not room.core.sharesCoopField(env['state']):
            self.detach(env, 'マップを移動して協力部屋から出ました。')

    def command(self, env, action, now):
        if action == 'coop_leave':
            self.detach(env)
            return True
        joining = action.startswith('coop_join:')
        if not joining and action != 'coop_create':
            return False

        def unavailable(message):
            env['coop_notice'] = message
            return True

        if env.get('coop_room'):
            return unavailable('すでに協力部屋にいます。')
        site = location(env)
        if site not in RULES['nodes'] or env['rank_player']:
            return unavailable('通常の冒険で指定の狩場に着くと参加できます。')
        if joining:
            code = action.removeprefix('coop_join:').upper()
            room = self.rooms.get(code)
            if not room or room.world.node != site:
                return unavailable('同じ狩場にある部屋の合言葉を確認してください。')
            if len(room.members) >= RULES['capacity']:
                return unavailable('この部屋は満員です。')
            if any(row['dailyProfile'] == env['dailyProfile'] for row in room.members):
                return unavailable('別のブラウザプロフィールで参加してください。')
            # Migrate at the map boundary using the normal checkpoint schema.
            source = env['state']
            checkpoint = native(env['core'].checkpoint(source))
            state = room.core.restore(room.lua.table_from(checkpoint, recursive=True), source.density)
            room.core.enterStoryNode(state, site)
            for index in (1, 2):
                actor, original = state.actors[index], source.actors[index]
                actor.x, actor.y, actor.vy = original.x, original.y, original.vy
                actor.dir, actor.ground = original.dir, original.ground
                actor.hp, actor.inv = min(actor.maxhp, original.hp), original.inv
            env.update(lua=room.lua, core=room.core, state=state)
        else:
            code = secrets.token_hex(4).upper()
            while code in self.rooms:
                code = secrets.token_hex(4).upper()
            lua, core, state = env['lua'], env['core'], env['state']
            room = Room(code, lua, core, core.newCoop(state), now)
            self.rooms[code] = room
        self.attach(room, env)
        return True

    def participants(self, env, now):
        room = env.get('coop_room')
        if room is None:
            return [env]
        live = []
        for row in room.members:
            online = not row.get('retire_at') and now - row['last'] < RULES['presenceSeconds']
            member = row['coop_member']
            member.online = online
            if now - row['last'] >= RULES['inputLeaseSeconds'] or not online:
                member.input = None
            if online:
                live.append(row)
        return live

    def advance(self, room, now):
        room.lag += min(max(0, now - room.last), MAX_TICKS * TICK)
        room.last = now
        steps = min(MAX_TICKS, int((room.lag + 1e-8) / TICK))
        room.lag = max(0, room.lag - steps * TICK)
        for _ in range(steps):
            room.core.stepCoop(room.world, TICK)
        for env in room.members[:]:
            self.leave_field(env)

    def view(self, env):
        site = location(env)
        room = env.get('coop_room')
        view = dict(eligible=site in RULES['nodes'] and not env['rank_player'],
                    sites=list(RULES['nodes'].values()), capacity=RULES['capacity'],
                    notice=env.get('coop_notice'))
        if room:
            party = native(room.core.coopFrame(env['state']))
            party['peers'] = party['peers'] or []
            for peer in party['peers']:
                peer['actors'] = peer['actors'] or []
            view.update(party, code=room.code)
        return view
