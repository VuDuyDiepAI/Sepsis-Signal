"""Shared sepsis score presentation for manual entry and sample replay."""
from html import escape

import altair as alt
import pandas as pd
import streamlit as st

from src.mock_emr import FEATURES, explain_log_odds, format_feature_name_vi

SCORE_BLUE = '#155ca8'


def page_header(title, description):
    st.title(title, anchor=False)
    st.markdown(f'<p class="signal-lead">{description}</p>', unsafe_allow_html=True)


def display_case_id(case_id):
    return case_id.replace('DEMO-', 'HS-', 1) if case_id.startswith('DEMO-') else case_id


def select_manual_case(case_id, hour):
    st.session_state.manual_case_id = case_id
    st.session_state.manual_case_picker = case_id
    st.session_state[f'hour_{case_id}'] = hour


def percent(score):
    return f'{score:.2%}'


def show_result(at, score=None, threshold=None, previous=None):
    if score is None:
        st.markdown(
            '<div class="signal-result signal-empty" role="status"><strong>Chưa chấm mốc này</strong>'
            '<span>Lưu dữ liệu để xem điểm sepsis.</span></div>', unsafe_allow_html=True,
        )
        return

    above = score >= threshold
    style = ' signal-alert' if above else ''
    label = 'Vượt ngưỡng cảnh báo' if above else 'Dưới ngưỡng cảnh báo'
    st.markdown(
        f'<div class="signal-result{style}" role="status"><strong>{label}</strong>'
        f'<span>Mốc {at:%d/%m %H:%M} · Cửa sổ dự báo 6 giờ tiếp theo</span></div>',
        unsafe_allow_html=True,
    )
    with st.container(key='score_summary'):
        cols = st.columns(3)
        cols[0].metric('Điểm sepsis', percent(score))
        cols[1].metric('Ngưỡng cảnh báo', percent(threshold))
        change = f'{(score - previous) * 100:+.2f}' if previous is not None else '—'
        cols[2].metric('Thay đổi · điểm %', change)
    if previous is None:
        st.caption('Mốc chấm đầu tiên của hồ sơ.')
    if percent(score) == percent(threshold):
        st.caption('Điểm và ngưỡng hiển thị đã làm tròn. Trạng thái dùng giá trị đầy đủ.')


def show_timeline(rows, selected_hour, onset_hour=None, lab_events=None):
    """Plot observed scores, their recorded thresholds, and the selected hour."""
    if rows.empty:
        st.caption('Biểu đồ sẽ xuất hiện sau lần chấm đầu tiên.')
        return
    rows = rows.loc[rows['hour'] <= selected_hour].sort_values('hour')
    if rows.empty:
        st.caption('Chưa có kết quả tại hoặc trước mốc đang xem.')
        return
    x = alt.X('hour:Q', title='Giờ sau T0', axis=alt.Axis(tickMinStep=1))
    y = alt.Y('score:Q', title='Điểm sepsis', axis=alt.Axis(format='%'))
    tooltip = [
        alt.Tooltip('hour:Q', title='Giờ sau T0', format='g'),
        alt.Tooltip('score:Q', title='Điểm sepsis', format='.2%'),
        alt.Tooltip('threshold:Q', title='Ngưỡng cảnh báo', format='.2%'),
    ]
    base = alt.Chart(rows)
    layers = [
        base.mark_line(color=SCORE_BLUE, strokeWidth=2.4).encode(x=x, y=y),
        base.mark_point(filled=True, size=65).encode(
            x=x, y=y, tooltip=tooltip,
            color=alt.condition('datum.score >= datum.threshold', alt.value('#a33b29'),
                                alt.value(SCORE_BLUE)),
        ),
        alt.Chart(pd.DataFrame({'hour': [selected_hour]})).mark_rule(
            color=SCORE_BLUE, opacity=0.38,
        ).encode(x=x),
    ]
    threshold_y = alt.Y('threshold:Q', title='Điểm sepsis', axis=alt.Axis(format='%'))
    if rows['threshold'].nunique() == 1:
        layers.insert(0, alt.Chart(rows[['threshold']].head(1)).mark_rule(
            color='#657b94', strokeDash=[5, 4],
        ).encode(y=threshold_y))
    else:
        layers.insert(0, base.mark_line(
            color='#657b94', strokeDash=[5, 4], interpolate='step-after',
        ).encode(x=x, y=threshold_y))
    if onset_hour is not None:
        layers.append(alt.Chart(pd.DataFrame({'hour': [onset_hour]})).mark_rule(
            color='#a33b29', strokeDash=[2, 4],
        ).encode(x=x))
    if lab_events is not None and not lab_events.empty:
        events = lab_events.loc[lab_events['hour'].le(selected_hour)]
        layers.append(alt.Chart(events).mark_rule(
            color='#607994', opacity=0.4, strokeDash=[2, 5],
        ).encode(x='hour:Q', tooltip=[alt.Tooltip('event:N', title='Dữ liệu mới'),
                                     alt.Tooltip('time:N', title='Giờ có kết quả')]))
    chart = alt.layer(*layers).properties(height=340).configure_axis(
        labelFontSize=16, titleFontSize=17, labelColor='#4c627b', titleColor='#152b45',
    )
    st.altair_chart(chart, width='stretch')
    caption = 'Đường xám nét đứt biểu thị ngưỡng cảnh báo. Vạch xanh dương đánh dấu mốc đang xem.'
    if lab_events is not None and not lab_events.empty:
        caption += ' Vạch chấm xám đánh dấu xét nghiệm mới trả.'
    if onset_hour is not None:
        caption += ' Vạch đỏ đánh dấu mốc khởi phát tham chiếu của hồ sơ mẫu.'
    st.caption(caption)


