"""Synthetic ED-to-hospital EMR contract and logistic-regression demo inference.

Reference outcomes are deliberately separate from the predictor feature table.
This module is for a research demonstration, never for clinical decisions.
"""
from __future__ import annotations

import json
import hashlib
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'data' / 'mock_ed_hospital_emr_v3_hourly.xlsx'
ARTIFACT_DIR = ROOT / 'artifacts' / 'mock_emr_hourly_lr'
TARGETS = {
    'sepsis': ('eligible_sepsis', 'sepsis_next_6h'),
    'shock': ('eligible_shock', 'shock_next_6h'),
}


def bundle_paths(target: str) -> tuple[Path, Path]:
    if target not in TARGETS:
        raise ValueError(f'Kết cục không hợp lệ: {target}')
    return ARTIFACT_DIR / f'{target}_model.joblib', ARTIFACT_DIR / f'{target}_metadata.json'

NUMERIC_FEATURES = [
    'age_years', 'bmi_kg_m2', 'diabetes', 'cardiovascular_disease',
    'chronic_kidney_disease', 'chronic_liver_disease', 'chronic_lung_disease',
    'cancer', 'immunosuppression', 'heart_rate_last_bpm',
    'respiratory_rate_last_per_min', 'sbp_last_mmhg', 'map_last_mmhg',
    'spo2_last_pct', 'temperature_last_c', 'gcs_last',
    'heart_rate_delta_6h_bpm', 'sbp_delta_6h_mmhg',
    'heart_rate_mean_6h_bpm', 'vital_observation_count_6h',
    'WBC_last_10e9_L', 'platelets_last_10e9_L', 'creatinine_last_mg_dL',
    'bilirubin_last_mg_dL', 'CRP_last_mg_L', 'procalcitonin_last_ng_mL',
    'creatinine_measured_24h', 'CRP_measured_24h',
    'hours_since_creatinine_result', 'symptom_respiratory',
    'symptom_urinary', 'symptom_abdominal', 'symptom_skin', 'symptom_cns',
]
CATEGORICAL_FEATURES = ['sex', 'location_code']
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

SKEWED_LAB_FEATURES = (
    'WBC_last_10e9_L',
    'platelets_last_10e9_L',
    'creatinine_last_mg_dL',
    'bilirubin_last_mg_dL',
    'CRP_last_mg_L',
    'procalcitonin_last_ng_mL',
    'hours_since_creatinine_result',
)

NONLINEAR_CLINICAL_FEATURES = [
    'temp_hypothermia_deg',
    'temp_fever_deg',
    'wbc_leukopenia_gap',
    'wbc_leukocytosis_excess',
    'sbp_hypotension_gap',
    'map_hypoperfusion_gap',
    'rr_tachypnea_excess',
]

MISSINGNESS_FLAG_FEATURES = [
    'procalcitonin_measured_24h',
    'bilirubin_measured_24h',
    'WBC_measured_24h',
    'platelets_measured_24h',
    'spo2_measured_6h',
    'temperature_measured_6h',
    'gcs_measured_6h',
]

EXPANDED_NUMERIC_FEATURES = (
    NUMERIC_FEATURES + NONLINEAR_CLINICAL_FEATURES + MISSINGNESS_FLAG_FEATURES
)

