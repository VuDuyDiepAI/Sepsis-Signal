"""Standalone clinical benchmark harness & MIMIC-IV (+ED) hourly ETL.

Supports:
  1. --source mock        Compare ML models vs bedside scores (qSOFA, SIRS, MEWS, NEWS2)
                          on the repo's synthetic ED-to-hospital EMR using fixed 6h alert
                          episodes, calibration diagnostics, and subgroup slices.
  2. --source mimic-demo  Read MIMIC-IV Demo + MIMIC-IV-ED Demo directly from .zip files,
                          enforce anti-leakage storetime <= prediction_at, derive Sepsis-3
                          onset labels (microbiology + antibiotics + hourly SOFA >= 2),
                          build hourly snapshots from T0, and run subject-grouped CV.

This script is strictly decoupled from the frozen web MVP bundle and golden fixtures.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import importlib.util
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.alert_evaluation import (  # noqa: E402
    calibration_parameters,
    evaluate_predictions,
    select_patient_threshold,
)
from src.mock_emr import (  # noqa: E402
    CATEGORICAL_FEATURES,
    EXPANDED_NUMERIC_FEATURES,
    FEATURES,
    TARGETS,
    ClinicalFeatureExpander,
    load_tables,
    training_frame,
)


# ---------------------------------------------------------------------------
# 1. Bedside clinical comparator scores (Sepsis-3 qSOFA, SIRS, MEWS, NEWS2)
# ---------------------------------------------------------------------------

def compute_clinical_baselines(df: pd.DataFrame) -> pd.DataFrame:
    """Compute exact bedside scores from hourly snapshot columns."""
    hr = pd.to_numeric(df.get('heart_rate_last_bpm', np.nan), errors='coerce')
    rr = pd.to_numeric(df.get('respiratory_rate_last_per_min', np.nan), errors='coerce')
    sbp = pd.to_numeric(df.get('sbp_last_mmhg', np.nan), errors='coerce')
    spo2 = pd.to_numeric(df.get('spo2_last_pct', np.nan), errors='coerce')
    temp = pd.to_numeric(df.get('temperature_last_c', np.nan), errors='coerce')
    gcs = pd.to_numeric(df.get('gcs_last', np.nan), errors='coerce')
    wbc = pd.to_numeric(df.get('WBC_last_10e9_L', np.nan), errors='coerce')

    # Sepsis-3 qSOFA: RR >= 22, SBP <= 100, GCS < 15
    qsofa = (
        rr.ge(22).fillna(False).astype(int)
        + sbp.le(100).fillna(False).astype(int)
        + gcs.lt(15).fillna(False).astype(int)
    )

    # SIRS: Temp >38 or <36, HR >90, RR >20, WBC >12 or <4
    sirs = (
        (temp.gt(38.0) | temp.lt(36.0)).fillna(False).astype(int)
        + hr.gt(90).fillna(False).astype(int)
        + rr.gt(20).fillna(False).astype(int)
        + (wbc.gt(12.0) | wbc.lt(4.0)).fillna(False).astype(int)
    )

    # MEWS (Subbe et al.): SBP, HR, RR, Temp, GCS(AVPU)
    mews_sbp = np.select(
        [sbp.le(70), sbp.le(80), sbp.le(100), sbp.ge(200)],
        [3, 2, 1, 2], default=0,
    )
    mews_hr = np.select(
        [hr.le(40), hr.le(50), hr.le(100), hr.le(110), hr.le(129), hr.ge(130)],
        [2, 1, 0, 1, 2, 3], default=0,
    )
    mews_rr = np.select(
        [rr.lt(9), rr.le(14), rr.le(20), rr.le(29), rr.ge(30)],
        [2, 0, 1, 2, 3], default=0,
    )
    mews_temp = np.where((temp.lt(35.0) | temp.ge(38.5)).fillna(False), 2, 0)
    mews_gcs = np.select(
        [gcs.le(8), gcs.le(12), gcs.le(14)],
        [3, 2, 1], default=0,
    )
    mews = mews_sbp + mews_hr + mews_rr + mews_temp + mews_gcs

    # NEWS2 (without supplemental O2 flag): RR, SpO2, SBP, HR, Temp, GCS
    news_rr = np.select(
        [rr.le(8), rr.between(9, 11), rr.between(12, 20), rr.between(21, 24), rr.ge(25)],
        [3, 1, 0, 2, 3], default=0,
    )
    news_spo2 = np.select(
        [spo2.le(91), spo2.between(92, 93), spo2.between(94, 95)],
        [3, 2, 1], default=0,
    )
    news_sbp = np.select(
        [sbp.le(90), sbp.between(91, 100), sbp.between(101, 110), sbp.between(111, 219), sbp.ge(220)],
        [3, 2, 1, 0, 3], default=0,
    )
    news_hr = np.select(
        [hr.le(40), hr.between(41, 50), hr.between(51, 90), hr.between(91, 110), hr.between(111, 130), hr.ge(131)],
        [3, 1, 0, 1, 2, 3], default=0,
    )
    news_temp = np.select(
        [temp.le(35.0), temp.between(35.1, 36.0), temp.between(36.1, 38.0), temp.between(38.1, 39.0), temp.ge(39.1)],
        [3, 1, 0, 1, 2], default=0,
    )
    news_gcs = np.where(gcs.lt(15).fillna(False), 3, 0)
    news2 = news_rr + news_spo2 + news_sbp + news_hr + news_temp + news_gcs

    return pd.DataFrame({
        'qSOFA': qsofa.astype(float),
        'SIRS': sirs.astype(float),
        'MEWS': mews.astype(float),
        'NEWS2': news2.astype(float),
    }, index=df.index)


# ---------------------------------------------------------------------------
# 2. Candidate ML Pipelines (LR L2, RandomForest, HistGBDT, optional LGBM/XGB)
# ---------------------------------------------------------------------------

def _numeric_and_cat_prep(numeric_cols: list[str], cat_cols: list[str], *, impute: bool = True, scale: bool = True):
    num_steps = []
    if impute:
        num_steps.append(('impute', SimpleImputer(strategy='median', keep_empty_features=True)))
    if scale:
        num_steps.append(('scale', StandardScaler()))
    num_pipe = Pipeline(num_steps) if num_steps else 'passthrough'
    transformers = [('numeric', num_pipe, numeric_cols)]
    if cat_cols:
        transformers.append(('category', Pipeline([
            ('impute', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False)),
        ]), cat_cols))
    return ColumnTransformer(transformers, sparse_threshold=0)


def make_candidate_models(
    numeric_cols: list[str],
    cat_cols: list[str],
    *,
    use_clinical_expander: bool = False,
) -> dict[str, Pipeline]:
    def wrap(estimator, *, impute=True, scale=True):
        steps: list[tuple[str, Any]] = []
        if use_clinical_expander:
            steps.append(('expand', ClinicalFeatureExpander()))
        steps.append(('prep', _numeric_and_cat_prep(numeric_cols, cat_cols, impute=impute, scale=scale)))
        steps.append(('model', estimator))
        return Pipeline(steps)

    models: dict[str, Pipeline] = {
        'LogisticRegression_L2': wrap(
            LogisticRegression(C=0.5, penalty='l2', solver='lbfgs', max_iter=2000, random_state=42),
            impute=True, scale=True,
        ),
        'RandomForest': wrap(
            RandomForestClassifier(
                n_estimators=200, max_depth=8, min_samples_leaf=5,
                class_weight='balanced_subsample', random_state=42, n_jobs=1,
            ),
            impute=True, scale=False,
        ),
        'HistGradientBoosting': wrap(
            HistGradientBoostingClassifier(
                max_iter=150, max_depth=4, learning_rate=0.05,
                min_samples_leaf=20, l2_regularization=1.0, random_state=42,
            ),
            impute=False, scale=False,
        ),
    }
    if importlib.util.find_spec('lightgbm'):
        from lightgbm import LGBMClassifier  # type: ignore
        models['LightGBM'] = wrap(
            LGBMClassifier(
                n_estimators=200, max_depth=4, learning_rate=0.05,
                num_leaves=15, subsample_for_bin=50000, random_state=42, verbose=-1,
            ),
            impute=False, scale=False,
        )
    if importlib.util.find_spec('xgboost'):
        from xgboost import XGBClassifier  # type: ignore
        models['XGBoost'] = wrap(
            XGBClassifier(
                n_estimators=200, max_depth=4, learning_rate=0.05,
                eval_metric='logloss', random_state=42, n_jobs=1,
            ),
            impute=False, scale=False,
        )
    return models


def _platt_calibrate(val_probs: np.ndarray, val_y: np.ndarray, test_probs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Post-hoc logistic recalibration fitted strictly on validation predictions."""
    eps = 1e-6
    val_logit = np.log(np.clip(val_probs, eps, 1 - eps) / (1 - np.clip(val_probs, eps, 1 - eps))).reshape(-1, 1)
    test_logit = np.log(np.clip(test_probs, eps, 1 - eps) / (1 - np.clip(test_probs, eps, 1 - eps))).reshape(-1, 1)
    if len(np.unique(val_y)) < 2:
        return val_probs, test_probs
    cal = LogisticRegression(C=1e4, solver='lbfgs', max_iter=1000)
    cal.fit(val_logit, val_y)
    return cal.predict_proba(val_logit)[:, 1], cal.predict_proba(test_logit)[:, 1]


