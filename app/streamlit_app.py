"""Sepsis Signal Streamlit entry point."""
import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

st.set_page_config(page_title='Sepsis Signal', page_icon=':material/monitor_heart:',
                   layout='wide', initial_sidebar_state='auto')
styles = (ROOT / 'app' / 'styles.css').read_text(encoding='utf-8')
st.html(f'<style>{styles}</style>')
from app.auth_ui import require_login, show_app_header

user = require_login()
pages = {
    'LÂM SÀNG': [
        st.Page('views/2_manual_watchlist.py', title='Danh sách theo dõi',
                icon=':material/view_list:', default=True),
        st.Page('views/1_manual.py', title='Hồ sơ và chỉ số', icon=':material/edit_note:'),
    ],
    'DỮ LIỆU VÀ MÔ HÌNH': [
        st.Page('views/4_sample_case.py', title='Chạy ca mẫu', icon=':material/play_circle:'),
        st.Page('views/3_model_monitoring.py', title='Đánh giá mô hình', icon=':material/analytics:'),
    ],
}
navigation = st.navigation(pages)
show_app_header(user)

navigation.run()
