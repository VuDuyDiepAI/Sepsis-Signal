import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { dataset, timeAt } from "../clinical-data";
import type { Prediction, Review } from "../clinical-types";
import type { ManualCase, ClinicalSnapshot, ScoreResponse, ManualPrediction } from "../manual-types";
import type { ManualEntry, ManualProfile } from "../manual-schema";

export class ClinicalError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
/** A single local server owns this file. Clinical observations and audit records never expire with a browser tab. */
export class ClinicalDatabase {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version);
    if (version > 1 || (version === 0 && this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get())) {
      this.db.close();
      throw new ClinicalError("File cơ sở dữ liệu không đúng schema web. Chọn một file SEPSIS_WEB_DB riêng.",503);
    }
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      PRAGMA foreign_keys=ON;
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
      PRAGMA user_version=1;
    `);
    this.transaction(() => {
      // Superseded fixture versions stay available for audit, never as current results.
      this.db.prepare("UPDATE predictions SET active=0 WHERE source='fixture'").run();
      const seed = this.db.prepare(`INSERT INTO predictions
        (id,encounter_id,hour,revision,active,source,data,created_at) VALUES(?,?,?,?,1,'fixture',?,?)
        ON CONFLICT(id) DO UPDATE SET active=1`);
      for (const p of dataset.predictions) seed.run(p.id,p.encounterId,p.hour,p.revision,JSON.stringify(p),new Date().toISOString());
    });
  }
  close() { this.db.close(); }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  getCase(id: string): ManualCase | undefined {
    const row = this.db.prepare("SELECT * FROM manual_cases WHERE id=?").get(id);
    if (!row) return;
    return {
      profile: JSON.parse(String(row.profile)), revision: Number(row.revision),
      currentHour: Number(row.current_hour), attemptedHours: JSON.parse(String(row.attempted_hours)),
      errors: JSON.parse(String(row.errors)),
      entries: this.db.prepare("SELECT data FROM manual_entries WHERE encounter_id=? ORDER BY hour").all(id).map(r => JSON.parse(String(r.data))),
      predictions: this.db.prepare("SELECT data FROM predictions WHERE encounter_id=? AND active=1 ORDER BY hour").all(id).map(r => JSON.parse(String(r.data))),
    };
  }
  snapshot(): ClinicalSnapshot {
    const reviews: Record<string, Review> = {};
    for (const row of this.db.prepare("SELECT data FROM legacy_reviews").all()) {
      const r: Review = JSON.parse(String(row.data));
      const [encounterId,hour] = r.predictionId.split(":");
      reviews[`legacy:${r.predictionId}`] = {...r,localOnly:false,encounterId,hour:Number(hour),note:`Bản ghi từ phiên trình duyệt cũ. ${r.note}`};
    }
    for (const r of this.db.prepare(`SELECT r.*,p.data FROM reviews r JOIN predictions p ON p.id=r.prediction_id ORDER BY r.timestamp`).all()) {
      const prediction: Prediction = JSON.parse(String(r.data));
      reviews[String(r.prediction_id)] = {
        predictionId: String(r.prediction_id), revision: Number(r.revision), reviewer: String(r.reviewer),
        timestamp: String(r.timestamp), note: String(r.note), localOnly: false,
        encounterId: prediction.encounterId, hour: prediction.hour, prediction,
      };
    }
    return {
      cases: this.db.prepare("SELECT id FROM manual_cases ORDER BY created_at DESC,id").all().map(r => this.getCase(String(r.id))!),
      reviews,
    };
  }
  create(profile: ManualProfile): ManualCase {
    if (this.getCase(profile.id)) throw new ClinicalError("Mã hồ sơ đã tồn tại.");
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO manual_cases VALUES(?,?,0,0,'[]','{}',?,?)`).run(profile.id,JSON.stringify(profile),now,now);
    return this.getCase(profile.id)!;
  }
  importCase(profile: ManualProfile, entries: ManualEntry[], hours: number[], response: ScoreResponse, original: unknown) {
    return this.transaction(() => {
      const existing = this.getCase(profile.id);
      if (existing) {
        if (!this.db.prepare("SELECT encounter_id FROM legacy_imports WHERE encounter_id=?").get(profile.id))
          throw new ClinicalError("Mã hồ sơ đã có trên máy chủ; không ghi đè dữ liệu hiện tại.");
        return existing;
      }
      this.create(profile);
      const now = new Date().toISOString(), revision = Math.max(1,entries.length);
      entries.forEach((entry,i) => {
        this.db.prepare("INSERT INTO manual_entries VALUES(?,?,?)").run(profile.id,entry.hour,JSON.stringify(entry));
        this.db.prepare("INSERT INTO entry_history VALUES(?,?,?,?,?)").run(profile.id,i+1,entry.hour,JSON.stringify(entry),now);
      });
      for (const p of response.predictions) {
        const next: ManualPrediction = {...p,encounterId:profile.id,timestamp:timeAt(profile.t0+"+07:00",p.hour),revision,id:`${profile.id}:${p.hour}:${revision}`};
        this.db.prepare("INSERT INTO predictions VALUES(?,?,?,?,1,'manual',?,?)").run(next.id,profile.id,next.hour,revision,JSON.stringify(next),now);
      }
      this.db.prepare("UPDATE manual_cases SET revision=?,current_hour=?,attempted_hours=?,errors=? WHERE id=?").run(revision,Math.max(0,...entries.map(e=>e.hour)),JSON.stringify(hours),JSON.stringify(response.errors),profile.id);
      this.db.prepare("INSERT INTO legacy_imports VALUES(?,?,?)").run(profile.id,JSON.stringify(original),now);
      return this.getCase(profile.id)!;
    });
  }
  /** Python runs before this transaction. Compare-and-swap rejects stale writes without partial entry/result saves. */
  saveEntry(id: string, expectedRevision: number, entry: ManualEntry, response: ScoreResponse) {
    return this.transaction(() => {
      const c = this.getCase(id);
      if (!c) throw new ClinicalError("Không tìm thấy hồ sơ.",404);
      if (c.revision !== expectedRevision) throw new ClinicalError("Hồ sơ đã thay đổi ở tab khác. Tải lại dữ liệu trước khi lưu.");
      const revision = c.revision + 1, now = new Date().toISOString();
      this.db.prepare(`INSERT INTO manual_entries VALUES(?,?,?) ON CONFLICT(encounter_id,hour) DO UPDATE SET data=excluded.data`).run(id,entry.hour,JSON.stringify(entry));
      this.db.prepare("INSERT INTO entry_history VALUES(?,?,?,?,?)").run(id,revision,entry.hour,JSON.stringify(entry),now);
      this.db.prepare("UPDATE predictions SET active=0 WHERE encounter_id=?").run(id);
      for (const p of response.predictions) {
        const old = c.predictions.find(q => q.hour === p.hour);
        const unchanged = old && old.featureHash === p.featureHash && old.modelVersion === p.modelVersion && old.threshold === p.threshold && old.score === p.score;
        if (unchanged) {
          this.db.prepare("UPDATE predictions SET active=1 WHERE id=?").run(old.id);
        } else {
          const next: ManualPrediction = { ...p, encounterId:id, timestamp:timeAt(c.profile.t0+"+07:00",p.hour), revision, id:`${id}:${p.hour}:${revision}` };
          this.db.prepare("INSERT INTO predictions VALUES(?,?,?,?,1,'manual',?,?)").run(next.id,id,next.hour,next.revision,JSON.stringify(next),now);
        }
      }
      const hours = [...new Set([...c.attemptedHours,...(entry.hour > 0 ? [entry.hour] : [])])];
      this.db.prepare("UPDATE manual_cases SET revision=?,current_hour=?,attempted_hours=?,errors=?,updated_at=? WHERE id=?").run(revision,Math.max(c.currentHour,entry.hour),JSON.stringify(hours),JSON.stringify(response.errors),now,id);
      return this.getCase(id)!;
    });
  }
  recordReview(predictionId: string, revision: number, reviewer: string, note: string) {
    this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM predictions WHERE id=? AND active=1 AND revision=?").get(predictionId,revision);
      if (!row) throw new ClinicalError("Kết quả đã thay đổi hoặc không còn đủ dữ liệu. Tải lại trước khi xem xét.");
      const p: Prediction = JSON.parse(String(row.data));
      if (p.modelVersion !== dataset.models.sepsis.model_version || p.threshold !== dataset.models.sepsis.threshold)
        throw new ClinicalError("Chính sách mô hình đã thay đổi. Chấm lại trước khi xem xét.");
      // A retry is idempotent; another person's earlier review is never overwritten.
      this.db.prepare("INSERT OR IGNORE INTO reviews VALUES(?,?,?,?,?)").run(predictionId,revision,reviewer,note,new Date().toISOString());
    });
  }
  archiveLegacyReviews(reviews: Review[]) {
    for (const r of reviews) {
      this.db.prepare("INSERT OR IGNORE INTO legacy_reviews VALUES(?,?,?)").run(r.predictionId,JSON.stringify(r),new Date().toISOString());
      const row = this.db.prepare("SELECT data FROM predictions WHERE id=? AND revision=? AND active=1 AND source='fixture'").get(r.predictionId,r.revision);
      const p: Prediction | undefined = row ? JSON.parse(String(row.data)) : undefined;
      if (p && p.modelVersion === dataset.models.sepsis.model_version && p.threshold === dataset.models.sepsis.threshold)
        this.recordReview(p.id,p.revision,r.reviewer,`Chuyển từ phiên cũ (${r.timestamp}). ${r.note}`.slice(0,1000));
    }
  }
}
const globalDb = globalThis as typeof globalThis & { sepsisClinicalDb?: ClinicalDatabase };
export function clinicalDb() {
  return globalDb.sepsisClinicalDb ??= new ClinicalDatabase(
    process.env.SEPSIS_WEB_DB ?? path.resolve(process.cwd(),"../data/frontend_clinical.sqlite3"),
  );
}