# ---------------------------------------------------------------------------
# 3. Mode A: Mock EMR Benchmark (ML models + 4 clinical scores + subgroups)
# ---------------------------------------------------------------------------

def run_mock_benchmark(target: str = 'sepsis', bootstrap_samples: int = 200) -> dict[str, Any]:
    tables = load_tables()
    outcomes = tables['ReferenceOutcomes']
    label_col = TARGETS[target][1]
    frame = training_frame(tables, target)

    dev = frame.loc[frame.split_hint == 'development'].copy()
    hold = frame.loc[frame.split_hint == 'temporal_holdout'].copy()
    enc = dev.groupby('encounter_id')[label_col].max()
    train_ids, val_ids = train_test_split(enc.index, test_size=0.25, stratify=enc.to_numpy(), random_state=42)
    train_df = dev.loc[dev.encounter_id.isin(train_ids)].reset_index(drop=True)
    val_df = dev.loc[dev.encounter_id.isin(val_ids)].reset_index(drop=True)
    hold_df = hold.reset_index(drop=True)

    models = make_candidate_models(EXPANDED_NUMERIC_FEATURES, CATEGORICAL_FEATURES, use_clinical_expander=True)
    results: list[dict[str, Any]] = []

    for name, pipe in models.items():
        pipe.fit(train_df[FEATURES], train_df[label_col].to_numpy(dtype=int))
        val_raw = pipe.predict_proba(val_df[FEATURES])[:, 1]
        hold_raw = pipe.predict_proba(hold_df[FEATURES])[:, 1]
        val_cal, hold_cal = _platt_calibrate(val_raw, val_df[label_col].to_numpy(dtype=int), hold_raw)

        for variant, vp, hp in [(name, val_raw, hold_raw), (f'{name}_PlattCal', val_cal, hold_cal)]:
            try:
                thr, _ = select_patient_threshold(val_df, label_col, vp, outcomes, target, minimum_recall=0.8)
            except ValueError:
                thr = float(np.quantile(vp, 0.9))
            hold_m = evaluate_predictions(hold_df, hold_df[label_col].to_numpy(), hp, thr, outcomes, target, bootstrap_samples=bootstrap_samples)
            subgroups = _evaluate_subgroups(hold_df, hold_df[label_col].to_numpy(), hp, thr)
            results.append({
                'model': variant,
                'kind': 'ML',
                'threshold': round(thr, 4),
                'auroc': _r(hold_m['auroc']),
                'auprc': _r(hold_m['auprc']),
                'brier': _r(hold_m['brier']),
                'calibration_slope': _r(hold_m['calibration_slope']),
                'encounter_early_recall': _r(hold_m['encounter_early_recall']),
                'episode_ppv': _r(hold_m['episode_ppv']),
                'nne_encounters': _r(hold_m['nne_encounters']),
                'median_lead_hours': _r(hold_m['median_lead_hours']),
                'subgroups': subgroups,
            })

    # Clinical baseline comparators at canonical bedside cutoffs
    base_hold = compute_clinical_baselines(hold_df)
    canonical_cutoffs = {'qSOFA': (2.0, 3.0), 'SIRS': (2.0, 4.0), 'MEWS': (5.0, 14.0), 'NEWS2': (5.0, 18.0)}
    for name, (cutoff, scale_max) in canonical_cutoffs.items():
        score_norm = np.clip(base_hold[name].to_numpy(dtype=float) / scale_max, 0.0, 1.0)
        thr_norm = cutoff / scale_max
        hold_m = evaluate_predictions(hold_df, hold_df[label_col].to_numpy(), score_norm, thr_norm, outcomes, target, bootstrap_samples=bootstrap_samples)
        results.append({
            'model': f'{name} (cutoff>={int(cutoff)})',
            'kind': 'ClinicalScore',
            'threshold': round(thr_norm, 4),
            'auroc': _r(hold_m['auroc']),
            'auprc': _r(hold_m['auprc']),
            'brier': None,
            'calibration_slope': None,
            'encounter_early_recall': _r(hold_m['encounter_early_recall']),
            'episode_ppv': _r(hold_m['episode_ppv']),
            'nne_encounters': _r(hold_m['nne_encounters']),
            'median_lead_hours': _r(hold_m['median_lead_hours']),
            'subgroups': _evaluate_subgroups(hold_df, hold_df[label_col].to_numpy(), score_norm, thr_norm),
        })

    return {
        'source': 'synthetic_mock_emr',
        'target': target,
        'train_encounters': int(train_df.encounter_id.nunique()),
        'val_encounters': int(val_df.encounter_id.nunique()),
        'holdout_encounters': int(hold_df.encounter_id.nunique()),
        'holdout_positive_encounters': int(hold_df.groupby('encounter_id')[label_col].max().sum()),
        'results': results,
    }


