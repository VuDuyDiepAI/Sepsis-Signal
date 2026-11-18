"""Review the most recent sepsis result for each manual demo encounter."""
import pandas as pd
import streamlit as st

from app.shared_ui import display_case_id, page_header
from src.manual_cases import delete_case, event_rows, list_cases, prediction_history

page_header('Danh sách theo dõi', 'Xem kết quả sepsis mới nhất của từng hồ sơ.')
cases = list_cases()
if not cases:
    st.info('Chưa có hồ sơ theo dõi.')
    st.page_link('views/1_manual.py', label='Tạo hồ sơ', icon=':material/add:')
    st.stop()

rows = []
for case in cases:
    eid = case['encounter_id']
    latest = next((p for p in reversed(prediction_history(eid)) if p['target'] == 'sepsis'), None)
    locations = event_rows(eid, 'locations')
    available = [row for row in locations if latest is None or row['available_at'] <= latest['prediction_at']]
    location = available[-1]['location_code'] if available else 'ED'
    status = 'Chưa chấm'
    if latest is not None:
        status = 'Vượt ngưỡng' if latest['alert'] else 'Dưới ngưỡng'
    rows.append({
        'Mã hồ sơ': display_case_id(eid),
        'encounter_id': eid,
        'Trạng thái': status,
        'Khoa': location,
        'Tuổi': case['age_years'],
        'Mốc chấm cuối': pd.Timestamp(latest['prediction_at']) if latest else pd.NaT,
        'hour': int((pd.Timestamp(latest['prediction_at']) - pd.Timestamp(case['triage_completed_at']))
                    .total_seconds() // 3600) if latest else 1,
        'Điểm sepsis': latest['score'] * 100 if latest else None,
        'Ngưỡng tại mốc': latest['threshold'] * 100 if latest else None,
        'rank': {'Vượt ngưỡng': 0, 'Dưới ngưỡng': 1, 'Chưa chấm': 2}[status],
    })

data = pd.DataFrame(rows)
cols = st.columns(3)
cols[0].metric('Hồ sơ đã tạo', len(data))
cols[1].metric('Vượt ngưỡng cảnh báo', int(data['rank'].eq(0).sum()))
cols[2].metric('Chưa chấm', int(data['rank'].eq(2).sum()))

status_filter, location_filter = st.columns(2)
status = status_filter.selectbox('Trạng thái', ['Tất cả', 'Vượt ngưỡng', 'Dưới ngưỡng', 'Chưa chấm'])
locations = location_filter.multiselect('Khoa', ['ED', 'WARD', 'ICU'], placeholder='Tất cả khoa')
filtered = data.loc[
    (data['Trạng thái'].eq(status) if status != 'Tất cả' else data['Trạng thái'].notna())
    & (data['Khoa'].isin(locations) if locations else data['Khoa'].notna())
].sort_values(['rank', 'Mốc chấm cuối'], ascending=[True, False])
if filtered.empty:
    st.info('Không có ca khớp bộ lọc.')
    st.stop()

st.dataframe(filtered.drop(columns=['rank', 'hour', 'encounter_id']), hide_index=True, width='stretch', row_height=40, column_config={
    'Điểm sepsis': st.column_config.NumberColumn(format='%.2f%%'),
    'Ngưỡng tại mốc': st.column_config.NumberColumn(format='%.2f%%'),
    'Mốc chấm cuối': st.column_config.DatetimeColumn(format='DD/MM/YYYY HH:mm'),
})
selected = st.selectbox('Hồ sơ muốn mở', filtered['encounter_id'].tolist(), format_func=display_case_id)
if st.button('Mở hồ sơ', type='primary'):
    st.session_state.manual_case_id = selected
    st.session_state[f'hour_{selected}'] = int(data.loc[data['encounter_id'].eq(selected), 'hour'].iloc[0])
    st.switch_page('views/1_manual.py')
with st.expander('Quản lý hồ sơ trải nghiệm'):
    confirmed = st.checkbox(f'Xác nhận xóa lịch sử hồ sơ {display_case_id(selected)}',
                            key=f'confirm_delete_{selected}')
    if st.button('Xóa hồ sơ', disabled=not confirmed):
        delete_case(selected)
        if st.session_state.get('manual_case_id') == selected:
            st.session_state.pop('manual_case_id')
        st.rerun()
