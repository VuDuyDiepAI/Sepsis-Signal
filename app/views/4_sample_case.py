"""Replay sepsis scores using mock EMR values available at each selected hour."""
import hashlib

import pandas as pd
import streamlit as st

from app.shared_ui import (lab_markers, page_header, show_changes, show_feature_details,
                           show_result, show_review, show_timeline)
from src.manual_cases import review_history
from src.mock_emr import DATA_PATH, latest_available, load_bundle, load_tables, predict_scores

LOCATIONS = {'ED': 'Cấp cứu', 'WARD': 'Nội trú', 'ICU': 'Hồi sức tích cực'}
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
    ward.text_input('Khoa tại mốc này', value=LOCATIONS.get(row['location_code'], str(row['location_code'])),
                    disabled=True)
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
sample_signature = '|'.join((case_id, at.isoformat(), meta['model_version'],
                             meta['source_sha256'], repr(float(row['risk_score'])),
                             repr(float(meta['threshold']))))
review_key = 'sample:' + hashlib.sha256(sample_signature.encode()).hexdigest()
reviews = {r['result_key']: r for r in review_history(case_id)}
with st.container(border=True, key='sample_result'):
    st.subheader('Trạng thái cảnh báo', anchor=False)
    show_result(at, row['risk_score'], meta['threshold'],
                previous['risk_score'] if previous is not None else None)
    st.caption('Đã xem xét' if review_key in reviews else 'Chờ xem xét')

with st.container(border=True):
    show_changes(previous_vitals, vitals, labs, previous_at, at)

with st.container(border=True, key='timeline_panel'):
    st.subheader('Diễn biến nguy cơ', anchor=False)
    chart_area = st.container()
    reveal = st.toggle('Hiện mốc khởi phát tham chiếu')
    onset = outcomes.loc[case_id, 'sepsis_onset_at']
    onset_hour = (onset - t0).total_seconds() / 3600 if reveal and pd.notna(onset) else None
    with chart_area:
        show_timeline(points.iloc[:position+1].rename(columns={'risk_score': 'score'}),
                      row['hour'], onset_hour, lab_events=lab_markers(labs, t0))
    if reveal:
        if pd.isna(onset):
            st.caption('Theo hồ sơ mẫu, sepsis không khởi phát trong lượt khám này.')
        else:
            within = 0 < (onset - at).total_seconds() <= 6 * 3600
            window = 'trong' if within else 'ngoài'
            st.caption(f'Mốc khởi phát tham chiếu {onset:%d/%m %H:%M} nằm {window} cửa sổ 6 giờ của mốc đang xem.')

show_review(review_key, case_id, at, meta['model_version'])
st.button('Xem mốc tiếp theo', disabled=position + 1 == len(times),
          key='sample_next_bottom', on_click=step_to,
          args=(time_key, times[min(position + 1, len(times)-1)]), width='stretch')

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
