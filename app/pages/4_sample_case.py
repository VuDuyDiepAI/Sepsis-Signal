"""Read-only example from the generated EMR workbook — Full-Width Horizontal Layout."""
import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from src.mock_emr import (FEATURES, explain_log_odds, format_feature_name_vi,
                          latest_available, load_bundle, load_tables, predict_scores)


@st.cache_data(show_spinner='Đang đọc EMR giả...')
def data():
    return load_tables()


@st.cache_resource(show_spinner='Đang nạp hồi quy logistic...')
def bundle():
    return {target: load_bundle(target) for target in ('sepsis', 'shock')}


st.markdown('<div class="app-kicker">Trang chủ &nbsp;&gt;&nbsp; <b>Ca mẫu từ bộ EMR giả</b></div>', unsafe_allow_html=True)
st.title('Ca mẫu từ bộ EMR giả')
st.markdown('<p class="app-subtitle">Đối chiếu từng mốc thời gian: Dữ liệu EMR đã có trên hệ thống (available_at ≤ t) → Đặc trưng lâm sàng → Hồi quy Logistic (v2) → Cảnh báo trong 6 giờ tới.</p>', unsafe_allow_html=True)

try:
    tables = data()
    bundles = bundle()
except Exception as exc:
    st.error(f'Không nạp được bộ mô phỏng: {exc}')
    st.stop()

encounters = tables['Encounters']
outcomes = tables['ReferenceOutcomes'].set_index('encounter_id')
enc_by_id = encounters.set_index('encounter_id')
case_ids = encounters.encounter_id.tolist()
default_case = st.session_state.get('chosen_case')
if default_case not in case_ids:
    default_case = next((eid for eid in case_ids if pd.notna(outcomes.loc[eid, 'sepsis_onset_at'])), case_ids[0])