FEATURE_LABELS_VI = {
    'age_years': 'Tuổi (năm)',
    'bmi_kg_m2': 'Chỉ số BMI (kg/m²)',
    'diabetes': 'Bệnh nền: Đái tháo đường',
    'cardiovascular_disease': 'Bệnh nền: Tim mạch',
    'chronic_kidney_disease': 'Bệnh nền: Thận mạn',
    'chronic_liver_disease': 'Bệnh nền: Gan mạn',
    'chronic_lung_disease': 'Bệnh nền: Phổi mạn',
    'cancer': 'Bệnh nền: Ung thư',
    'immunosuppression': 'Bệnh nền: Ức chế miễn dịch',
    'heart_rate_last_bpm': 'Mạch gần nhất (lần/phút)',
    'respiratory_rate_last_per_min': 'Nhịp thở gần nhất (lần/phút)',
    'sbp_last_mmhg': 'HA tâm thu gần nhất (mmHg)',
    'map_last_mmhg': 'HA trung bình MAP gần nhất (mmHg)',
    'spo2_last_pct': 'SpO₂ gần nhất (%)',
    'temperature_last_c': 'Nhiệt độ gần nhất (°C)',
    'gcs_last': 'Thang điểm hôn mê GCS gần nhất',
    'heart_rate_delta_6h_bpm': 'Thay đổi mạch trong 6 giờ (lần/phút)',
    'sbp_delta_6h_mmhg': 'Thay đổi HA tâm thu trong 6 giờ (mmHg)',
    'heart_rate_mean_6h_bpm': 'Mạch trung bình trong 6 giờ (lần/phút)',
    'vital_observation_count_6h': 'Số lần đo sinh hiệu trong 6 giờ',
    'WBC_last_10e9_L': 'Bạch cầu WBC gần nhất (log1p · 10⁹/L)',
    'platelets_last_10e9_L': 'Tiểu cầu gần nhất (log1p · 10⁹/L)',
    'creatinine_last_mg_dL': 'Creatinine gần nhất (log1p · mg/dL)',
    'bilirubin_last_mg_dL': 'Bilirubin toàn phần gần nhất (log1p · mg/dL)',
    'CRP_last_mg_L': 'CRP gần nhất (log1p · mg/L)',
    'procalcitonin_last_ng_mL': 'Procalcitonin gần nhất (log1p · ng/mL)',
    'creatinine_measured_24h': 'Đã có KQ Creatinine trong 24 giờ',
    'CRP_measured_24h': 'Đã có KQ CRP trong 24 giờ',
    'hours_since_creatinine_result': 'Số giờ từ KQ Creatinine gần nhất (log1p)',
    'symptom_respiratory': 'Triệu chứng nghi nhiễm: Hô hấp',
    'symptom_urinary': 'Triệu chứng nghi nhiễm: Tiết niệu',
    'symptom_abdominal': 'Triệu chứng nghi nhiễm: Ổ bụng',
    'symptom_skin': 'Triệu chứng nghi nhiễm: Da / mô mềm',
    'symptom_cns': 'Triệu chứng nghi nhiễm: Thần kinh TW',
    'temp_hypothermia_deg': 'Độ lệch hạ thân nhiệt (< 36,0°C)',
    'temp_fever_deg': 'Độ lệch sốt cao (> 38,0°C)',
    'wbc_leukopenia_gap': 'Mức giảm bạch cầu (< 4,0 × 10⁹/L)',
    'wbc_leukocytosis_excess': 'Mức tăng bạch cầu (> 12,0 × 10⁹/L)',
    'sbp_hypotension_gap': 'Mức tụt HA tâm thu (< 100 mmHg · qSOFA)',
    'map_hypoperfusion_gap': 'Mức giảm tưới máu MAP (< 65 mmHg)',
    'rr_tachypnea_excess': 'Mức thở nhanh (> 22 lần/phút · qSOFA)',
    'procalcitonin_measured_24h': 'Đã chỉ định & có KQ Procalcitonin (24h)',
    'bilirubin_measured_24h': 'Đã chỉ định & có KQ Bilirubin (24h)',
    'WBC_measured_24h': 'Đã chỉ định & có KQ Bạch cầu WBC (24h)',
    'platelets_measured_24h': 'Đã chỉ định & có KQ Tiểu cầu (24h)',
    'spo2_measured_6h': 'Đã đo SpO₂ trong 6 giờ',
    'temperature_measured_6h': 'Đã đo Nhiệt độ trong 6 giờ',
    'gcs_measured_6h': 'Đã đánh giá GCS trong 6 giờ',
    'sex_F': 'Giới tính: Nữ',
    'sex_M': 'Giới tính: Nam',
    'location_code_ED': 'Khu vực: Khoa Cấp cứu (ED)',
    'location_code_WARD': 'Khu vực: Nội trú (WARD)',
    'location_code_ICU': 'Khu vực: Hồi sức tích cực (ICU)',
}


