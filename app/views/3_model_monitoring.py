"""Show threshold policy and descriptive results on the synthetic workbook."""
import pandas as pd
import streamlit as st

from app.shared_ui import page_header, percent
from src.mock_emr import load_bundle
from src.alert_evaluation import EVALUATION_VERSION


SPLITS = {
    'validation': 'Validation · chọn ngưỡng',
    'temporal_holdout': 'Holdout · đánh giá',
}
BRANCH_LABELS = {
    'patient_episode_recall': 'Ngưỡng cao nhất đạt độ nhạy người bệnh ≥80% theo đợt cảnh báo',
    'both_recall_targets': 'Đạt mục tiêu theo ca và theo giờ',
    'encounter_only': 'Nhánh dự phòng · chỉ đạt mục tiêu theo ca',
    'fixed_demo_threshold': 'Nhánh dự phòng · dùng ngưỡng cảnh báo cố định',
}


def show_evaluation(meta):
    policy = meta.get('threshold_selection')
    if meta.get('evaluation_version') != EVALUATION_VERSION or policy is None:
        st.warning('Metadata đang dùng cách đánh giá cũ. Chạy scripts/train_mock_emr.py --refresh-metrics.')
        return

    validation = meta['validation_synthetic_metrics']
    holdout = meta['temporal_holdout_synthetic_metrics']
    cols = st.columns(3)
    cols[0].metric('Ngưỡng cảnh báo', percent(meta['threshold']))
    cols[1].metric('Phát hiện trong 6h · holdout',
                   f'{holdout["timely_alert_encounters"]}/{meta["temporal_holdout_positive_encounters"]} ca')
    lead = holdout['median_lead_hours']
    cols[2].metric('Báo trước trung vị · holdout', f'{lead:g} giờ' if lead is not None else 'Chưa có')

    st.subheader('Chọn ngưỡng')
    branch = BRANCH_LABELS.get(policy['branch'], policy['branch'])
    st.write(f'**{branch}**')
    st.caption(
        f'Validation đạt {validation["encounter_early_recall"]:.1%} theo người bệnh. '
        f'Mục tiêu tối thiểu {policy["minimum_recall"]:.0%}; không áp điều kiện Recall theo giờ hoặc trần ngưỡng tùy ý. '
        'Validation dùng chọn ngưỡng; holdout giữ nguyên chính sách.'
    )

    st.subheader('Cảnh báo theo lượt khám')
    rows = []
    for key, label in SPLITS.items():
        m = meta[f'{key}_synthetic_metrics']
        lead = m['median_lead_hours']
        rows.append({
            'Tập': label,
            'Số ca dương / tổng ca': f'{meta[f"{key}_positive_encounters"]}/{meta[f"{key}_encounters"]}',
            'Phát hiện trong 6h': f'{m["timely_alert_encounters"]} ({m["encounter_early_recall"]:.1%})',
            'Có cảnh báo >6h': m['too_early_alert_encounters'],
            'Chỉ cảnh báo >6h': m['too_early_only_encounters'],
            'Báo trước trung vị': f'{lead:g} giờ' if lead is not None else '—',
            'Đợt cảnh báo / 100 ca': m['alert_episodes_per_100'],
            'Đợt đúng / giả': f'{m["true_alert_episodes"]:g} / {m["false_alert_episodes"]:g}',
            'PPV theo đợt': f'{m["episode_ppv"]:.1%}' if m['episode_ppv'] is not None else '—',
            'Đợt giả / 100 ca': m['false_alert_episodes_per_100'],
            'Đợt giả / đợt đúng': m['false_episodes_per_true_episode'],
            'Lần vượt được gộp': m['repeated_alert_fraction'],
        })
    st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')
    st.caption('Đợt bắt đầu ở lần vượt ngưỡng đầu tiên, gộp các lần vượt trong 6 giờ tính từ đầu đợt. Đợt đúng khi khởi phát trong (đầu đợt, +6h]. Lead time chỉ lấy đầu đợt đúng; đợt quá sớm không trở thành đúng nhờ các giờ bị gộp.')
    intervals = []
    for key, label in SPLITS.items():
        m = meta[f'{key}_synthetic_metrics']
        for name in ['encounter_early_recall', 'episode_ppv', 'false_alert_episodes_per_100', 'median_lead_hours']:
            ci = m['confidence_intervals'][name]
            intervals.append({'Tập': label, 'Chỉ số': name, 'Giá trị': m[name],
                              'KTC 95% dưới': ci['lower'], 'KTC 95% trên': ci['upper']})
    with st.expander('Khoảng tin cậy 95% theo người bệnh'):
        st.dataframe(pd.DataFrame(intervals), hide_index=True, width='stretch')
        st.caption('Bootstrap 1.000 lần theo người bệnh, giữ nguyên mô hình và ngưỡng; chưa bao gồm bất định do lựa chọn mô hình/ngưỡng.')

    with st.expander('Chỉ số theo giờ và cấu hình mô hình'):
        rows = []
        for key, label in SPLITS.items():
            m = meta[f'{key}_synthetic_metrics']
            rows.append({
                'Tập': label,
                'Giờ dương / tổng giờ': f'{m["positive_snapshots"]}/{m["snapshots"]}',
                'Recall': f'{m["recall"]:.1%}',
                'Precision': f'{m["precision"]:.1%}',
                'AUROC': m['auroc'], 'AUPRC': m['auprc'], 'Brier': m['brier'],
                'Specificity': m['specificity'], 'NPV': m['npv'], 'F1': m['f1'],
                'Calibration intercept': m['calibration_intercept'],
                'Calibration slope': m['calibration_slope'],
            })
        st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')
        st.caption(
            f'{meta["model_version"]} · {meta["train_encounters"]} ca train · '
            f'{meta["train_positive_encounters"]} ca dương · Logistic L2, C={meta["regularization_C"]}. '
            'Điểm lấy trực tiếp từ mô hình logistic.'
        )


page_header('Đánh giá mô hình', 'Kết quả kỹ thuật theo giờ và theo lượt khám.')
st.info('Các chỉ số được tính trên 360 hồ sơ mô phỏng dành cho chế độ trải nghiệm.')
try:
    _, meta = load_bundle('sepsis')
except (FileNotFoundError, ValueError) as exc:
    st.error(str(exc))
    st.stop()

show_evaluation(meta)
with st.expander('Mở rộng minh họa · Sốc nhiễm khuẩn'):
    if st.toggle('Xem đánh giá mô hình sốc'):
        try:
            _, shock_meta = load_bundle('shock')
        except (FileNotFoundError, ValueError) as exc:
            st.warning(str(exc))
        else:
            st.caption(
                f'{shock_meta["train_positive_encounters"]} ca dương train · '
                f'{shock_meta["validation_positive_encounters"]} ca dương validation · '
                f'{shock_meta["temporal_holdout_positive_encounters"]} ca dương holdout. '
                'Kết quả chỉ minh họa luồng kỹ thuật.'
            )
            show_evaluation(shock_meta)
