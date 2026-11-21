from sqlalchemy import MetaData, Table, Column, Text, Integer, BigInteger, ForeignKey, UniqueConstraint, Index, CheckConstraint

metadata = MetaData()


def col(name, kind=Text, **kw):
    return Column(name, kind, nullable=kw.pop('nullable', False), **kw)


cases = Table('manual_cases', metadata, col('id', primary_key=True), col('profile'), col('revision', Integer),
              col('current_hour', Integer), col('attempted_hours'), col('errors'), col('created_at'), col('updated_at'),
              col('scoring_status', server_default='idle'), col('scoring_error', nullable=True))
entries = Table('manual_entries', metadata, Column('encounter_id', Text, ForeignKey('manual_cases.id'), primary_key=True),
                col('hour', Integer, primary_key=True), col('data'))
predictions = Table('predictions', metadata, col('id', primary_key=True), col('encounter_id'), col('hour', Integer),
                    col('revision', Integer), col('active', Integer), col('source'), col('data'), col('created_at'),
                    CheckConstraint('active IN (0,1)'))
Index('prediction_encounter', predictions.c.encounter_id, predictions.c.active, predictions.c.hour)
Index('manual_prediction_version', predictions.c.encounter_id, predictions.c.hour, predictions.c.revision,
      unique=True, sqlite_where=predictions.c.source == 'manual', postgresql_where=predictions.c.source == 'manual')
history = Table('entry_history', metadata, Column('encounter_id', Text, ForeignKey('manual_cases.id'), primary_key=True),
                col('revision', Integer, primary_key=True), col('hour', Integer), col('data'), col('saved_at'), col('actor_id', nullable=True))
imports = Table('legacy_imports', metadata, Column('encounter_id', Text, ForeignKey('manual_cases.id'), primary_key=True), col('data'), col('imported_at'))
legacy_reviews = Table('legacy_reviews', metadata, col('prediction_id', primary_key=True), col('data'), col('imported_at'))
scoring_jobs = Table('scoring_jobs', metadata, Column('encounter_id', Text, ForeignKey('manual_cases.id'), primary_key=True),
                     col('revision', Integer, primary_key=True), col('status'), col('previous_predictions'), col('error', nullable=True),
                     col('created_at'), col('finished_at', nullable=True), col('lease_until', BigInteger, server_default='0'), col('attempt_id', nullable=True))
users = Table('auth_users', metadata, col('id', primary_key=True), col('username', unique=True), col('display_name'),
              col('password_hash'), col('role'), col('is_demo', Integer, server_default='0'), col('disabled', Integer, server_default='0'),
              CheckConstraint("role IN ('admin','doctor','viewer')"))
sessions = Table('auth_sessions', metadata, col('token_hash', primary_key=True), Column('user_id', Text, ForeignKey('auth_users.id'), nullable=False),
                 col('expires_at', BigInteger), col('created_at', BigInteger))
attempts = Table('auth_attempts', metadata, col('username', primary_key=True), col('failures', Integer), col('locked_until', BigInteger))
reviews = Table('review_events', metadata, col('id', primary_key=True), Column('prediction_id', Text, ForeignKey('predictions.id'), nullable=False),
                col('revision', Integer), col('user_id', nullable=True), col('reviewer'), col('note'), col('timestamp'), col('request_id'), col('provenance'),
                UniqueConstraint('user_id', 'request_id'))
review_order = Table('review_order', metadata, Column('position', Integer, primary_key=True, autoincrement=True),
                     Column('event_id', Text, ForeignKey('review_events.id'), nullable=False, unique=True))
versions = Table('schema_migrations', metadata, col('version', Integer, primary_key=True), col('applied_at'))
# This table is the transactional outbox AND durable queue. There is no separate
# broker publish that can be lost between the input commit and job submission.
queue = Table('work_jobs', metadata, col('id', primary_key=True), Column('encounter_id', Text, ForeignKey('manual_cases.id'), nullable=False),
              col('revision', Integer), col('status'), col('input_json'), col('model_version'), col('policy_hash'),
              col('attempts', Integer, server_default='0'), col('max_attempts', Integer), col('available_at', BigInteger),
              col('lease_until', BigInteger, server_default='0'), col('attempt_id', nullable=True), col('error', nullable=True),
              col('created_at'), col('finished_at', nullable=True), UniqueConstraint('encounter_id', 'revision', 'model_version', 'policy_hash'))
Index('claimable_jobs', queue.c.status, queue.c.available_at, queue.c.lease_until)
emr = Table('emr_events', metadata, col('id', primary_key=True), col('source'), col('event_id'), col('event_version', Integer),
            Column('encounter_id', Text, ForeignKey('manual_cases.id'), nullable=False), col('payload'), col('entry_json'),
            col('received_at'), col('active', Integer), UniqueConstraint('source', 'event_id', 'event_version'))
