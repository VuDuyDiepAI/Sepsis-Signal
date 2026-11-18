"""Show threshold policy and descriptive results on the synthetic workbook."""
import pandas as pd
import streamlit as st

from app.shared_ui import page_header, percent
from src.mock_emr import load_bundle


SPLITS = {
    'validation': 'Validation · chọn ngưỡng',
    'temporal_holdout': 'Holdout · đánh giá',
}
BRANCH_LABELS = {
    'both_recall_targets': 'Đạt mục tiêu theo ca và theo giờ',
    'encounter_only': 'Nhánh dự phòng · chỉ đạt mục tiêu theo ca',
    'fixed_demo_threshold': 'Nhánh dự phòng · dùng ngưỡng cảnh báo cố định',
}


def show_evaluation(meta):
    policy = meta.get('threshold_selection')
    if meta.get('evaluation_version') != 'timely-alert-v1' or policy is None:
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
        f'Validation đạt {validation["encounter_early_recall"]:.1%} theo ca và '
        f'{validation["recall"]:.1%} theo giờ. Mục tiêu {policy["minimum_recall"]:.0%} cho mỗi chỉ số. '
        f'Giới hạn trên khi chọn ngưỡng {policy["demo_ceiling"]:.0%}.'
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
        })
    st.dataframe(pd.DataFrame(rows), hide_index=True, width='stretch')
    st.caption('Lead time lấy cảnh báo đầu tiên trong 6 giờ trước khởi phát. Một ca có thể có cả cảnh báo >6 giờ và cảnh báo trong cửa sổ. Số đợt tính trên toàn bộ cảnh báo đủ điều kiện đánh giá.')

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