def _evaluate_subgroups(df: pd.DataFrame, y: np.ndarray, probs: np.ndarray, threshold: float) -> dict[str, dict[str, Any]]:
    slices = {
        'ED': df['location_code'].eq('ED').to_numpy(),
        'WARD': df['location_code'].eq('WARD').to_numpy(),
        'ICU': df['location_code'].eq('ICU').to_numpy(),
        'age_ge_65': pd.to_numeric(df['age_years'], errors='coerce').ge(65).to_numpy(),
        'age_lt_65': pd.to_numeric(df['age_years'], errors='coerce').lt(65).to_numpy(),
    }
    out: dict[str, dict[str, Any]] = {}
    for label, mask in slices.items():
        n = int(mask.sum())
        pos = int(y[mask].sum()) if n else 0
        auroc = float(roc_auc_score(y[mask], probs[mask])) if 0 < pos < n else None
        auprc = float(average_precision_score(y[mask], probs[mask])) if 0 < pos < n else None
        alert_rate = float(np.mean(probs[mask] >= threshold)) if n else None
        out[label] = {'snapshots': n, 'positives': pos, 'auroc': _r(auroc), 'auprc': _r(auprc), 'alert_rate': _r(alert_rate)}
    return out


# ---------------------------------------------------------------------------
# 4. Mode B: MIMIC-IV (+ED) Demo ETL & Subject-Grouped Benchmark
# ---------------------------------------------------------------------------