VITAL_DISPLAY = (
    ('Nhịp tim', 'lần/phút', 'heart_rate_bpm', 0),
    ('Nhịp thở', 'lần/phút', 'respiratory_rate_per_min', 0),
    ('HA tâm thu', 'mmHg', 'sbp_mmhg', 0),
    ('MAP', 'mmHg', 'map_mmhg', 0),
    ('SpO₂', '%', 'spo2_pct', 0),
    ('Nhiệt độ', '°C', 'temperature_c', 1),
    ('GCS', 'điểm', 'gcs', 0),
)
LAB_DISPLAY = {
    'WBC': 'Bạch cầu', 'platelets': 'Tiểu cầu', 'creatinine': 'Creatinine',
    'bilirubin_total': 'Bilirubin toàn phần', 'CRP': 'CRP',
    'procalcitonin': 'Procalcitonin', 'lactate': 'Lactate', 'PaO2': 'PaO₂',
    'glucose': 'Glucose', 'albumin': 'Albumin', 'hemoglobin': 'Hemoglobin',
    'sodium': 'Natri', 'potassium': 'Kali', 'PaCO2': 'PaCO₂', 'HCO3': 'HCO₃⁻',
}


def lab_markers(labs, t0):
    if labs.empty:
        return pd.DataFrame(columns=['hour', 'event', 'time'])
    events = labs.groupby('available_at').size().reset_index(name='count')
    events['hour'] = (events['available_at'] - pd.Timestamp(t0)).dt.total_seconds() / 3600
    events['event'] = events['count'].astype(str) + ' kết quả xét nghiệm'
    events['time'] = events['available_at'].dt.strftime('%d/%m %H:%M')
    return events


def show_changes(previous_vitals, current_vitals, labs, previous_at, at, *, title='Thay đổi từ lần trước'):
    """Display source observations and result availability beside their changes."""
    st.subheader(title, anchor=False)
    before = {} if previous_vitals.empty else previous_vitals.iloc[-1]
    current = {} if current_vitals.empty else current_vitals.iloc[-1]
    changed, other, new_results = [], [], []

    def number(value, decimals):
        return '—' if pd.isna(value) else f'{value:.{decimals}f}'.replace('.', ',')

    measured = current.get('measured_at', current.get('observed_at'))
    available = current.get('available_at')
    timing = (f'Đo {pd.Timestamp(measured):%d/%m %H:%M} · '
              f'có trên EMR {pd.Timestamp(available):%H:%M}') if measured is not None else 'Chưa có bản đo'
    for label, unit, field, decimals in VITAL_DISPLAY:
        old, new = before.get(field, float('nan')), current.get(field, float('nan'))
        if pd.isna(old) and pd.isna(new):
            continue
        old_text, new_text = number(old, decimals), number(new, decimals)
        difference = 'Mới' if pd.isna(old) else '—' if pd.isna(new) else f'{new-old:+.{decimals}f}'
        row = (label, unit, old_text, new_text, difference, timing)
        (changed if old_text != new_text else other).append(row)

    if not labs.empty:
        recent = labs.loc[labs['available_at'].gt(pd.Timestamp(previous_at))
                          & labs['available_at'].le(pd.Timestamp(at))]
        for item in recent.sort_values('available_at', ascending=False).itertuples(index=False):
            earlier = labs.loc[labs['test_code'].eq(item.test_code)
                               & labs['available_at'].le(pd.Timestamp(previous_at))]
            old = earlier.iloc[-1]['value_num'] if not earlier.empty else float('nan')
            timing_lab = f'Kết quả {pd.Timestamp(item.available_at):%d/%m %H:%M}'
            new_results.append((LAB_DISPLAY.get(item.test_code, item.test_code), str(item.unit),
                                number(old, 2), number(item.value_num, 2), 'Kết quả mới', timing_lab))

    def render(rows):
        body = ''.join(
            '<tr><td>' + escape(f'{label} ({unit})') + '<small>' + escape(time)
            + '</small></td>' + ''.join(f'<td>{escape(str(cell))}</td>' for cell in
                                       (old, new, difference)) + '</tr>'
            for label, unit, old, new, difference, time in rows
        )
        st.html('<div class="signal-table-scroll"><table class="signal-data-table signal-changes">'
                '<thead><tr><th>Chỉ số</th><th>Trước</th><th>Hiện tại</th><th>Thay đổi</th></tr></thead>'
                f'<tbody>{body}</tbody></table></div>')

    if current_vitals.empty:
        st.caption('Chưa có bản đo sinh hiệu tại mốc đang xem.')
    if changed or new_results:
        vital_limit = 4 if new_results else 6
        lab_limit = max(2, 6 - len(changed[:vital_limit]))
        render(changed[:vital_limit] + new_results[:lab_limit])
        remaining = changed[vital_limit:] + new_results[lab_limit:]
        if remaining:
            with st.expander(f'Xem thêm {len(remaining)} thay đổi'):
                render(remaining)
    elif not current_vitals.empty:
        st.caption('Các giá trị sinh hiệu đang hiển thị giống mốc trước. Chưa có xét nghiệm mới trả.')
    if other:
        with st.expander('Các sinh hiệu còn lại'):
            render(other)
    st.caption('So sánh các bản ghi đã có tại mỗi mốc. Thời điểm dữ liệu được hiển thị ở từng dòng.')


