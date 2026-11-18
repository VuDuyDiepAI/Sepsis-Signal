"""Manual hourly entry for synthetic sepsis and shock alerts — Full-Width Horizontal Layout."""
from datetime import datetime, timedelta

import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from src.manual_cases import (COMORBIDITIES, LAB_UNITS, LOCATIONS, SYMPTOMS,
    build_features, create_case, event_rows, get_case, list_cases,
    prediction_history, recompute_scored_hours, save_entry, score_hour)
from src.mock_emr import FEATURES, explain_log_odds, format_feature_name_vi, load_bundle


@st.cache_resource
def bundles():
    return {target: load_bundle(target) for target in ('sepsis', 'shock')}


COMORBIDITY_NAMES = {
    'diabetes': 'Đái tháo đường',
    'cardiovascular_disease': 'Bệnh tim mạch',
    'chronic_kidney_disease': 'Bệnh thận mạn',
    'chronic_liver_disease': 'Bệnh gan mạn',
    'chronic_lung_disease': 'Bệnh phổi mạn',
    'cancer': 'Bệnh lý ác tính (Ung thư)',
    'immunosuppression': 'Suy giảm / Ức chế miễn dịch',
}

LOCATION_NAMES = {
    'ED': 'Khoa Cấp cứu (ED)',
    'WARD': 'Khoa Nội trú (WARD)',
    'ICU': 'Hồi sức tích cực (ICU)',
}

SYMPTOM_NAMES = {
    'respiratory': 'Hô hấp (ho, khó thở, ran phổi)',
    'urinary': 'Tiết niệu (tiểu buốt, tiểu đục, đau hông lưng)',
    'abdominal': 'Ổ bụng (đau bụng, phản ứng thành bụng)',
    'skin': 'Da / mô mềm (sưng nóng đỏ đau, vết thương)',
    'cns': 'Thần kinh TW (cổ cứng, rối loạn tri giác nghi nhiễm)',
}

LAB_INFO = [
    ('WBC', 'Bạch cầu (WBC)', 'Tham chiếu: 4,0 – 10,0 × 10⁹/L (SIRS: <4 hoặc >12)'),
    ('platelets', 'Tiểu cầu (PLT)', 'Tham chiếu: 150 – 400 × 10⁹/L (SOFA: <150)'),
    ('creatinine', 'Creatinine huyết thanh', 'Tham chiếu: 0,6 – 1,2 mg/dL (SOFA: ≥1,2)'),
    ('bilirubin_total', 'Bilirubin toàn phần', 'Tham chiếu: 0,2 – 1,2 mg/dL (SOFA: ≥1,2)'),
    ('CRP', 'Protein phản ứng C (CRP)', 'Tham chiếu: < 5,0 mg/L'),
    ('procalcitonin', 'Procalcitonin (PCT)', 'Tham chiếu: < 0,05 ng/mL (nghi nhiễm khuẩn: ≥0,5)'),
]


def when(label, default, key):
    st.markdown(
        f'<div style="font-size:12.5px;color:#526575;background:#f8fbfd;border:1px solid #d8e4ec;'
        f'border-radius:4px;padding:6px 12px;margin:4px 0;">'
        f'<strong style="color:#17324d;">{label}:</strong> {default.strftime("%H:%M · %d/%m/%Y")}</div>',
        unsafe_allow_html=True,
    )
    return default.replace(second=0, microsecond=0)


def advance_hour(case_id, new_hour):
    st.session_state[f'hour_{case_id}'] = new_hour


def show_score(value):
    return '<0,1%' if value < 0.001 else f'{value:.1%}'


