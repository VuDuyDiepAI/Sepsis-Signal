"""Train or reevaluate a logistic-regression demo on synthetic ED/hospital EMR.

The temporal holdout is used once for descriptive synthetic-only evaluation.
No metric in this script estimates performance on real patients.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.mock_emr import (  # noqa: E402
    CATEGORICAL_FEATURES,
    DATA_PATH,
    EXPANDED_NUMERIC_FEATURES,
    FEATURES,
    FEATURE_SCHEMA_VERSION,
    OBSERVATION_WINDOW,
    TARGETS,
    ClinicalFeatureExpander,
    bundle_paths,
    load_bundle,
    load_tables,
    training_frame,
)


def make_pipeline(c_value: float = 0.1) -> Pipeline:
    columns = ColumnTransformer([
        ('numeric', Pipeline([
            ('impute', SimpleImputer(strategy='median', keep_empty_features=True)),
            ('scale', StandardScaler()),
        ]), EXPANDED_NUMERIC_FEATURES),
        ('category', Pipeline([
            ('impute', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False)),
        ]), CATEGORICAL_FEATURES),
    ], sparse_threshold=0)
    prep = Pipeline([
        ('expand', ClinicalFeatureExpander()),
        ('columns', columns),
    ])
    return Pipeline([
        ('prep', prep),
        ('lr', LogisticRegression(
            C=float(c_value),
            penalty='l2',
            solver='lbfgs',
            class_weight=None,
            max_iter=2000,
            random_state=42,
        )),
    ])


def _count_episodes_6h(alert_times: list[pd.Timestamp]) -> int:
    """Group consecutive hourly alerts within a 6-hour cooldown window into 1 episode."""
    if not alert_times:
        return 0
    episodes = 0
    active_until = None
    for t in sorted(alert_times):
        if active_until is None or t > active_until:
            episodes += 1
            active_until = t + pd.Timedelta(hours=6)
    return episodes


def metrics(frame: pd.DataFrame, y: np.ndarray, score: np.ndarray, threshold: float,
            outcomes: pd.DataFrame, target: str) -> dict:
    prediction = score >= threshold
    df = frame[['encounter_id', 'prediction_at']].copy()
    df['y'] = y
    df['alert'] = prediction
    onset_col = f'{target}_onset_at'
    df = df.merge(outcomes[['encounter_id', onset_col]], on='encounter_id',
                  how='left', validate='many_to_one')
    df['lead_hours'] = (df[onset_col] - df['prediction_at']).dt.total_seconds() / 3600

    total_encounters = int(df['encounter_id'].nunique())
    pos_enc_ids = set(df.loc[df['y'] == 1, 'encounter_id'].unique())
    alerted_enc_ids = set(df.loc[df['alert'], 'encounter_id'].unique())

    timely = df.loc[df['alert'] & df['y'].eq(1) & df['lead_hours'].gt(0)
                    & df['lead_hours'].le(6)]
    timely_ids = set(timely['encounter_id'])
    too_early_ids = set(df.loc[df['alert'] & df['lead_hours'].gt(6), 'encounter_id'])
    tp_enc = len(timely_ids)
    fp_enc = df.loc[df['alert'] & df[onset_col].isna(), 'encounter_id'].nunique()
    enc_early_recall = float(tp_enc / len(pos_enc_ids)) if pos_enc_ids else 0.0
    enc_precision = float(tp_enc / len(alerted_enc_ids)) if alerted_enc_ids else 0.0
    nne_enc = round(float(1.0 / enc_precision), 2) if enc_precision > 0 else None
    false_alert_enc_per_100 = round(float(fp_enc / total_encounters * 100.0), 2) if total_encounters else 0.0

    total_episodes = sum(_count_episodes_6h(group['prediction_at'].tolist())
                         for _, group in df.loc[df['alert']].groupby('encounter_id'))
    lead_hours = timely.groupby('encounter_id')['lead_hours'].max().to_numpy()

    episodes_per_100 = round(float(total_episodes / total_encounters * 100.0), 2) if total_encounters else 0.0
    median_lead = round(float(np.median(lead_hours)), 2) if len(lead_hours) else None
    iqr_lead = (
        [round(float(np.percentile(lead_hours, 25)), 2), round(float(np.percentile(lead_hours, 75)), 2)]
        if len(lead_hours) else None
    )

    return {
        'snapshots': int(len(y)),
        'positive_snapshots': int(np.sum(y)),
        'auroc': float(roc_auc_score(y, score)) if len(np.unique(y)) == 2 else None,
        'auprc': float(average_precision_score(y, score)) if np.sum(y) else None,
        'brier': float(brier_score_loss(y, score)),
        'observed_prevalence': float(np.mean(y)),
        'mean_predicted_probability': float(np.mean(score)),
        'recall': float(recall_score(y, prediction, zero_division=0)),
        'precision': float(precision_score(y, prediction, zero_division=0)),
        'alert_fraction': float(np.mean(prediction)),
        'encounter_early_recall': enc_early_recall,
        'timely_alert_encounters': tp_enc,
        'too_early_alert_encounters': len(too_early_ids),
        'too_early_only_encounters': len(too_early_ids - timely_ids),
        'encounter_precision': enc_precision,
        'nne_encounters': nne_enc,
        'false_alert_encounters_per_100': false_alert_enc_per_100,
        'alert_episodes_per_100': episodes_per_100,
        'median_lead_hours': median_lead,
        'iqr_lead_hours': iqr_lead,
    }


def tune_regularization_cv(train_df: pd.DataFrame, label_col: str, target: str) -> tuple[float, dict]:
    """Select L2 regularization C via 5-fold patient-grouped CV on pooled OOF AUPRC."""
    # Shock has only 7 positive encounters in train (very low EPV), so restrict C to stronger shrinkage.
    c_grid = [0.005, 0.01, 0.02, 0.05, 0.1] if target == 'shock' else [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0]
    X = train_df[FEATURES].reset_index(drop=True)
    y = train_df[label_col].to_numpy(dtype=int)
    groups = train_df['encounter_id'].to_numpy()
    gkf = GroupKFold(n_splits=5)
    folds = list(gkf.split(X, y, groups))

    best_c = c_grid[0]
    best_auprc = -1.0
    best_auroc = 0.0
    grid_history = []
    for c_val in c_grid:
        oof = np.zeros(len(y), dtype=float)
        for tr_idx, va_idx in folds:
            assert set(groups[tr_idx]).isdisjoint(set(groups[va_idx]))
            pipe = make_pipeline(c_val)
            pipe.fit(X.iloc[tr_idx], y[tr_idx])
            oof[va_idx] = pipe.predict_proba(X.iloc[va_idx])[:, 1]
        auprc = float(average_precision_score(y, oof))
        auroc = float(roc_auc_score(y, oof))
        grid_history.append({'C': c_val, 'oof_auprc': round(auprc, 4), 'oof_auroc': round(auroc, 4)})
        if auprc > best_auprc:
            best_auprc = auprc
            best_auroc = auroc
            best_c = c_val

    return best_c, {
        'cv_folds': 5,
        'best_C': best_c,
        'oof_auprc': round(best_auprc, 4),
        'oof_auroc': round(best_auroc, 4),
        'c_grid_results': grid_history,
    }


def split_target(tables, target):
    label_col = TARGETS[target][1]
    frame = training_frame(tables, target)
    development = frame.loc[frame.split_hint == 'development'].copy()
    holdout = frame.loc[frame.split_hint == 'temporal_holdout'].copy()
    if development.empty or holdout.empty:
        raise ValueError('Cần cả development và temporal_holdout.')

    patient_event = development.groupby('encounter_id')[label_col].max()
    train_ids, validation_ids = train_test_split(
        patient_event.index.to_numpy(), test_size=0.25, random_state=42,
        stratify=patient_event.to_numpy(),
    )
    train = development.loc[development.encounter_id.isin(train_ids)].copy()
    validation = development.loc[development.encounter_id.isin(validation_ids)].copy()
    assert set(train.encounter_id).isdisjoint(validation.encounter_id)
    assert set(development.encounter_id).isdisjoint(holdout.encounter_id)
    return train, validation, holdout


def select_threshold(validation, label_col, scores, target):
    # Positive labels mark eligible hours with onset in (t, t+6 hours].
    val_eval = validation[['encounter_id', label_col]].assign(score=scores)
    positives = val_eval.loc[val_eval[label_col].eq(1)]
    positive_scores = positives['score'].to_numpy()
    if not len(positive_scores):
        raise ValueError('Validation không có nhãn dương.')

    per_encounter = positives.groupby('encounter_id')['score'].max().to_numpy()
    ceiling = 0.15 if target == 'shock' else 0.28
    candidates = np.unique(np.append(scores, [ceiling]))
    candidates = candidates[candidates <= ceiling]
    encounter_feasible = [float(t) for t in candidates if np.mean(per_encounter >= t) >= 0.80]
    both_feasible = [t for t in encounter_feasible if np.mean(positive_scores >= t) >= 0.80]
    if both_feasible:
        threshold, branch = max(both_feasible), 'both_recall_targets'
    elif encounter_feasible:
        threshold, branch = max(encounter_feasible), 'encounter_only'
    else:
        threshold, branch = (0.10 if target == 'shock' else 0.20), 'fixed_demo_threshold'
    return threshold, {
        'branch': branch,
        'minimum_recall': 0.80,
        'demo_ceiling': ceiling,
        'validation_encounter_recall': float(np.mean(per_encounter >= threshold)),
        'validation_snapshot_recall': float(np.mean(positive_scores >= threshold)),
    }


def evaluate_model(tables, target, model, validation, holdout):
    label_col = TARGETS[target][1]
    outcomes = tables['ReferenceOutcomes']
    validation_score = model.predict_proba(validation[FEATURES])[:, 1]
    threshold, selection = select_threshold(validation, label_col, validation_score, target)
    holdout_score = model.predict_proba(holdout[FEATURES])[:, 1]
    return {
        'evaluation_version': 'timely-alert-v1',
        'evaluated_at_utc': datetime.now(timezone.utc).isoformat(),
        'threshold': threshold,
        'threshold_rule': 'Highest validation threshold within the demo ceiling meeting both recall targets; fallbacks are recorded under threshold_selection.',
        'threshold_selection': selection,
        'validation_synthetic_metrics': metrics(validation, validation[label_col].to_numpy(), validation_score, threshold, outcomes, target),
        'temporal_holdout_synthetic_metrics': metrics(holdout, holdout[label_col].to_numpy(), holdout_score, threshold, outcomes, target),
    }


def train_target(tables, target):
    label_col = TARGETS[target][1]
    train, validation, holdout = split_target(tables, target)
    best_c, cv_summary = tune_regularization_cv(train, label_col, target)
    model = make_pipeline(best_c)
    model.fit(train[FEATURES], train[label_col])
    train_pos_enc = int(train.groupby('encounter_id')[label_col].max().sum())
    n_expanded_features = int(len(model.named_steps['prep'].get_feature_names_out()))
    epv_encounters = round(train_pos_enc / len(FEATURES), 2)

    metadata = {
        'model_name': 'Logistic regression',
        'model_version': f'mock-emr-hourly-{target}-lr-v3-expanding-t0',
        'data_kind': 'SYNTHETIC_MOCK_EMR',
        'target': label_col,
        'horizon_hours': 6,
        'feature_schema_version': FEATURE_SCHEMA_VERSION,
        'observation_window': OBSERVATION_WINDOW,
        'first_prediction_hour': 1,
        'prediction_interval_minutes': 60,
        'features': FEATURES,
        'expanded_feature_count': n_expanded_features,
        'class_weight': None,
        'regularization_C': best_c,
        'cv_tuning': cv_summary,
        'epv_positive_encounters_per_input_var': epv_encounters,
        'source_sha256': hashlib.sha256(DATA_PATH.read_bytes()).hexdigest(),
        'trained_at_utc': datetime.now(timezone.utc).isoformat(),
        'train_encounters': int(train.encounter_id.nunique()),
        'train_positive_encounters': train_pos_enc,
        'validation_encounters': int(validation.encounter_id.nunique()),
        'validation_positive_encounters': int(validation.groupby('encounter_id')[label_col].max().sum()),
        'temporal_holdout_encounters': int(holdout.encounter_id.nunique()),
        'temporal_holdout_positive_encounters': int(holdout.groupby('encounter_id')[label_col].max().sum()),
        **evaluate_model(tables, target, model, validation, holdout),
        'warning': 'Synthetic, event-enriched and rule-generated data. Not a clinical probability or clinical validation.',
    }
    bundle_path, meta_path = bundle_paths(target)
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, bundle_path)
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'target': target, **{k: metadata[k] for k in [
        'model_version', 'regularization_C', 'epv_positive_encounters_per_input_var',
        'train_encounters', 'validation_encounters',
        'temporal_holdout_encounters', 'train_positive_encounters',
        'validation_positive_encounters', 'temporal_holdout_positive_encounters', 'threshold',
        'validation_synthetic_metrics', 'temporal_holdout_synthetic_metrics',
    ]}}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-metrics', action='store_true',
                        help='Reevaluate saved weights on the matching mock workbook.')
    args = parser.parse_args()
    tables = load_tables()
    for target in TARGETS:
        if not args.refresh_metrics:
            train_target(tables, target)
            continue
        model, metadata = load_bundle(target)
        train, validation, holdout = split_target(tables, target)
        for name, frame in [('train', train), ('validation', validation), ('temporal_holdout', holdout)]:
            if frame.encounter_id.nunique() != metadata[f'{name}_encounters']:
                raise ValueError(f'{target}: split size no longer matches saved metadata.')
        evaluation = evaluate_model(tables, target, model, validation, holdout)
        _, metadata_path = bundle_paths(target)
        pending = metadata_path.with_suffix('.pending')
        pending.write_text(json.dumps({**metadata, **evaluation}, ensure_ascii=False, indent=2),
                           encoding='utf-8')
        pending.replace(metadata_path)
        print(f'{target}: {evaluation["threshold"]!r} {evaluation["threshold_selection"]}')


if __name__ == '__main__':
    main()
