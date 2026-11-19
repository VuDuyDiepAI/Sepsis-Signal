"""Enter simulated EMR events and score the next six hours for sepsis."""
import json
from datetime import datetime, timedelta

import pandas as pd
import streamlit as st

from app.shared_ui import (
    display_case_id, lab_markers, page_header, show_case_sidebar, show_changes,
    show_feature_details, show_result, show_review, show_timeline,
)
from src.manual_cases import (
    LAB_UNITS, LOCATIONS, build_features, create_case, event_rows, get_case,
    case_overview, list_cases, prediction_history, recompute_scored_hours,
    review_history, save_entry, score_hour,
)
from src.mock_emr import load_bundle

COMORBIDITIES = {
    'diabetes': 'Đái tháo đường',
    'cardiovascular_disease': 'Bệnh tim mạch',
    'chronic_kidney_disease': 'Bệnh thận mạn',
    'chronic_liver_disease': 'Bệnh gan mạn',
    'chronic_lung_disease': 'Bệnh phổi mạn',
    'cancer': 'Ung thư',
    'immunosuppression': 'Suy giảm miễn dịch',
}
SYMPTOMS = {
    'respiratory': 'Hô hấp',
    'urinary': 'Tiết niệu',
    'abdominal': 'Tiêu hóa / ổ bụng',
    'skin': 'Da và mô mềm',
    'cns': 'Thần kinh trung ương',
}
LAB_NAMES = {
    'WBC': 'Bạch cầu',
    'platelets': 'Tiểu cầu',
    'creatinine': 'Creatinine',
    'bilirubin_total': 'Bilirubin',
    'CRP': 'CRP',
    'procalcitonin': 'Procalcitonin',
}
LOCATION_NAMES = {'ED': 'Cấp cứu', 'WARD': 'Nội trú', 'ICU': 'Hồi sức tích cực'}


def date_time(label, default, key):
    date_column, time_column = st.columns(2)
    date = date_column.date_input(f'{label} · ngày', default.date(), key=f'{key}_date',
                                 format='DD/MM/YYYY')
    time = time_column.time_input(f'{label} · giờ', default.time(), key=f'{key}_time', step=60)
    return datetime.combine(date, time).replace(second=0, microsecond=0)


def show_new_case():
    with st.form('new_case'):
        current_time = datetime.now().replace(second=0, microsecond=0)
        with st.container(key='intake_fields'):
            date_col, time_col, age_col, sex_col, height_col, weight_col = st.columns(6)
            t0_date = date_col.date_input(
                'Ngày T0', current_time.date(), key='case_t0_date', format='DD/MM/YYYY',
                help='T0 là thời điểm hoàn tất phân loại.',
            )
            t0_time = time_col.time_input('Giờ T0', current_time.time(), key='case_t0_time', step=60)
            age = age_col.number_input('Tuổi', 18, 120, 55)
            sex = sex_col.selectbox('Giới', ['Nữ', 'Nam'])
            height = height_col.number_input('Chiều cao (cm)', 80.0, 250.0, value=None)
            weight = weight_col.number_input('Cân nặng (kg)', 20.0, 400.0, value=None)
        t0 = datetime.combine(t0_date, t0_time)
        st.caption('Bệnh nền đã biết tại T0')
        columns = st.columns(3)
        flags = {key: columns[i % 3].checkbox(label)
                 for i, (key, label) in enumerate(COMORBIDITIES.items())}
        create = st.form_submit_button('Tạo hồ sơ', type='primary')
    if create:
        try:
            st.session_state.manual_case_id = create_case(
                triage_completed_at=t0, age_years=age, sex='F' if sex == 'Nữ' else 'M',
                height_cm=height, weight_kg=weight, comorbidities=flags,
            )
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))


