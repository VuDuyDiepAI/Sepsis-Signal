"""Overview of manually entered synthetic encounters."""
import pandas as pd
import streamlit as st

from src.manual_cases import delete_case, event_rows, list_cases, prediction_history

st.markdown('<div class="app-kicker">TRANG CHỦ &nbsp;/&nbsp; <b>DANH SÁCH THEO DÕI CA BỆNH</b></div>', unsafe_allow_html=True)
st.title('Danh sách ca đang theo dõi')
st.markdown('<p class="app-subtitle">Tổng hợp các lượt khám đang được theo dõi từ Cấp cứu (ED) sang Nội trú (WARD) và Hồi sức (ICU), kèm điểm Hồi quy Logistic mới nhất.</p>', unsafe_allow_html=True)

cases = list_cases()
if not cases:
    st.info('Chưa có ca nào. Mở trang “Nhập ca và dự đoán” để tạo lượt khám đầu tiên.')
    st.stop()

rows = []
for case in cases:
    eid = case['encounter_id']
    predictions = prediction_history(eid)
    by_target = {target: next((p for p in reversed(predictions) if p['target'] == target), None)
                 for target in ('sepsis', 'shock')}
    latest = by_target['sepsis'] or by_target['shock']
    locs = event_rows(eid, 'locations')
    current_loc = locs[-1]['location_code'] if locs else 'ED'
    sep_alert = bool(by_target['sepsis']['alert']) if by_target['sepsis'] else False
    shk_alert = bool(by_target['shock']['alert']) if by_target['shock'] else False
    status_label = (
        '🔴 Vượt ngưỡng Sepsis & Sốc' if (sep_alert and shk_alert)
        else '🟠 Vượt ngưỡng Sepsis' if sep_alert
        else '🟠 Vượt ngưỡng Sốc' if shk_alert
        else '🟢 Dưới ngưỡng demo' if latest
        else '⚪ Chưa chấm điểm'
    )
    rows.append({
        'Mã ca giả': eid,
        'Trạng thái theo dõi': status_label,
        'Khu vực': current_loc,
        'Giới': 'Nữ' if case.get('sex') == 'F' else 'Nam',
        'Tuổi': case['age_years'],
        'T0': case['triage_completed_at'],
        'Giờ chấm cuối': latest['prediction_at'] if latest else 'Chưa chấm',
        'Điểm sepsis': 100 * by_target['sepsis']['score'] if by_target['sepsis'] else None,
        'Vượt ngưỡng sepsis': sep_alert if by_target['sepsis'] else None,
        'Điểm sốc': 100 * by_target['shock']['score'] if by_target['shock'] else None,
        'Vượt ngưỡng sốc': shk_alert if by_target['shock'] else None,
    })

data = pd.DataFrame(rows)
a, b, c, d = st.columns(4)
a.metric('Ca giả đã tạo', len(rows))
b.metric('Ca vượt ngưỡng sepsis', int(data['Vượt ngưỡng sepsis'].eq(True).sum()))
c.metric('Ca vượt ngưỡng sốc', int(data['Vượt ngưỡng sốc'].eq(True).sum()))
d.metric('Ca đang ở ICU / Nội trú', int(data['Khu vực'].isin(['ICU', 'WARD']).sum()))
st.caption('Các con số trên phản ánh những ca giả đã nhập trên máy này; không đại diện cho tỷ lệ cảnh báo lâm sàng thực tế.')

f1, f2 = st.columns([2, 2])
filter_mode = f1.radio(
    'Lọc theo mức cảnh báo',
    ['Tất cả ca', 'Chỉ ca vượt ngưỡng (Cần xem xét)', 'Chưa chấm điểm'],
    horizontal=True,
)
loc_filter = f2.multiselect('Lọc theo khu vực điều trị', ['ED', 'WARD', 'ICU'], default=['ED', 'WARD', 'ICU'])

filtered = data.loc[data['Khu vực'].isin(loc_filter)].copy()
if filter_mode == 'Chỉ ca vượt ngưỡng (Cần xem xét)':
    filtered = filtered.loc[filtered['Vượt ngưỡng sepsis'].eq(True) | filtered['Vượt ngưỡng sốc'].eq(True)]
elif filter_mode == 'Chưa chấm điểm':
    filtered = filtered.loc[filtered['Giờ chấm cuối'] == 'Chưa chấm']

st.dataframe(
    filtered.sort_values('Giờ chấm cuối', ascending=False),
    hide_index=True,
    width='stretch',
    column_config={
        'Điểm sepsis': st.column_config.NumberColumn('Điểm Sepsis (6h tới)', format='%.1f%%'),
        'Điểm sốc': st.column_config.NumberColumn('Điểm Sốc (6h tới)', format='%.1f%%'),
    },
)

selected = st.selectbox('Chọn ca bệnh để mở lại bảng nhập chỉ số theo giờ', data['Mã ca giả'].tolist())
btn_col1, btn_col2, _ = st.columns([1, 1, 4])
if btn_col1.button('Mở ca', type='primary'):
    st.session_state.manual_case_id = selected
    st.switch_page('pages/1_manual.py')
if btn_col2.button('🗑 Xóa ca nháp này', type='secondary'):
    delete_case(selected)
    if st.session_state.get('manual_case_id') == selected:
        st.session_state.pop('manual_case_id', None)
    st.rerun()
