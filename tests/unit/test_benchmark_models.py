"""Unit tests for standalone clinical baselines and benchmark harness."""
import numpy as np
import pandas as pd

from scripts.benchmark_models import compute_clinical_baselines, run_mock_benchmark


def test_clinical_baselines_exact_sepsis3_and_mews_thresholds():
    df = pd.DataFrame([
        {
            'heart_rate_last_bpm': 118,
            'respiratory_rate_last_per_min': 22,
            'sbp_last_mmhg': 96,
            'spo2_last_pct': 93,
            'temperature_last_c': 38.6,
            'gcs_last': 14,
            'WBC_last_10e9_L': 15.2,
        },
        {
            # Boundary: RR=21 must NOT score qSOFA (>=22), but DOES score SIRS (>20)
            'heart_rate_last_bpm': 82,
            'respiratory_rate_last_per_min': 21,
            'sbp_last_mmhg': 115,
            'spo2_last_pct': 98,
            'temperature_last_c': 37.0,
            'gcs_last': np.nan,
            'WBC_last_10e9_L': np.nan,
        },
    ])
    scores = compute_clinical_baselines(df)
    assert list(scores['qSOFA']) == [3.0, 0.0]
    assert list(scores['SIRS']) == [4.0, 1.0]
    assert list(scores['MEWS']) == [8.0, 2.0]
    # Row 0 NEWS2: RR 22 (+2), SpO2 93 (+2), SBP 96 (+2), HR 118 (+2), Temp 38.6 (+1), GCS 14 (+3) = 12
    assert scores.loc[0, 'NEWS2'] == 12.0
    # Row 1 NEWS2: RR 21 (+2), others 0 = 2
    assert scores.loc[1, 'NEWS2'] == 2.0


def test_mock_benchmark_runs_end_to_end_with_subgroups():
    report = run_mock_benchmark(target='sepsis', bootstrap_samples=20)
    assert report['source'] == 'synthetic_mock_emr'
    names = {r['model'] for r in report['results']}
    assert 'LogisticRegression_L2' in names
    assert 'HistGradientBoosting' in names
    assert 'qSOFA (cutoff>=2)' in names
    assert 'NEWS2 (cutoff>=5)' in names
    lr_row = next(r for r in report['results'] if r['model'] == 'LogisticRegression_L2')
    assert lr_row['auroc'] is not None and lr_row['auroc'] > 0.8
    assert {'ED', 'WARD', 'ICU', 'age_ge_65', 'age_lt_65'} <= set(lr_row['subgroups'])
