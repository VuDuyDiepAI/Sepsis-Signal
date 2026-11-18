"""Replay sepsis scores using mock EMR values available at each selected hour."""
from html import escape

import pandas as pd
import streamlit as st

from app.shared_ui import page_header, show_feature_details, show_result, show_timeline
from src.mock_emr import DATA_PATH, latest_available, load_bundle, load_tables, predict_scores

LOCATIONS = {'ED': 'Cấp cứu', 'WARD': 'Nội trú', 'ICU': 'Hồi sức tích cực'}
VITAL_FIELDS = (
    ('Nhịp tim', 'lần/phút', 'heart_rate_bpm', 0),
    ('Nhịp thở', 'lần/phút', 'respiratory_rate_per_min', 0),
    ('HA tâm thu', 'mmHg', 'sbp_mmhg', 0),
    ('MAP', 'mmHg', 'map_mmhg', 0),
    ('SpO₂', '%', 'spo2_pct', 0),
    ('Nhiệt độ', '°C', 'temperature_c', 1),
    ('GCS', 'điểm', 'gcs', 0),
)
LAB_NAMES = {
    'WBC': 'Bạch cầu', 'platelets': 'Tiểu cầu', 'creatinine': 'Creatinine',
    'bilirubin_total': 'Bilirubin toàn phần', 'CRP': 'CRP', 'procalcitonin': 'Procalcitonin',
    'lactate': 'Lactate', 'PaO2': 'PaO₂',
    'glucose': 'Glucose', 'albumin': 'Albumin', 'hemoglobin': 'Hemoglobin',
    'sodium': 'Natri', 'potassium': 'Kali', 'PaCO2': 'PaCO₂', 'HCO3': 'HCO₃⁻',
}


@st.cache_data(show_spinner='Đang tải hồ sơ mẫu…')
def sample_tables(workbook_stamp):
    return load_tables()


def choose_example(scored, outcomes):
    ordered = scored.sort_values(['encounter_id', 'prediction_at']).copy()
    grouped = ordered.groupby('encounter_id')
    previous = grouped['risk_score'].shift()
    spacing = grouped['prediction_at'].diff()
    onset = ordered['encounter_id'].map(outcomes['sepsis_onset_at'])
    lead = onset - ordered['prediction_at']
    crossings = ordered.loc[
        (previous < ordered['threshold']) & (ordered['risk_score'] >= ordered['threshold'])
        & spacing.eq(pd.Timedelta(hours=1)) & lead.gt(pd.Timedelta(0))
        & lead.le(pd.Timedelta(hours=6))
    ]
    if crossings.empty:
        return ordered.iloc[0]['encounter_id'], ordered.iloc[0]['prediction_at']
    first = crossings.iloc[0]
    return first['encounter_id'], first['prediction_at'] - pd.Timedelta(hours=1)


def step_to(key, value):
    st.session_state[key] = value


def vital_comparison(previous_vitals, current_vitals, previous_hour, hour):
    def value(row, field, decimals):
        number = row.get(field)
        return '—' if pd.isna(number) else f'{number:.{decimals}f}'.replace('.', ',')

    previous = {} if previous_vitals.empty else previous_vitals.iloc[0]
    current = {} if current_vitals.empty else current_vitals.iloc[0]
    previous_label = f'T0+{previous_hour:g}h' if previous_hour is not None else 'Mốc trước'
    rows = []
    for label, unit, field, decimals in VITAL_FIELDS:
        before, now = value(previous, field, decimals), value(current, field, decimals)
        changed = ' class="signal-value-changed"' if before != now and '—' not in (before, now) else ''
        rows.append(
            f'<tr><th scope="row">{label} <small>{unit}</small></th>'
            f'<td>{before}</td><td{changed}>{now}</td></tr>'
        )
    st.html(
        '<table class="signal-data-table signal-vitals" aria-label="So sánh sinh hiệu gần nhất">'
        '<thead><tr><th scope="col">Chỉ số</th>'
        f'<th scope="col">{previous_label}</th><th scope="col">T0+{hour:g}h</th>'
        '</tr></thead>'
        f'<tbody>{"".join(rows)}</tbody></table>'
    )
    if not current_vitals.empty:
        measured = current['observed_at']
        if previous.get('observed_at') == measured:
            st.caption(f'Cả hai mốc dùng cùng bản đo lúc {measured:%d/%m %H:%M}.')
        else:
            st.caption(f'Lần đo gần nhất tại mốc đang xem: {measured:%d/%m %H:%M}.')
    else:
        st.caption('Chưa có bản đo sinh hiệu tại mốc này.')


def lab_results(labs, start, at):
    new_labs = labs.loc[labs['available_at'].gt(start)].sort_values(
        'available_at', ascending=False, kind='stable',
    )
    st.subheader('Xét nghiệm mới trả', anchor=False)
    if new_labs.empty:
        st.caption(f'Chưa có kết quả mới từ sau {start:%H:%M} đến {at:%H:%M}.')
        return
    st.caption(f'{len(new_labs)} kết quả có trên EMR từ sau {start:%H:%M} đến {at:%H:%M}.')

    def render(results):
        rows = []
        for result in results.itertuples(index=False):
            label = escape(LAB_NAMES.get(result.test_code, str(result.test_code)))
            unit = escape(str(result.unit).replace('10^9/L', '×10⁹/L'))
            value = '—' if pd.isna(result.value_num) else f'{result.value_num:g}'.replace('.', ',')
            rows.append(
                f'<tr><th scope="row">{label}</th><td>{value} <small>{unit}</small></td>'
                f'<td>{result.available_at:%H:%M}</td></tr>'
            )
        st.html(
            '<table class="signal-data-table signal-labs" aria-label="Xét nghiệm mới trả">'
            '<thead><tr><th scope="col">Xét nghiệm</th><th scope="col">Kết quả</th>'
            '<th scope="col">Giờ có KQ</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
        )

    render(new_labs.head(5))
    if len(new_labs) > 5:
        with st.expander(f'Xem {len(new_labs) - 5} kết quả còn lại'):
            render(new_labs.iloc[5:])


