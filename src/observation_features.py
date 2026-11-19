"""Expanding T0-to-now observation contract shared by training and manual inference."""
import numpy as np
import pandas as pd

OBSERVATION_WINDOW = {
    'type': 'expanding', 'start': 'triage_completed_at', 'end': 'prediction_at',
    'availability_rule': 'available_at <= prediction_at',
    'latest_order': 'measurement_or_collection_time_then_availability',
    'missing_value_policy': 'latest_nonmissing_available_since_t0',
}
FEATURE_SCHEMA_VERSION = 'expanding-t0-v1'
SYMPTOMS = ('respiratory', 'urinary', 'abdominal', 'skin', 'cns')
COMORBIDITIES = ('diabetes', 'cardiovascular_disease', 'chronic_kidney_disease',
                 'chronic_liver_disease', 'chronic_lung_disease', 'cancer', 'immunosuppression')


def build_snapshot(case, prediction_at, vital_records, lab_records, symptom_records, location_records):
    t, t0 = pd.Timestamp(prediction_at), pd.Timestamp(case['triage_completed_at'])
    if t < t0:
        raise ValueError('Mốc tổng hợp dữ liệu không được trước T0.')

    def visible(records, time_field, alternate=None):
        ordered = []
        for record in records:
            clinical = pd.Timestamp(record.get(time_field, record.get(alternate)))
            available = pd.Timestamp(record.get('available_at', clinical))
            if t0 <= clinical <= available <= t:
                ordered.append((clinical, available, record))
        return [record for _, _, record in sorted(ordered, key=lambda item: (item[0], item[1]))]

    vitals = visible(vital_records, 'measured_at', 'observed_at')
    labs = visible(lab_records, 'collected_at')
    symptoms = visible(symptom_records, 'recorded_at')
    symptoms = [{**r, **{key: r.get(key, r.get(f'{key}_symptom', np.nan))
                        for key in ('respiratory','urinary','abdominal','skin','cns')}} for r in symptoms]
    locations = visible(location_records, 'effective_at', 'started_at')
    locations = [r for r in locations if pd.isna(r.get('ended_at')) or t < pd.Timestamp(r['ended_at'])]
    last_v = vitals[-1] if vitals else None
    early_v = vitals[0] if vitals else None
    last_symptom = symptoms[-1] if symptoms else None
    last_location = locations[-1]['location_code'] if locations else 'ED'
    last_labs = {r['test_code']: r for r in labs}
    lab_value = lambda code: last_labs[code]['value_num'] if code in last_labs else np.nan
    creat = last_labs.get('creatinine')
    def vital_value(field):
        return next((r[field] for r in reversed(vitals) if pd.notna(r.get(field))), np.nan)

    row = {
        'encounter_id': case['encounter_id'], 'prediction_at': t, 'location_code': last_location,
        'age_years': case['age_years'], 'sex': case['sex'],
        'bmi_kg_m2': case['bmi_kg_m2'] if case['bmi_kg_m2'] is not None else np.nan,
        **{key: case[key] for key in COMORBIDITIES},
        'heart_rate_last_bpm': vital_value('heart_rate_bpm'),
        'respiratory_rate_last_per_min': vital_value('respiratory_rate_per_min'),
        'sbp_last_mmhg': vital_value('sbp_mmhg'),
        'map_last_mmhg': vital_value('map_mmhg'),
        'spo2_last_pct': vital_value('spo2_pct'),
        'temperature_last_c': vital_value('temperature_c'),
        'gcs_last': vital_value('gcs'),
        'heart_rate_delta_since_t0_bpm': last_v['heart_rate_bpm'] - early_v['heart_rate_bpm'] if last_v else np.nan,
        'sbp_delta_since_t0_mmhg': last_v['sbp_mmhg'] - early_v['sbp_mmhg'] if last_v else np.nan,
        'heart_rate_mean_since_t0_bpm': round(sum(v['heart_rate_bpm'] for v in vitals) / len(vitals), 1) if vitals else np.nan,
        'vital_observation_count_since_t0': len(vitals),
        'WBC_last_10e9_L': lab_value('WBC'),
        'platelets_last_10e9_L': lab_value('platelets'),
        'creatinine_last_mg_dL': lab_value('creatinine'),
        'bilirubin_last_mg_dL': lab_value('bilirubin_total'),
        'CRP_last_mg_L': lab_value('CRP'),
        'procalcitonin_last_ng_mL': lab_value('procalcitonin'),
        'creatinine_measured_since_t0': int(creat is not None),
        'CRP_measured_since_t0': int('CRP' in last_labs),
        'hours_since_creatinine_result': round((t - pd.Timestamp(creat['available_at'])).total_seconds() / 3600, 2) if creat else np.nan,
        **{f'symptom_{key}': last_symptom[key] if last_symptom else np.nan for key in SYMPTOMS},
    }
    return row
