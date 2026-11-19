"""Local accounts and revocable, time-limited login sessions."""
from __future__ import annotations

from contextlib import contextmanager
import hashlib
import hmac
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
import uuid

from src.mock_emr import ROOT

ITERATIONS = 600_000
SESSION_SECONDS = 8 * 60 * 60
DEMO_PASSWORD = 'SepsisDemo2026!'
DEMO_ACCOUNTS = (
    {'username': 'bacsi.demo1', 'display_name': 'Bác sĩ trải nghiệm 01'},
    {'username': 'bacsi.demo2', 'display_name': 'Bác sĩ trải nghiệm 02'},
)


def auth_path() -> Path:
    return Path(os.environ.get('SEPSIS_AUTH_DB', ROOT / 'data' / 'accounts.sqlite3'))


@contextmanager
def _connection():
    path = auth_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_auth():
    with _connection() as con:
        con.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS login_limits (
                username TEXT PRIMARY KEY, failures INTEGER NOT NULL, locked_until REAL NOT NULL
            );
        ''')


def has_accounts() -> bool:
    init_auth()
    with _connection() as con:
        return con.execute('SELECT 1 FROM users LIMIT 1').fetchone() is not None


def ensure_demo_accounts() -> None:
    """Provision the advertised shared demo identities without changing existing users."""
    init_auth()
    with _connection() as con:
        existing = {row[0] for row in con.execute('SELECT username FROM users')}
    for account in DEMO_ACCOUNTS:
        if account['username'] in existing:
            continue
        encoded = _password_hash(DEMO_PASSWORD)
        with _connection() as con:
            con.execute('''INSERT INTO users(id,username,display_name,password_hash,created_at)
                VALUES(?,?,?,?,?) ON CONFLICT(username) DO NOTHING''',
                (uuid.uuid4().hex, account['username'], account['display_name'], encoded, time.time()))


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt if salt is not None else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS)
    return f'pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}'


def _verify_password(password: str, encoded: str | None) -> bool:
    if encoded is None:
        _password_hash(password, bytes(16))
        return False
    algorithm, iterations, salt, digest = encoded.split('$')
    if algorithm != 'pbkdf2_sha256':
        return False
    candidate = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(candidate.hex(), digest)


def create_first_account(username: str, display_name: str, password: str) -> None:
    username, display_name = username.strip().lower(), display_name.strip()
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,63}', username):
        raise ValueError('Tên đăng nhập từ 3–64 ký tự, gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.')
    if not display_name or len(display_name) > 100:
        raise ValueError('Nhập tên hiển thị, tối đa 100 ký tự.')
    if not 12 <= len(password) <= 128:
        raise ValueError('Mật khẩu cần từ 12 đến 128 ký tự.')
    encoded = _password_hash(password)
    init_auth()
    with _connection() as con:
        con.execute('BEGIN IMMEDIATE')
        if con.execute('SELECT 1 FROM users LIMIT 1').fetchone():
            raise ValueError('Tài khoản đầu tiên đã được tạo. Hãy đăng nhập để tiếp tục.')
        con.execute('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)',
                    (uuid.uuid4().hex, username, display_name, encoded, time.time()))


def sign_in(username: str, password: str) -> str:
    username = username.strip().lower()[:128]
    if len(password) > 128:
        raise ValueError('Tên đăng nhập hoặc mật khẩu không đúng.')
    init_auth()
    now = time.time()
    error = None
    token = None
    with _connection() as con:
        con.execute('BEGIN IMMEDIATE')
        limit = con.execute('SELECT * FROM login_limits WHERE username=?', (username,)).fetchone()
        if limit and limit['locked_until'] > now:
            raise ValueError('Đăng nhập chưa thành công nhiều lần. Vui lòng thử lại sau 5 phút.')
        user = con.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        valid = _verify_password(password, user['password_hash'] if user else None)
        if not valid or not user or not user['active']:
            failures = (limit['failures'] if limit and limit['locked_until'] == 0 else 0) + 1
            locked_until = now + 300 if failures >= 5 else 0
            con.execute('''INSERT INTO login_limits VALUES(?,?,?) ON CONFLICT(username)
                           DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until''',
                        (username, failures, locked_until))
            error = 'Tên đăng nhập hoặc mật khẩu không đúng.'
        else:
            con.execute('DELETE FROM login_limits WHERE username=?', (username,))
            con.execute('DELETE FROM auth_sessions WHERE expires_at<=?', (now,))
            token = secrets.token_urlsafe(32)
            con.execute('INSERT INTO auth_sessions VALUES(?,?,?)',
                        (hashlib.sha256(token.encode()).hexdigest(), user['id'], now + SESSION_SECONDS))
    if error:
        raise ValueError(error)
    return token


def session_user(token: str | None) -> dict | None:
    if not token:
        return None
    init_auth()
    with _connection() as con:
        user = con.execute('''SELECT u.id,u.username,u.display_name FROM users u
            JOIN auth_sessions s ON s.user_id=u.id
            WHERE s.token_hash=? AND s.expires_at>? AND u.active=1''',
            (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
    return dict(user) if user else None


def sign_out(token: str | None) -> None:
    if token:
        init_auth()
        with _connection() as con:
            con.execute('DELETE FROM auth_sessions WHERE token_hash=?',
                        (hashlib.sha256(token.encode()).hexdigest(),))