page_header('Chạy ca mẫu', 'Theo dõi điểm sepsis và dữ liệu EMR tại từng mốc giờ.')
try:
    tables = sample_tables(DATA_PATH.stat().st_mtime_ns)
    model, meta = load_bundle()
except (FileNotFoundError, ValueError) as exc:
    st.error(str(exc))
    st.stop()

encounters = tables['Encounters'].set_index('encounter_id')
outcomes = tables['ReferenceOutcomes'].set_index('encounter_id')
snapshots = tables['FeatureSnapshots']
labels = tables['Labels']
eligible = labels.loc[labels['eligible_sepsis'].eq(1), ['encounter_id', 'prediction_at']]
eligible_snapshots = snapshots.merge(eligible, on=['encounter_id', 'prediction_at'], validate='one_to_one')
scored = predict_scores(model, eligible_snapshots).assign(threshold=meta['threshold'])
if scored.empty:
    st.info('Chưa có mốc đủ điều kiện để chấm điểm.')
    st.stop()

example_id, example_at = choose_example(scored, outcomes)
case_ids = [example_id, *sorted(set(scored['encounter_id']) - {example_id})]
with st.container(key='replay_toolbar', border=True):
    first, ward, clock, action = st.columns([1.25, 1, 1.2, 1.15], vertical_alignment='bottom')
    case_id = first.selectbox('Hồ sơ mẫu', case_ids,
                              format_func=lambda eid: f'{eid} · Ca gợi ý' if eid == example_id else eid)
    case = encounters.loc[case_id]
    t0 = pd.Timestamp(case['triage_completed_at'])
    points = scored.loc[scored['encounter_id'].eq(case_id)].sort_values('prediction_at').copy()
    points['hour'] = (points['prediction_at'] - t0).dt.total_seconds() / 3600
    times = points['prediction_at'].tolist()
    default = times.index(example_at) if case_id == example_id and example_at in times else 0
    time_key = f'replay_time_{case_id}'
    at = clock.selectbox(
        'Mốc chấm điểm', times, index=default, key=time_key,
        format_func=lambda value: f'T0+{(value - t0).total_seconds()/3600:g}h · {value:%H:%M}',
    )
    position = times.index(at)
    row = points.iloc[position]
    location = escape(LOCATIONS.get(row['location_code'], str(row['location_code'])))
    ward.html(f'<div class="signal-readout"><span>Khoa tại mốc này</span><div>{location}</div></div>')
    action.button('Sang mốc tiếp theo', disabled=position + 1 == len(times),
                  type='primary', key='replay_next', on_click=step_to,
                  args=(time_key, times[min(position + 1, len(times)-1)]), width='stretch')
    sex = 'Nữ' if case['sex'] == 'F' else 'Nam'
    st.caption(f'{int(case["age_years"])} tuổi · {sex} · T0 {t0:%d/%m/%Y %H:%M}')

snapshot = eligible_snapshots.loc[
    eligible_snapshots['encounter_id'].eq(case_id) & eligible_snapshots['prediction_at'].eq(at)
]
vitals, labs, symptoms = latest_available(tables, case_id, at)
previous = points.iloc[position-1] if position else None
previous_at = previous['prediction_at'] if previous is not None else t0
previous_vitals = (
    latest_available(tables, case_id, previous_at)[0] if previous is not None else vitals.iloc[:0]
)
result, context = st.columns([1.15, 1], gap='medium', border=True)
with result:
    st.subheader('Kết quả sepsis', anchor=False)
    show_result(at, row['risk_score'], meta['threshold'],
                previous['risk_score'] if previous is not None else None)
    st.subheader('Diễn biến theo giờ', anchor=False)
    chart_area = st.container()
    reveal = st.toggle('Hiện mốc khởi phát tham chiếu')
    onset = outcomes.loc[case_id, 'sepsis_onset_at']
    onset_hour = (onset - t0).total_seconds() / 3600 if reveal and pd.notna(onset) else None
    with chart_area:
        show_timeline(points.iloc[:position+1].rename(columns={'risk_score': 'score'}), row['hour'], onset_hour)
    if reveal:
        if pd.isna(onset):
            st.caption('Theo hồ sơ mẫu, sepsis không khởi phát trong lượt khám này.')
        else:
            within = 0 < (onset - at).total_seconds() <= 6 * 3600
            window = 'trong' if within else 'ngoài'
            st.caption(f'Mốc khởi phát tham chiếu {onset:%d/%m %H:%M} nằm {window} cửa sổ 6 giờ của mốc đang xem.')
with context:
    st.subheader('Sinh hiệu gần nhất', anchor=False)
    vital_comparison(previous_vitals, vitals, previous['hour'] if previous is not None else None,
                     row['hour'])
    lab_results(labs, previous_at, at)

with st.expander('Xem bản ghi EMR sẵn có'):
    a, b, c = st.tabs(['Sinh hiệu gần nhất', 'Xét nghiệm', 'Triệu chứng'])
    with a:
        st.dataframe(vitals.drop(columns=['encounter_id']), hide_index=True, width='stretch')
    with b:
        st.dataframe(labs[['test_code', 'value_num', 'unit', 'available_at']],
                     hide_index=True, width='stretch')
    with c:
        st.dataframe(symptoms.drop(columns=['encounter_id']), hide_index=True, width='stretch')
show_feature_details(snapshot, model)
