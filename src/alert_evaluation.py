"""Fixed-policy evaluation of pre-onset predictions and six-hour alert episodes.

Intervals resample whole encounters, retaining their correlated hourly rows.
They describe the supplied synthetic sample, not clinical validation.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import brentq, minimize
from scipy.special import expit, logit
from sklearn.metrics import average_precision_score, roc_auc_score

HORIZON_HOURS = 6
EVALUATION_VERSION = 'alert-episodes-6h-v2'


def evaluation_frame(frame, y, scores, outcomes, target):
    y, scores = np.asarray(y), np.asarray(scores, dtype=float)
    if len(frame) != len(y) or len(y) != len(scores) or not len(y):
        raise ValueError('Evaluation requires nonempty aligned predictions and labels.')
    if not np.isin(y, [0, 1]).all() or not np.isfinite(scores).all() or ((scores < 0) | (scores > 1)).any():
        raise ValueError('Labels must be binary and scores must be finite probabilities.')
    df = frame[['encounter_id', 'prediction_at']].copy()
    df['prediction_at'] = pd.to_datetime(df.prediction_at)
    if df.duplicated(['encounter_id', 'prediction_at']).any():
        raise ValueError('Duplicate encounter/time predictions would inflate evaluation.')
    df['y'], df['score'] = y.astype(int), scores
    onset = f'{target}_onset_at'
    df = df.merge(outcomes[['encounter_id', onset]], on='encounter_id',
                  how='left', validate='many_to_one', indicator=True)
    if not df['_merge'].eq('both').all():
        raise ValueError('Each evaluated encounter needs a reference outcome record.')
    df['onset'] = pd.to_datetime(df[onset])
    if (df.onset.notna() & df.prediction_at.ge(df.onset)).any():
        raise ValueError('Post-onset predictions cannot enter early-warning evaluation.')
    df['lead_hours'] = (df.onset - df.prediction_at).dt.total_seconds() / 3600
    expected = df.lead_hours.gt(0) & df.lead_hours.le(HORIZON_HOURS)
    if not np.array_equal(expected.astype(int), df.y):
        raise ValueError('Labels disagree with onset in (prediction time, time + 6h].')
    return df.sort_values(['encounter_id', 'prediction_at']).reset_index(drop=True)


def episode_starts(times, scores, threshold):
    """A fixed lockout measured from episode start; suppressed alerts do not extend it.

    An alert exactly six hours after start still belongs to that episode.
    """
    starts, until = [], None
    for i in np.argsort(times):
        if scores[i] >= threshold and (until is None or times[i] > until):
            starts.append(int(i))
            until = times[i] + np.timedelta64(HORIZON_HOURS, 'h')
    return starts


def alert_episodes(df, threshold):
    if not np.isfinite(threshold) or not 0 <= threshold <= 1:
        raise ValueError('Threshold must be a finite probability.')
    records = []
    for eid, group in df.groupby('encounter_id', sort=False):
        times, scores = group.prediction_at.to_numpy(), group.score.to_numpy()
        for i in episode_starts(times, scores, threshold):
            row = group.iloc[i]
            records.append({'encounter_id': eid, 'started_at': row.prediction_at,
                            'true_alert': bool(0 < row.lead_hours <= HORIZON_HOURS),
                            'lead_hours': float(row.lead_hours) if pd.notna(row.lead_hours) else None})
    return pd.DataFrame(records, columns=['encounter_id', 'started_at', 'true_alert', 'lead_hours'])


def select_patient_threshold(validation, label_col, scores, outcomes, target, minimum_recall=0.8):
    """Highest candidate meeting patient recall under the actual episode policy."""
    if not 0 < minimum_recall <= 1:
        raise ValueError('Minimum recall must be in (0, 1].')
    df = evaluation_frame(validation, validation[label_col].to_numpy(), scores, outcomes, target)
    positives = [g for _, g in df.groupby('encounter_id') if g.onset.notna().any()]
    if not positives:
        raise ValueError('No event encounters in threshold-selection data.')
    groups = [(g.prediction_at.to_numpy(), g.score.to_numpy(), g.y.to_numpy()) for g in positives]
    for candidate in sorted(np.unique(np.append(scores, 0.0)), reverse=True):
        caught = sum(any(labels[i] == 1 for i in episode_starts(times, values, candidate))
                     for times, values, labels in groups)
        if caught / len(groups) >= minimum_recall:
            episodes = alert_episodes(df, candidate)
            return float(candidate), {
                'branch': 'patient_episode_recall',
                'minimum_recall': minimum_recall,
                'recall_unit': 'encounter_with_true_alert_episode',
                'validation_encounter_recall': caught / len(groups),
                'validation_snapshot_recall': float(np.mean(df.loc[df.y.eq(1), 'score'] >= candidate)),
                'validation_true_alert_episodes': int(episodes.true_alert.sum()),
                'validation_false_alert_episodes': int((~episodes.true_alert).sum()),
                'selection_data': 'independent_validation',
                'probability_calibration': 'not_applied',
                'cooldown_hours': HORIZON_HOURS,
                'hourly_recall_constraint': False,
                'arbitrary_threshold_ceiling': False,
            }
    raise ValueError('No threshold meets patient recall under the six-hour episode policy; do not silently fall back.')


def _ratio(numerator, denominator):
    return float(numerator / denominator) if denominator else None


def calibration_parameters(y, score, weight):
    """Calibration-in-the-large (slope fixed at 1), and a joint logistic slope.

    These are diagnostic fits, not a recalibration of prediction probabilities.
    Return null for single-class samples, failed fits or boundary/separated fits.
    """
    active = weight > 0
    y, score, weight = y[active], score[active], weight[active]
    if len(np.unique(y)) < 2:
        return None, None
    x = logit(np.clip(score, 1e-12, 1 - 1e-12))
    intercept = float(brentq(lambda a: np.dot(weight, expit(a + x) - y), -60, 60))
    if np.ptp(x) < 1e-10:
        return intercept, None
    design = np.column_stack([np.ones(len(x)), x])
    def loss(params):
        z = design @ params
        return float(np.dot(weight, np.logaddexp(0, z) - y * z)), design.T @ (weight * (expit(z) - y))
    fitted = minimize(loss, [intercept, 1.0], jac=True, method='L-BFGS-B',
                      bounds=[(-50, 50), (-50, 50)], options={'maxiter': 200, 'ftol': 1e-12})
    slope = float(fitted.x[1]) if fitted.success and np.max(np.abs(fitted.x)) < 49.9 else None
    return intercept, slope


def evaluate_predictions(frame, y, scores, threshold, outcomes, target, bootstrap_samples=1000, seed=42):
    df = evaluation_frame(frame, y, scores, outcomes, target)
    episodes = alert_episodes(df, threshold)
    ids = df.encounter_id.drop_duplicates().tolist()
    lookup = {eid: i for i, eid in enumerate(ids)}
    codes = df.encounter_id.map(lookup).to_numpy()
    y, scores = df.y.to_numpy(), df.score.to_numpy()
    alert = scores >= threshold
    event = df.groupby('encounter_id', sort=False).onset.first().notna().to_numpy()
    raw_alerted = np.bincount(codes, weights=alert, minlength=len(ids))
    true_counts, false_counts = np.zeros(len(ids)), np.zeros(len(ids))
    lead = np.full(len(ids), np.nan)
    for row in episodes.itertuples():
        i = lookup[row.encounter_id]
        if row.true_alert:
            true_counts[i] += 1
            lead[i] = row.lead_hours if np.isnan(lead[i]) else max(lead[i], row.lead_hours)
        else:
            false_counts[i] += 1
    timely_raw = np.bincount(codes, weights=alert & (y == 1), minlength=len(ids)) > 0
    early_raw = np.bincount(codes, weights=alert & df.lead_hours.gt(6).to_numpy(), minlength=len(ids)) > 0

    def aggregate(group_weight):
        weight = group_weight[codes]
        tp = np.sum(weight * (alert & (y == 1)))
        fp = np.sum(weight * (alert & (y == 0)))
        tn = np.sum(weight * (~alert & (y == 0)))
        fn = np.sum(weight * (~alert & (y == 1)))
        total = group_weight.sum()
        true = np.dot(group_weight, true_counts)
        false = np.dot(group_weight, false_counts)
        episode_count = true + false
        positive = np.dot(group_weight, event)
        caught = np.dot(group_weight, true_counts > 0)
        alerted = np.dot(group_weight, raw_alerted > 0)
        lead_sample = np.repeat(lead, group_weight.astype(int))
        lead_sample = lead_sample[np.isfinite(lead_sample)]
        both_classes = np.sum(weight * y) > 0 and np.sum(weight * (1 - y)) > 0
        intercept, slope = calibration_parameters(y, scores, weight)
        return {
            'snapshots': float(weight.sum()), 'positive_snapshots': float(np.dot(weight, y)),
            'encounters': float(total), 'positive_encounters': float(positive),
            'auroc': float(roc_auc_score(y, scores, sample_weight=weight)) if both_classes else None,
            'auprc': float(average_precision_score(y, scores, sample_weight=weight)) if both_classes else None,
            'brier': float(np.average((scores-y)**2, weights=weight)),
            'observed_prevalence': float(np.average(y, weights=weight)),
            'mean_predicted_probability': float(np.average(scores, weights=weight)),
            'calibration_intercept': intercept, 'calibration_slope': slope,
            'recall': _ratio(tp, tp+fn), 'precision': _ratio(tp, tp+fp),
            'specificity': _ratio(tn, tn+fp), 'npv': _ratio(tn, tn+fn),
            'f1': _ratio(2*tp, 2*tp+fp+fn),
            'alert_fraction': float(np.average(alert, weights=weight)),
            'encounter_early_recall': _ratio(caught, positive),
            'timely_alert_encounters': float(caught),
            'too_early_alert_encounters': float(np.dot(group_weight, early_raw)),
            'too_early_only_encounters': float(np.dot(group_weight, early_raw & ~(true_counts > 0))),
            'raw_timely_alert_encounters': float(np.dot(group_weight, timely_raw)),
            'encounter_precision': _ratio(caught, alerted),
            'nne_encounters': _ratio(alerted, caught),
            'false_alert_encounters_per_100': _ratio(100*np.dot(group_weight, false_counts > 0), total),
            'alert_episodes': float(episode_count), 'true_alert_episodes': float(true),
            'false_alert_episodes': float(false), 'episode_ppv': _ratio(true, episode_count),
            'alert_episodes_per_100': _ratio(100*episode_count, total),
            'false_alert_episodes_per_100': _ratio(100*false, total),
            'false_episodes_per_true_episode': _ratio(false, true),
            'repeated_alert_fraction': _ratio(tp+fp-episode_count, tp+fp),
            'median_lead_hours': float(np.median(lead_sample)) if len(lead_sample) else None,
            'lead_q1_hours': float(np.percentile(lead_sample, 25)) if len(lead_sample) else None,
            'lead_q3_hours': float(np.percentile(lead_sample, 75)) if len(lead_sample) else None,
        }

    result = aggregate(np.ones(len(ids), dtype=int))
    result['iqr_lead_hours'] = [result['lead_q1_hours'], result['lead_q3_hours']] if result['median_lead_hours'] is not None else None
    result['calibration_curve'] = []
    bins = pd.qcut(df.score, q=min(10, df.score.nunique()), duplicates='drop') if df.score.nunique() > 1 else pd.Series('all', index=df.index)
    for _, group in df.groupby(bins, observed=True):
        result['calibration_curve'].append({'mean_probability': float(group.score.mean()),
            'observed_fraction': float(group.y.mean()), 'snapshots': len(group)})
    result['confidence_intervals'] = {}
    result['bootstrap'] = {'unit': 'encounter', 'resamples': bootstrap_samples, 'seed': seed,
        'level': 0.95, 'fixed_model_and_threshold': True}
    if bootstrap_samples:
        rng = np.random.default_rng(seed)
        samples = []
        for _ in range(bootstrap_samples):
            group_weight = np.bincount(rng.integers(0, len(ids), size=len(ids)), minlength=len(ids))
            samples.append(aggregate(group_weight))
        for key in samples[0]:
            values = [sample[key] for sample in samples if sample[key] is not None and np.isfinite(sample[key])]
            result['confidence_intervals'][key] = {
                'lower': float(np.percentile(values, 2.5)) if values else None,
                'upper': float(np.percentile(values, 97.5)) if values else None,
                'valid_resamples': len(values),
            }
    return result