ANTIBIOTIC_KEYWORDS = (
    'vancomycin', 'piperacillin', 'cefepime', 'ceftriaxone', 'meropenem',
    'metronidazole', 'levofloxacin', 'ciprofloxacin', 'azithromycin',
    'ampicillin', 'cefazolin', 'clindamycin', 'doxycycline', 'gentamicin',
    'linezolid', 'imipenem', 'ertapenem', 'ceftazidime', 'amoxicillin',
    'oxacillin', 'nafcillin', 'trimethoprim', 'sulfamethoxazole',
)

LAB_ITEM_MAP = {
    '51301': 'WBC',
    '51265': 'platelets',
    '50912': 'creatinine',
    '50885': 'bilirubin_total',
    '50889': 'CRP',
    '50813': 'lactate',
}

ICU_ITEM_MAP = {
    '220045': ('heart_rate_bpm', 1.0),
    '220210': ('respiratory_rate_per_min', 1.0),
    '220179': ('sbp_mmhg', 1.0),
    '220050': ('sbp_mmhg', 1.0),
    '220181': ('map_mmhg', 1.0),
    '220052': ('map_mmhg', 1.0),
    '220277': ('spo2_pct', 1.0),
    '223762': ('temperature_c', 1.0),
    '223761': ('temperature_f', 1.0),
    '220739': ('gcs_eye', 1.0),
    '223900': ('gcs_verbal', 1.0),
    '223901': ('gcs_motor', 1.0),
}


def _read_zip_gz_csv(zpath: Path, suffix: str) -> list[dict[str, str]]:
    with zipfile.ZipFile(zpath) as zf:
        matches = [n for n in zf.namelist() if n.endswith(suffix)]
        if not matches:
            return []
        with zf.open(matches[0]) as raw, gzip.GzipFile(fileobj=raw) as gz:
            return list(csv.DictReader(io.TextIOWrapper(gz, encoding='utf-8', errors='replace')))


def _parse_ts(val: str | None) -> pd.Timestamp | None:
    if not val:
        return None
    ts = pd.to_datetime(val, errors='coerce')
    return None if pd.isna(ts) else ts


def _to_float(val: str | None) -> float | None:
    if val is None or val == '':
        return None
    try:
        x = float(val)
        return x if np.isfinite(x) else None
    except ValueError:
        return None


def _partial_sofa(platelets, bilirubin, creatinine, map_val, gcs) -> int:
    score = 0
    if platelets is not None:
        if platelets < 20:
            score += 4
        elif platelets < 50:
            score += 3
        elif platelets < 100:
            score += 2
        elif platelets < 150:
            score += 1
    if bilirubin is not None:
        if bilirubin >= 12.0:
            score += 4
        elif bilirubin >= 6.0:
            score += 3
        elif bilirubin >= 2.0:
            score += 2
        elif bilirubin >= 1.2:
            score += 1
    if creatinine is not None:
        if creatinine >= 5.0:
            score += 4
        elif creatinine >= 3.5:
            score += 3
        elif creatinine >= 2.0:
            score += 2
        elif creatinine >= 1.2:
            score += 1
    if map_val is not None and map_val < 70:
        score += 1
    if gcs is not None:
        if gcs < 6:
            score += 4
        elif gcs <= 9:
            score += 3
        elif gcs <= 12:
            score += 2
        elif gcs <= 14:
            score += 1
    return score


def _careunit_to_dept(unit: str) -> str:
    u = (unit or '').upper()
    if 'EMERGENCY' in u or u == 'ED':
        return 'ED'
    if 'ICU' in u or 'CCU' in u or 'INTENSIVE' in u:
        return 'ICU'
    return 'WARD'


def _slope_recent(pairs: list[tuple[float, float]]) -> float:
    if len(pairs) < 2:
        return np.nan
    xs = np.array([p[0] for p in pairs], dtype=float)
    ys = np.array([p[1] for p in pairs], dtype=float)
    if np.ptp(xs) < 1e-6:
        return 0.0
    return float(np.polyfit(xs, ys, 1)[0])


