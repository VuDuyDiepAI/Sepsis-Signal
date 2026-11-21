"""Read-only export of synthetic EMR and saved predictions for the Next.js UI.

Run from the repository root. No training, source updates or clinical writes.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.mock_emr import DATA_PATH, FEATURES, bundle_paths, load_bundle, load_tables, training_frame


def stamp(value):
    return None if pd.isna(value) else pd.Timestamp(value).tz_localize('Asia/Ho_Chi_Minh').isoformat()


def number(value):
    return None if pd.isna(value) else float(value)


def export():
    protected = [DATA_PATH, *sorted((ROOT / 'artifacts/mock_emr_hourly_lr').glob('*'))]
    hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in protected if p.is_file()}
    tables = load_tables()
    model, meta = load_bundle('sepsis')
    _, shock = load_bundle('shock')
    # Prediction identity changes with weights or decision policy so a prior review
    # cannot silently attach to a newly evaluated result after a fixture refresh.
    policy_fingerprint = hashlib.sha256(json.dumps({
        'version': meta['model_version'], 'threshold': meta['threshold'],
        'weights_sha256': hashes[bundle_paths('sepsis')[0]],
        'source_sha256': hashes[DATA_PATH],
    }, sort_keys=True).encode()).hexdigest()[:12]
    outcomes = tables['ReferenceOutcomes']
    selected = []
    for _, group in outcomes.groupby('scenario_scripted', sort=True):
        selected.extend(group.encounter_id.head(2).tolist())
    eligible = training_frame(tables)
    selected = sorted(set(selected + ['E0009']) & set(eligible.encounter_id))
    encounters = tables['Encounters'].set_index('encounter_id')
    frame = eligible
    frame = frame.loc[frame.encounter_id.isin(selected)].copy()
    frame['score'] = model.predict_proba(frame[FEATURES])[:, 1]
    result = {'encounters': [], 'predictions': [], 'vitals': [], 'labs': [], 'locations': [],
              'models': {'sepsis': meta, 'shock': shock},
              'provenance': {'dataKind': 'SYNTHETIC_MOCK_EMR', 'source': DATA_PATH.name,
                             'sourceSha256': hashes[DATA_PATH], 'featureCount': len(FEATURES),
                             'availabilityRule': 'available_at <= prediction_at',
                             'observationWindow': '[T0, prediction_at]'}}
    references = {}
    for i, eid in enumerate(selected):
        e = encounters.loc[eid]
        rows = frame.loc[frame.encounter_id.eq(eid)].sort_values('prediction_at')
        t0 = e.triage_completed_at
        above = rows.loc[rows.score.ge(meta['threshold'])]
        chosen = above.iloc[0] if not above.empty else rows.iloc[min(11, len(rows)-1)]
        current = int((chosen.prediction_at-t0).total_seconds()/3600)
        result['encounters'].append({'id': eid, 'age': int(e.age_years), 'sex': e.sex,
                                     't0': stamp(t0), 'currentHour': 0 if i == 0 else current})
        for _, row in rows.iterrows():
            hour = int((row.prediction_at-t0).total_seconds()/3600)
            result['predictions'].append({'id': f'{eid}:{hour}:1:{policy_fingerprint}', 'encounterId': eid,
                'hour': hour, 'timestamp': stamp(row.prediction_at), 'score': float(row.score),
                'threshold': meta['threshold'], 'revision': 1, 'modelVersion': meta['model_version'],
                'department': row.location_code, 'availableFeatures': int(row[FEATURES].notna().sum())})
        ref = outcomes.loc[outcomes.encounter_id.eq(eid)].iloc[0]
        references[eid] = {'sepsisOnset': stamp(ref.sepsis_onset_at)}
    for _, row in tables['Vitals'].loc[lambda d: d.encounter_id.isin(selected)].iterrows():
        result['vitals'].append({'encounterId': row.encounter_id, 'measuredAt': stamp(row.observed_at),
            'availableAt': stamp(row.available_at), 'values': {k: number(row[k]) for k in
            ['heart_rate_bpm', 'respiratory_rate_per_min', 'sbp_mmhg', 'map_mmhg', 'spo2_pct', 'temperature_c', 'gcs']}})
    codes = ['WBC', 'platelets', 'creatinine', 'bilirubin_total', 'CRP', 'procalcitonin']
    for _, row in tables['Labs'].loc[lambda d: d.encounter_id.isin(selected) & d.test_code.isin(codes)].iterrows():
        result['labs'].append({'encounterId': row.encounter_id, 'code': row.test_code,
            'value': number(row.value_num), 'unit': row.unit, 'collectedAt': stamp(row.collected_at),
            'availableAt': stamp(row.available_at)})
    for _, row in tables['Locations'].loc[lambda d: d.encounter_id.isin(selected)].iterrows():
        result['locations'].append({'encounterId': row.encounter_id, 'department': row.location_code,
            'startedAt': stamp(row.started_at), 'endedAt': stamp(row.ended_at)})
    destination = ROOT / 'frontend/src/data'
    destination.mkdir(parents=True, exist_ok=True)
    for filename, data in [('clinical-demo.json', result), ('reference-onsets.json', references)]:
        (destination / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    assert hashes == {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in hashes}, 'Source changed'
    print(f'Exported {len(selected)} synthetic encounters, {len(frame)} model predictions; sources unchanged.')


if __name__ == '__main__':
    export()
