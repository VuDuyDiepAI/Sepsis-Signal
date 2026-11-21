"""Stateless manual-UI bridge to existing Python inference; no persistent writes."""
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.manual_cases import create_case, save_entry, score_hour, InsufficientDataError
from src.mock_emr import FEATURES, load_bundle


def local(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        raise ValueError('Thời gian nhập phải là giờ địa phương không kèm múi giờ.')
    return parsed


def score(payload, bundle=None):
    profile = payload['profile']
    with TemporaryDirectory(prefix='sepsis-ui-') as directory:
        db = Path(directory) / 'case.sqlite3'
        eid = create_case(triage_completed_at=local(profile['t0']), age_years=profile['age'],
                          sex=profile['sex'], height_cm=profile.get('height'),
                          weight_kg=profile.get('weight'), comorbidities=profile['comorbidities'], path=db)
        for entry in sorted(payload['entries'], key=lambda e: e['hour']):
            save_entry(eid, measured_at=local(entry['measuredAt']),
                       vital_available_at=local(entry['availableAt']), vitals=entry.get('vitals'),
                       lab_collected_at=local(entry['collectedAt']), lab_available_at=local(entry['labAvailableAt']),
                       labs=entry.get('labs'), symptom_recorded_at=local(entry['measuredAt']),
                       symptom_available_at=local(entry['availableAt']), symptoms=entry.get('symptoms'),
                       location_code=entry['department'], location_at=local(entry['measuredAt']), path=db)
        bundle = bundle if bundle is not None else load_bundle('sepsis')
        predictions, errors = [], {}
        for hour in sorted(set(payload['hours'])):
            if hour == 0:
                continue
            try:
                result = score_hour(eid, hour, path=db, bundles={'sepsis': bundle})
            except InsufficientDataError as error:
                errors[str(hour)] = str(error)
                continue
            values = result['features'][FEATURES].to_json(orient='records', double_precision=15)
            signature = hashlib.sha256((values + bundle[1]['model_version'] + str(bundle[1]['threshold'])).encode()).hexdigest()
            predictions.append({'hour': hour, 'score': result['sepsis']['score'],
                'threshold': result['sepsis']['threshold'], 'modelVersion': result['sepsis']['model_version'],
                'availableFeatures': len(FEATURES)-result['missing_features'],
                'department': result['features'].iloc[0]['location_code'], 'featureHash': signature})
        return {'predictions': predictions, 'errors': errors}


if __name__ == '__main__':
    try:
        print(json.dumps(score(json.load(sys.stdin)), ensure_ascii=False, allow_nan=False))
    except (ValueError, KeyError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False))
        sys.exit(2)