def format_case_label(eid: str) -> str:
    row = outcomes.loc[eid]
    t0_val = pd.Timestamp(enc_by_id.loc[eid, 'triage_completed_at'])
    if pd.notna(row['shock_onset_at']):
        sh_h = int((pd.Timestamp(row['shock_onset_at']) - t0_val).total_seconds() // 3600)
        sp_h = int((pd.Timestamp(row['sepsis_onset_at']) - t0_val).total_seconds() // 3600)
        return f"{eid} · 🔴 Sepsis (T0+{sp_h}h) → Sốc nhiễm khuẩn (T0+{sh_h}h)"
    if pd.notna(row['sepsis_onset_at']):
        sp_h = int((pd.Timestamp(row['sepsis_onset_at']) - t0_val).total_seconds() // 3600)
        return f"{eid} · 🟠 Sepsis mới (khởi phát T0+{sp_h}h)"
    if row['scenario_scripted'] == 'infection_without_sepsis':
        return f"{eid} · 🟡 Nhiễm trùng khu trú (Không tiến triển Sepsis)"
    return f"{eid} · 🟢 Ổn định (Không nhiễm khuẩn huyết)"


# SECTION 1 (FULL-WIDTH HORIZONTAL): CHỌN CA MẪU & MỐC THỜI GIAN
st.markdown(
    '<div class="vm-panel-header">'
    '<span>1. Chọn ca bệnh mẫu &amp; Mốc chấm điểm theo giờ</span>'
    '<span class="vm-panel-sub">360 lượt khám · 60 ca Sepsis · 12 ca Sốc nhiễm khuẩn</span>'
    '</div>',
    unsafe_allow_html=True,
)

c_sel1, c_sel2 = st.columns([1.6, 1.2], gap='medium')
case_id = c_sel1.selectbox(
    'Chọn một lượt khám EMR giả',
    case_ids,
    index=case_ids.index(default_case),
    format_func=format_case_label,
)
patient = encounters.loc[encounters.encounter_id == case_id].iloc[0]
t0_case = pd.Timestamp(patient.triage_completed_at)
snapshots = tables['FeatureSnapshots'].loc[tables['FeatureSnapshots'].encounter_id == case_id].sort_values('prediction_at')
times = snapshots.prediction_at.tolist()
onset_val = outcomes.loc[case_id, 'sepsis_onset_at']
if pd.notna(onset_val):
    onset_h = int((pd.Timestamp(onset_val) - t0_case).total_seconds() // 3600)
    default_time_idx = max(0, min(len(times) - 1, onset_h - 3))
else:
    default_time_idx = min(3, len(times) - 1)
at = c_sel2.selectbox(
    'Mốc chấm điểm (T0+1h, rồi mỗi 60 phút)',
    times,
    index=default_time_idx,
    format_func=lambda t: f"T0+{int((pd.Timestamp(t) - t0_case).total_seconds() // 3600)}h · {pd.Timestamp(t).strftime('%d/%m/%Y %H:%M')}",
)
snapshot = snapshots.loc[snapshots.prediction_at == at].iloc[[0]]
vitals, labs, symptoms = latest_available(tables, case_id, at)
selected_label = tables['Labels'].loc[(tables['Labels'].encounter_id == case_id) & (tables['Labels'].prediction_at == at)].iloc[0]

c1, c2, c3, c4 = st.columns(4, gap='small')
c1.metric('Lượt khám giả', case_id)
c2.metric('Tuổi / Giới', f"{int(patient.age_years)} · {'Nữ' if patient.sex == 'F' else 'Nam'}")
c3.metric('Khu vực tại mốc t', snapshot.location_code.iloc[0])
c4.metric('Xét nghiệm đã trả KQ', f"{len(labs)} bản ghi")

# SECTION 2 (FULL-WIDTH HORIZONTAL): KẾT QUẢ DỰ BÁO 6H TỚI & BIỂU ĐỒ SONG SONG
st.markdown(
    '<div class="vm-panel-header" style="margin-top:16px;">'
    '<span>2. Dự báo Hồi quy Logistic (6 giờ tới) &amp; Phân tích AI</span>'
    '<span class="vm-panel-sub">Cửa sổ dự báo (t, t+6h]</span>'
    '</div>',
    unsafe_allow_html=True,
)

top_pred1, top_pred2, top_pred3 = st.columns([1.1, 1.1, 1.6], gap='small')
for key, column, label in [('sepsis', top_pred1, 'Sepsis'), ('shock', top_pred2, 'Sốc nhiễm khuẩn')]:
    m, info = bundles[key]
    value = float(m.predict_proba(snapshot[FEATURES])[0, 1])
    is_over = value >= info['threshold']
    card_cls = 'alert' if is_over else 'ok'
    badge_txt = f'🔴 Vượt ngưỡng ({info["threshold"]:.1%})' if is_over else f'🟢 Dưới ngưỡng ({info["threshold"]:.1%})'
    with column:
        st.metric(f'Điểm LR · {label}', f'{value:.1%}')
        st.markdown(f'<span class="tag-pill {card_cls}">{badge_txt}</span>', unsafe_allow_html=True)

with top_pred3:
    target = st.radio('Xem phân tích chi tiết cho mô hình', ['Sepsis', 'Sốc nhiễm khuẩn'], horizontal=True)
    reference = outcomes.loc[case_id]
    st.markdown(
        f'<div style="background:#ffffff;border:1px solid #cedae4;border-radius:4px;padding:10px 14px;font-size:12px;color:#17324d;">'
        f'<b>Kết cục giả lập của ca này:</b><br>'
        f'• Khởi phát Sepsis: <b>{str(reference.sepsis_onset_at) if pd.notna(reference.sepsis_onset_at) else "Không có"}</b><br>'
        f'• Khởi phát Sốc nhiễm khuẩn: <b>{str(reference.shock_onset_at) if pd.notna(reference.shock_onset_at) else "Không có"}</b>'
        f'</div>',
        unsafe_allow_html=True,
    )

target_key = 'sepsis' if target == 'Sepsis' else 'shock'
model, meta = bundles[target_key]
score = float(model.predict_proba(snapshot[FEATURES])[0, 1])
threshold = float(meta['threshold'])
eligible_col = f'eligible_{target_key}'

intercept, contributions = explain_log_odds(model, snapshot)
linear_sum = intercept + float(contributions.log_odds_contribution.sum())
assert np.isclose(score, 1 / (1 + np.exp(-linear_sum)))

# SECTION 3 (FULL-WIDTH): DIỄN BIẾN ĐIỂM QUA CÁC GIỜ
st.markdown(
    '<div class="vm-panel-header" style="margin-top:18px;">'
    '<span>3. Diễn biến xác suất dự báo qua các giờ (Trước khởi phát)</span>'
    '<span class="vm-panel-sub">Đường nét đứt màu đỏ là ngưỡng cảnh báo demo</span>'
    '</div>',
    unsafe_allow_html=True,
)
with st.container(border=True):
    all_scores = predict_scores(model, snapshots)
    all_scores = all_scores.merge(tables['Labels'][['encounter_id', 'prediction_at', eligible_col]], on=['encounter_id', 'prediction_at'], validate='one_to_one')
    all_scores = all_scores.loc[all_scores[eligible_col] == 1].copy()
    all_scores['threshold'] = threshold
    if all_scores.empty:
        st.info('Lượt khám này không có mốc đủ điều kiện đánh giá hồi cứu.')
    else:
        chart = alt.Chart(all_scores).mark_line(point=alt.OverlayMarkDef(size=60), color='#0875b5', strokeWidth=2.5).encode(
            x=alt.X('prediction_at:T', title='Thời điểm chấm điểm theo giờ'),
            y=alt.Y('risk_score:Q', title='Xác suất dự báo (6h tới)', scale=alt.Scale(domain=[0, 1]), axis=alt.Axis(format='%')),
            tooltip=['prediction_at:T', alt.Tooltip('risk_score:Q', format='.1%'), 'location_code:N'],
        ).properties(height=250)
        limit = alt.Chart(all_scores).mark_line(strokeDash=[5, 4], color='#b42318', strokeWidth=2).encode(x='prediction_at:T', y='threshold:Q')
        sample_chart = (chart + limit).configure(background='#ffffff').configure_axis(
            labelColor='#17324d', titleColor='#17324d', gridColor='#e2e8f0'
        )
        st.altair_chart(sample_chart, width='stretch', theme=None)

# SECTION 4 (FULL-WIDTH): ĐÓNG GÓP LOG-ODDS TẠI MỐC ĐANG CHỌN (XAI)
st.markdown(
    '<div class="vm-panel-header" style="margin-top:18px;">'
    '<span>4. Phân rã đóng góp Log-Odds tại mốc đang chọn (Giải thích mô hình XAI)</span>'
    f'<span class="vm-panel-sub">Mô hình: {target} · z = {intercept:+.2f} (chặn) + {contributions.log_odds_contribution.sum():+.2f} (biến) = {linear_sum:+.2f} ➔ sigmoid(z) = {score:.1%}</span>'
    '</div>',
    unsafe_allow_html=True,
)
with st.container(border=True):
    top = contributions.head(10).copy()
    top['Chiều tác động'] = np.where(top['log_odds_contribution'] >= 0, 'Tăng nguy cơ (+)', 'Giảm nguy cơ (-)')
    chart_contrib = alt.Chart(top).mark_bar(cornerRadiusEnd=0).encode(
        x=alt.X('log_odds_contribution:Q', title='Đóng góp Log-Odds (βᵢ × xᵢ)'),
        y=alt.Y('label_vi:N', sort=top['label_vi'].tolist(), title=None, axis=alt.Axis(labelLimit=420)),
        color=alt.Color('Chiều tác động:N', scale=alt.Scale(domain=['Tăng nguy cơ (+)', 'Giảm nguy cơ (-)'], range=['#b42318', '#0875b5']), legend=alt.Legend(orient='top')),
        tooltip=['label_vi', alt.Tooltip('transformed_value:Q', format='.2f'), alt.Tooltip('coefficient:Q', format='+.3f'), alt.Tooltip('log_odds_contribution:Q', format='+.3f')],
    ).properties(height=280).configure(background='#ffffff').configure_axis(
        labelColor='#17324d', titleColor='#17324d', gridColor='#e2e8f0'
    ).configure_legend(labelColor='#17324d', titleColor='#17324d')
    st.altair_chart(chart_contrib, width='stretch', theme=None)

    top_table = top[['label_vi', 'feature', 'transformed_value', 'coefficient', 'log_odds_contribution']].rename(columns={
        'label_vi': 'Tên đặc trưng lâm sàng',
        'feature': 'Mã biến sau mã hóa',
        'transformed_value': 'Giá trị chuẩn hóa (xᵢ)',
        'coefficient': 'Hệ số LR (βᵢ)',
        'log_odds_contribution': 'Đóng góp Log-Odds (βᵢ × xᵢ)',
    })
    st.dataframe(top_table, hide_index=True, width='stretch')

# SECTION 5 (FULL-WIDTH): DỮ LIỆU EMR TẠI MỐC t
st.markdown(
    '<div class="vm-panel-header" style="margin-top:18px;">'
    '<span>5. Dữ liệu EMR sẵn có tại thời điểm t (available_at ≤ t)</span>'
    '<span class="vm-panel-sub">Chốt chặn chống rò rỉ dữ liệu tương lai</span>'
    '</div>',
    unsafe_allow_html=True,
)
tab_v, tab_l, tab_f = st.tabs([
    '🩺 Sinh hiệu & Triệu chứng gần nhất',
    '🧪 Kết quả xét nghiệm đã có',
    '📋 Bảng 36 biến đặc trưng gốc',
])
with tab_v:
    v_col, s_col = st.columns([1.4, 1.0], gap='medium')
    with v_col:
        st.markdown('**Sinh hiệu gần nhất**')
        st.dataframe(
            vitals[['observed_at', 'available_at', 'heart_rate_bpm', 'respiratory_rate_per_min', 'sbp_mmhg', 'spo2_pct', 'temperature_c', 'gcs']].tail(8),
            hide_index=True,
            width='stretch',
        )
    with s_col:
        st.markdown('**Triệu chứng nghi nhiễm đã ghi nhận**')
        st.dataframe(symptoms.tail(8), hide_index=True, width='stretch')
with tab_l:
    st.dataframe(labs[['test_code', 'value_num', 'unit', 'available_at']].tail(12), hide_index=True, width='stretch')
with tab_f:
    feature_frame = pd.DataFrame({
        'Tên lâm sàng': [format_feature_name_vi(name) for name in FEATURES],
        'Mã đặc trưng': FEATURES,
        'Giá trị tại t': [str(snapshot.iloc[0][name]) for name in FEATURES],
    })
    st.dataframe(feature_frame, hide_index=True, width='stretch', height=260)
