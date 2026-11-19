"""Meaningful as-of and revision checks for the manual demo path."""
from datetime import datetime, timedelta

import pandas as pd
import pytest

from src.manual_cases import (build_features, create_case, event_rows,
    case_overview, delete_case, init_db, prediction_history, record_review,
    recompute_scored_hours, review_history, save_entry, score_hour)
from src.mock_emr import load_bundle


@pytest.fixture
def setup_case(tmp_path):
    path = tmp_path / 'manual.sqlite3'
    t0 = datetime(2026, 1, 1, 8)
    case_id = create_case(path=path, triage_completed_at=t0,
                          age_years=65, sex='F', comorbidities={'diabetes': True})
    models = {target: load_bundle(target) for target in ('sepsis', 'shock')}
    return path, t0, case_id, models


def test_delayed_lab_is_hidden_until_available_and_both_models_score(setup_case):
    path, t0, case_id, models = setup_case
    t1, t2 = t0 + timedelta(hours=1), t0 + timedelta(hours=2)
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 100, 'respiratory_rate_per_min': 24,
                       'sbp_mmhg': 105, 'dbp_mmhg': 65, 'spo2_pct': 94},
               lab_collected_at=t1, lab_available_at=t2,
               labs={'creatinine': 1.8})
    features1 = build_features(case_id, t1, path)
    features2 = build_features(case_id, t2, path)
    assert pd.isna(features1.iloc[0]['creatinine_last_mg_dL'])
    assert features1.iloc[0]['creatinine_measured_24h'] == 0
    assert features2.iloc[0]['creatinine_last_mg_dL'] == 1.8
    assert features2.iloc[0]['map_last_mmhg'] == 78.3
    first = score_hour(case_id, 1, path=path, bundles=models)
    second = score_hour(case_id, 2, path=path, bundles=models)
    assert set(first) >= {'sepsis', 'shock'}
    assert set(second) >= {'sepsis', 'shock'}
    assert len(prediction_history(case_id, path=path)) == 4
    score_hour(case_id, 2, path=path, bundles=models)
    assert len(prediction_history(case_id, path=path, include_revisions=True)) == 4


def test_correction_recomputes_existing_hours_and_preserves_revisions(setup_case):
    path, t0, case_id, models = setup_case
    t1 = t0 + timedelta(hours=1)
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 80, 'respiratory_rate_per_min': 18,
                       'sbp_mmhg': 130})
    score_hour(case_id, 1, path=path, bundles=models)
    changed = save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
                         vitals={'heart_rate_bpm': 140, 'respiratory_rate_per_min': 30,
                                 'sbp_mmhg': 80})
    assert recompute_scored_hours(case_id, changed, path=path, bundles=models) == 1
    assert len(event_rows(case_id, 'vitals', path, include_revisions=True)) == 2
    assert len(event_rows(case_id, 'vitals', path)) == 1
    assert len(prediction_history(case_id, path=path)) == 2
    assert len(prediction_history(case_id, path=path, include_revisions=True)) == 4


def test_invalid_temporal_order_and_missing_vitals_rejected(setup_case):
    path, t0, case_id, models = setup_case
    t1 = t0 + timedelta(hours=1)
    with pytest.raises(ValueError, match='sinh hiệu'):
        save_entry(case_id, path=path, measured_at=t1, vital_available_at=t0,
                   vitals={'heart_rate_bpm': 100, 'respiratory_rate_per_min': 20,
                           'sbp_mmhg': 110})
    with pytest.raises(ValueError, match='Chưa có sinh hiệu'):
        score_hour(case_id, 1, path=path, bundles=models)


def test_cannot_move_a_used_vital_result_after_its_prediction(setup_case):
    path, t0, case_id, models = setup_case
    t1 = t0 + timedelta(hours=1)
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 90, 'respiratory_rate_per_min': 20,
                       'sbp_mmhg': 115})
    score_hour(case_id, 1, path=path, bundles=models)
    with pytest.raises(ValueError, match='không thể dời'):
        save_entry(case_id, path=path, measured_at=t1,
                   vital_available_at=t1 + timedelta(hours=1),
                   vitals={'heart_rate_bpm': 95, 'respiratory_rate_per_min': 21,
                           'sbp_mmhg': 110})
    assert len(event_rows(case_id, 'vitals', path)) == 1


def test_review_persists_and_a_new_revision_requires_its_own_review(setup_case):
    path, t0, case_id, models = setup_case
    t1 = t0 + timedelta(hours=1)
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 100, 'respiratory_rate_per_min': 24, 'sbp_mmhg': 105})
    score_hour(case_id, 1, path=path, bundles=models)
    prediction = next(p for p in prediction_history(case_id, path=path) if p['target'] == 'sepsis')
    args = dict(result_key=f'manual:{prediction["id"]}', encounter_id=case_id,
                prediction_at=prediction['prediction_at'], model_version=prediction['model_version'],
                reviewed_by='Bác sĩ A', prediction_id=prediction['id'], path=path)
    first = record_review(**args, note='Đã xem sinh hiệu')
    second = record_review(**{**args, 'reviewed_by': 'Bác sĩ B'})
    assert second == first
    init_db(path)
    assert case_overview(path)[0]['review']['reviewed_by'] == 'Bác sĩ A'
    save_entry(case_id, path=path, measured_at=t1, vital_available_at=t1,
               vitals={'heart_rate_bpm': 140, 'respiratory_rate_per_min': 32, 'sbp_mmhg': 80})
    score_hour(case_id, 1, path=path, bundles=models)
    assert case_overview(path)[0]['review_status'] == 'Chờ xem xét'
    assert review_history(case_id, path) == [first]
    with pytest.raises(ValueError, match='bản tính mới'):
        record_review(**args)
    delete_case(case_id, path)
    assert review_history(case_id, path) == []


def test_sample_reviews_are_isolated_by_result_key_and_validate_reviewer(tmp_path):
    path = tmp_path / 'reviews.sqlite3'
    args = dict(encounter_id='E0009', prediction_at='2026-01-01T09:00:00',
                model_version='sample-v1', reviewed_by='Người xem', path=path)
    with pytest.raises(ValueError, match='người ghi nhận'):
        record_review(**{**args, 'reviewed_by': ' '}, result_key='sample:first')
    record_review(**args, result_key='sample:first')
    record_review(**args, result_key='sample:second')
    assert len(review_history('E0009', path)) == 2
    assert review_history('E0010', path) == []


def test_concurrent_review_keeps_one_acknowledgement(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    path = tmp_path / 'concurrent.sqlite3'
    init_db(path)
    def submit(name):
        return record_review(result_key='sample:concurrent', encounter_id='E0009',
                             prediction_at='2026-01-01T09:00:00', model_version='v1',
                             reviewed_by=name, path=path)
    with ThreadPoolExecutor(max_workers=2) as pool:
        saved = list(pool.map(submit, ['Người A', 'Người B']))
    assert saved[0] == saved[1]
    assert len(review_history('E0009', path)) == 1