def bedside_flags(feat_row: pd.Series) -> list[tuple[str, str]]:
    """Derive quick physiological reference badges at time t for nurses & physicians."""
    badges = []
    hr = feat_row.get('heart_rate_last_bpm')
    rr = feat_row.get('respiratory_rate_last_per_min')
    sbp = feat_row.get('sbp_last_mmhg')
    map_v = feat_row.get('map_last_mmhg')
    temp = feat_row.get('temperature_last_c')
    spo2 = feat_row.get('spo2_last_pct')
    gcs = feat_row.get('gcs_last')
    wbc = feat_row.get('WBC_last_10e9_L')

    if pd.notna(sbp) and sbp <= 100:
        badges.append(('alert', f'HA tâm thu thấp: {sbp:.0f} mmHg (qSOFA ≤ 100)'))
    if pd.notna(map_v) and map_v < 65:
        badges.append(('alert', f'MAP giảm: {map_v:.0f} mmHg (< 65)'))
    if pd.notna(rr) and rr >= 22:
        badges.append(('warn', f'Thở nhanh: {rr:.0f} lần/p (qSOFA ≥ 22)'))
    if pd.notna(hr) and hr > 90:
        badges.append(('warn', f'Mạch nhanh: {hr:.0f} lần/p (SIRS > 90)'))
    if pd.notna(temp):
        if temp > 38.0:
            badges.append(('warn', f'Sốt: {temp:.1f}°C'))
        elif temp < 36.0:
            badges.append(('alert', f'Hạ thân nhiệt: {temp:.1f}°C'))
    if pd.notna(spo2) and spo2 < 94:
        badges.append(('alert', f'SpO₂ giảm: {spo2:.0f}%'))
    if pd.notna(gcs) and gcs < 15:
        badges.append(('alert', f'GCS {gcs:.0f}/15'))
    if pd.notna(wbc) and (wbc > 12.0 or wbc < 4.0):
        badges.append(('warn', f'WBC: {wbc:.1f} × 10⁹/L'))
    return badges


st.markdown('<div class="app-kicker">Trang chủ &nbsp;&gt;&nbsp; <b>Nhập ca và dự đoán theo giờ</b></div>', unsafe_allow_html=True)
st.title('Theo dõi nguy cơ sepsis theo giờ')
st.markdown('<p class="app-subtitle">Tiếp nhận tại Cấp cứu (T0) → Cập nhật sinh hiệu, xét nghiệm &amp; triệu chứng theo từng mốc giờ → Dự báo nguy cơ Sepsis và Sốc nhiễm khuẩn trong 6 giờ tiếp theo bằng Hồi quy Logistic.</p>', unsafe_allow_html=True)

try:
    models = bundles()
    cases = list_cases()
except Exception as exc:
    st.error(f'Không mở được prototype: {exc}')
    st.stop()

# -------------------------------------------------------------------------
# SECTION 1 (FULL-WIDTH HORIZONTAL): HỒ SƠ CA BỆNH & TIẾP NHẬN TẠI MỐC T0
# -------------------------------------------------------------------------
st.markdown(
    '<div class="vm-panel-header">'
    '<span>1. Hồ sơ lượt khám &amp; Thông tin nền tại thời điểm T0</span>'
    '<span class="vm-panel-sub">Khoa Cấp cứu (ED) → Nội trú (WARD) → Hồi sức (ICU)</span>'
    '</div>',
    unsafe_allow_html=True,
)

with st.expander('＋ Tiếp nhận & Tạo lượt khám mới (Tại mốc T0 hoàn tất phân loại)', expanded=not cases):
    with st.form('new_case'):
        top_row = st.columns([1.4, 1.0, 1.0, 1.0, 1.0], gap='small')
        with top_row[0]:
            t0_default = datetime.now().replace(second=0, microsecond=0)
            t0_input = when('T0 (Phân loại ED)', t0_default, 'new_t0')
        age = top_row[1].number_input('Tuổi', min_value=18, max_value=120, value=55)
        sex = top_row[2].selectbox('Giới', ['Nữ', 'Nam'])
        height = top_row[3].number_input('Chiều cao (cm)', 80.0, 250.0, value=None)
        weight = top_row[4].number_input('Cân nặng (kg)', 20.0, 400.0, value=None)

        st.caption('Bệnh nền đã biết tại thời điểm tiếp nhận T0 (BMI sẽ tự động tính khi nhập chiều cao & cân nặng):')
        cols = st.columns(4)
        flags = {key: cols[i % 4].checkbox(COMORBIDITY_NAMES[key]) for i, key in enumerate(COMORBIDITIES)}
        create = st.form_submit_button('Tạo ca', type='primary')
    if create:
        try:
            st.session_state.manual_case_id = create_case(
                triage_completed_at=t0_input, age_years=age,
                sex='F' if sex == 'Nữ' else 'M', height_cm=height,
                weight_kg=weight, comorbidities=flags)
            st.rerun()
        except Exception as exc:
            st.error(str(exc))