def format_feature_name_vi(raw_name: str) -> str:
    clean = raw_name.split('__', 1)[-1]
    return FEATURE_LABELS_VI.get(clean, clean)


class ClinicalFeatureExpander(BaseEstimator, TransformerMixin):
    """Expand 36 raw EMR snapshot fields with log1p labs, U-shaped hinges, and MNAR flags."""

    def fit(self, X: pd.DataFrame, y=None):
        self.feature_names_in_ = list(FEATURES)
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        df = X[FEATURES].copy()
        for col in NUMERIC_FEATURES:
            df[col] = pd.to_numeric(df[col], errors='coerce')

        temp = df['temperature_last_c']
        wbc = df['WBC_last_10e9_L']
        sbp = df['sbp_last_mmhg']
        map_v = df['map_last_mmhg']
        rr = df['respiratory_rate_last_per_min']

        # 1. Missingness indicators (MNAR clinical ordering & monitoring signals)
        df['procalcitonin_measured_24h'] = df['procalcitonin_last_ng_mL'].notna().astype(float)
        df['bilirubin_measured_24h'] = df['bilirubin_last_mg_dL'].notna().astype(float)
        df['WBC_measured_24h'] = wbc.notna().astype(float)
        df['platelets_measured_24h'] = df['platelets_last_10e9_L'].notna().astype(float)
        df['spo2_measured_6h'] = df['spo2_last_pct'].notna().astype(float)
        df['temperature_measured_6h'] = temp.notna().astype(float)
        df['gcs_measured_6h'] = df['gcs_last'].notna().astype(float)

        # 2. U-shaped & clinical threshold hinge terms (SIRS / qSOFA / Sepsis-3)
        df['temp_hypothermia_deg'] = np.where(temp.notna(), np.maximum(0.0, 36.0 - temp), np.nan)
        df['temp_fever_deg'] = np.where(temp.notna(), np.maximum(0.0, temp - 38.0), np.nan)
        df['wbc_leukopenia_gap'] = np.where(wbc.notna(), np.maximum(0.0, 4.0 - wbc), np.nan)
        df['wbc_leukocytosis_excess'] = np.where(wbc.notna(), np.maximum(0.0, wbc - 12.0), np.nan)
        df['sbp_hypotension_gap'] = np.where(sbp.notna(), np.maximum(0.0, 100.0 - sbp), np.nan)
        df['map_hypoperfusion_gap'] = np.where(map_v.notna(), np.maximum(0.0, 65.0 - map_v), np.nan)
        df['rr_tachypnea_excess'] = np.where(rr.notna(), np.maximum(0.0, rr - 22.0), np.nan)

        # 3. Log1p transform for right-skewed laboratory and elapsed-time features
        for col in SKEWED_LAB_FEATURES:
            val = df[col]
            df[col] = np.where(val.notna(), np.log1p(np.maximum(0.0, val)), np.nan)

        return df[EXPANDED_NUMERIC_FEATURES + CATEGORICAL_FEATURES]

    def get_feature_names_out(self, input_features=None):
        return np.asarray(EXPANDED_NUMERIC_FEATURES + CATEGORICAL_FEATURES, dtype=object)

SHEETS = [
    'Encounters', 'Locations', 'Symptoms', 'Vitals', 'Labs',
    'FeatureSnapshots', 'Labels', 'ReferenceOutcomes',
]


def load_tables(path: Path = DATA_PATH) -> dict[str, pd.DataFrame]:
    if not path.exists():
        raise FileNotFoundError(f'Chưa có bộ EMR mock: {path}. Chạy script huấn luyện theo README.')
    tables = pd.read_excel(path, sheet_name=SHEETS, engine='openpyxl')
    for table in tables.values():
        for column in table.columns:
            if column.endswith('_at') or column == 'assessed_at':
                table[column] = pd.to_datetime(table[column], errors='raise')
    missing = set(FEATURES) - set(tables['FeatureSnapshots'].columns)
    if missing:
        raise ValueError(f'Thiếu trường đặc trưng: {sorted(missing)}')
    if tables['FeatureSnapshots'].duplicated(['encounter_id', 'prediction_at']).any():
        raise ValueError('Trùng encounter_id + prediction_at trong FeatureSnapshots')
    return tables


