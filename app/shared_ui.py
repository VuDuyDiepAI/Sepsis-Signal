"""Shared sepsis score presentation for manual entry and sample replay."""
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
        cols = st.columns(2)
        cols[0].metric('Điểm sepsis', percent(score))
        cols[1].metric('Ngưỡng cảnh báo', percent(threshold))
    if previous is not None:
        st.caption(f'{(score - previous) * 100:+.2f} điểm phần trăm so với mốc đã chấm trước đó.')
    if percent(score) == percent(threshold):
        st.caption('Điểm và ngưỡng hiển thị đã làm tròn. Trạng thái dùng giá trị đầy đủ.')


def show_timeline(rows, selected_hour, onset_hour=None):
    """Plot observed scores, their recorded thresholds, and the selected hour."""
    if rows.empty:
        st.caption('Biểu đồ sẽ xuất hiện sau lần chấm đầu tiên.')
        return
    rows = rows.sort_values('hour')
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
    chart = alt.layer(*layers).properties(height=270).configure_axis(
        labelFontSize=13, titleFontSize=14, labelColor='#4c627b', titleColor='#152b45',
    )
    st.altair_chart(chart, width='stretch')
    caption = 'Đường xám nét đứt biểu thị ngưỡng cảnh báo. Vạch xanh dương đánh dấu mốc đang xem.'
    if onset_hour is not None:
        caption += ' Vạch đỏ đánh dấu mốc khởi phát tham chiếu của hồ sơ mẫu.'
    st.caption(caption)


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
