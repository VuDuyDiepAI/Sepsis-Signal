"""Sepsis Signal Streamlit entry point."""
import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

st.set_page_config(page_title='Sepsis Signal', page_icon=':material/monitor_heart:',
                   layout='wide', initial_sidebar_state='auto')
pages = [
    st.Page('views/4_sample_case.py', title='Chạy ca mẫu', icon=':material/play_circle:', default=True),
    st.Page('views/1_manual.py', title='Nhập ca theo giờ', icon=':material/edit_note:'),
    st.Page('views/2_manual_watchlist.py', title='Danh sách theo dõi', icon=':material/view_list:'),
    st.Page('views/3_model_monitoring.py', title='Đánh giá mô hình', icon=':material/analytics:'),
]
navigation = st.navigation(pages)

styles = (ROOT / 'app' / 'styles.css').read_text(encoding='utf-8')
st.html(f'<style>{styles}</style>')
st.html(
    '<header class="signal-header" aria-label="Sepsis Signal">'
    '<div class="signal-brand"><span class="signal-mark" aria-hidden="true">S</span>'
    '<div><b>Sepsis Signal</b><small>Theo dõi nguy cơ sepsis</small></div></div>'
    '<span class="signal-mode">Chế độ trải nghiệm</span>'
    '</header>'
)

navigation.run()
