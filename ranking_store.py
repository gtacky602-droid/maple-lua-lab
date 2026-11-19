"""Local authority for the lifetime and weekly base-EXP standings."""
from datetime import date
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3

from daily_store import period_at

COOKIE = 'maple_exp_profile'
TOKEN = re.compile(r'[0-9a-f]{64}')
# Unix day 4 was Monday. Match the local daily reset boundary.
FIRST_MONDAY = 4
EPOCH = date(1970, 1, 1).toordinal()


def week_start(unix_time=None):
    day = period_at(unix_time)
    return day - (day - FIRST_MONDAY) % 7


def default_path():
    data_dir = Path(os.environ.get('LOCALAPPDATA') or Path.home() / '.local' / 'share')
    return data_dir / 'MapleLuaLab' / 'exp-ranking.sqlite3'


def normalize_numbers(value):
    # Browsers serialize integral JSON numbers without a decimal suffix.
    if isinstance(value, dict):
        return {key: normalize_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_numbers(item) for item in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


class RankingStore:
    def __init__(self, path):
        if path != ':memory:':
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS exp_players (
            id INTEGER PRIMARY KEY, credential TEXT NOT NULL UNIQUE,
            best INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS exp_weeks (
            week INTEGER NOT NULL, player_id INTEGER NOT NULL, score INTEGER NOT NULL,
            PRIMARY KEY (week, player_id)
          );
          CREATE TABLE IF NOT EXISTS exp_settings (
            key TEXT PRIMARY KEY, value BLOB NOT NULL
          );
        """)
        with self.db:
            self.db.execute("INSERT OR IGNORE INTO exp_settings VALUES ('checkpoint', ?)", (secrets.token_bytes(32),))
        self.key, = self.db.execute("SELECT value FROM exp_settings WHERE key='checkpoint'").fetchone()

    def account(self, token):
        if not isinstance(token, str) or not TOKEN.fullmatch(token):
            return None
        row = self.db.execute('SELECT id FROM exp_players WHERE credential=?',
                              (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        return row[0] if row else None

    def register(self):
        token = secrets.token_hex(32)
        with self.db:
            cursor = self.db.execute('INSERT INTO exp_players(credential) VALUES (?)',
                                     (hashlib.sha256(token.encode()).hexdigest(),))
        return cursor.lastrowid, token

    def proof(self, player, checkpoint):
        message = json.dumps([player, normalize_numbers(checkpoint)],
                             ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        return hmac.new(self.key, message.encode('utf8'), 'sha256').hexdigest()

    def verify(self, player, checkpoint, proof):
        return bool(player and isinstance(proof, str) and TOKEN.fullmatch(proof)
                    and hmac.compare_digest(self.proof(player, checkpoint), proof))

    def record(self, player, base_xp, week):
        # One write transaction across processes. Older checkpoints or parallel tabs
        # can resume play, and only a new personal maximum advances either table.
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            previous, = self.db.execute('SELECT best FROM exp_players WHERE id=?', (player,)).fetchone()
            if base_xp <= previous:
                return
            self.db.execute('UPDATE exp_players SET best=? WHERE id=?', (base_xp, player))
            self.db.execute("""
              INSERT INTO exp_weeks (week, player_id, score) VALUES (?, ?, ?)
              ON CONFLICT(week, player_id) DO UPDATE SET score=score+excluded.score
            """, (week, player, base_xp - previous))

    @staticmethod
    def label(player):
        return f'旅人 {player:04d}'

    def standings(self, player, week):
        def board(source, parameters):
            query = f"""
              WITH scores AS ({source}), ranked AS (
                SELECT id, score, RANK() OVER (ORDER BY score DESC) AS place
                FROM scores WHERE score>0
              )
              SELECT id, score, place FROM ranked WHERE place<=10 OR id=?
              ORDER BY score DESC, id
            """
            entries = []
            own = None
            for id_, score, place in self.db.execute(query, (*parameters, player)):
                row = dict(name=self.label(id_), score=score, place=place, own=id_ == player)
                if id_ == player:
                    own = row
                if place <= 10 and len(entries) < 10:
                    entries.append(row)
            return dict(entries=entries, own=own)

        with self.db:
            self.db.execute('BEGIN')
            return dict(
                player=self.label(player) if player else None,
                weekStart=date.fromordinal(EPOCH + week).isoformat(),
                total=board('SELECT id, best AS score FROM exp_players', ()),
                weekly=board('SELECT player_id AS id, score FROM exp_weeks WHERE week=?', (week,)),
            )

    def close(self):
        self.db.close()