def training_frame(tables: dict[str, pd.DataFrame], target: str = 'sepsis') -> pd.DataFrame:
    """Join labels for supervised learning; return only eligible pre-onset rows."""
    if target not in TARGETS:
        raise ValueError(f'Kết cục không hợp lệ: {target}')
    eligible_col, label_col = TARGETS[target]
    labels = tables['Labels'][['encounter_id', 'prediction_at', eligible_col, label_col]]
    frame = tables['FeatureSnapshots'].merge(
        labels, on=['encounter_id', 'prediction_at'], how='inner', validate='one_to_one'
    ).merge(
        tables['Encounters'][['encounter_id', 'split_hint']],
        on='encounter_id', how='inner', validate='many_to_one'
    )
    frame = frame.loc[(frame[eligible_col] == 1) & frame[label_col].notna()].copy()
    frame[label_col] = frame[label_col].astype(int)
    return frame


def load_bundle(target: str = 'sepsis') -> tuple[object, dict]:
    bundle_path, meta_path = bundle_paths(target)
    if not bundle_path.exists() or not meta_path.exists():
        raise FileNotFoundError(f'Chưa có mô hình {target}. Chạy scripts/train_mock_emr.py.')
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    if (meta.get('data_kind') != 'SYNTHETIC_MOCK_EMR'
            or meta.get('features') != FEATURES
            or meta.get('target') != TARGETS[target][1]):
        raise ValueError('Metadata mô hình không khớp hợp đồng EMR mock.')
    if not DATA_PATH.exists() or hashlib.sha256(DATA_PATH.read_bytes()).hexdigest() != meta.get('source_sha256'):
        raise ValueError('Workbook EMR mock đã thay đổi; cần huấn luyện lại trước khi dự báo.')
    return joblib.load(bundle_path), meta


def predict_scores(model: object, snapshots: pd.DataFrame) -> pd.DataFrame:
    result = snapshots[['encounter_id', 'prediction_at', 'location_code']].copy()
    result['risk_score'] = model.predict_proba(snapshots[FEATURES])[:, 1]
    return result


def explain_log_odds(model: object, snapshot: pd.DataFrame) -> tuple[float, pd.DataFrame]:
    """Return intercept and per-feature additive terms before the sigmoid."""
    transformed = model.named_steps['prep'].transform(snapshot[FEATURES])
    transformed = np.asarray(transformed).ravel()
    names = model.named_steps['prep'].get_feature_names_out()
    coefficients = model.named_steps['lr'].coef_[0]
    contributions = pd.DataFrame({
        'feature': names,
        'label_vi': [format_feature_name_vi(str(n)) for n in names],
        'transformed_value': transformed,
        'coefficient': coefficients,
        'log_odds_contribution': transformed * coefficients,
    })
    contributions['absolute'] = contributions.log_odds_contribution.abs()
    contributions = contributions.sort_values('absolute', ascending=False).drop(columns='absolute')
    return float(model.named_steps['lr'].intercept_[0]), contributions


def latest_available(tables: dict[str, pd.DataFrame], encounter_id: str, at: pd.Timestamp):
    """Show source records visible at the chosen scoring time; no future results."""
    vitals = tables['Vitals']
    vitals = vitals.loc[(vitals.encounter_id == encounter_id) & (vitals.available_at <= at)]
    labs = tables['Labs']
    labs = labs.loc[(labs.encounter_id == encounter_id) & (labs.available_at <= at)]
    symptoms = tables['Symptoms']
    symptoms = symptoms.loc[(symptoms.encounter_id == encounter_id) & (symptoms.available_at <= at)]
    return vitals.sort_values('available_at').tail(1), labs.sort_values('available_at'), symptoms.sort_values('available_at')
