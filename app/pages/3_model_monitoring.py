"""Transparent synthetic training and technical checks for the mock EMR model."""
import pandas as pd
import streamlit as st

from src.manual_cases import list_cases, prediction_history
from src.mock_emr import FEATURES, format_feature_name_vi, load_bundle, load_tables


@st.cache_data(show_spinner='Đang đọc EMR giả...')
def data():
    return load_tables()


st.markdown('<div class="app-kicker">TRANG CHỦ &nbsp;/&nbsp; <b>GIÁM SÁT MÔ HÌNH &amp; KIỂM ĐỊNH KỸ THUẬT</b></div>', unsafe_allow_html=True)
st.title('Mô hình và kiểm tra kỹ thuật')
st.markdown('<p class="app-subtitle">Thiết kế Hồi quy Logistic (LR v2): hiệu chỉnh xác suất tự nhiên, biến đổi phi tuyến chữ U & log1p, cờ thiếu dữ liệu, chọn điều chuẩn L2 qua GroupKFold 5-fold và đánh giá cấp lượt khám.</p>', unsafe_allow_html=True)

try:
    tables = data()
    bundles = {target: load_bundle(target) for target in ('sepsis', 'shock')}
except Exception as exc:
    st.error(str(exc))
    st.stop()

a, b, c, d = st.columns(4)
a.metric('Mô hình', '2 hồi quy logistic')
b.metric('Mốc đầu tiên', 'T0 + 1 giờ')
c.metric('Lặp lại', '60 phút')
d.metric('Đặc trưng sau mở rộng', f"{bundles['sepsis'][1].get('expanded_feature_count', 53)} biến")
st.caption('Tập Train: ' + ' · '.join(
    f"{target.upper()}: {meta['train_encounters']} lượt khám ({meta['train_positive_encounters']} ca có biến cố, "
    f"C tối ưu = {meta.get('regularization_C', 1.0)}, EPV = {meta.get('epv_positive_encounters_per_input_var', '—')})"
    for target, (_, meta) in bundles.items()
))

st.markdown('#### 1. Tóm tắt 6 chuẩn hóa kỹ thuật trong Hồi quy Logistic (v2)')
st.markdown('''
<div class="role-guide">
  <div class="role-box">
    <strong>① Hiệu chỉnh xác suất tự nhiên</strong>
    Không ép tỷ lệ 50:50 nhân tạo; hệ số chặn phản ánh đúng tỷ lệ biến cố thực tế (~3,5% với Sepsis, ~0,8% với Sốc).
  </div>
  <div class="role-box">
    <strong>② Xử lý biến chữ U & lệch phải</strong>
    Tách nhánh Sốt (&gt; 38°C) &amp; Hạ thân nhiệt (&lt; 36°C), WBC cao (&gt; 12) &amp; thấp (&lt; 4), tụt HA và lấy hàm log1p cho xét nghiệm.
  </div>
  <div class="role-box">
    <strong>③ Cờ báo có kết quả xét nghiệm</strong>
    Bổ sung 7 cờ theo dõi chỉ định (PCT, Bilirubin, WBC, Tiểu cầu, SpO₂, Nhiệt độ, GCS) để phân biệt "chưa làm" với "bình thường".
  </div>
  <div class="role-box">
    <strong>④ Điều chuẩn L2 qua GroupKFold</strong>
    Chọn hệ số C tối ưu qua 5-fold theo từng người bệnh, tránh rò rỉ dữ liệu giữa các giờ của cùng một ca.
  </div>
  <div class="role-box">
    <strong>⑤ Chọn ngưỡng &amp; gộp đợt cảnh báo 6h</strong>
    Đánh giá độ nhạy phát hiện sớm trước khởi phát theo ca bệnh, thời gian báo trước (Lead time) và gộp cảnh báo lặp 6 giờ.
  </div>
  <div class="role-box">
    <strong>⑥ Kiểm soát quá khớp cỡ mẫu nhỏ</strong>
    Khóa điều chuẩn chặt (C ≤ 0,1) cho mô hình Sốc do số biến cố ít (EPV = 0,19), giữ hệ số hồi quy ổn định.
  </div>
</div>
''', unsafe_allow_html=True)