def show_entry_form(case_id, hour, at, location):
    key = f'{case_id}_{hour}'
    with st.form(f'entry_{key}'):
        st.subheader(f'Cập nhật dữ liệu · T0+{hour}h')
        vital_tab, lab_tab, context_tab = st.tabs(['Sinh hiệu', 'Xét nghiệm', 'Triệu chứng và khoa'])
        with vital_tab:
            st.caption('Nhập sinh hiệu mới nếu có. Có thể dùng bản đo đã lưu trong 6 giờ gần nhất.')
            cols = st.columns(2)
            vitals = {
                'heart_rate_bpm': cols[0].number_input('Nhịp tim (lần/phút)', 20, 250, value=None),
                'respiratory_rate_per_min': cols[1].number_input('Nhịp thở (lần/phút)', 4, 70, value=None),
                'sbp_mmhg': cols[0].number_input('HA tâm thu (mmHg)', 40, 300, value=None),
                'dbp_mmhg': cols[1].number_input('HA tâm trương (mmHg)', 20, 200, value=None),
                'map_mmhg': cols[0].number_input('MAP (mmHg)', 20, 250, value=None),
                'spo2_pct': cols[1].number_input('SpO₂ (%)', 40, 100, value=None),
                'temperature_c': cols[0].number_input('Nhiệt độ (°C)', 25.0, 45.0, value=None, step=0.1),
                'gcs': cols[1].number_input('GCS', 3, 15, value=None),
            }
            with st.expander('Chỉnh giờ đo và giờ có trên EMR'):
                measured = date_time('Giờ đo sinh hiệu', at, f'{key}_vital_measured')
                vital_available = date_time('Giờ sinh hiệu có trên EMR', at, f'{key}_vital_available')
        with lab_tab:
            st.caption('Chỉ số chỉ được dùng ở các mốc từ giờ có kết quả trên EMR.')
            cols = st.columns(2)
            labs = {}
            for i, (code, name) in enumerate(LAB_NAMES.items()):
                value = cols[i % 2].number_input(f'{name} ({LAB_UNITS[code]})', 0.0, 100000.0,
                                                 value=None, step=0.01, key=f'{key}_lab_{code}')
                if value is not None:
                    labs[code] = value
            with st.expander('Chỉnh giờ lấy mẫu và giờ có kết quả'):
                collected = date_time('Giờ lấy mẫu', at, f'{key}_lab_collected')
                lab_available = date_time('Giờ có kết quả trên EMR', at, f'{key}_lab_available')
        with context_tab:
            record_symptoms = st.checkbox('Lưu lần đánh giá triệu chứng tại mốc này')
            cols = st.columns(2)
            symptoms = {code: cols[i % 2].checkbox(name)
                        for i, (code, name) in enumerate(SYMPTOMS.items())}
            new_location = st.selectbox('Khoa điều trị tại mốc này', [None, *LOCATIONS],
                                        format_func=lambda code: LOCATION_NAMES[code] if code else 'Giữ nguyên')
            st.caption(f'Khoa hiện tại · {LOCATION_NAMES.get(location, location)}')
        submitted = st.form_submit_button('Lưu dữ liệu và chấm điểm', type='primary', width='stretch')

    if not submitted:
        return None

    return dict(
        measured_at=measured, vital_available_at=vital_available,
        vitals=vitals if any(value is not None for value in vitals.values()) else None,
        lab_collected_at=collected, lab_available_at=lab_available, labs=labs,
        symptom_recorded_at=at, symptom_available_at=at,
        symptoms=symptoms if record_symptoms or any(symptoms.values()) else None,
        location_code=new_location, location_at=at,
    )


def sepsis_history(case_id):
    return [row for row in prediction_history(case_id) if row['target'] == 'sepsis']


def change_hour(key, hour):
    st.session_state[key] = hour


page_header('Theo dõi người bệnh', 'Cảnh báo, diễn biến và ghi nhận xem xét theo từng mốc giờ.')
st.caption('Chỉ dùng thông tin từ hồ sơ mẫu khi trải nghiệm.')
overview = case_overview()
cases = list_cases()
with st.expander('Tạo hồ sơ trải nghiệm', expanded=not cases):
    show_new_case()

if not cases:
    st.info('Tạo lượt khám để bắt đầu ở T0+1h, hoặc mở trang Chạy ca mẫu.')
    st.stop()

ids = [row['encounter_id'] for row in cases]
active = st.session_state.get('manual_case_id')
cols = st.columns([1.25, 0.75, 1], vertical_alignment='bottom')
case_id = cols[0].selectbox('Hồ sơ', ids, index=ids.index(active) if active in ids else 0,
                            format_func=display_case_id, key='manual_case_picker')
st.session_state.manual_case_id = case_id
show_case_sidebar(overview, case_id)
case = get_case(case_id)
t0 = datetime.fromisoformat(case['triage_completed_at'])
history = sepsis_history(case_id)
last_hour = (datetime.fromisoformat(history[-1]['prediction_at']) - t0).total_seconds() // 3600 if history else 0
hour_key = f'hour_{case_id}'
hour = cols[1].number_input('Giờ sau T0', 1, 36, min(36, int(last_hour) + 1), key=hour_key)
at = t0 + timedelta(hours=hour)
cols[2].text_input('Mốc đang xem', value=f'{at:%d/%m/%Y · %H:%M}', disabled=True)
sex = 'Nữ' if case['sex'] == 'F' else 'Nam'
st.caption(f'T0 {t0:%d/%m/%Y %H:%M} · {case["age_years"]} tuổi · {sex} · {len(history)} mốc đã chấm')

try:
    model, meta = load_bundle('sepsis')
except (FileNotFoundError, ValueError) as exc:
    st.error(str(exc))
    st.stop()

