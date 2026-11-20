import type { DatabaseSync } from "node:sqlite";
export const schemaVersion = 2;
export const migrations = [
  {version:1,sql:`      CREATE TABLE IF NOT EXISTS manual_cases (
        id TEXT PRIMARY KEY, profile TEXT NOT NULL, revision INTEGER NOT NULL,
        current_hour INTEGER NOT NULL, attempted_hours TEXT NOT NULL, errors TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS manual_entries (
        encounter_id TEXT NOT NULL REFERENCES manual_cases(id), hour INTEGER NOT NULL,
        data TEXT NOT NULL, PRIMARY KEY(encounter_id,hour)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL, hour INTEGER NOT NULL,
        revision INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
        source TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS prediction_encounter ON predictions(encounter_id,active,hour);
      CREATE UNIQUE INDEX IF NOT EXISTS manual_prediction_version ON predictions(encounter_id,hour,revision) WHERE source='manual';
      CREATE TABLE IF NOT EXISTS reviews (
        prediction_id TEXT PRIMARY KEY REFERENCES predictions(id), revision INTEGER NOT NULL,
        reviewer TEXT NOT NULL, note TEXT NOT NULL, timestamp TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS entry_history (
        encounter_id TEXT NOT NULL REFERENCES manual_cases(id), revision INTEGER NOT NULL,
        hour INTEGER NOT NULL, data TEXT NOT NULL, saved_at TEXT NOT NULL,
        PRIMARY KEY(encounter_id,revision)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS legacy_imports (
        encounter_id TEXT PRIMARY KEY REFERENCES manual_cases(id), data TEXT NOT NULL, imported_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS legacy_reviews (
        prediction_id TEXT PRIMARY KEY, data TEXT NOT NULL, imported_at TEXT NOT NULL
      ) STRICT;
`},
  {version:2,sql:`
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
`},
] as const;
/** Lock and migrate atomically. A failed migration never advances user_version. */
export function migrateDatabase(db: DatabaseSync, steps: readonly {version:number; sql:string}[] = migrations) {
  db.exec("BEGIN IMMEDIATE");
  try {
    let current = Number(db.prepare("PRAGMA user_version").get()?.user_version);
    if (current > schemaVersion) throw new Error("Database schema is newer than this application");
    if (current === 0 && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get())
      throw new Error("Unrecognized database; use a separate SEPSIS_WEB_DB file");
    for (const step of steps) if (step.version > current) {
      if (step.version !== current+1) throw new Error("Missing database migration");
      db.exec(step.sql);
      db.exec(`PRAGMA user_version=${step.version}`);
      current = step.version;
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
