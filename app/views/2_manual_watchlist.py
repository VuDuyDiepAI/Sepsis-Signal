"""Review the latest sepsis results and their acknowledgement state."""
import pandas as pd
import streamlit as st

from app.shared_ui import display_case_id, page_header, select_manual_case
from src.manual_cases import case_overview, delete_case

LOCATION_NAMES = {'ED': 'Cấp cứu', 'WARD': 'Nội trú', 'ICU': 'Hồi sức tích cực'}
page_header('Danh sách theo dõi', 'Ưu tiên ca vượt ngưỡng đang chờ xem xét.')
cases = case_overview()
if not cases:
    st.info('Chưa có hồ sơ theo dõi.')
    st.page_link('views/1_manual.py', label='Tạo hồ sơ', icon=':material/add:')
    st.stop()

cols = st.columns(3)
cols[0].metric('Hồ sơ theo dõi', len(cases))
cols[1].metric('Cảnh báo chờ xem xét', sum(item['rank'] == 0 for item in cases))
cols[2].metric('Đã xem xét · mốc mới nhất', sum(item['review'] is not None for item in cases))

with st.container(border=True, key='watchlist_filters'):
    a, b, c, d = st.columns(4)
    search = a.text_input('Tìm mã hồ sơ', placeholder='Nhập mã hồ sơ')
    status = b.selectbox('Trạng thái cảnh báo', ['Tất cả', 'Vượt ngưỡng', 'Dưới ngưỡng', 'Chưa chấm'])
    review_status = c.selectbox('Xem xét', ['Tất cả', 'Chờ xem xét', 'Đã xem xét', 'Chưa có kết quả'])
    location = d.selectbox('Khoa', ['Tất cả', *LOCATION_NAMES],
                           format_func=lambda code: LOCATION_NAMES.get(code, code))

filtered = [r for r in cases
            if search.lower() in display_case_id(r['encounter_id']).lower()
            and (status == 'Tất cả' or r['status'] == status)
            and (review_status == 'Tất cả' or r['review_status'] == review_status)
            and (location == 'Tất cả' or r['location'] == location)]
if not filtered:
    st.info('Không có ca khớp bộ lọc. Thay đổi điều kiện để xem thêm hồ sơ.')
    st.stop()

rows = []
for item in filtered:
    latest, review = item['latest'], item['review']
    rows.append({
        'Mã hồ sơ': display_case_id(item['encounter_id']),
        'Cảnh báo': item['status'], 'Xem xét': item['review_status'],
        'Khoa': LOCATION_NAMES[item['location']],
        'Điểm sepsis': latest['score'] * 100 if latest else None,
        'Thay đổi · điểm %': item['change'],
        'Mốc chấm cuối': pd.Timestamp(latest['prediction_at']) if latest else pd.NaT,
        'Người ghi nhận': review['reviewed_by'] if review else '—',
        'Giờ xem xét': pd.Timestamp(review['reviewed_at']) if review else pd.NaT,
    })

st.caption('Chọn một dòng để mở hồ sơ tại mốc chấm gần nhất.')
selection = st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch', row_height=54,
                        on_select='rerun', selection_mode='single-row',
                        column_config={
    'Điểm sepsis': st.column_config.NumberColumn(format='%.2f%%'),
    'Thay đổi · điểm %': st.column_config.NumberColumn(format='%+.2f'),
    'Mốc chấm cuối': st.column_config.DatetimeColumn(format='DD/MM HH:mm'),
    'Giờ xem xét': st.column_config.DatetimeColumn(format='DD/MM HH:mm'),
})
if selection.selection.rows:
    selected = filtered[selection.selection.rows[0]]
    select_manual_case(selected['encounter_id'], selected['hour'])
    st.switch_page('views/1_manual.py')

with st.expander('Quản lý hồ sơ trải nghiệm'):
    eid = st.selectbox('Hồ sơ cần quản lý', [r['encounter_id'] for r in filtered], format_func=display_case_id)
    confirmed = st.checkbox(f'Xác nhận xóa lịch sử hồ sơ {display_case_id(eid)}', key=f'confirm_delete_{eid}')
    if st.button('Xóa hồ sơ', disabled=not confirmed):
        delete_case(eid)
        if st.session_state.get('manual_case_id') == eid:
            st.session_state.pop('manual_case_id')
            st.session_state.pop('manual_case_picker', None)
        st.rerun()
