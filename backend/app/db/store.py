from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import time
from uuid import uuid4

from sqlalchemy import create_engine, event, inspect, select, update, delete, insert, and_, or_, func, text
from sqlalchemy.pool import StaticPool

from backend.app.config import REPO, Settings
from backend.app.identity import fixture_prediction, now_iso, prediction_time
from backend.app.db import tables as t


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


class ClinicalError(Exception):
    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


class Store:
    def __init__(self, settings: Settings, source=None):
        self.settings = settings
        self.artifact_hashes = [hashlib.sha256((REPO / "artifacts/mock_emr_hourly_lr" / name).read_bytes()).hexdigest()
            for name in ("sepsis_model.joblib", "sepsis_metadata.json")]
        self.source = source or json.loads((REPO / 'frontend/src/data/clinical-demo.json').read_text(encoding='utf-8'))
        url = settings.database_url
        if url.startswith('postgresql://'):
            url = url.replace('postgresql://', 'postgresql+psycopg://', 1)
        options = {'pool_pre_ping': True}
        if url.startswith('sqlite'):
            options['connect_args'] = {'check_same_thread': False, 'timeout': 10}
            if ':memory:' in url:
                options['poolclass'] = StaticPool
            else:
                Path(url.split('///', 1)[1]).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(url, **options)
        self.postgres = self.engine.dialect.name == 'postgresql'
        if not self.postgres:
            @event.listens_for(self.engine, 'connect')
            def setup_sqlite(dbapi, _):
                dbapi.isolation_level = None
                dbapi.execute('PRAGMA foreign_keys=ON')
                dbapi.execute('PRAGMA busy_timeout=10000')
                dbapi.execute('PRAGMA journal_mode=WAL')

            @event.listens_for(self.engine, 'begin')
            def begin_sqlite(conn):
                conn.exec_driver_sql('BEGIN IMMEDIATE')
        self.migrate()
        self.sync_fixtures()

    def close(self):
        self.engine.dispose()

    @contextmanager
    def transaction(self):
        with self.engine.begin() as conn:
            yield conn

    def migrate(self):
        with self.transaction() as c:
            if self.postgres:
                c.execute(text('SELECT pg_advisory_xact_lock(73573109)'))
            names = set(inspect(c).get_table_names())
            if 'schema_migrations' in names:
                version = c.execute(select(func.max(t.versions.c.version))).scalar() or 0
                if version > 3:
                    raise ValueError('Database schema is newer than this application')
            elif names and 'manual_cases' not in names:
                raise ValueError('Unrecognized database; choose a separate SEPSIS_DATABASE_URL')
            if not self.postgres:
                version = c.exec_driver_sql('PRAGMA user_version').scalar()
                if version > 3:
                    raise ValueError('Database schema is newer than this application')
                if version == 1:
                    sql = (Path(__file__).parent / 'legacy_v2.sql').read_text(encoding='utf-8')
                    for statement in sql.split(';'):
                        if statement.strip():
                            c.exec_driver_sql(statement)
            t.metadata.create_all(c)
            # Preserve legacy SQLite row order for simultaneous review timestamps.
            order = t.reviews.c.timestamp if self.postgres else text('rowid')
            for row in c.execute(select(t.reviews.c.id).order_by(order)).mappings():
                if not c.execute(select(t.review_order.c.position).where(t.review_order.c.event_id == row['id'])).first():
                    c.execute(insert(t.review_order).values(event_id=row['id']))
            if not c.execute(select(t.versions).where(t.versions.c.version == 3)).first():
                c.execute(insert(t.versions).values(version=3, applied_at=now_iso()))
            if not self.postgres:
                c.exec_driver_sql('PRAGMA user_version=3')

    def sync_fixtures(self):
        with self.transaction() as c:
            if self.postgres:
                c.execute(text('SELECT pg_advisory_xact_lock(73573109)'))
            c.execute(update(t.predictions).where(t.predictions.c.source == 'fixture').values(active=0))
            for original in self.source['predictions']:
                p = fixture_prediction(original, self.source['provenance']['sourceSha256'])
                existing = c.execute(select(t.predictions).where(t.predictions.c.id == p['id'])).mappings().first()
                if existing:
                    if json.loads(existing['data']) != p:
                        raise ValueError('Immutable prediction identity conflict')
                    c.execute(update(t.predictions).where(t.predictions.c.id == p['id']).values(active=1))
                else:
                    c.execute(insert(t.predictions).values(id=p['id'], encounter_id=p['encounterId'], hour=p['hour'],
                        revision=p['revision'], active=1, source='fixture', data=dump(p), created_at=now_iso()))

    def _case(self, c, case_id, lock=False):
        stmt = select(t.cases).where(t.cases.c.id == case_id)
        if lock and self.postgres:
            stmt = stmt.with_for_update()
        row = c.execute(stmt).mappings().first()
        if not row:
            return None
        entries = [json.loads(r.data) for r in c.execute(select(t.entries.c.data).where(t.entries.c.encounter_id == case_id).order_by(t.entries.c.hour))]
        emr_entries = [json.loads(r.entry_json) for r in c.execute(select(t.emr.c.entry_json).where(
            t.emr.c.encounter_id == case_id, t.emr.c.active == 1).order_by(t.emr.c.received_at, t.emr.c.id))]
        return {'profile': json.loads(row['profile']), 'revision': row['revision'], 'currentHour': row['current_hour'],
                'attemptedHours': json.loads(row['attempted_hours']), 'errors': json.loads(row['errors']),
                'scoringStatus': row['scoring_status'], 'scoringError': row['scoring_error'],
                'entries': sorted(entries + emr_entries, key=lambda e: e['hour']),
                'predictions': [json.loads(r.data) for r in c.execute(select(t.predictions.c.data).where(
                    t.predictions.c.encounter_id == case_id, t.predictions.c.active == 1).order_by(t.predictions.c.hour))]}

    def get_case(self, case_id):
        with self.transaction() as c:
            if self.postgres:
                c.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
            return self._case(c, case_id)

    def snapshot(self):
        with self.transaction() as c:
            if self.postgres:
                c.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
            reviews, history = {}, []
            for row in c.execute(select(t.legacy_reviews)).mappings():
                r = json.loads(row['data'])
                parts = r['predictionId'].split(':')
                r |= {'localOnly': False, 'encounterId': parts[0], 'hour': int(parts[1]),
                      'note': 'Bản ghi từ phiên trình duyệt cũ. ' + r.get('note', '')}
                reviews['legacy:' + r['predictionId']] = r
                history.append(r)
            stmt = select(t.reviews, t.predictions.c.data).join(t.predictions, t.predictions.c.id == t.reviews.c.prediction_id).join(
                t.review_order, t.review_order.c.event_id == t.reviews.c.id).order_by(t.reviews.c.timestamp, t.review_order.c.position)
            for row in c.execute(stmt).mappings():
                p = json.loads(row['data'])
                r = {'id': row['id'], 'reviewerId': row['user_id'], 'provenance': row['provenance'],
                     'predictionId': row['prediction_id'], 'revision': row['revision'], 'reviewer': row['reviewer'],
                     'timestamp': row['timestamp'], 'note': row['note'], 'localOnly': False,
                     'encounterId': p['encounterId'], 'hour': p['hour'], 'prediction': p}
                reviews.setdefault(r['predictionId'], r)
                history.append(r)
            ids = c.execute(select(t.cases.c.id).order_by(t.cases.c.created_at.desc(), t.cases.c.id)).scalars().all()
            return {'cases': [self._case(c, i) for i in ids], 'reviews': reviews, 'reviewHistory': history,
                    'fixturePredictions': [json.loads(r.data) for r in c.execute(select(t.predictions.c.data).where(
                        t.predictions.c.source == 'fixture', t.predictions.c.active == 1).order_by(t.predictions.c.encounter_id, t.predictions.c.hour))]}

    def _create(self, c, profile):
        if self._case(c, profile['id']):
            raise ClinicalError('Mã hồ sơ đã tồn tại.')
        now = now_iso()
        c.execute(insert(t.cases).values(id=profile['id'], profile=dump(profile), revision=0, current_hour=0,
            attempted_hours='[]', errors='{}', created_at=now, updated_at=now, scoring_status='idle'))

    def create(self, profile):
        with self.transaction() as c:
            self._create(c, profile)
        return self.get_case(profile['id'])

    @property
    def policy(self):
        return self.source['models']['sepsis']

    def _policy_hash(self):
        from src.observation_features import FEATURE_SCHEMA_VERSION
        return hashlib.sha256(dump({'model': self.policy['model_version'], 'threshold': self.policy['threshold'],
            'features': FEATURE_SCHEMA_VERSION, 'artifacts': self.artifact_hashes}).encode()).hexdigest()

    def _enqueue(self, c, record):
        if not record['attemptedHours']:
            return None
        key = and_(t.queue.c.encounter_id == record['profile']['id'], t.queue.c.revision == record['revision'],
                   t.queue.c.model_version == self.policy['model_version'], t.queue.c.policy_hash == self._policy_hash())
        old = c.execute(select(t.queue).where(key)).mappings().first()
        if old:
            if old['status'] == 'failed':
                c.execute(update(t.queue).where(t.queue.c.id == old['id']).values(status='pending', attempts=0,
                    available_at=int(time.time()*1000), error=None, finished_at=None))
            return old['id']
        job_id = str(uuid4())
        c.execute(insert(t.queue).values(id=job_id, encounter_id=record['profile']['id'], revision=record['revision'],
            status='pending', input_json=dump({'profile': record['profile'], 'entries': record['entries'], 'hours': record['attemptedHours']}),
            model_version=self.policy['model_version'], policy_hash=self._policy_hash(), attempts=0,
            max_attempts=self.settings.max_attempts, available_at=int(time.time()*1000), lease_until=0, created_at=now_iso()))
        return job_id

    def _invalidate(self, c, record, entry_hour, actor_id=None):
        case_id = record['profile']['id']
        revision, now = record['revision'] + 1, now_iso()
        hours = sorted(set(record['attemptedHours'] + ([entry_hour] if entry_hour > 0 else [])))
        c.execute(update(t.queue).where(t.queue.c.encounter_id == case_id, t.queue.c.status.in_(['pending', 'running', 'failed'])).values(status='superseded', finished_at=now))
        c.execute(update(t.scoring_jobs).where(t.scoring_jobs.c.encounter_id == case_id,
            t.scoring_jobs.c.status.in_(['pending', 'running', 'error'])).values(status='superseded', finished_at=now))
        c.execute(insert(t.scoring_jobs).values(encounter_id=case_id, revision=revision,
            status='pending' if hours else 'complete', previous_predictions=dump(record['predictions']), created_at=now, lease_until=0))
        c.execute(update(t.predictions).where(t.predictions.c.encounter_id == case_id, t.predictions.c.source == 'manual').values(active=0))
        c.execute(update(t.cases).where(t.cases.c.id == case_id).values(revision=revision, current_hour=max(record['currentHour'], entry_hour),
            attempted_hours=dump(hours), errors=dump({str(h): 'Đã lưu dữ liệu, đang chờ chấm lại.' for h in hours}),
            updated_at=now, scoring_status='pending' if hours else 'idle', scoring_error=None))
        fresh = self._case(c, case_id)
        self._enqueue(c, fresh)
        return fresh

    def save_input(self, case_id, revision, entry, actor_id=None):
        from backend.app.schemas import validate_entry
        with self.transaction() as c:
            record = self._case(c, case_id, lock=True)
            if not record:
                raise ClinicalError('Không tìm thấy hồ sơ.', 404)
            if record['revision'] != revision:
                raise ClinicalError('Hồ sơ đã thay đổi ở tab khác. Tải lại dữ liệu trước khi lưu.')
            validate_entry(record['profile'], entry)
            c.execute(delete(t.entries).where(t.entries.c.encounter_id == case_id, t.entries.c.hour == entry['hour']))
            c.execute(insert(t.entries).values(encounter_id=case_id, hour=entry['hour'], data=dump(entry)))
            c.execute(insert(t.history).values(encounter_id=case_id, revision=revision+1, hour=entry['hour'],
                data=dump(entry), saved_at=now_iso(), actor_id=actor_id))
            return self._invalidate(c, record, entry['hour'], actor_id)

    def request_rescore(self, case_id, revision):
        with self.transaction() as c:
            record = self._case(c, case_id, lock=True)
            if not record:
                raise ClinicalError('Không tìm thấy hồ sơ.', 404)
            if record['revision'] != revision:
                raise ClinicalError('Dữ liệu đã thay đổi. Tải lại hồ sơ trước khi chấm.')
            existing = c.execute(select(t.queue.c.policy_hash).where(t.queue.c.encounter_id == case_id,
                t.queue.c.revision == revision)).scalars().all()
            if existing and self._policy_hash() not in existing:
                record = self._invalidate(c, record, 0)
            job_id = self._enqueue(c, record)
            if job_id:
                job = c.execute(select(t.queue).where(t.queue.c.id == job_id)).mappings().one()
                if job['status'] in ('pending', 'running'):
                    c.execute(update(t.cases).where(t.cases.c.id == case_id).values(scoring_status=job['status'], scoring_error=None))
            return job_id

    def claim_job(self, now=None):
        now = int(time.time()*1000) if now is None else now
        with self.transaction() as c:
            stmt = select(t.queue).join(t.cases, t.cases.c.id == t.queue.c.encounter_id).where(or_(and_(t.queue.c.status == 'pending', t.queue.c.available_at <= now),
                and_(t.queue.c.status == 'running', t.queue.c.lease_until <= now))).order_by(t.queue.c.created_at, t.queue.c.id).limit(1)
            if self.postgres:
                stmt = stmt.with_for_update(skip_locked=True, of=t.cases)
            job = c.execute(stmt).mappings().first()
            if not job:
                return None
            # Re-read after taking the encounter lock: the join snapshot may
            # predate another worker's commit immediately before lock acquisition.
            current = select(t.queue).where(t.queue.c.id == job['id'])
            if self.postgres:
                current = current.with_for_update()
            job = dict(c.execute(current).mappings().one())
            if not (job['status']=='pending' and job['available_at']<=now or job['status']=='running' and job['lease_until']<=now):
                return None
            record = self._case(c, job['encounter_id'], lock=True)
            if not record or record['revision'] != job['revision'] or job['policy_hash'] != self._policy_hash():
                c.execute(update(t.queue).where(t.queue.c.id == job['id']).values(status='superseded', finished_at=now_iso()))
                if record and record['revision'] == job['revision']:
                    message = 'Phiên bản mô hình đã thay đổi. Vui lòng chấm lại dữ liệu đã lưu.'
                    c.execute(update(t.cases).where(t.cases.c.id == job['encounter_id']).values(scoring_status='error', scoring_error=message))
                    c.execute(update(t.scoring_jobs).where(t.scoring_jobs.c.encounter_id == job['encounter_id'],
                        t.scoring_jobs.c.revision == job['revision']).values(status='superseded', error=message, finished_at=now_iso()))
                return None
            if job['attempts'] >= job['max_attempts']:
                self._fail(c, job, 'Job đã hết số lần thử. Vui lòng chấm lại dữ liệu đã lưu.', now)
                return None
            job |= {'attempt_id': str(uuid4()), 'attempts': job['attempts']+1, 'status': 'running',
                    'lease_until': now + self.settings.lease_seconds*1000}
            c.execute(update(t.queue).where(t.queue.c.id == job['id']).values(**{k: job[k] for k in ('attempt_id','attempts','status','lease_until')}))
            c.execute(update(t.scoring_jobs).where(t.scoring_jobs.c.encounter_id == job['encounter_id'], t.scoring_jobs.c.revision == job['revision']).values(
                status='running', attempt_id=job['attempt_id'], lease_until=job['lease_until']))
            c.execute(update(t.cases).where(t.cases.c.id == job['encounter_id']).values(scoring_status='running', scoring_error=None))
            return job

    def finish_job(self, job, result):
        with self.transaction() as c:
            # All paths lock the encounter first, then the job. No lock inversion.
            record = self._case(c, job['encounter_id'], lock=True)
            stmt = select(t.queue).where(t.queue.c.id == job['id'])
            if self.postgres:
                stmt = stmt.with_for_update()
            current = c.execute(stmt).mappings().first()
            if not record or record['revision'] != job['revision'] or not current or current['status'] != 'running' or current['attempt_id'] != job['attempt_id']:
                return False
            if job['policy_hash'] != self._policy_hash():
                c.execute(update(t.queue).where(t.queue.c.id == job['id']).values(status='superseded', finished_at=now_iso()))
                return False
            previous = json.loads(c.execute(select(t.scoring_jobs.c.previous_predictions).where(
                t.scoring_jobs.c.encounter_id == job['encounter_id'], t.scoring_jobs.c.revision == job['revision'])).scalar_one())
            c.execute(update(t.predictions).where(t.predictions.c.encounter_id == job['encounter_id'], t.predictions.c.source == 'manual').values(active=0))
            for p in result['predictions']:
                if p['modelVersion'] != job['model_version'] or p['threshold'] != self.policy['threshold']:
                    raise ValueError('Scorer returned a different model/policy version')
                old = next((q for q in previous if q['hour'] == p['hour'] and all(q[k] == p[k] for k in (
                    'featureHash','modelVersion','threshold','score','department','availableFeatures'))), None)
                if old:
                    c.execute(update(t.predictions).where(t.predictions.c.id == old['id']).values(active=1))
                else:
                    next_p = p | {'encounterId': job['encounter_id'], 'revision': job['revision'],
                        'id': f"{job['encounter_id']}:{p['hour']}:{job['revision']}",
                        'timestamp': prediction_time(record['profile']['t0'], p['hour']), 'computedAt': now_iso()}
                    c.execute(insert(t.predictions).values(id=next_p['id'], encounter_id=job['encounter_id'], hour=p['hour'],
                        revision=job['revision'], active=1, source='manual', data=dump(next_p), created_at=now_iso()))
            c.execute(update(t.cases).where(t.cases.c.id == job['encounter_id']).values(errors=dump(result['errors']), scoring_status='ready', scoring_error=None))
            c.execute(update(t.queue).where(t.queue.c.id == job['id']).values(status='succeeded', error=None, finished_at=now_iso()))
            c.execute(update(t.scoring_jobs).where(t.scoring_jobs.c.encounter_id == job['encounter_id'], t.scoring_jobs.c.revision == job['revision']).values(status='complete', error=None, finished_at=now_iso()))
            return True

    def _fail(self, c, job, message, now):
        retry = job['attempts'] < job['max_attempts']
        c.execute(update(t.queue).where(t.queue.c.id == job['id']).values(status='pending' if retry else 'failed', error=message,
            available_at=now + min(30000, 1000*2**job['attempts']), finished_at=None if retry else now_iso()))
        c.execute(update(t.cases).where(t.cases.c.id == job['encounter_id']).values(scoring_status='pending' if retry else 'error', scoring_error=message,
            errors=dump({str(h): message for h in json.loads(job['input_json'])['hours']})))
        c.execute(update(t.scoring_jobs).where(t.scoring_jobs.c.encounter_id == job['encounter_id'], t.scoring_jobs.c.revision == job['revision']).values(status='pending' if retry else 'error', error=message))

    def fail_job(self, job, message='Đã lưu dữ liệu nhưng chưa chấm được. Vui lòng thử lại hoặc liên hệ quản trị hệ thống.'):
        with self.transaction() as c:
            record = self._case(c, job['encounter_id'], lock=True)
            current = c.execute(select(t.queue).where(t.queue.c.id == job['id'])).mappings().first()
            if record and record['revision'] == job['revision'] and current and current['status'] == 'running' and current['attempt_id'] == job['attempt_id']:
                self._fail(c, dict(current), message, int(time.time()*1000))

    def record_review(self, value, user):
        with self.transaction() as c:
            # Serialize reviews of one prediction to maintain the first acknowledgement.
            stmt = select(t.predictions).where(t.predictions.c.id == value['predictionId'])
            if self.postgres:
                stmt = stmt.with_for_update()
            row = c.execute(stmt).mappings().first()
            duplicate = c.execute(select(t.reviews).where(t.reviews.c.user_id == user['id'], t.reviews.c.request_id == value['requestId'])).mappings().first()
            if duplicate:
                if (duplicate['prediction_id'],duplicate['revision'],duplicate['note'],duplicate['reviewer']) != (value['predictionId'],value['revision'],value['note'].strip(),user['displayName']):
                    raise ClinicalError('Mã thao tác đã dùng cho một ghi nhận khác.')
                return duplicate['id']
            if not row or row['active'] != 1 or row['revision'] != value['revision']:
                raise ClinicalError('Kết quả đã thay đổi hoặc không còn đủ dữ liệu. Tải lại trước khi xem xét.')
            p = json.loads(row['data'])
            if p['modelVersion'] != self.policy['model_version'] or p['threshold'] != self.policy['threshold']:
                raise ClinicalError('Chính sách mô hình đã thay đổi. Chấm lại trước khi xem xét.')
            review_id = str(uuid4())
            c.execute(insert(t.reviews).values(id=review_id, prediction_id=value['predictionId'], revision=value['revision'], user_id=user['id'],
                reviewer=user['displayName'], note=value['note'].strip(), timestamp=now_iso(), request_id=value['requestId'], provenance='authenticated'))
            c.execute(insert(t.review_order).values(event_id=review_id))
            return review_id

    def import_case(self, value):
        source = value['input']
        with self.transaction() as c:
            case_id = source['profile']['id']
            old = self._case(c, case_id, lock=True)
            if old:
                if not c.execute(select(t.imports).where(t.imports.c.encounter_id == case_id)).first():
                    raise ClinicalError('Mã hồ sơ đã có trên máy chủ; không ghi đè dữ liệu hiện tại.')
                return
            self._create(c, source['profile'])
            for i, entry in enumerate(source['entries']):
                c.execute(insert(t.entries).values(encounter_id=case_id,hour=entry['hour'],data=dump(entry)))
                c.execute(insert(t.history).values(encounter_id=case_id,revision=i+1,hour=entry['hour'],data=dump(entry),saved_at=now_iso()))
            revision = max(1, len(source['entries']))
            c.execute(update(t.cases).where(t.cases.c.id == case_id).values(revision=revision, current_hour=max([0]+[e['hour'] for e in source['entries']]),
                attempted_hours=dump(source['hours']),scoring_status='pending' if source['hours'] else 'idle'))
            c.execute(insert(t.imports).values(encounter_id=case_id,data=dump(value),imported_at=now_iso()))
            c.execute(insert(t.scoring_jobs).values(encounter_id=case_id,revision=revision,status='pending',previous_predictions='[]',created_at=now_iso(),lease_until=0))
            self._enqueue(c,self._case(c,case_id))

    def archive_reviews(self, values):
        with self.transaction() as c:
            for r in values:
                if not c.execute(select(t.legacy_reviews).where(t.legacy_reviews.c.prediction_id == r['predictionId'])).first():
                    c.execute(insert(t.legacy_reviews).values(prediction_id=r['predictionId'],data=dump(r),imported_at=now_iso()))