cases = list_cases()
if not cases:
    st.info('Tạo một ca bệnh mới ở khung trên để bắt đầu nhập chỉ số ở mốc T0+1 giờ.')
    st.stop()

ids = [c['encounter_id'] for c in cases]
selected = st.session_state.get('manual_case_id')
sel_col, info_col = st.columns([1.2, 2.8], gap='medium')
with sel_col:
    case_id = st.selectbox('Lượt khám đang theo dõi', ids,
                           index=ids.index(selected) if selected in ids else 0)
st.session_state.manual_case_id = case_id
case = get_case(case_id)
t0 = datetime.fromisoformat(case['triage_completed_at'])
history = prediction_history(case_id)
scored_hours = sorted({int((datetime.fromisoformat(p['prediction_at']) - t0).total_seconds()/3600)
                       for p in history})
default_hour = min(36, max(scored_hours, default=0)+1)

active_comorbidities = [COMORBIDITY_NAMES[k] for k in COMORBIDITIES if case.get(k)]
comorb_html = ''.join(f'<span class="tag-pill">{name}</span>' for name in active_comorbidities) or '<span class="tag-pill ok">Không ghi nhận bệnh nền</span>'
sex_label = 'Nữ' if case['sex'] == 'F' else 'Nam'
bmi_label = f"{case['bmi_kg_m2']:.1f} kg/m²" if case.get('bmi_kg_m2') is not None else 'Chưa tính BMI'

with info_col:
    st.markdown(
        f'<div style="background:#ffffff;border:1px solid #cedae4;border-radius:4px;padding:10px 14px;margin-top:22px;font-size:12.5px;color:#17324d;">'
        f'<b>Thông tin nền tại T0:</b> Giới tính: <b>{sex_label}</b> &nbsp;·&nbsp; BMI: <b>{bmi_label}</b> &nbsp;·&nbsp; '
        f'Các mốc đã chấm: <b>{", ".join(f"T0+{h}h" for h in scored_hours) if scored_hours else "Chưa chấm mốc nào"}</b> &nbsp;·&nbsp; '
        f'<b>Bệnh nền:</b> {comorb_html}'
        f'</div>',
        unsafe_allow_html=True,
    )

# Full-width 4-column horizontal KPI row
k1, k2, k3, k4 = st.columns(4, gap='small')
k1.metric('Mã ca giả', case_id)
k2.metric('Tuổi', case['age_years'])
k3.metric('T0', t0.strftime('%d/%m %H:%M'))
k4.metric('Mốc đã chấm', len(scored_hours))

# -------------------------------------------------------------------------
# SECTION 2 (FULL-WIDTH HORIZONTAL): CẬP NHẬT CHỈ SỐ THEO MỐC GIỜ (T0 + k)
# -------------------------------------------------------------------------
st.markdown(
    '<div class="vm-panel-header" style="margin-top:16px;">'
    '<span>2. Cập nhật chỉ số lâm sàng &amp; Xét nghiệm tại mốc giờ đang chọn</span>'
    '<span class="vm-panel-sub">Chu kỳ 60 phút · Cửa sổ dự báo (t, t+6h]</span>'
    '</div>',
    unsafe_allow_html=True,
)

h_bar1, h_bar2 = st.columns([1.0, 3.0], gap='medium')
with h_bar1:
    hour = st.number_input('Giờ sau T0', min_value=1, max_value=36, value=default_hour,
                           key=f'hour_{case_id}')