at_key = at.isoformat(timespec='seconds')
features = build_features(case_id, at)
current = next((row for row in history if row['prediction_at'] == at_key), None)
previous = next((row for row in reversed(history) if row['prediction_at'] < at_key), None)
latest = history[-1] if history else None
if latest and at_key < latest['prediction_at']:
    st.info(f'Đang xem lịch sử T0+{hour}h · Kết quả mới nhất T0+{int(last_hour)}h '
            f'({datetime.fromisoformat(latest["prediction_at"]):%d/%m %H:%M}).')

with st.container(border=True, key='manual_result'):
    st.subheader('Trạng thái cảnh báo', anchor=False)
    if current:
        show_result(at, current['score'], current['threshold'], previous['score'] if previous else None)
        reviews = {r['result_key']: r for r in review_history(case_id)}
        review = reviews.get(f'manual:{current["id"]}')
        st.caption(f'{"Đã xem xét" if review else "Chờ xem xét"} · '
                   f'Bản tính {current["revision"]} · Chấm lúc '
                   f'{datetime.fromisoformat(current["scored_at"]):%d/%m %H:%M}')
    else:
        show_result(at)
        if pd.isna(features.iloc[0]['heart_rate_last_bpm']):
            st.caption('Cần bản đo gồm nhịp tim, nhịp thở và HA tâm thu trong 6 giờ gần nhất.')

vitals = pd.DataFrame(event_rows(case_id, 'vitals'))
labs = pd.DataFrame(event_rows(case_id, 'labs'))
for frame in (vitals, labs):
    if not frame.empty:
        frame['available_at'] = pd.to_datetime(frame['available_at'])
previous_at = pd.Timestamp(previous['prediction_at']) if previous else pd.Timestamp(t0)
visible_vitals = vitals.loc[vitals['available_at'].le(at)].tail(1) if not vitals.empty else vitals
previous_vitals = vitals.loc[vitals['available_at'].le(previous_at)].tail(1) if not vitals.empty else vitals
visible_labs = labs.loc[labs['available_at'].le(at)] if not labs.empty else labs
with st.container(border=True):
    show_changes(previous_vitals, visible_vitals, visible_labs, previous_at, at)

timeline = pd.DataFrame([
    {'hour': (datetime.fromisoformat(row['prediction_at']) - t0).total_seconds() / 3600,
     'score': row['score'], 'threshold': row['threshold']}
    for row in history
])
with st.container(border=True, key='timeline_panel'):
    st.subheader('Diễn biến nguy cơ', anchor=False)
    show_timeline(timeline, hour, lab_events=lab_markers(visible_labs, t0))

if current:
    show_review(f'manual:{current["id"]}', case_id, at, current['model_version'],
                prediction_id=current['id'])

with st.container(border=True, key='entry_panel'):
    payload = show_entry_form(case_id, hour, at, features.iloc[0]['location_code'])
    if payload is not None:
        try:
            changed = save_entry(case_id, **payload)
            bundles = {'sepsis': (model, meta)}
            recompute_scored_hours(case_id, changed, bundles=bundles)
            score_hour(case_id, hour, bundles=bundles)
        except ValueError as exc:
            st.warning(str(exc))
        else:
            st.session_state['entry_saved'] = 'Đã lưu dữ liệu và cập nhật kết quả chấm điểm.'
            st.rerun()
    if message := st.session_state.pop('entry_saved', None):
        st.success(message)
    if hour < 36:
        st.button(f'Cập nhật mốc T0+{hour+1}h', on_click=change_hour,
                  args=(hour_key, hour+1), width='stretch')

if current:
    snapshot = pd.DataFrame([json.loads(current['feature_json'])])
    show_feature_details(snapshot, model if current['model_version'] == meta['model_version'] else None)
else:
    show_feature_details(features)
with st.expander('Lịch sử kết quả và xem xét'):
    all_reviews = {r['result_key']: r for r in review_history(case_id)}
    versions = []
    for item in prediction_history(case_id, include_revisions=True):
        if item['target'] != 'sepsis':
            continue
        review = all_reviews.get(f'manual:{item["id"]}', {})
        versions.append({'Mốc chấm': pd.Timestamp(item['prediction_at']),
                         'Bản tính': item['revision'], 'Điểm sepsis': item['score'],
                         'Người ghi nhận': review.get('reviewed_by', 'Chờ xem xét'),
                         'Giờ xem xét': review.get('reviewed_at', ''),
                         'Ghi chú': review.get('note', '')})
    st.dataframe(pd.DataFrame(versions), hide_index=True, width='stretch')
with st.expander('Nhật ký EMR'):
    for name, label in [('vitals', 'Sinh hiệu'), ('labs', 'Xét nghiệm'),
                        ('symptoms', 'Triệu chứng'), ('locations', 'Khoa điều trị')]:
        events = event_rows(case_id, name, include_revisions=True)
        if events:
            st.markdown(f'**{label}**')
            st.dataframe(pd.DataFrame(events), hide_index=True, width='stretch')
