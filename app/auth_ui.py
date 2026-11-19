"""Sign-in screen and account session controls."""
from html import escape

import streamlit as st

from src.auth import (DEMO_ACCOUNTS, DEMO_PASSWORD, ensure_demo_accounts,
                      session_user, sign_in, sign_out)


def logout():
    sign_out(st.session_state.get('auth_token'))
    st.session_state.clear()


def choose_demo(username):
    st.session_state.login_username = username
    st.session_state.login_password = DEMO_PASSWORD


def require_login():
    user = session_user(st.session_state.get('auth_token'))
    if user:
        st.session_state.auth_user = user
        return user
    if st.session_state.get('auth_user'):
        st.session_state.clear()
        st.info('Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.')
    ensure_demo_accounts()
    with st.container(key='login_shell'):
        intro, form = st.columns([1.05, 1], gap='large', vertical_alignment='top')
        with intro:
            st.html(
                '<section class="login-intro">'
                '<div class="login-brand"><span>S</span><b>Sepsis Signal</b></div>'
                '<h1>Theo dõi nguy cơ<br>nhiễm khuẩn huyết</h1>'
                '<p>Quản lý hồ sơ, theo dõi diễn biến và xem xét cảnh báo theo từng thời điểm.</p>'
                '<div class="login-hospital">Khoa Cấp cứu<br>Bệnh viện Đa khoa Quốc tế Vinmec</div>'
                '</section>'
            )
        with form:
            with st.container(key='login_form'):
                st.title('Đăng nhập', anchor=False)
                st.caption('Đăng nhập hoặc chọn tài khoản trải nghiệm bên dưới.')
                with st.form('sign_in', clear_on_submit=True):
                    username = st.text_input('Tên đăng nhập', placeholder='Nhập tên đăng nhập',
                                             max_chars=64, key='login_username')
                    password = st.text_input('Mật khẩu', type='password', max_chars=128,
                                             key='login_password')
                    submit = st.form_submit_button('Đăng nhập', type='primary', width='stretch')
                if submit:
                    try:
                        st.session_state.auth_token = sign_in(username, password)
                    except ValueError as exc:
                        st.error(str(exc))
                    else:
                        st.rerun()
                with st.container(key='demo_accounts'):
                    st.markdown('**Tài khoản trải nghiệm**')
                    st.caption('Chọn tài khoản để điền sẵn thông tin, sau đó bấm Đăng nhập.')
                    for account in DEMO_ACCOUNTS:
                        st.button(f'{account["display_name"]} · {account["username"]}',
                                  key=f'demo_{account["username"]}', width='stretch',
                                  on_click=choose_demo, args=(account['username'],))
                    st.caption(f'Mật khẩu dùng chung: **{DEMO_PASSWORD}**')
    st.stop()


def show_app_header(user):
    st.html(
        '<header class="signal-header" aria-label="Sepsis Signal">'
        '<div class="signal-brand"><span class="signal-mark" aria-hidden="true">S</span>'
        '<div><b>Sepsis Signal</b><small>Khoa Cấp cứu · Vinmec</small></div></div>'
        '<div class="signal-account"><span class="account-avatar" aria-hidden="true">'
        f'{escape(user["display_name"][:1].upper())}</span>'
        f'<div><b>{escape(user["display_name"])}</b><small>{escape(user["username"])}</small></div>'
        '</div></header>'
    )
    with st.container(key='header_logout'):
        st.button('Đăng xuất', icon=':material/logout:', on_click=logout, width='stretch')
