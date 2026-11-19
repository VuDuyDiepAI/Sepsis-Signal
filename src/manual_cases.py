"""Local event store and as-of inference for synthetic research demo cases.

No patient names or hospital identifiers are collected. The two model bundles
remain trained on synthetic data and their outputs are demonstration scores.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from src.mock_emr import FEATURES, ROOT, load_bundle

VITAL_RANGES = {
    'heart_rate_bpm': (20, 250), 'respiratory_rate_per_min': (4, 70),
    'sbp_mmhg': (40, 300), 'dbp_mmhg': (20, 200), 'map_mmhg': (20, 250),
    'spo2_pct': (40, 100), 'temperature_c': (25, 45), 'gcs': (3, 15),
}
LAB_UNITS = {
    'WBC': '10^9/L', 'platelets': '10^9/L', 'creatinine': 'mg/dL',
    'bilirubin_total': 'mg/dL', 'CRP': 'mg/L', 'procalcitonin': 'ng/mL',
}
COMORBIDITIES = (
    'diabetes', 'cardiovascular_disease', 'chronic_kidney_disease',
    'chronic_liver_disease', 'chronic_lung_disease', 'cancer', 'immunosuppression',
)
SYMPTOMS = ('respiratory', 'urinary', 'abdominal', 'skin', 'cns')
LOCATIONS = ('ED', 'WARD', 'ICU')


def db_path() -> Path:
    return Path(os.environ.get('SEPSIS_MANUAL_DB', ROOT / 'data' / 'manual_cases.sqlite3'))


def _stamp(value: datetime | str) -> str:
    parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
    if parsed.tzinfo is not None:
        raise ValueError('Giờ nhập phải là giờ địa phương không kèm múi giờ.')
    return parsed.replace(microsecond=0).isoformat(timespec='seconds')


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


@contextmanager
def _connection(path: Path | None = None):
    target = Path(path) if path is not None else db_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(target)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys = ON')
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db(path: Path | None = None) -> None:
    with _connection(path) as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS encounters (
          encounter_id TEXT PRIMARY KEY, triage_completed_at TEXT NOT NULL,
          age_years INTEGER NOT NULL, sex TEXT NOT NULL,
          height_cm REAL, weight_kg REAL, bmi_kg_m2 REAL,
          diabetes INTEGER NOT NULL, cardiovascular_disease INTEGER NOT NULL,
          chronic_kidney_disease INTEGER NOT NULL, chronic_liver_disease INTEGER NOT NULL,
          chronic_lung_disease INTEGER NOT NULL, cancer INTEGER NOT NULL,
          immunosuppression INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS vitals (
          id INTEGER PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(encounter_id),
          measured_at TEXT NOT NULL, available_at TEXT NOT NULL,
          heart_rate_bpm REAL NOT NULL, respiratory_rate_per_min REAL NOT NULL,
          sbp_mmhg REAL NOT NULL, dbp_mmhg REAL, map_mmhg REAL,
          spo2_pct REAL, temperature_c REAL, gcs REAL,
          active INTEGER NOT NULL DEFAULT 1, supersedes_id INTEGER, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS vitals_case_time ON vitals(encounter_id, available_at, active);
        CREATE TABLE IF NOT EXISTS labs (
          id INTEGER PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(encounter_id),
          test_code TEXT NOT NULL, value_num REAL NOT NULL, unit TEXT NOT NULL,
          collected_at TEXT NOT NULL, available_at TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1, supersedes_id INTEGER, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS labs_case_time ON labs(encounter_id, available_at, active);
        CREATE TABLE IF NOT EXISTS symptoms (
          id INTEGER PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(encounter_id),
          recorded_at TEXT NOT NULL, available_at TEXT NOT NULL,
          respiratory INTEGER NOT NULL, urinary INTEGER NOT NULL,
          abdominal INTEGER NOT NULL, skin INTEGER NOT NULL, cns INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1, supersedes_id INTEGER, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS locations (
          id INTEGER PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(encounter_id),
          location_code TEXT NOT NULL, effective_at TEXT NOT NULL, available_at TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1, supersedes_id INTEGER, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS predictions (
          id INTEGER PRIMARY KEY, encounter_id TEXT NOT NULL REFERENCES encounters(encounter_id),
          prediction_at TEXT NOT NULL, target TEXT NOT NULL,
          score REAL NOT NULL, threshold REAL NOT NULL, alert INTEGER NOT NULL,
          model_version TEXT NOT NULL, feature_hash TEXT NOT NULL,
          feature_json TEXT NOT NULL, revision INTEGER NOT NULL, scored_at TEXT NOT NULL,
          UNIQUE(encounter_id, prediction_at, target, revision)
        );
        CREATE INDEX IF NOT EXISTS predictions_case_time ON predictions(encounter_id, prediction_at);
        CREATE TABLE IF NOT EXISTS result_reviews (
          result_key TEXT PRIMARY KEY, encounter_id TEXT NOT NULL,
          prediction_id INTEGER UNIQUE REFERENCES predictions(id) ON DELETE CASCADE,
          prediction_at TEXT NOT NULL, model_version TEXT NOT NULL,
          reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL, note TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS reviews_case ON result_reviews(encounter_id);
        ''')
        columns = {row[1] for row in con.execute('PRAGMA table_info(result_reviews)')}
        if 'reviewed_by_user_id' not in columns:
            con.execute('ALTER TABLE result_reviews ADD COLUMN reviewed_by_user_id TEXT')


def _finite(value, field: str, bounds: tuple[float, float] | None = None):
    if value is None:
        return None
    number = float(value)
    if not np.isfinite(number) or (bounds and not bounds[0] <= number <= bounds[1]):
        raise ValueError(f'Giá trị {field} nằm ngoài khoảng nhập hợp lệ.')
    return number


def create_case(*, triage_completed_at: datetime, age_years: int, sex: str,
                height_cm: float | None = None, weight_kg: float | None = None,
                comorbidities: dict[str, bool] | None = None,
                path: Path | None = None) -> str:
    init_db(path)
    age = int(age_years)
    if not 18 <= age <= 120 or sex not in ('F', 'M'):
        raise ValueError('Hồ sơ trải nghiệm cần tuổi từ 18 đến 120 và thông tin giới tính.')
    height = _finite(height_cm, 'chiều cao', (80, 250))
    weight = _finite(weight_kg, 'cân nặng', (20, 400))
    bmi = round(weight / (height / 100) ** 2, 1) if height and weight else None
    flags = {key: int(bool((comorbidities or {}).get(key, False))) for key in COMORBIDITIES}
    case_id = f'DEMO-{uuid.uuid4().hex[:10].upper()}'
    now = _stamp(datetime.now())
    t0 = _stamp(triage_completed_at)
    with _connection(path) as con:
        con.execute('''INSERT INTO encounters VALUES
          (:encounter_id,:triage_completed_at,:age_years,:sex,:height_cm,:weight_kg,:bmi_kg_m2,
           :diabetes,:cardiovascular_disease,:chronic_kidney_disease,:chronic_liver_disease,
           :chronic_lung_disease,:cancer,:immunosuppression,:created_at)''',
            dict(encounter_id=case_id, triage_completed_at=t0, age_years=age, sex=sex,
                 height_cm=height, weight_kg=weight, bmi_kg_m2=bmi, created_at=now, **flags))
        con.execute('''INSERT INTO locations(encounter_id,location_code,effective_at,available_at,created_at)
                       VALUES (?,?,?,?,?)''', (case_id, 'ED', t0, t0, now))
    return case_id


def list_cases(path: Path | None = None) -> list[dict]:
    init_db(path)
    with _connection(path) as con:
        return [dict(row) for row in con.execute(
            'SELECT * FROM encounters ORDER BY created_at DESC, encounter_id DESC')]


def get_case(encounter_id: str, path: Path | None = None) -> dict:
    init_db(path)
    with _connection(path) as con:
        row = con.execute('SELECT * FROM encounters WHERE encounter_id=?', (encounter_id,)).fetchone()
    if row is None:
        raise KeyError(f'Không tìm thấy ca {encounter_id}')
    return dict(row)


def delete_case(encounter_id: str, path: Path | None = None) -> None:
    """Remove a synthetic manual demo case and all its associated events/predictions."""
    get_case(encounter_id, path)
    with _connection(path) as con:
        for table in ('predictions', 'vitals', 'labs', 'symptoms', 'locations', 'encounters'):
            con.execute(f'DELETE FROM {table} WHERE encounter_id=?', (encounter_id,))


def review_history(encounter_id: str, path: Path | None = None) -> list[dict]:
    init_db(path)
    with _connection(path) as con:
        return [dict(row) for row in con.execute(
            'SELECT * FROM result_reviews WHERE encounter_id=? ORDER BY reviewed_at DESC',
            (encounter_id,))]


def case_overview(path: Path | None = None) -> list[dict]:
    rows = []
    for case in list_cases(path):
        eid = case['encounter_id']
        history = [p for p in prediction_history(eid, path=path) if p['target'] == 'sepsis']
        latest = history[-1] if history else None
        reviews = {r['result_key']: r for r in review_history(eid, path)}
        review = reviews.get(f'manual:{latest["id"]}') if latest else None
        locations = [r for r in event_rows(eid, 'locations', path)
                     if latest is None or r['available_at'] <= latest['prediction_at']]
        status = ('Vượt ngưỡng' if latest['alert'] else 'Dưới ngưỡng') if latest else 'Chưa chấm'
        pending_alert = bool(latest and latest['alert'] and not review)
        rows.append({
            **case, 'latest': latest, 'review': review, 'status': status,
            'location': locations[-1]['location_code'] if locations else 'ED',
            'review_status': ('Đã xem xét' if review else 'Chờ xem xét') if latest else 'Chưa có kết quả',
            'change': (latest['score'] - history[-2]['score']) * 100 if len(history) > 1 else None,
            'hour': int((_dt(latest['prediction_at']) - _dt(case['triage_completed_at']))
                        .total_seconds() // 3600) if latest else 0,
            'rank': 0 if pending_alert else 1 if latest and latest['alert'] else 2 if latest else 3,
        })
    return sorted(rows, key=lambda r: (r['rank'], -(r['latest']['score'] if r['latest'] else 0)))


def record_review(*, result_key: str, encounter_id: str, prediction_at: str,
                  model_version: str, reviewed_by: str, note: str = '',
                  prediction_id: int | None = None, path: Path | None = None,
                  reviewed_by_user_id: str | None = None) -> dict:
    """Persist the first review of an exact result, rejecting stale manual revisions."""
    reviewer, note = reviewed_by.strip(), note.strip()
    if not reviewer or len(reviewer) > 120 or len(note) > 1000:
        raise ValueError('Nhập người ghi nhận (tối đa 120 ký tự), ghi chú tối đa 1.000 ký tự.')
    init_db(path)
    with _connection(path) as con:
        con.execute('BEGIN IMMEDIATE')
        if prediction_id is not None:
            prediction = con.execute('SELECT * FROM predictions WHERE id=?',
                                     (prediction_id,)).fetchone()
            if (prediction is None or prediction['encounter_id'] != encounter_id
                    or prediction['target'] != 'sepsis'
                    or prediction['prediction_at'] != _stamp(prediction_at)
                    or prediction['model_version'] != model_version
                    or result_key != f'manual:{prediction_id}'):
                raise ValueError('Kết quả được chọn không hợp lệ. Mở lại hồ sơ để xem kết quả mới nhất.')
            newest = con.execute('''SELECT MAX(revision) FROM predictions
                WHERE encounter_id=? AND prediction_at=? AND target='sepsis' ''',
                (encounter_id, prediction['prediction_at'])).fetchone()[0]
            if prediction['revision'] != newest:
                raise ValueError('Kết quả đã có bản tính mới. Tải lại trang để xem xét bản mới nhất.')
        elif not result_key.startswith('sample:'):
            raise ValueError('Mã kết quả mẫu không hợp lệ.')
        reviewed_at = _stamp(datetime.now(timezone(timedelta(hours=7))).replace(tzinfo=None))
        con.execute('''INSERT INTO result_reviews
            (result_key,encounter_id,prediction_id,prediction_at,model_version,
             reviewed_by,reviewed_at,note,reviewed_by_user_id) VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(result_key) DO NOTHING''',
            (result_key, encounter_id, prediction_id, _stamp(prediction_at), model_version,
             reviewer, reviewed_at, note, reviewed_by_user_id))
        return dict(con.execute('SELECT * FROM result_reviews WHERE result_key=?',
                                (result_key,)).fetchone())


def _replace_event(con, table: str, identity: dict, values: dict) -> int:
    where = ' AND '.join(f'{key}=?' for key in identity)
    old = con.execute(
        f'SELECT id FROM {table} WHERE active=1 AND {where} ORDER BY id DESC LIMIT 1',
        tuple(identity.values()),
    ).fetchone()
    if old:
        con.execute(f'UPDATE {table} SET active=0 WHERE id=?', (old['id'],))
    record = {**identity, **values, 'active': 1,
              'supersedes_id': old['id'] if old else None,
              'created_at': _stamp(datetime.now())}
    columns = ','.join(record)
    marks = ','.join('?' for _ in record)
    return con.execute(f'INSERT INTO {table}({columns}) VALUES({marks})', tuple(record.values())).lastrowid


def save_entry(encounter_id: str, *, measured_at: datetime | None = None,
               vital_available_at: datetime | None = None, vitals: dict | None = None,
               lab_collected_at: datetime | None = None,
               lab_available_at: datetime | None = None, labs: dict | None = None,
               symptom_recorded_at: datetime | None = None,
               symptom_available_at: datetime | None = None, symptoms: dict | None = None,
               location_code: str | None = None, location_at: datetime | None = None,
               path: Path | None = None) -> datetime | None:
    """Save an hourly batch atomically; same event time replaces an earlier entry."""
    case = get_case(encounter_id, path)
    t0 = _dt(case['triage_completed_at'])
    prepared = []
    if vitals is not None:
        if measured_at is None or vital_available_at is None:
            raise ValueError('Cần giờ đo và giờ có sinh hiệu.')
        measured, available = _stamp(measured_at), _stamp(vital_available_at)
        if _dt(measured) < t0 or available < measured:
            raise ValueError('Giờ sinh hiệu phải từ T0 trở đi và giờ có dữ liệu không trước giờ đo.')
        clean = {key: _finite(vitals.get(key), key, bounds) for key, bounds in VITAL_RANGES.items()}
        if any(clean[key] is None for key in ('heart_rate_bpm', 'respiratory_rate_per_min', 'sbp_mmhg')):
            raise ValueError('Một lần đo sinh hiệu cần HR, nhịp thở và huyết áp tâm thu.')
        if clean['map_mmhg'] is None and clean['dbp_mmhg'] is not None:
            clean['map_mmhg'] = round((clean['sbp_mmhg'] + 2 * clean['dbp_mmhg']) / 3, 1)
        prepared.append(('vitals', {'encounter_id': encounter_id, 'measured_at': measured},
                         {'available_at': available, **clean}, _dt(available)))
    if labs:
        if lab_collected_at is None or lab_available_at is None:
            raise ValueError('Cần giờ lấy mẫu và giờ có kết quả xét nghiệm.')
        collected, available = _stamp(lab_collected_at), _stamp(lab_available_at)
        if _dt(collected) < t0 or available < collected:
            raise ValueError('Giờ kết quả xét nghiệm không được trước giờ lấy mẫu.')
        for code, value in labs.items():
            if code not in LAB_UNITS:
                raise ValueError(f'Mã xét nghiệm không được hỗ trợ: {code}')
            number = _finite(value, code, (0, 100000))
            if number is None:
                continue
            prepared.append(('labs', {'encounter_id': encounter_id, 'test_code': code,
                                      'collected_at': collected},
                             {'available_at': available, 'value_num': number,
                              'unit': LAB_UNITS[code]}, _dt(available)))
    if symptoms is not None:
        if symptom_recorded_at is None or symptom_available_at is None:
            raise ValueError('Cần giờ ghi nhận triệu chứng.')
        recorded, available = _stamp(symptom_recorded_at), _stamp(symptom_available_at)
        if _dt(recorded) < t0 or available < recorded:
            raise ValueError('Giờ có triệu chứng không được trước giờ ghi nhận.')
        flags = {key: int(bool(symptoms.get(key, False))) for key in SYMPTOMS}
        prepared.append(('symptoms', {'encounter_id': encounter_id, 'recorded_at': recorded},
                         {'available_at': available, **flags}, _dt(available)))
    if location_code is not None:
        if location_code not in LOCATIONS or location_at is None:
            raise ValueError('Khu vực điều trị hoặc thời điểm không hợp lệ.')
        when = _stamp(location_at)
        if _dt(when) < t0:
            raise ValueError('Giờ chuyển khu vực không được trước T0.')
        prepared.append(('locations', {'encounter_id': encounter_id, 'effective_at': when},
                         {'available_at': when, 'location_code': location_code}, _dt(when)))
    with _connection(path) as con:
        for table, identity, values, _ in prepared:
            if table == 'vitals':
                old = con.execute('''SELECT available_at FROM vitals WHERE encounter_id=?
                    AND measured_at=? AND active=1 ORDER BY id DESC LIMIT 1''',
                    (encounter_id, identity['measured_at'])).fetchone()
                if old and values['available_at'] > old['available_at']:
                    scored = con.execute('''SELECT 1 FROM predictions WHERE encounter_id=?
                        AND prediction_at>=? AND prediction_at<? LIMIT 1''',
                        (encounter_id, old['available_at'], values['available_at'])).fetchone()
                    if scored:
                        raise ValueError('Đã có mốc dự báo dùng lần đo này; không thể dời giờ có dữ liệu sang sau mốc đó.')
            _replace_event(con, table, identity, values)
    return min((row[3] for row in prepared), default=None)


def event_rows(encounter_id: str, table: str, path: Path | None = None,
               include_revisions: bool = False) -> list[dict]:
    if table not in ('vitals', 'labs', 'symptoms', 'locations'):
        raise ValueError('Bảng sự kiện không hợp lệ.')
    get_case(encounter_id, path)
    clause = '' if include_revisions else 'AND active=1'
    with _connection(path) as con:
        return [dict(row) for row in con.execute(
            f'SELECT * FROM {table} WHERE encounter_id=? {clause} ORDER BY available_at,id',
            (encounter_id,))]


def build_features(encounter_id: str, prediction_at: datetime,
                   path: Path | None = None) -> pd.DataFrame:
    """One 36-field feature row using only values visible at the scoring time."""
    from src.observation_features import build_snapshot
    case = get_case(encounter_id, path)
    row = build_snapshot(case, prediction_at,
                         event_rows(encounter_id, 'vitals', path),
                         event_rows(encounter_id, 'labs', path),
                         event_rows(encounter_id, 'symptoms', path),
                         event_rows(encounter_id, 'locations', path))
    frame = pd.DataFrame([row])
    assert set(FEATURES) <= set(frame.columns)
    return frame


def score_hour(encounter_id: str, hour: int, *, path: Path | None = None,
               bundles: dict | None = None) -> dict:
    if not 1 <= int(hour) <= 36:
        raise ValueError('Chọn mốc từ T0+1 đến T0+36 giờ.')
    case = get_case(encounter_id, path)
    t = _dt(case['triage_completed_at']) + timedelta(hours=int(hour))
    frame = build_features(encounter_id, t, path)
    if pd.isna(frame.iloc[0]['heart_rate_last_bpm']):
        raise ValueError('Chưa có sinh hiệu hợp lệ từ T0 đến mốc đang xem để chấm điểm.')
    result = {'encounter_id': encounter_id, 'prediction_at': t,
              'missing_features': int(frame[FEATURES].isna().sum(axis=1).iloc[0]),
              'features': frame}
    payload = {k: None if pd.isna(v) else (v.item() if isinstance(v, np.generic) else v)
               for k, v in frame.iloc[0][FEATURES].items()}
    if bundles is None:
        bundles = {target: load_bundle(target) for target in ('sepsis', 'shock')}
    for target, (model, meta) in bundles.items():
        score = float(model.predict_proba(frame[FEATURES])[0, 1])
        threshold = float(meta['threshold'])
        feature_json = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        signature = hashlib.sha256((feature_json + meta['model_version'] + str(threshold)).encode()).hexdigest()
        with _connection(path) as con:
            prior = con.execute('''SELECT * FROM predictions WHERE encounter_id=? AND prediction_at=?
                AND target=? ORDER BY revision DESC LIMIT 1''',
                (encounter_id, _stamp(t), target)).fetchone()
            if prior is not None and prior['feature_hash'] == signature:
                revision = prior['revision']
            else:
                revision = 1 if prior is None else prior['revision'] + 1
                con.execute('''INSERT INTO predictions
                    (encounter_id,prediction_at,target,score,threshold,alert,model_version,
                     feature_hash,feature_json,revision,scored_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                    (encounter_id, _stamp(t), target, score, threshold, int(score >= threshold),
                     meta['model_version'], signature, feature_json, revision, _stamp(datetime.now())))
        result[target] = {'score': score, 'threshold': threshold,
                          'alert': score >= threshold, 'model_version': meta['model_version'],
                          'revision': revision}
    return result


def prediction_history(encounter_id: str, *, path: Path | None = None,
                       include_revisions: bool = False) -> list[dict]:
    get_case(encounter_id, path)
    with _connection(path) as con:
        if include_revisions:
            query = '''SELECT * FROM predictions WHERE encounter_id=?
                       ORDER BY prediction_at,target,revision'''
        else:
            query = '''SELECT p.* FROM predictions p WHERE p.encounter_id=? AND p.revision=(
                       SELECT MAX(q.revision) FROM predictions q WHERE q.encounter_id=p.encounter_id
                       AND q.prediction_at=p.prediction_at AND q.target=p.target)
                       ORDER BY p.prediction_at,p.target'''
        return [dict(row) for row in con.execute(query, (encounter_id,))]


def recompute_scored_hours(encounter_id: str, from_available_at: datetime | None,
                           *, path: Path | None = None, bundles: dict | None = None) -> int:
    if from_available_at is None:
        return 0
    case = get_case(encounter_id, path)
    t0 = _dt(case['triage_completed_at'])
    # A correction can remove an older active record. Revisit every scored hour
    # so records before and after the corrected availability stay consistent.
    hours = sorted({round((_dt(p['prediction_at']) - t0).total_seconds() / 3600)
                    for p in prediction_history(encounter_id, path=path)})
    for hour in hours:
        score_hour(encounter_id, hour, path=path, bundles=bundles)
    return len(hours)
