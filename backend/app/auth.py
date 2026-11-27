import base64
import hashlib
import hmac
import re
import secrets
import time
from uuid import uuid4
from sqlalchemy import select, insert, update, delete

from backend.app.db import tables as t
from backend.app.db.store import ClinicalError

COOKIE = 'sepsis_session'
SESSION_SECONDS = 8*3600
DEMO = [dict(username=f'bacsi.demo{i}', displayName=f'Bác sĩ trải nghiệm 0{i}', password='SepsisDemo2026!') for i in (1, 2)]


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    # Node scryptSync used the hexadecimal salt as a UTF-8 string, not raw bytes.
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()
    return f'scrypt${salt}${digest}'


def verify_password(password, encoded):
    try:
        algorithm, salt, expected = encoded.split('$')
        return algorithm == 'scrypt' and hmac.compare_digest(password_hash(password, salt).split('$')[2], expected)
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class Auth:
    def __init__(self, store):
        self.store = store
        self.dummy = password_hash(secrets.token_urlsafe(32))
        if store.settings.demo_accounts:
            for account in DEMO:
                self.provision(account['username'], account['password'], account['displayName'], demo=True)

    def provision(self, username, password, name, role='doctor', demo=False, replace=False):
        username = username.strip().lower()
        if not re.fullmatch(r'[a-z0-9._-]{3,80}', username) or not 12 <= len(password) <= 200 or not name.strip() or role not in ('admin','doctor','viewer'):
            raise ValueError('Invalid account configuration')
        with self.store.transaction() as c:
            if self.store.postgres:
                # Protect first-account provisioning when API and worker start together.
                from sqlalchemy import text
                c.execute(text('SELECT pg_advisory_xact_lock(73573110)'))
            row = c.execute(select(t.users).where(t.users.c.username == username)).mappings().first()
            if row:
                if replace:
                    c.execute(update(t.users).where(t.users.c.id == row['id']).values(password_hash=password_hash(password),
                        display_name=name.strip(),role=role,disabled=0))
                    c.execute(delete(t.sessions).where(t.sessions.c.user_id == row['id']))
                return row['id']
            user_id = str(uuid4())
            c.execute(insert(t.users).values(id=user_id,username=username,display_name=name.strip(),password_hash=password_hash(password),
                role=role,is_demo=int(demo),disabled=0))
            return user_id

    def _session(self, c, token, now):
        if not token or not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
            return None
        row = c.execute(select(t.users).join(t.sessions,t.users.c.id == t.sessions.c.user_id).where(
            t.sessions.c.token_hash == token_hash(token),t.sessions.c.expires_at > now,t.users.c.disabled == 0)).mappings().first()
        if not row or row['is_demo'] and not self.store.settings.demo_accounts:
            return None
        return dict(id=row['id'],username=row['username'],displayName=row['display_name'],role=row['role'],isDemo=bool(row['is_demo']))

    def session(self, token, now=None):
        with self.store.transaction() as c:
            return self._session(c, token, int(time.time()*1000) if now is None else now)

    def login(self, username, password, now=None):
        now = int(time.time()*1000) if now is None else now
        username = username.strip().lower()
        error = None
        with self.store.transaction() as c:
            if self.store.postgres:
                from sqlalchemy import text
                # Serialize failed attempts across processes, including unknown usernames.
                key = int.from_bytes(hashlib.sha256(username.encode()).digest()[:4], 'big', signed=True)
                c.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
            attempt = c.execute(select(t.attempts).where(t.attempts.c.username == username)).mappings().first()
            if attempt and attempt['locked_until'] > now:
                raise ClinicalError('Tài khoản tạm khóa. Vui lòng thử lại sau 5 phút.',429)
            user = c.execute(select(t.users).where(t.users.c.username == username,t.users.c.disabled == 0)).mappings().first()
            valid = verify_password(password, user['password_hash'] if user else self.dummy)
            if not user or not valid or user['is_demo'] and not self.store.settings.demo_accounts:
                failures = (attempt['failures'] if attempt and attempt['locked_until'] == 0 else 0)+1
                c.execute(delete(t.attempts).where(t.attempts.c.username == username))
                c.execute(insert(t.attempts).values(username=username,failures=failures,locked_until=now+300000 if failures>=5 else 0))
                error = ClinicalError('Tên đăng nhập hoặc mật khẩu không đúng.',401)
            else:
                c.execute(delete(t.attempts).where(t.attempts.c.username == username))
                c.execute(delete(t.sessions).where(t.sessions.c.expires_at <= now))
                token = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('=')
                c.execute(insert(t.sessions).values(token_hash=token_hash(token),user_id=user['id'],expires_at=now+SESSION_SECONDS*1000,created_at=now))
                result = {'token':token,'user':self._session(c,token,now)}
        # Failed attempt records must commit before raising an HTTP error.
        if error:
            raise error
        return result

    def logout(self, token):
        if token:
            with self.store.transaction() as c:
                c.execute(delete(t.sessions).where(t.sessions.c.token_hash == token_hash(token)))