def show_review(result_key, case_id, at, model_version, *, prediction_id=None):
    from src.manual_cases import record_review, review_history

    with st.container(border=True, key='review_panel'):
        st.subheader('Ghi nhận xem xét', anchor=False)
        reviews = review_history(case_id)
        review = next((item for item in reviews if item['result_key'] == result_key), None)
        if review:
            st.success(f'Đã xem xét · {review["reviewed_by"]} · '
                       f'{pd.Timestamp(review["reviewed_at"]):%d/%m/%Y %H:%M}')
            if review['note']:
                st.text(review['note'])
        else:
            st.caption(f'Chờ xem xét kết quả tại {pd.Timestamp(at):%d/%m %H:%M}.')
            from src.auth import session_user
            user = session_user(st.session_state.get('auth_token'))
            if not user:
                st.error('Phiên làm việc đã hết hạn. Đăng nhập lại để ghi nhận xem xét.')
                return
            with st.form(f'review_{result_key}'):
                st.caption(f'Người ghi nhận · {user["display_name"]}')
                note = st.text_area('Ghi chú xem xét (tùy chọn)', max_chars=1000, height=90)
                submitted = st.form_submit_button('Đã xem xét kết quả', type='primary', width='stretch')
            if submitted:
                try:
                    record_review(result_key=result_key, encounter_id=case_id,
                                  prediction_at=pd.Timestamp(at).isoformat(), model_version=model_version,
                                  reviewed_by=user['display_name'], reviewed_by_user_id=user['id'],
                                  note=note, prediction_id=prediction_id)
                except ValueError as exc:
                    st.error(str(exc))
                else:
                    st.rerun()
        st.caption('Ghi nhận theo tài khoản đăng nhập · giờ Việt Nam.')


def show_feature_details(snapshot, model=None):
    with st.expander('Xem dữ liệu đầu vào và cách tính điểm'):
        missing = int(snapshot[FEATURES].isna().sum(axis=1).iloc[0])
        st.caption(f'{len(FEATURES) - missing}/{len(FEATURES)} trường có giá trị trước tiền xử lý.')
        if model is not None:
            intercept, terms = explain_log_odds(model, snapshot)
            contribution = float(terms['log_odds_contribution'].sum())
            st.markdown(f'`z = {intercept:+.3f} {contribution:+.3f} = {intercept + contribution:+.3f}` · `điểm = sigmoid(z)`')
            detail = terms[['label_vi', 'transformed_value', 'coefficient', 'log_odds_contribution']]
            st.dataframe(detail.head(8).rename(columns={
                'label_vi': 'Đặc trưng có đóng góp lớn',
                'transformed_value': 'Sau tiền xử lý',
                'coefficient': 'Hệ số',
                'log_odds_contribution': 'Đóng góp vào z',
            }), hide_index=True, width='stretch')
        st.dataframe(pd.DataFrame({
            'Trường': [format_feature_name_vi(key) for key in FEATURES],
            'Giá trị': [str(snapshot.iloc[0][key]) if pd.notna(snapshot.iloc[0][key])
                        else 'Chưa có' for key in FEATURES],
        }), hide_index=True, width='stretch', height=245)
