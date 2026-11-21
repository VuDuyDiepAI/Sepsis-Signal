"""Account lifecycle, route protection and login identity."""
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest

from src import auth

PASSWORD = 'test-only-password-123'

@pytest.fixture(autouse=True)
def accounts(tmp_path, monkeypatch):
    monkeypatch.setenv('SEPSIS_AUTH_DB', str(tmp_path / 'accounts.sqlite3'))
    monkeypatch.setenv('SEPSIS_MANUAL_DB', str(tmp_path / 'manual.sqlite3'))


def test_first_account_is_atomic_and_password_is_hashed():
    def create():
        try:
            auth.create_first_account('doctor', 'Bác sĩ', PASSWORD)
            return True
        except ValueError:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: create(), range(2))) == [False, True]
    with sqlite3.connect(auth.auth_path()) as con:
        stored = con.execute('SELECT password_hash FROM users').fetchone()[0]
    assert PASSWORD not in stored
    assert stored.startswith('pbkdf2_sha256$600000$')
    assert auth.has_accounts()


def test_login_revoke_expire_and_throttle(monkeypatch):
    auth.create_first_account('doctor', 'Bác sĩ', PASSWORD)
    for _ in range(5):
        with pytest.raises(ValueError, match='không đúng'):
            auth.sign_in('doctor', 'wrong')
    with pytest.raises(ValueError, match='5 phút'):
        auth.sign_in('doctor', PASSWORD)
    original = auth.time.time()
    monkeypatch.setattr(auth.time, 'time', lambda: original + 301)
    token = auth.sign_in('DOCTOR', PASSWORD)
    assert auth.session_user(token)['display_name'] == 'Bác sĩ'
    with sqlite3.connect(auth.auth_path()) as con:
        assert token != con.execute('SELECT token_hash FROM auth_sessions').fetchone()[0]
    auth.sign_out(token)
    assert auth.session_user(token) is None
    token = auth.sign_in('doctor', PASSWORD)
    monkeypatch.setattr(auth.time, 'time', lambda: original + 301 + auth.SESSION_SECONDS + 1)
    assert auth.session_user(token) is None
    assert auth.session_user('fabricated') is None


def test_demo_login_without_registration_and_idempotent_provisioning():
    auth.ensure_demo_accounts()
    users = [auth.session_user(auth.sign_in(a['username'], auth.DEMO_PASSWORD))
             for a in auth.DEMO_ACCOUNTS]
    auth.ensure_demo_accounts()
    with sqlite3.connect(auth.auth_path()) as con:
        assert con.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 2
    assert users[0]['id'] != users[1]['id']
    assert auth.session_user(auth.sign_in(auth.DEMO_ACCOUNTS[0]['username'],
                                        auth.DEMO_PASSWORD))['id'] == users[0]['id']
