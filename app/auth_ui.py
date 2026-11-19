"""Sign-in screen and account session controls."""
from html import escape

import streamlit as st

from src.auth import create_first_account, has_accounts, session_user, sign_in, sign_out


def logout():
    sign_out(st.session_state.get('auth_token'))
    st.session_state.clear()


def require_login():
    user = session_user(st.session_state.get('auth_token'))
    if user:
        st.session_state.auth_user = user
        return user
    if st.session_state.get('auth_user'):
        st.session_state.clear()
        st.info('Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.')
    setup = not has_accounts()
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
                st.title('Thiết lập tài khoản' if setup else 'Đăng nhập', anchor=False)
                st.caption('Tạo tài khoản đầu tiên để bắt đầu sử dụng trên máy này.' if setup
                           else 'Nhập tài khoản để truy cập hệ thống theo dõi.')
                with st.form('sign_in', clear_on_submit=True):
                    username = st.text_input('Tên đăng nhập', placeholder='Ví dụ bacsi.diep', max_chars=64)
                    name = st.text_input('Tên hiển thị', placeholder='Tên dùng khi ghi nhận xem xét',
                                         max_chars=100) if setup else ''
                    password = st.text_input('Mật khẩu', type='password', max_chars=128)
                    confirmation = st.text_input('Nhập lại mật khẩu', type='password', max_chars=128) if setup else ''
                    if setup:
                        st.caption('Mật khẩu từ 12 ký tự. Bạn tự chọn thông tin đăng nhập.')
                    submit = st.form_submit_button('Tạo tài khoản và đăng nhập' if setup else 'Đăng nhập',
                                                    type='primary', width='stretch')
                if submit:
                    try:
                        if setup:
                            if password != confirmation:
                                raise ValueError('Hai lần nhập mật khẩu chưa khớp.')
                            create_first_account(username, name, password)
                        st.session_state.auth_token = sign_in(username, password)
                    except ValueError as exc:
                        st.error(str(exc))
                    else:
                        st.rerun()
                st.caption('Phiên làm việc tối đa 8 giờ. Khi tải lại trình duyệt, bạn đăng nhập lại.')
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
    with st.sidebar:
        with st.container(key='account_menu'):
            st.caption('TÀI KHOẢN')
            st.write(user['display_name'])
            st.button('Đăng xuất', icon=':material/logout:', on_click=logout, width='stretch')