def build_mimic_demo_hourly(mimic_zip: Path, ed_zip: Path | None = None, max_hours: int = 72) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Build anti-leakage hourly snapshots & Sepsis-3 onset labels from MIMIC-IV (+ED) zips."""
    patients = {r['subject_id']: r for r in _read_zip_gz_csv(mimic_zip, 'hosp/patients.csv.gz')}
    admissions = _read_zip_gz_csv(mimic_zip, 'hosp/admissions.csv.gz')
    transfers = _read_zip_gz_csv(mimic_zip, 'hosp/transfers.csv.gz')
    labs = _read_zip_gz_csv(mimic_zip, 'hosp/labevents.csv.gz')
    micro = _read_zip_gz_csv(mimic_zip, 'hosp/microbiologyevents.csv.gz')
    presc = _read_zip_gz_csv(mimic_zip, 'hosp/prescriptions.csv.gz')
    charts = _read_zip_gz_csv(mimic_zip, 'icu/chartevents.csv.gz')

    ed_stays_by_hadm: dict[str, list[dict[str, str]]] = defaultdict(list)
    ed_triage_by_stay: dict[str, dict[str, str]] = {}
    ed_vitals_by_stay: dict[str, list[dict[str, str]]] = defaultdict(list)
    if ed_zip and ed_zip.exists():
        for r in _read_zip_gz_csv(ed_zip, 'ed/edstays.csv.gz'):
            if r.get('hadm_id'):
                ed_stays_by_hadm[r['hadm_id']].append(r)
        for r in _read_zip_gz_csv(ed_zip, 'ed/triage.csv.gz'):
            ed_triage_by_stay[r['stay_id']] = r
        for r in _read_zip_gz_csv(ed_zip, 'ed/vitalsign.csv.gz'):
            ed_vitals_by_stay[r['stay_id']].append(r)

    transfers_by_hadm: dict[str, list[tuple[pd.Timestamp, pd.Timestamp | None, str]]] = defaultdict(list)
    for r in transfers:
        hadm = r.get('hadm_id')
        it = _parse_ts(r.get('intime'))
        if hadm and it is not None and r.get('careunit'):
            transfers_by_hadm[hadm].append((it, _parse_ts(r.get('outtime')), _careunit_to_dept(r['careunit'])))
    for v in transfers_by_hadm.values():
        v.sort(key=lambda x: x[0])

    # Index labs strictly keeping charttime AND storetime (anti-leakage availability)
    labs_by_hadm: dict[str, list[tuple[pd.Timestamp, pd.Timestamp, str, float]]] = defaultdict(list)
    for r in labs:
        code = LAB_ITEM_MAP.get(r.get('itemid', ''))
        hadm = r.get('hadm_id')
        val = _to_float(r.get('valuenum'))
        if not code or not hadm or val is None:
            continue
        ct = _parse_ts(r.get('charttime'))
        st = _parse_ts(r.get('storetime')) or ct
        if ct is None or st is None:
            continue
        avail = max(ct, st)
        labs_by_hadm[hadm].append((ct, avail, code, val))
    for v in labs_by_hadm.values():
        v.sort(key=lambda x: (x[0], x[1]))

    # Index ICU chartevents vitals + GCS
    icu_obs_by_hadm: dict[str, dict[pd.Timestamp, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    for r in charts:
        spec = ICU_ITEM_MAP.get(r.get('itemid', ''))
        hadm = r.get('hadm_id')
        val = _to_float(r.get('valuenum'))
        if not spec or not hadm or val is None:
            continue
        ct = _parse_ts(r.get('charttime'))
        st = _parse_ts(r.get('storetime')) or ct
        if ct is None or st is None:
            continue
        field, _ = spec
        if field == 'temperature_f':
            field, val = 'temperature_c', (val - 32.0) * 5.0 / 9.0
        bucket = icu_obs_by_hadm[hadm][max(ct, st)]
        bucket[field] = val

    # Index microbiology & systemic antibiotics for Sepsis-3 suspected infection
    micro_by_hadm: dict[str, list[pd.Timestamp]] = defaultdict(list)
    for r in micro:
        hadm = r.get('hadm_id')
        ts = _parse_ts(r.get('charttime')) or _parse_ts(r.get('chartdate'))
        if hadm and ts is not None:
            micro_by_hadm[hadm].append(ts)
    abx_by_hadm: dict[str, list[pd.Timestamp]] = defaultdict(list)
    for r in presc:
        hadm = r.get('hadm_id')
        drug = (r.get('drug') or '').lower()
        ts = _parse_ts(r.get('starttime'))
        if hadm and ts is not None and any(k in drug for k in ANTIBIOTIC_KEYWORDS):
            abx_by_hadm[hadm].append(ts)

    rows: list[dict[str, Any]] = []
    sepsis_hadms = 0
    prevalent_excluded = 0

    for adm in admissions:
        hadm = adm['hadm_id']
        subj = adm['subject_id']
        pat = patients.get(subj)
        if not pat:
            continue
        age = _to_float(pat.get('anchor_age'))
        if age is None or age < 18:
            continue
        admit_t = _parse_ts(adm.get('admittime'))
        disch_t = _parse_ts(adm.get('dischtime'))
        if admit_t is None or disch_t is None or disch_t <= admit_t:
            continue

        ed_stays = sorted(ed_stays_by_hadm.get(hadm, []), key=lambda x: x.get('intime') or '')
        ed_in = _parse_ts(ed_stays[0].get('intime')) if ed_stays else _parse_ts(adm.get('edregtime'))
        t0 = ed_in if (ed_in is not None and ed_in <= admit_t) else admit_t

        # Combine ED triage + ED vitals + ICU chartevents into timestamped vital dicts
        vital_events: list[tuple[pd.Timestamp, dict[str, float]]] = []
        for stay in ed_stays:
            sid = stay['stay_id']
            tr = ed_triage_by_stay.get(sid)
            st_in = _parse_ts(stay.get('intime'))
            if tr and st_in is not None:
                rec: dict[str, float] = {}
                if (x := _to_float(tr.get('heartrate'))) is not None:
                    rec['heart_rate_bpm'] = x
                if (x := _to_float(tr.get('resprate'))) is not None:
                    rec['respiratory_rate_per_min'] = x
                if (x := _to_float(tr.get('sbp'))) is not None:
                    rec['sbp_mmhg'] = x
                if (x := _to_float(tr.get('dbp'))) is not None and 'sbp_mmhg' in rec:
                    rec['map_mmhg'] = (rec['sbp_mmhg'] + 2.0 * x) / 3.0
                if (x := _to_float(tr.get('o2sat'))) is not None:
                    rec['spo2_pct'] = x
                if (x := _to_float(tr.get('temperature'))) is not None:
                    rec['temperature_c'] = (x - 32.0) * 5.0 / 9.0 if x > 50 else x
                if rec:
                    vital_events.append((st_in, rec))
            for vs in ed_vitals_by_stay.get(sid, []):
                vt = _parse_ts(vs.get('charttime'))
                if vt is None:
                    continue
                rec = {}
                if (x := _to_float(vs.get('heartrate'))) is not None:
                    rec['heart_rate_bpm'] = x
                if (x := _to_float(vs.get('resprate'))) is not None:
                    rec['respiratory_rate_per_min'] = x
                if (x := _to_float(vs.get('sbp'))) is not None:
                    rec['sbp_mmhg'] = x
                if (x := _to_float(vs.get('dbp'))) is not None and 'sbp_mmhg' in rec:
                    rec['map_mmhg'] = (rec['sbp_mmhg'] + 2.0 * x) / 3.0
                if (x := _to_float(vs.get('o2sat'))) is not None:
                    rec['spo2_pct'] = x
                if (x := _to_float(vs.get('temperature'))) is not None:
                    rec['temperature_c'] = (x - 32.0) * 5.0 / 9.0 if x > 50 else x
                if rec:
                    vital_events.append((vt, rec))
        for ts, rec in icu_obs_by_hadm.get(hadm, {}).items():
            combined = dict(rec)
            if {'gcs_eye', 'gcs_verbal', 'gcs_motor'} <= combined.keys():
                combined['gcs'] = combined['gcs_eye'] + combined['gcs_verbal'] + combined['gcs_motor']
            vital_events.append((ts, combined))
        vital_events.sort(key=lambda x: x[0])

        hadm_labs = labs_by_hadm.get(hadm, [])
        hadm_transfers = transfers_by_hadm.get(hadm, [])

        # Determine Sepsis-3 suspected infection timestamp (earliest valid micro+abx pair)
        suspicion_times: list[pd.Timestamp] = []
        for mt in micro_by_hadm.get(hadm, []):
            for at in abx_by_hadm.get(hadm, []):
                diff_h = (at - mt).total_seconds() / 3600.0
                if -24.0 <= diff_h <= 72.0:
                    suspicion_times.append(min(mt, at))
        t_suspicion = min(suspicion_times) if suspicion_times else None

        total_hours = min(max_hours, int((disch_t - t0).total_seconds() // 3600))
        if total_hours < 2:
            continue

        # Pass 1: build hourly state and compute partial SOFA trajectory for onset labeling
        hourly_states: list[dict[str, Any]] = []
        t_sofa: pd.Timestamp | None = None
        for h in range(1, total_hours + 1):
            t_pred = t0 + pd.Timedelta(hours=h)
            vis_v = [(ts, r) for ts, r in vital_events if t0 <= ts <= t_pred]
            vis_l = [r for r in hadm_labs if t0 <= r[0] <= r[1] <= t_pred]
            if not vis_v:
                continue

            def last_v(k: str) -> float | None:
                for _, r in reversed(vis_v):
                    if k in r:
                        return r[k]
                return None

            def first_v(k: str) -> float | None:
                for _, r in vis_v:
                    if k in r:
                        return r[k]
                return None

            last_lab_map: dict[str, tuple[pd.Timestamp, float]] = {}
            for _, avail, code, val in vis_l:
                last_lab_map[code] = (avail, val)

            hr_last = last_v('heart_rate_bpm')
            sbp_last = last_v('sbp_mmhg')
            hr_first = first_v('heart_rate_bpm')
            sbp_first = first_v('sbp_mmhg')
            hr_recent = [((ts - t0).total_seconds() / 3600.0, r['heart_rate_bpm'])
                         for ts, r in vis_v if 'heart_rate_bpm' in r and (t_pred - ts).total_seconds() <= 6 * 3600]
            sbp_recent = [((ts - t0).total_seconds() / 3600.0, r['sbp_mmhg'])
                          for ts, r in vis_v if 'sbp_mmhg' in r and (t_pred - ts).total_seconds() <= 6 * 3600]

            dept = 'ED' if ed_stays else 'WARD'
            for it, ot, d in hadm_transfers:
                if it <= t_pred and (ot is None or t_pred < ot):
                    dept = d

            plt_v = last_lab_map['platelets'][1] if 'platelets' in last_lab_map else None
            bili_v = last_lab_map['bilirubin_total'][1] if 'bilirubin_total' in last_lab_map else None
            creat_v = last_lab_map['creatinine'][1] if 'creatinine' in last_lab_map else None
            map_v = last_v('map_mmhg')
            gcs_v = last_v('gcs')
            sofa_h = _partial_sofa(plt_v, bili_v, creat_v, map_v, gcs_v)
            if t_suspicion is not None and sofa_h >= 2 and t_sofa is None:
                diff_s = (t_pred - t_suspicion).total_seconds() / 3600.0
                if -48.0 <= diff_s <= 24.0:
                    t_sofa = t_pred

            hourly_states.append({
                'subject_id': subj,
                'encounter_id': hadm,
                'hour': h,
                'prediction_at': t_pred,
                'location_code': dept,
                'age_years': age,
                'sex': pat.get('gender', 'F'),
                'heart_rate_last_bpm': hr_last if hr_last is not None else np.nan,
                'respiratory_rate_last_per_min': last_v('respiratory_rate_per_min') if last_v('respiratory_rate_per_min') is not None else np.nan,
                'sbp_last_mmhg': sbp_last if sbp_last is not None else np.nan,
                'map_last_mmhg': map_v if map_v is not None else np.nan,
                'spo2_last_pct': last_v('spo2_pct') if last_v('spo2_pct') is not None else np.nan,
                'temperature_last_c': last_v('temperature_c') if last_v('temperature_c') is not None else np.nan,
                'gcs_last': gcs_v if gcs_v is not None else np.nan,
                'heart_rate_delta_since_t0_bpm': (hr_last - hr_first) if (hr_last is not None and hr_first is not None) else np.nan,
                'sbp_delta_since_t0_mmhg': (sbp_last - sbp_first) if (sbp_last is not None and sbp_first is not None) else np.nan,
                'hr_slope_6h': _slope_recent(hr_recent),
                'sbp_slope_6h': _slope_recent(sbp_recent),
                'shock_index': (hr_last / sbp_last) if (hr_last is not None and sbp_last is not None and sbp_last > 0) else np.nan,
                'vital_observation_count_since_t0': len(vis_v),
                'WBC_last_10e9_L': last_lab_map['WBC'][1] if 'WBC' in last_lab_map else np.nan,
                'platelets_last_10e9_L': plt_v if plt_v is not None else np.nan,
                'creatinine_last_mg_dL': creat_v if creat_v is not None else np.nan,
                'bilirubin_last_mg_dL': bili_v if bili_v is not None else np.nan,
                'CRP_last_mg_L': last_lab_map['CRP'][1] if 'CRP' in last_lab_map else np.nan,
                'lactate_last_mmol_L': last_lab_map['lactate'][1] if 'lactate' in last_lab_map else np.nan,
                'lactate_measured_since_t0': int('lactate' in last_lab_map),
                'creatinine_measured_since_t0': int('creatinine' in last_lab_map),
            })

        t_onset = min(t_suspicion, t_sofa) if (t_suspicion is not None and t_sofa is not None) else None
        if t_onset is not None and t_onset <= t0 + pd.Timedelta(hours=1):
            prevalent_excluded += 1
            continue
        if t_onset is not None:
            sepsis_hadms += 1

        for st in hourly_states:
            t_pred = st['prediction_at']
            if t_onset is not None and t_pred >= t_onset:
                continue  # Exclude post-onset snapshots
            lead_h = (t_onset - t_pred).total_seconds() / 3600.0 if t_onset is not None else np.nan
            st['sepsis_onset_at'] = t_onset
            st['sepsis_next_6h'] = int(t_onset is not None and 0 < lead_h <= 6.0)
            rows.append(st)

    df = pd.DataFrame(rows)
    summary = {
        'subjects': int(df['subject_id'].nunique()) if len(df) else 0,
        'encounters': int(df['encounter_id'].nunique()) if len(df) else 0,
        'snapshots': int(len(df)),
        'positive_encounters_sepsis3': int(sepsis_hadms),
        'prevalent_sepsis_excluded': int(prevalent_excluded),
        'positive_snapshots_next_6h': int(df['sepsis_next_6h'].sum()) if len(df) else 0,
    }
    return df, summary


def run_mimic_demo_benchmark(mimic_zip: Path, ed_zip: Path | None = None) -> dict[str, Any]:
    df, summary = build_mimic_demo_hourly(mimic_zip, ed_zip)
    if df.empty or df['sepsis_next_6h'].sum() == 0:
        return {'source': 'mimic_iv_demo', 'cohort': summary, 'results': [], 'warning': 'No positive pre-onset Sepsis-3 snapshots.'}

    num_cols = [
        'age_years', 'heart_rate_last_bpm', 'respiratory_rate_last_per_min', 'sbp_last_mmhg',
        'map_last_mmhg', 'spo2_last_pct', 'temperature_last_c', 'gcs_last',
        'heart_rate_delta_since_t0_bpm', 'sbp_delta_since_t0_mmhg', 'hr_slope_6h', 'sbp_slope_6h',
        'shock_index', 'vital_observation_count_since_t0', 'WBC_last_10e9_L',
        'platelets_last_10e9_L', 'creatinine_last_mg_dL', 'bilirubin_last_mg_dL',
        'CRP_last_mg_L', 'lactate_last_mmol_L', 'lactate_measured_since_t0', 'creatinine_measured_since_t0',
    ]
    cat_cols = ['sex', 'location_code']
    feature_cols = num_cols + cat_cols

    y = df['sepsis_next_6h'].to_numpy(dtype=int)
    groups = df['subject_id'].to_numpy()
    pos_subjects = int(df.groupby('subject_id')['sepsis_next_6h'].max().sum())
    n_splits = min(5, max(2, pos_subjects))
    cv = StratifiedGroupKFold(n_splits=n_splits)

    models = make_candidate_models(num_cols, cat_cols, use_clinical_expander=False)
    results: list[dict[str, Any]] = []

    for name, pipe in models.items():
        oof = np.zeros(len(df), dtype=float)
        for tr, va in cv.split(df[feature_cols], y, groups):
            assert set(groups[tr]).isdisjoint(set(groups[va]))
            pipe.fit(df.iloc[tr][feature_cols], y[tr])
            oof[va] = pipe.predict_proba(df.iloc[va][feature_cols])[:, 1]
        _, slope = calibration_parameters(y, oof, np.ones_like(y, dtype=float))
        results.append({
            'model': name,
            'kind': 'ML (Subject-Grouped CV)',
            'auroc': _r(float(roc_auc_score(y, oof))),
            'auprc': _r(float(average_precision_score(y, oof))),
            'brier': _r(float(brier_score_loss(y, oof))),
            'calibration_slope': _r(slope),
        })

    base = compute_clinical_baselines(df)
    for name, scale_max in [('qSOFA', 3.0), ('SIRS', 4.0), ('MEWS', 14.0), ('NEWS2', 18.0)]:
        s = np.clip(base[name].to_numpy(dtype=float) / scale_max, 0.0, 1.0)
        results.append({
            'model': name,
            'kind': 'ClinicalScore',
            'auroc': _r(float(roc_auc_score(y, s))),
            'auprc': _r(float(average_precision_score(y, s))),
            'brier': None,
            'calibration_slope': None,
        })

    return {
        'source': 'mimic_iv_demo',
        'cv_folds': n_splits,
        'cohort': summary,
        'results': results,
        'warning': 'MIMIC-IV Demo contains only 100 patients; metrics verify ETL/labeling pipeline parity before running on MIMIC-IV Full.',
    }


def _r(value: float | None, digits: int = 4) -> float | None:
    return None if value is None or not np.isfinite(value) else round(float(value), digits)


def _print_table(report: dict[str, Any]) -> None:
    print(f"\n=== Benchmark Report ({report['source']}) ===")
    if 'cohort' in report:
        print('Cohort:', json.dumps(report['cohort'], ensure_ascii=False))
    else:
        print(f"Split: train={report['train_encounters']}, val={report['val_encounters']}, "
              f"holdout={report['holdout_encounters']} (pos={report['holdout_positive_encounters']})")
    cols = ['model', 'auroc', 'auprc', 'brier', 'calibration_slope', 'encounter_early_recall', 'episode_ppv', 'nne_encounters', 'median_lead_hours']
    rows = report.get('results', [])
    if not rows:
        print('No results.')
        return
    present = [c for c in cols if any(c in r for r in rows)]
    header = ' | '.join(f'{c:>14}' if c != 'model' else f'{c:<26}' for c in present)
    print(header)
    print('-' * len(header))
    for r in rows:
        parts = []
        for c in present:
            v = r.get(c)
            s = '—' if v is None else str(v)
            parts.append(f'{s:<26}' if c == 'model' else f'{s:>14}')
        print(' | '.join(parts))
    if report.get('warning'):
        print(f"\n[NOTE] {report['warning']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Benchmark Sepsis models vs clinical baselines.')
    parser.add_argument('--source', choices=['mock', 'mimic-demo'], default='mock')
    parser.add_argument('--target', choices=['sepsis', 'shock'], default='sepsis')
    parser.add_argument('--mimic-zip', type=Path, default=Path(r'D:\Vinmec\mimic-iv-clinical-database-demo-2.2 (1).zip'))
    parser.add_argument('--ed-zip', type=Path, default=Path(r'D:\Vinmec\mimic-iv-ed-demo-2.2.zip'))
    parser.add_argument('--bootstrap', type=int, default=100)
    parser.add_argument('--output-json', type=Path, default=None)
    args = parser.parse_args(argv)

    if args.source == 'mock':
        report = run_mock_benchmark(target=args.target, bootstrap_samples=args.bootstrap)
    else:
        if not args.mimic_zip.exists():
            raise FileNotFoundError(f'Missing MIMIC-IV zip: {args.mimic_zip}')
        report = run_mimic_demo_benchmark(args.mimic_zip, args.ed_zip if args.ed_zip.exists() else None)

    _print_table(report)
    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f'Saved JSON report to {args.output_json}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