prediction_at = t0 + timedelta(hours=int(hour))
entry_key = f'{case_id}_{hour}'
preview_features = build_features(case_id, prediction_at)
preview_row = preview_features.iloc[0]
current_loc = str(preview_row['location_code'])
with h_bar2:
    st.markdown(
        f'<div style="background:#ffffff;border:1px solid #cedae4;border-radius:4px;padding:10px 14px;margin-top:22px;font-size:12.5px;color:#17324d;">'
        f'Đang chọn mốc <b>T0+{hour} giờ ({prediction_at:%d/%m/%Y %H:%M})</b> &nbsp;·&nbsp; '
        f'Khu vực hiện tại: <b>{LOCATION_NAMES.get(current_loc, current_loc)}</b> &nbsp;·&nbsp; '
        f'<span style="color:#64748b;">Chỉ dữ liệu có <code>available_at ≤ {prediction_at:%H:%M}</code> mới đi vào dự báo.</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

with st.form(f'entry_{case_id}_{hour}'):
    tab_vitals, tab_labs, tab_sym = st.tabs([
        '🩺 1. Sinh hiệu (Điều dưỡng / Monitor tại giường)',
        '🧪 2. Xét nghiệm đã trả kết quả (Hệ thống LIS)',
        '📍 3. Triệu chứng nghi nhiễm & Điều chuyển khoa',
    ])
    with tab_vitals:
        top_v1, top_v2, top_v3 = st.columns([1.4, 1.3, 1.3], gap='small')
        with top_v1:
            has_vitals = st.checkbox('Có lần đo sinh hiệu mới tại giờ này', value=not scored_hours)
        with top_v2:
            vital_time_in = when('Giờ đo sinh hiệu', prediction_at, f'{entry_key}_vital_time')
        with top_v3:
            vital_avail_in = when('Giờ có trên EMR', prediction_at, f'{entry_key}_vital_avail')

        c = st.columns(4, gap='small')
        hr = c[0].number_input('Nhịp tim / phút *', 20, 250, value=90, help='Bình thường: 60–90 lần/phút.')
        rr = c[1].number_input('Nhịp thở / phút *', 4, 70, value=20, help='Ngưỡng qSOFA: ≥ 22 lần/phút.')
        sbp = c[2].number_input('HA tâm thu mmHg *', 40, 300, value=120, help='Ngưỡng qSOFA: ≤ 100 mmHg.')
        dbp = c[3].number_input('HA tâm trương mmHg', 20, 200, value=None, help='Tự tính MAP nếu để trống MAP.')

        c = st.columns(4, gap='small')
        map_value = c[0].number_input('MAP mmHg', 20, 250, value=None, help='Ngưỡng Sepsis-3: < 65 mmHg.')
        spo2 = c[1].number_input('SpO₂ %', 40, 100, value=None)
        temp = c[2].number_input('Nhiệt độ °C', 25.0, 45.0, value=None, step=0.1)
        gcs = c[3].number_input('GCS', 3, 15, value=None, help='Thang điểm Glasgow (3–15).')

        if has_vitals:
            vital_time, vital_available = vital_time_in, vital_avail_in
            vital_values = dict(heart_rate_bpm=hr, respiratory_rate_per_min=rr,
                 sbp_mmhg=sbp, dbp_mmhg=dbp, map_mmhg=map_value,
                 spo2_pct=spo2, temperature_c=temp, gcs=gcs)
        else:
            vital_values = vital_time = vital_available = None

    with tab_labs:
        top_l1, top_l2, top_l3 = st.columns([1.4, 1.3, 1.3], gap='small')
        with top_l1:
            has_labs = st.checkbox('Có kết quả xét nghiệm mới trả về EMR')
        with top_l2:
            lab_time_in = when('Giờ lấy mẫu', prediction_at, f'{entry_key}_lab_time')
        with top_l3:
            lab_avail_in = when('Giờ có kết quả', prediction_at, f'{entry_key}_lab_avail')

        entered_labs = {}
        c = st.columns(3, gap='small')
        for i, (key, label, hint) in enumerate(LAB_INFO):
            value = c[i % 3].number_input(f'{label} ({LAB_UNITS[key]})',
                min_value=0.0, max_value=100000.0, value=None, step=0.1,
                help=hint, key=f'{entry_key}_lab_{key}')
            if value is not None:
                entered_labs[key] = value
        if has_labs or entered_labs:
            lab_values, lab_time, lab_available = entered_labs, lab_time_in, lab_avail_in
        else:
            lab_values, lab_time, lab_available = {}, None, None

    with tab_sym:
        s_left, s_right = st.columns(2, gap='medium')
        with s_left:
            has_symptoms = st.checkbox('Cập nhật triệu chứng nghi nhiễm trùng')
            scols = st.columns(2)
            entered_symptoms = {key: scols[i % 2].checkbox(SYMPTOM_NAMES[key], key=f'{entry_key}_symptom_{key}')
                                for i, key in enumerate(SYMPTOMS)}
            symptom_time_in = when('Giờ ghi nhận triệu chứng', prediction_at, f'{entry_key}_symptom_time')
            save_sym = has_symptoms or any(entered_symptoms.values())
            symptom_values = entered_symptoms if save_sym else None
            symptom_time = symptom_time_in if save_sym else None
        with s_right:
            has_location = st.checkbox('Chuyển khu vực điều trị (ED → Nội trú → ICU)')
            location = st.selectbox('Khu vực điều trị chuyển đến', LOCATIONS,
                                    index=LOCATIONS.index(current_loc) if current_loc in LOCATIONS else 0,
                                    format_func=lambda code: LOCATION_NAMES.get(code, code))
            location_time_in = when('Giờ chuyển khu vực', prediction_at, f'{entry_key}_loc_time')
            location_time = location_time_in if has_location else None

    submitted = st.form_submit_button('Lưu dữ liệu và chấm điểm', type='primary')

if submitted:
    try:
        changed = save_entry(case_id, measured_at=vital_time,
            vital_available_at=vital_available, vitals=vital_values,
            lab_collected_at=lab_time, lab_available_at=lab_available, labs=lab_values,
            symptom_recorded_at=symptom_time,
            symptom_available_at=symptom_time,
            symptoms=symptom_values, location_code=location if has_location else None,
            location_at=location_time)
        if changed is not None:
            recompute_scored_hours(case_id, changed, bundles=models)
        score_hour(case_id, int(hour), bundles=models)
        history = prediction_history(case_id)
    except Exception as exc:
        st.error(f'Không lưu/chấm được mốc này: {exc}')

# -------------------------------------------------------------------------
# SECTION 3 (FULL-WIDTH HORIZONTAL): KẾT QUẢ DỰ BÁO 6H TỚI & TRỰC QUAN HÓA
# -------------------------------------------------------------------------
st.markdown(
    f'<div class="vm-panel-header" style="margin-top:16px;">'
    f'<span>3. Kết quả dự báo 6 giờ tiếp theo &amp; Phân tích AI (Tại mốc T0+{hour}h)</span>'
    f'<span class="vm-panel-sub">Hồi quy Logistic v2</span>'
    f'</div>',
    unsafe_allow_html=True,
)

current = {p['target']: p for p in history
           if p['prediction_at'] == prediction_at.isoformat(timespec='seconds')}
features = build_features(case_id, prediction_at)
feat_row = features.iloc[0]

if current:
    flags_now = bedside_flags(feat_row)
    if flags_now:
        pills = ''.join(f'<span class="tag-pill {kind}">⚠ {txt}</span>' for kind, txt in flags_now)
        st.markdown(f'<div style="margin-bottom:10px;"><b>Dấu hiệu sinh lý đáng chú ý tại T0+{hour}h:</b> {pills}</div>', unsafe_allow_html=True)

    r_col1, r_col2, r_col3 = st.columns([1.2, 1.2, 1.5], gap='small')
    for key, col, label, subtitle in [
        ('sepsis', r_col1, 'Sepsis', 'Mục tiêu chính · Cửa sổ (t, t+6h]'),
        ('shock', r_col2, 'Sốc nhiễm khuẩn', 'Mục tiêu phụ · Cửa sổ (t, t+6h]'),
    ]:
        p = current.get(key)
        if p:
            with col:
                is_alert = bool(p['alert'])
                card_cls = 'alert' if is_alert else 'ok'
                badge_txt = f'🔴 Vượt ngưỡng ({p["threshold"]:.1%})' if is_alert else f'🟢 Dưới ngưỡng ({p["threshold"]:.1%})'
                st.metric(f'Điểm LR · {label}', show_score(p['score']))
                st.markdown(
                    f'<span class="tag-pill {card_cls}">{badge_txt}</span> '
                    f'<span style="font-size:11.5px;color:#64748b;">Bản tính #{p["revision"]}</span>',
                    unsafe_allow_html=True,
                )

    with r_col3:
        if any(p['alert'] for p in current.values()):
            st.warning(
                'CẢNH BÁO VƯỢT NGƯỠNG: Ít nhất một mô hình vượt ngưỡng nghiên cứu. '
                'Điều dưỡng báo Bác sĩ trực khám lại người bệnh, đánh giá ổ nhiễm và xem xét chỉ định xét nghiệm.',
                icon=':material/notification_important:',
            )
        else:
            st.success(
                'Chưa có điểm nào vượt ngưỡng tại mốc này. Tiếp tục theo dõi định kỳ ở các giờ tiếp theo.',
                icon=':material/check_circle:',
            )
        if hour < 36:
            st.button(f'Chuyển sang T0+{hour+1}', key=f'next_{case_id}_{hour}',
                      on_click=advance_hour, args=(case_id, hour+1), use_container_width=True)
else:
    st.info(f'Mốc **T0+{hour} giờ** chưa được chấm điểm. Hãy kiểm tra chỉ số ở mục 2 và bấm **“Lưu dữ liệu và chấm điểm”**.')

# SECTION 4 (FULL-WIDTH): DIỄN BIẾN XÁC SUẤT DỰ BÁO THEO GIỜ
st.markdown(
    '<div class="vm-panel-header" style="margin-top:18px;">'
    '<span>4. Diễn biến xác suất dự báo qua các giờ (Từ T0+1h)</span>'
    '<span class="vm-panel-sub">Đường nét đứt thể hiện ngưỡng cảnh báo demo của từng mô hình</span>'
    '</div>',
    unsafe_allow_html=True,
)
with st.container(border=True):
    if history:
        chart_data = pd.DataFrame(history)
        chart_data['Giờ sau T0'] = chart_data.prediction_at.map(
            lambda x: int((datetime.fromisoformat(x)-t0).total_seconds()/3600))
        chart_data['Mục tiêu'] = chart_data.target.map({'sepsis': 'Sepsis', 'shock': 'Sốc nhiễm khuẩn'})
        base_line = alt.Chart(chart_data).mark_line(point=alt.OverlayMarkDef(size=60), strokeWidth=2.5).encode(
            x=alt.X('Giờ sau T0:Q', axis=alt.Axis(tickMinStep=1), title='Giờ theo dõi sau hoàn tất phân loại (T0)'),
            y=alt.Y('score:Q', title='Xác suất dự báo (6h tới)', scale=alt.Scale(domain=[0, 1]), axis=alt.Axis(format='%')),
            color=alt.Color('Mục tiêu:N', scale=alt.Scale(domain=['Sepsis', 'Sốc nhiễm khuẩn'], range=['#0875b5', '#b42318']), legend=alt.Legend(orient='top')),
            tooltip=['Mục tiêu', 'Giờ sau T0', alt.Tooltip('score:Q', title='Điểm LR', format='.1%'), alt.Tooltip('threshold:Q', title='Ngưỡng', format='.1%')],
        )
        thresh_line = alt.Chart(chart_data).mark_rule(strokeDash=[5, 4], strokeWidth=1.5).encode(
            y='threshold:Q',
            color=alt.Color('Mục tiêu:N', scale=alt.Scale(domain=['Sepsis', 'Sốc nhiễm khuẩn'], range=['#0875b5', '#b42318'])),
        )
        timeline_chart = (base_line + thresh_line).properties(height=255).configure(
            background='#ffffff'
        ).configure_axis(
            labelColor='#17324d', titleColor='#17324d', gridColor='#e2e8f0'
        ).configure_legend(labelColor='#17324d', titleColor='#17324d')
        st.altair_chart(timeline_chart, width='stretch', theme=None)
    else:
        st.caption('Chưa có mốc giờ nào được chấm điểm cho lượt khám này.')

# SECTION 5 (FULL-WIDTH): ĐÓNG GÓP LOG-ODDS TẠI MỐC ĐANG CHỌN (XAI)
st.markdown(
    f'<div class="vm-panel-header" style="margin-top:18px;">'
    f'<span>5. Phân rã đóng góp Log-Odds tại mốc T0+{hour}h (Giải thích mô hình XAI)</span>'
    f'<span class="vm-panel-sub">Top 12 đặc trưng tác động mạnh nhất</span>'
    f'</div>',
    unsafe_allow_html=True,
)
with st.container(border=True):
    target = st.radio('Chọn mô hình giải thích', ['Sepsis', 'Sốc nhiễm khuẩn'], horizontal=True)
    key = 'sepsis' if target == 'Sepsis' else 'shock'
    intercept, contribution = explain_log_odds(models[key][0], features)
    linear_z = intercept + float(contribution['log_odds_contribution'].sum())
    prob_val = 1.0 / (1.0 + np.exp(-linear_z))
    st.caption(
        f'Công thức tại **T0+{hour}h**: `z = {intercept:+.2f} (Hệ số chặn) + {contribution["log_odds_contribution"].sum():+.2f} (Tổng đóng góp các biến) = {linear_z:+.2f}` '
        f'➔ `sigmoid(z) = {prob_val:.1%}`'
    )
    top12 = contribution.head(12).copy()
    top12['Chiều tác động'] = np.where(top12['log_odds_contribution'] >= 0, 'Tăng nguy cơ (+)', 'Giảm nguy cơ (-)')
    bar_chart = alt.Chart(top12).mark_bar(cornerRadiusEnd=0).encode(
        x=alt.X('log_odds_contribution:Q', title='Đóng góp Log-Odds (βᵢ × xᵢ)'),
        y=alt.Y('label_vi:N', sort=top12['label_vi'].tolist(), title=None, axis=alt.Axis(labelLimit=420)),
        color=alt.Color(
            'Chiều tác động:N',
            scale=alt.Scale(domain=['Tăng nguy cơ (+)', 'Giảm nguy cơ (-)'], range=['#b42318', '#0875b5']),
            legend=alt.Legend(orient='top'),
        ),
        tooltip=[
            alt.Tooltip('label_vi:N', title='Đặc trưng'),
            alt.Tooltip('transformed_value:Q', title='Giá trị chuẩn hóa', format='.2f'),
            alt.Tooltip('coefficient:Q', title='Hệ số LR (βᵢ)', format='+.3f'),
            alt.Tooltip('log_odds_contribution:Q', title='Đóng góp Log-Odds', format='+.3f'),
        ],
    ).properties(height=280).configure(background='#ffffff').configure_axis(
        labelColor='#17324d', titleColor='#17324d', gridColor='#e2e8f0'
    ).configure_legend(labelColor='#17324d', titleColor='#17324d')
    st.altair_chart(bar_chart, width='stretch', theme=None)

    display_contrib = top12[['label_vi', 'feature', 'transformed_value', 'coefficient', 'log_odds_contribution']].rename(columns={
        'label_vi': 'Tên đặc trưng lâm sàng',
        'feature': 'Mã biến kỹ thuật',
        'transformed_value': 'Giá trị chuẩn hóa (xᵢ)',
        'coefficient': 'Hệ số LR (βᵢ)',
        'log_odds_contribution': 'Đóng góp Log-Odds (βᵢ × xᵢ)',
    })
    st.dataframe(display_contrib, hide_index=True, width='stretch')

with st.expander('📋 Xem bảng 36 biến đặc trưng gốc & Nhật ký sự kiện EMR (Audit Trail)'):
    missing = int(features[FEATURES].isna().sum(axis=1).iloc[0])
    st.caption(f'Độ phủ dữ liệu tại T0+{hour}h: **{36 - missing}/36** trường đầu vào đã có giá trị (thiếu {missing}/36 trường).')
    raw_df = pd.DataFrame({
        'Tên lâm sàng': [format_feature_name_vi(x) for x in FEATURES],
        'Mã trường': FEATURES,
        'Giá trị tại t': ['Chưa có (NaN)' if pd.isna(features.iloc[0][x]) else str(features.iloc[0][x]) for x in FEATURES],
    })
    st.dataframe(raw_df, hide_index=True, width='stretch', height=220)
    for table, title in [('vitals', 'Sinh hiệu'), ('labs', 'Xét nghiệm'),
                         ('symptoms', 'Triệu chứng'), ('locations', 'Khu vực điều trị')]:
        rows = event_rows(case_id, table, include_revisions=True)
        if rows:
            st.markdown(f'**{title} ({len(rows)} bản ghi)**')
            st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')
