
ALTER TABLE manual_cases ADD COLUMN scoring_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE manual_cases ADD COLUMN scoring_error TEXT;
ALTER TABLE entry_history ADD COLUMN actor_id TEXT;
UPDATE manual_cases SET scoring_status='ready' WHERE EXISTS
 (SELECT 1 FROM predictions WHERE encounter_id=manual_cases.id AND active=1 AND source='manual');
CREATE TABLE scoring_jobs (
 encounter_id TEXT NOT NULL REFERENCES manual_cases(id), revision INTEGER NOT NULL,
 status TEXT NOT NULL, previous_predictions TEXT NOT NULL, error TEXT,
 created_at TEXT NOT NULL, finished_at TEXT, lease_until INTEGER NOT NULL DEFAULT 0, attempt_id TEXT, PRIMARY KEY(encounter_id,revision)
) STRICT;
CREATE TABLE auth_users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','doctor','viewer')),
 is_demo INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id),
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX session_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_attempts (username TEXT PRIMARY KEY, failures INTEGER NOT NULL, locked_until INTEGER NOT NULL) STRICT;
CREATE TABLE review_events (
 id TEXT PRIMARY KEY, prediction_id TEXT NOT NULL REFERENCES predictions(id), revision INTEGER NOT NULL,
 user_id TEXT, reviewer TEXT NOT NULL, note TEXT NOT NULL, timestamp TEXT NOT NULL,
 request_id TEXT NOT NULL, provenance TEXT NOT NULL, UNIQUE(user_id,request_id)
) STRICT;
INSERT INTO review_events
 SELECT 'v1:'||prediction_id,prediction_id,revision,NULL,reviewer,note,timestamp,'v1:'||prediction_id,'legacy-v1'
 FROM reviews;
DROP TABLE reviews;
CREATE INDEX review_prediction ON review_events(prediction_id,timestamp);
