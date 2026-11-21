      CREATE TABLE IF NOT EXISTS manual_cases (
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
