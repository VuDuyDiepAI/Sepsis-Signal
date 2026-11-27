"""Clinical alert-policy edge cases, independent of the trained mock model."""
import numpy as np
import pandas as pd
import pytest

from src.alert_evaluation import (
    alert_episodes, calibration_parameters, episode_starts, evaluate_predictions,
    evaluation_frame, select_patient_threshold,
)


def fixture_case(eid, hours, onset_hour, scores):
    origin = pd.Timestamp('2026-01-01')
    onset = origin + pd.Timedelta(hours=onset_hour) if onset_hour is not None else pd.NaT
    times = [origin + pd.Timedelta(hours=h) for h in hours]
    frame = pd.DataFrame({'encounter_id': eid, 'prediction_at': times,
                          'label': [int(pd.notna(onset) and 0 < (onset-t).total_seconds()/3600 <= 6) for t in times],
                          'score': scores})
    return frame, {'encounter_id': eid, 'sepsis_onset_at': onset}


def combine(*cases):
    return pd.concat([c[0] for c in cases], ignore_index=True), pd.DataFrame([c[1] for c in cases])


def test_fixed_cooldown_includes_exact_six_hours_and_does_not_slide():
    f, o = fixture_case('a', [1, 2, 6, 7, 8, 13, 14, 15], None, [1]*8)
    assert episode_starts(f.prediction_at.to_numpy(), f.score.to_numpy(), 0.5) == [0, 4, 7]
    df = evaluation_frame(f, f.label, f.score, pd.DataFrame([o]), 'sepsis')
    assert alert_episodes(df.sample(frac=1, random_state=42), 0.5).started_at.tolist() == f.iloc[[0, 4, 7]].prediction_at.tolist()


def test_early_false_episode_cannot_become_true_from_suppressed_positive_hours():
    frame, outcomes = combine(
        fixture_case('early', range(1, 8), 8, [0.9]*7),
        fixture_case('timely', [2], 8, [0.9]),
        fixture_case('negative', [1, 2, 8], None, [0.9]*3),
    )
    result = evaluate_predictions(frame, frame.label, frame.score, 0.5, outcomes, 'sepsis', 0)
    assert result['raw_timely_alert_encounters'] == 2
    assert result['timely_alert_encounters'] == 1
    assert result['encounter_early_recall'] == 0.5
    assert result['alert_episodes'] == 4
    assert result['true_alert_episodes'] == 1
    assert result['false_alert_episodes'] == 3  # Includes an early alert on a sepsis case.
    assert result['episode_ppv'] == 0.25
    assert result['false_alert_episodes_per_100'] == 100
    assert result['false_episodes_per_true_episode'] == 3
    assert result['median_lead_hours'] == 6
    assert result['repeated_alert_fraction'] == pytest.approx(7/11)


def test_threshold_targets_patients_not_hours_without_artificial_ceiling():
    cases = []
    for i in range(5):
        cases.append(fixture_case(str(i), range(4, 10), 10, [0.01]*5 + [0.8 if i < 4 else 0.2]))
    frame, outcomes = combine(*cases)
    threshold, policy = select_patient_threshold(frame, 'label', frame.score, outcomes, 'sepsis')
    assert threshold == 0.8
    assert policy['validation_encounter_recall'] == 0.8
    assert policy['validation_snapshot_recall'] == pytest.approx(4/30)
    assert policy['hourly_recall_constraint'] is False


def test_impossible_episode_recall_fails_instead_of_using_a_fixed_fallback():
    frame, outcomes = combine(
        fixture_case('a', [1, 7], 8, [0.9, 0.95]),
        fixture_case('b', [2], 8, [0.6]),
    )
    with pytest.raises(ValueError, match='No threshold meets'):
        select_patient_threshold(frame, 'label', frame.score, outcomes, 'sepsis', minimum_recall=1)


def test_bootstrap_resamples_whole_encounters_and_handles_undefined_ratios():
    frame, outcomes = combine(
        fixture_case('a', [1, 2, 3], None, [0.8]*3),
        fixture_case('b', [1, 2, 3], 7, [0.8]*3),
    )
    result = evaluate_predictions(frame, frame.label, frame.score, 0.5, outcomes, 'sepsis', 100)
    ci = result['confidence_intervals']['observed_prevalence']
    assert (ci['lower'], ci['upper']) == (0, 1)
    assert 0 < result['confidence_intervals']['auroc']['valid_resamples'] < 100
    assert result['npv'] is None
    assert result['calibration_slope'] is None  # Constant scores cannot identify slope.
    assert result['confidence_intervals']['calibration_slope']['valid_resamples'] == 0
    assert result['bootstrap']['unit'] == 'encounter'
    no_alert = evaluate_predictions(frame, frame.label, frame.score, 1.0, outcomes, 'sepsis', 10)
    assert no_alert['episode_ppv'] is None
    assert no_alert['median_lead_hours'] is None
    assert no_alert['iqr_lead_hours'] is None


def test_calibration_diagnostics_do_not_modify_probabilities():
    y = np.array([1, 0, 0, 0, 0, 1, 1, 1, 1, 0])
    scores = np.array([0.2]*5 + [0.8]*5)
    original = scores.copy()
    intercept, slope = calibration_parameters(y, scores, np.ones(10))
    assert intercept == pytest.approx(0, abs=1e-5)
    assert slope == pytest.approx(1, abs=1e-5)
    assert np.array_equal(scores, original)


def test_no_post_onset_predictions_duplicate_hours_or_mismatched_labels():
    frame, outcomes = combine(fixture_case('a', [1, 2], 3, [0.5, 0.6]))
    with pytest.raises(ValueError, match='Duplicate'):
        duplicated = pd.concat([frame, frame.iloc[[0]]])
        evaluation_frame(duplicated, duplicated.label, duplicated.score, outcomes, 'sepsis')
    with pytest.raises(ValueError, match='Labels disagree'):
        evaluation_frame(frame, [0, 0], frame.score, outcomes, 'sepsis')
    frame.loc[1, 'prediction_at'] = pd.Timestamp('2026-01-01T03:00')
    with pytest.raises(ValueError, match='Post-onset'):
        evaluation_frame(frame, frame.label, frame.score, outcomes, 'sepsis')