st.markdown('#### 2. Đánh giá cấp Lượt khám & Đợt cảnh báo sớm (Encounter & Episode-level Metrics)')
st.caption('Khác với việc chỉ đếm từng giờ riêng lẻ, bảng dưới đây đo lường đúng mục tiêu lâm sàng: **Tỷ lệ ca bệnh được cảnh báo sớm trước giờ khởi phát (`onset_at`)**, **Thời gian báo trước trung vị (Lead time)**, **NNE (số ca cảnh báo để bắt 1 ca thật)** và **Số đợt cảnh báo / 100 ca (sau khi gộp các cảnh báo lặp trong 6 giờ)**.')
enc_rows = []
for target, (_, meta) in bundles.items():
    for name, key, count_key, positive_key in [
        ('Validation (chọn ngưỡng)', 'validation_synthetic_metrics', 'validation_encounters', 'validation_positive_encounters'),
        ('Temporal holdout (kiểm định độc lập)', 'temporal_holdout_synthetic_metrics', 'temporal_holdout_encounters', 'temporal_holdout_positive_encounters'),
    ]:
        m = meta[key]
        iqr = m.get('iqr_lead_hours')
        lead_str = f"{m['median_lead_hours']:.1f}h (IQR {iqr[0]:.1f}–{iqr[1]:.1f}h)" if m.get('median_lead_hours') is not None and iqr else '—'
        enc_rows.append({
            'Kết cục': 'Sepsis (Chính)' if target == 'sepsis' else 'Sốc nhiễm khuẩn (Phụ)',
            'Tập đánh giá': name,
            'Ngưỡng demo': f"{meta['threshold']:.1%}",
            'Số lượt khám (Dương)': f"{meta[count_key]} ({meta[positive_key]})",
            'Độ nhạy sớm theo ca ( trước onset )': f"{100 * m.get('encounter_early_recall', 0):.1f}%",
            'PPV theo ca': f"{100 * m.get('encounter_precision', 0):.1f}%",
            'NNE (ca cảnh báo / 1 ca bệnh)': m.get('nne_encounters'),
            'Ca báo giả / 100 lượt khám': m.get('false_alert_encounters_per_100'),
            'Đợt cảnh báo (gộp 6h) / 100 ca': m.get('alert_episodes_per_100'),
            'Thời gian báo trước (Lead time)': lead_str,
        })
st.dataframe(pd.DataFrame(enc_rows), hide_index=True, width='stretch')

st.markdown('#### 3. Chỉ số phân biệt & Hiệu chỉnh xác suất cấp Snapshot (Theo từng giờ)')
snap_rows = []
for target, (_, meta) in bundles.items():
    for name, key in [
        ('Validation (chọn ngưỡng)', 'validation_synthetic_metrics'),
        ('Temporal holdout (chỉ đánh giá)', 'temporal_holdout_synthetic_metrics'),
    ]:
        m = meta[key]
        snap_rows.append({
            'Kết cục': target,
            'Tập': name,
            'Snapshot': m['snapshots'],
            'Snapshot dương': m['positive_snapshots'],
            'Tỷ lệ thực tế': f"{100 * m.get('observed_prevalence', 0):.2f}%",
            'Xác suất dự báo TB': f"{100 * m.get('mean_predicted_probability', 0):.2f}%",
            'Brier Score (↓ tốt)': round(m.get('brier', 0), 4),
            'AUROC': round(m['auroc'], 4),
            'AUPRC': round(m['auprc'], 4),
            'Recall giờ tại ngưỡng': f"{100 * m['recall']:.1f}%",
            'Precision giờ tại ngưỡng': f"{100 * m['precision']:.1f}%",
            'Tỷ lệ giờ vượt ngưỡng': f"{100 * m['alert_fraction']:.2f}%",
        })
