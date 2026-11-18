"""Train a calibrated, clinically-engineered logistic-regression demo on synthetic ED/hospital EMR.

The temporal holdout is used once for descriptive synthetic-only evaluation.
No metric in this script estimates performance on real patients.
"""
from __future__ import annotations

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
    TARGETS,
    ClinicalFeatureExpander,
    bundle_paths,
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
    df['score'] = score
    df['alert'] = prediction
    onset_col = f'{target}_onset_at'
    df = df.merge(outcomes[['encounter_id', onset_col]], on='encounter_id', how='left')

    total_encounters = int(df['encounter_id'].nunique())
    pos_enc_ids = set(df.loc[df['y'] == 1, 'encounter_id'].unique())
    alerted_enc_ids = set(df.loc[df['alert'], 'encounter_id'].unique())

    tp_enc = len(pos_enc_ids & alerted_enc_ids)
    fp_enc = len(alerted_enc_ids - pos_enc_ids)
    enc_early_recall = float(tp_enc / len(pos_enc_ids)) if pos_enc_ids else 0.0
    enc_precision = float(tp_enc / len(alerted_enc_ids)) if alerted_enc_ids else 0.0
    nne_enc = round(float(1.0 / enc_precision), 2) if enc_precision > 0 else None
    false_alert_enc_per_100 = round(float(fp_enc / total_encounters * 100.0), 2) if total_encounters else 0.0

    total_episodes = 0
    lead_hours = []
    for enc_id, group in df.groupby('encounter_id', sort=False):
        alert_rows = group.loc[group['alert']].sort_values('prediction_at')
        total_episodes += _count_episodes_6h(alert_rows['prediction_at'].tolist())
        if enc_id in pos_enc_ids and not alert_rows.empty:
            first_alert_at = alert_rows['prediction_at'].iloc[0]
            onset_at = alert_rows[onset_col].iloc[0]
            if pd.notna(onset_at):
                lead_hours.append(float((onset_at - first_alert_at).total_seconds() / 3600.0))

    episodes_per_100 = round(float(total_episodes / total_encounters * 100.0), 2) if total_encounters else 0.0
    median_lead = round(float(np.median(lead_hours)), 2) if lead_hours else None
    iqr_lead = (
        [round(float(np.percentile(lead_hours, 25)), 2), round(float(np.percentile(lead_hours, 75)), 2)]
        if lead_hours else None
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


def train_target(tables, target):
    label_col = TARGETS[target][1]
    frame = training_frame(tables, target)
    outcomes = tables['ReferenceOutcomes']
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

    best_c, cv_summary = tune_regularization_cv(train, label_col, target)
    model = make_pipeline(best_c)
    model.fit(train[FEATURES], train[label_col])

    validation_score = model.predict_proba(validation[FEATURES])[:, 1]
    positive_scores = validation_score[validation[label_col].to_numpy() == 1]
    if not len(positive_scores):
        raise ValueError('Validation không có nhãn dương.')

    # Select highest validation threshold achieving encounter-level early recall >= 80% AND snapshot recall >= 80%,
    # capped at a clinically sensible early-warning probability ceiling (30% for sepsis, 15% for shock)
    # so the system alerts during the early prodrome rather than waiting until >90% near onset.
    val_eval = validation[['encounter_id', label_col]].copy()
    val_eval['score'] = validation_score
    pos_val_enc = val_eval.loc[val_eval[label_col] == 1].groupby('encounter_id')['score'].max().to_numpy()

    max_sensible_ceiling = 0.15 if target == 'shock' else 0.28
    candidates = np.unique(np.append(validation_score, [max_sensible_ceiling]))
    feasible = [
        float(t) for t in candidates
        if t <= max_sensible_ceiling and np.mean(pos_val_enc >= t) >= 0.80 and np.mean(positive_scores >= t) >= 0.80
    ]
    if not feasible:
        feasible = [float(t) for t in candidates if t <= max_sensible_ceiling and np.mean(pos_val_enc >= t) >= 0.80]
    threshold = round(max(feasible), 4) if feasible else (0.10 if target == 'shock' else 0.20)

    holdout_score = model.predict_proba(holdout[FEATURES])[:, 1]
    train_pos_enc = int(train.groupby('encounter_id')[label_col].max().sum())
    n_expanded_features = int(len(model.named_steps['prep'].get_feature_names_out()))
    epv_encounters = round(train_pos_enc / len(FEATURES), 2)

    metadata = {
        'model_name': 'Logistic regression',
        'model_version': f'mock-emr-hourly-{target}-lr-v2',
        'data_kind': 'SYNTHETIC_MOCK_EMR',
        'target': label_col,
        'horizon_hours': 6,
        'first_prediction_hour': 1,
        'prediction_interval_minutes': 60,
        'features': FEATURES,
        'expanded_feature_count': n_expanded_features,
        'class_weight': None,
        'regularization_C': best_c,
        'cv_tuning': cv_summary,
        'epv_positive_encounters_per_input_var': epv_encounters,
        'threshold': threshold,
        'threshold_rule': 'Highest validation threshold with encounter early recall >= 0.80 and snapshot recall >= 0.80 (natural prevalence calibration)',
        'source_sha256': hashlib.sha256(DATA_PATH.read_bytes()).hexdigest(),
        'trained_at_utc': datetime.now(timezone.utc).isoformat(),
        'train_encounters': int(train.encounter_id.nunique()),
        'train_positive_encounters': train_pos_enc,
        'validation_encounters': int(validation.encounter_id.nunique()),
        'validation_positive_encounters': int(validation.groupby('encounter_id')[label_col].max().sum()),
        'temporal_holdout_encounters': int(holdout.encounter_id.nunique()),
        'temporal_holdout_positive_encounters': int(holdout.groupby('encounter_id')[label_col].max().sum()),
        'validation_synthetic_metrics': metrics(validation, validation[label_col].to_numpy(), validation_score, threshold, outcomes, target),
        'temporal_holdout_synthetic_metrics': metrics(holdout, holdout[label_col].to_numpy(), holdout_score, threshold, outcomes, target),
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
    tables = load_tables()
    for target in TARGETS:
        train_target(tables, target)


if __name__ == '__main__':
    main()
