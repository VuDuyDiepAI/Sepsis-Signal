"""Account lifecycle, route protection and login identity."""
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

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


def test_login_screen_gates_navigation_and_logout():
    auth.create_first_account('doctor', 'Bác sĩ', PASSWORD)
    app = AppTest.from_file(str(Path(__file__).resolve().parents[1] / 'app/streamlit_app.py')).run()
    assert not app.exception
    assert app.title[0].value == 'Đăng nhập'
    assert not app.dataframe
    app.text_input[0].set_value('doctor')
    app.text_input[1].set_value('wrong')
    app.button[0].click().run()
    assert app.error and app.title[0].value == 'Đăng nhập'
    app.text_input[0].set_value('doctor')
    app.text_input[1].set_value(PASSWORD)
    app.button[0].click().run()
    assert not app.exception
    assert app.title[0].value == 'Danh sách theo dõi'
    token = app.session_state.auth_token
    next(button for button in app.button if button.label == 'Đăng xuất').click().run()
    assert not app.exception
    assert app.title[0].value == 'Đăng nhập'
    assert auth.session_user(token) is None


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
    app = AppTest.from_file(str(Path(__file__).resolve().parents[1] / 'app/streamlit_app.py')).run()
    assert not app.exception
    assert app.title[0].value == 'Đăng nhập'
    assert [widget.label for widget in app.text_input] == ['Tên đăng nhập', 'Mật khẩu']
    assert not any('đăng ký' in b.label.lower() for b in app.button)
    next(b for b in app.button if b.key == 'demo_bacsi.demo2').click().run()
    assert app.text_input[0].value == 'bacsi.demo2'
    assert app.text_input[1].value == auth.DEMO_PASSWORD
    next(b for b in app.button if b.label == 'Đăng nhập').click().run()
    assert not app.exception
    assert app.title[0].value == 'Danh sách theo dõi'
    assert app.session_state.auth_user['id'] == users[1]['id']