st.dataframe(pd.DataFrame(snap_rows), hide_index=True, width='stretch')
st.info('Lưu ý về cỡ mẫu mô hình Sốc (Điểm #6): Cả bộ dữ liệu giả chỉ có 12 ca sốc (7 train / 3 validation / 2 holdout, EPV = 0,19 < 10). Dù đã ép điều chuẩn mạnh (C = 0,05), các chỉ số của mô hình Sốc chỉ mang tính minh họa kỹ thuật.', icon=':material/info:')

with st.expander('Xem chi tiết kết quả chọn siêu tham số điều chuẩn C qua 5-Fold GroupKFold theo lượt khám'):
    c1, c2 = st.columns(2)
    for col, (target, (_, meta)) in zip((c1, c2), bundles.items()):
        cv = meta.get('cv_tuning', {})
        col.markdown(f"**Mô hình `{target.upper()}`** · `best_C = {cv.get('best_C')}` · OOF AUPRC = `{cv.get('oof_auprc')}` · OOF AUROC = `{cv.get('oof_auroc')}`")
        if cv.get('c_grid_results'):
            col.dataframe(pd.DataFrame(cv['c_grid_results']), hide_index=True, width='stretch')

st.markdown('#### 4. Tỷ lệ thiếu dữ liệu tự nhiên trong các Snapshot (Lý do cần cờ `_measured`)')
missing = tables['FeatureSnapshots'][FEATURES].isna().mean().sort_values(ascending=False)
missing_df = pd.DataFrame({
    'Tên lâm sàng': [format_feature_name_vi(col) for col in missing.index],
    'Mã trường': missing.index,
    'Tỷ lệ thiếu': missing.values,
})
st.dataframe(missing_df.head(15), hide_index=True, width='stretch', column_config={
    'Tỷ lệ thiếu': st.column_config.ProgressColumn('Tỷ lệ thiếu', format='percent', min_value=0, max_value=1),
})

st.markdown('#### 5. Hoạt động của ca nhập tay trên máy này')
manual_cases = list_cases()
manual_scores = [p for case in manual_cases
                 for p in prediction_history(case['encounter_id'])]
unique_hours = len({(p['encounter_id'], p['prediction_at']) for p in manual_scores})
x, y, z = st.columns(3)
x.metric('Ca giả nhập tay', len(manual_cases))
y.metric('Mốc đã chấm', unique_hours)
z.metric('Lượt vượt ngưỡng', sum(bool(p['alert']) for p in manual_scores))
st.caption('Các số trên là nhật ký sử dụng prototype ở máy này, không phải đánh giá hiệu năng, tỷ lệ bệnh hoặc tải cảnh báo lâm sàng.')

with st.expander('Ranh giới an toàn của bản demo'):
    st.markdown('''
- `FeatureSnapshots` là đầu vào duy nhất của LR; `Labels` và `ReferenceOutcomes` chỉ dùng tạo nhãn và đối chiếu hồi cứu.
- Chia train/validation theo lượt khám; holdout gồm các lượt khám đến muộn hơn trong bộ giả.
- Biến đổi phi tuyến, cờ thiếu dữ liệu, điền trung vị và chuẩn hóa được đóng gói trong `Pipeline` chỉ fit trên tập train.
- Chưa có kiểm định nội bộ trên EMR thật, hiệu chỉnh xác suất thật hoặc thử nghiệm tiền cứu im lặng.
- Không có cảnh báo lâm sàng, chẩn đoán hoặc gợi ý điều trị tự động.
''')
    for target, (_, meta) in bundles.items():
        st.code(
            f"target={target}\nversion={meta['model_version']}\n"
            f"regularization_C={meta.get('regularization_C')}\nthreshold={meta['threshold']:.4f}\n"
            f"source_sha256={meta['source_sha256']}\ntrained_at_utc={meta['trained_at_utc']}"
        )
