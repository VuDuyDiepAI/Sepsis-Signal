import { createHash,randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { migrateDatabase } from "./migrations";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { dataset, timeAt } from "../clinical-data";
import type { Prediction, Review, ClinicalDataset } from "../clinical-types";
import type { ManualCase, ClinicalSnapshot, ScoreResponse, ManualPrediction } from "../manual-types";
import type { ManualEntry, ManualProfile } from "../manual-schema";

export class ClinicalError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
/** A single local server owns this file. Clinical observations and audit records never expire with a browser tab. */
export class ClinicalDatabase {
  readonly db: DatabaseSync;
  constructor(filename: string, private source: ClinicalDataset = dataset) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    try {
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
      migrateDatabase(this.db);
      this.syncFixtures();
    } catch (error) { this.db.close(); throw error; }
  }
  private syncFixtures() {
    this.transaction(() => {
      this.db.prepare("UPDATE predictions SET active=0 WHERE source='fixture'").run();
      for (const original of this.source.predictions) {
        const {id: sourceId, ...payload} = original;
        const stablePayload=Object.fromEntries(Object.entries(payload).sort(([a],[b])=>a.localeCompare(b)));
        const hash = createHash("sha256").update(JSON.stringify({sourceId,payload:stablePayload,source:this.source.provenance.sourceSha256})).digest("hex");
        const p = {...payload,id:`${original.encounterId}:${original.hour}:${original.revision}:f-${hash}`};
        const existing = this.db.prepare("SELECT data FROM predictions WHERE id=?").get(p.id);
        if (existing && !isDeepStrictEqual(JSON.parse(String(existing.data)),p)) throw new Error("Immutable prediction identity conflict");
        this.db.prepare(`INSERT INTO predictions (id,encounter_id,hour,revision,active,source,data,created_at)
          VALUES(?,?,?,?,1,'fixture',?,?) ON CONFLICT(id) DO UPDATE SET active=1`)
          .run(p.id,p.encounterId,p.hour,p.revision,JSON.stringify(p),new Date().toISOString());
      }
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
      scoringStatus: String(row.scoring_status) as ManualCase["scoringStatus"],
      scoringError: row.scoring_error ? String(row.scoring_error) : undefined,
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
    const reviewHistory: Review[] = Object.values(reviews);
    for (const r of this.db.prepare(`SELECT r.*,p.data FROM review_events r JOIN predictions p ON p.id=r.prediction_id ORDER BY r.timestamp,r.rowid`).all()) {
      const prediction: Prediction = JSON.parse(String(r.data));
      const review: Review = {
        id:String(r.id),reviewerId:r.user_id ? String(r.user_id) : undefined,
        provenance:String(r.provenance),predictionId:String(r.prediction_id),revision:Number(r.revision),
        reviewer:String(r.reviewer),timestamp:String(r.timestamp),note:String(r.note),localOnly:false,
        encounterId:prediction.encounterId,hour:prediction.hour,prediction,
      };
      // The first acknowledgement drives queue status; all subsequent evaluations stay in history.
      reviews[review.predictionId] ??= review;
      reviewHistory.push(review);
    }
    return {
      cases:this.db.prepare("SELECT id FROM manual_cases ORDER BY created_at DESC,id").all().map(r=>this.getCase(String(r.id))!),
      fixturePredictions:this.db.prepare("SELECT data FROM predictions WHERE source='fixture' AND active=1 ORDER BY encounter_id,hour").all().map(r=>JSON.parse(String(r.data))),
      reviews,reviewHistory,
    };
  }
  create(profile: ManualProfile): ManualCase {
    if (this.getCase(profile.id)) throw new ClinicalError("Mã hồ sơ đã tồn tại.");
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO manual_cases (id,profile,revision,current_hour,attempted_hours,errors,created_at,updated_at) VALUES(?,?,0,0,'[]','{}',?,?)`).run(profile.id,JSON.stringify(profile),now,now);
    return this.getCase(profile.id)!;
  }
  importCase(profile: ManualProfile, entries: ManualEntry[], hours: number[], original: unknown) {
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
        this.db.prepare("INSERT INTO entry_history (encounter_id,revision,hour,data,saved_at) VALUES(?,?,?,?,?)").run(profile.id,i+1,entry.hour,JSON.stringify(entry),now);
      });
      const errors=Object.fromEntries(hours.map(h=>[h,"Đã chuyển dữ liệu lên máy chủ, chờ chấm lại."]));
      this.db.prepare("UPDATE manual_cases SET revision=?,current_hour=?,attempted_hours=?,errors=? WHERE id=?").run(revision,Math.max(0,...entries.map(e=>e.hour)),JSON.stringify(hours),JSON.stringify(errors),profile.id);
      this.db.prepare("INSERT INTO legacy_imports VALUES(?,?,?)").run(profile.id,JSON.stringify(original),now);
      this.db.prepare("INSERT INTO scoring_jobs (encounter_id,revision,status,previous_predictions,error,created_at,finished_at) VALUES(?,?,'pending','[]',NULL,?,NULL)").run(profile.id,revision,now);
      this.db.prepare("UPDATE manual_cases SET scoring_status='pending' WHERE id=?").run(profile.id);
      return this.getCase(profile.id)!;
    });
  }
  /** Persist observations first. Pending predictions are never shown as current. */
  saveInput(id: string, expectedRevision: number, entry: ManualEntry, actorId?: string) {
    return this.transaction(() => {
      const c=this.getCase(id);
      if (!c) throw new ClinicalError("Không tìm thấy hồ sơ.",404);
      if (c.revision !== expectedRevision) throw new ClinicalError("Hồ sơ đã thay đổi ở tab khác. Tải lại dữ liệu trước khi lưu.");
      const revision=c.revision+1, now=new Date().toISOString();
      const hours=[...new Set([...c.attemptedHours,...(entry.hour>0?[entry.hour]:[])])];
      this.db.prepare(`INSERT INTO manual_entries VALUES(?,?,?) ON CONFLICT(encounter_id,hour) DO UPDATE SET data=excluded.data`).run(id,entry.hour,JSON.stringify(entry));
      this.db.prepare("INSERT INTO entry_history VALUES(?,?,?,?,?,?)").run(id,revision,entry.hour,JSON.stringify(entry),now,actorId??null);
      this.db.prepare("UPDATE scoring_jobs SET status='superseded',finished_at=? WHERE encounter_id=? AND status IN ('pending','running','error')").run(now,id);
      this.db.prepare("INSERT INTO scoring_jobs (encounter_id,revision,status,previous_predictions,error,created_at,finished_at) VALUES(?,?,?,?,NULL,?,NULL)").run(id,revision,hours.length?"pending":"complete",JSON.stringify(c.predictions),now);
      this.db.prepare("UPDATE predictions SET active=0 WHERE encounter_id=? AND source='manual'").run(id);
      const errors=Object.fromEntries(hours.map(h=>[h,"Đã lưu dữ liệu, đang chờ chấm lại."]));
      this.db.prepare("UPDATE manual_cases SET revision=?,current_hour=?,attempted_hours=?,errors=?,updated_at=?,scoring_status=?,scoring_error=NULL WHERE id=?")
        .run(revision,Math.max(c.currentHour,entry.hour),JSON.stringify(hours),JSON.stringify(errors),now,hours.length?"pending":"idle",id);
      return this.getCase(id)!;
    });
  }
  startScoring(id: string, revision: number, now=Date.now()) {
    return this.transaction(() => {
      const c=this.getCase(id);
      if (!c || c.revision!==revision) throw new ClinicalError("Dữ liệu đã thay đổi. Tải lại hồ sơ trước khi chấm.");
      const job=this.db.prepare("SELECT * FROM scoring_jobs WHERE encounter_id=? AND revision=?").get(id,revision);
      if (!job || job.status==='complete' || job.status==='superseded' || (job.status==='running' && Number(job.lease_until)>now)) return false;
      const attemptId=randomUUID();
      this.db.prepare("UPDATE scoring_jobs SET status='running',error=NULL,lease_until=?,attempt_id=? WHERE encounter_id=? AND revision=?").run(now+60000,attemptId,id,revision);
      this.db.prepare("UPDATE manual_cases SET scoring_status='running',scoring_error=NULL WHERE id=?").run(id);
      return attemptId;
    });
  }
  finishScoring(id: string, revision: number, response: ScoreResponse, attemptId: string) {
    return this.transaction(() => {
      const c=this.getCase(id);
      if (!c || c.revision!==revision) return false;
      const job=this.db.prepare("SELECT * FROM scoring_jobs WHERE encounter_id=? AND revision=?").get(id,revision);
      if (!job || job.status!=='running' || job.attempt_id!==attemptId) return false;
      const previous: ManualPrediction[]=JSON.parse(String(job.previous_predictions));
      this.db.prepare("UPDATE predictions SET active=0 WHERE encounter_id=? AND source='manual'").run(id);
      for (const p of response.predictions) {
        const old=previous.find(q=>q.hour===p.hour);
        const unchanged=old && old.featureHash===p.featureHash && old.modelVersion===p.modelVersion && old.threshold===p.threshold && old.score===p.score && old.department===p.department && old.availableFeatures===p.availableFeatures;
        if (unchanged) this.db.prepare("UPDATE predictions SET active=1 WHERE id=?").run(old.id);
        else {
          const next: ManualPrediction={...p,encounterId:id,timestamp:timeAt(c.profile.t0+"+07:00",p.hour),revision,id:`${id}:${p.hour}:${revision}`};
          this.db.prepare("INSERT INTO predictions VALUES(?,?,?,?,1,'manual',?,?)").run(next.id,id,next.hour,revision,JSON.stringify(next),new Date().toISOString());
        }
      }
      this.db.prepare("UPDATE manual_cases SET errors=?,scoring_status='ready',scoring_error=NULL WHERE id=?").run(JSON.stringify(response.errors),id);
      this.db.prepare("UPDATE scoring_jobs SET status='complete',error=NULL,finished_at=? WHERE encounter_id=? AND revision=?").run(new Date().toISOString(),id,revision);
      return true;
    });
  }
  failScoring(id: string, revision: number, message: string, attemptId?:string) {
    this.transaction(() => {
      const c=this.getCase(id);
      if (!c || c.revision!==revision) return;
      const job=this.db.prepare("SELECT * FROM scoring_jobs WHERE encounter_id=? AND revision=?").get(id,revision);
      if(!job || job.status==='complete' || job.status==='superseded' || (attemptId && job.attempt_id!==attemptId))return;
      const errors=Object.fromEntries(c.attemptedHours.map(h=>[h,message]));
      this.db.prepare("UPDATE scoring_jobs SET status='error',error=?,finished_at=? WHERE encounter_id=? AND revision=? AND status!='complete'").run(message,new Date().toISOString(),id,revision);
      this.db.prepare("UPDATE manual_cases SET errors=?,scoring_status='error',scoring_error=? WHERE id=?").run(JSON.stringify(errors),message,id);
    });
  }
  // Synchronous composition for offline adapters. HTTP uses the two persistence phases separately.
  saveEntry(id: string, revision: number, entry: ManualEntry, response: ScoreResponse) {
    const c=this.saveInput(id,revision,entry);
    const attempt=this.startScoring(id,c.revision); if(attempt)this.finishScoring(id,c.revision,response,attempt);
    return this.getCase(id)!;
  }
  recordReview(predictionId: string, revision: number, reviewer: string, note: string, requestId:string=randomUUID(), userId?: string) {
    return this.transaction(() => {
      const duplicate=this.db.prepare("SELECT * FROM review_events WHERE user_id IS ? AND request_id=?").get(userId??null,requestId);
      if (duplicate) {
        if (duplicate.prediction_id!==predictionId || duplicate.revision!==revision || duplicate.note!==note || duplicate.reviewer!==reviewer)
          throw new ClinicalError("Mã thao tác đã dùng cho một ghi nhận khác.");
        return String(duplicate.id);
      }
      const row=this.db.prepare("SELECT * FROM predictions WHERE id=? AND active=1 AND revision=?").get(predictionId,revision);
      if (!row) throw new ClinicalError("Kết quả đã thay đổi hoặc không còn đủ dữ liệu. Tải lại trước khi xem xét.");
      const p: Prediction=JSON.parse(String(row.data));
      if (p.modelVersion!==this.source.models.sepsis.model_version || p.threshold!==this.source.models.sepsis.threshold)
        throw new ClinicalError("Chính sách mô hình đã thay đổi. Chấm lại trước khi xem xét.");
      const id=randomUUID();
      this.db.prepare("INSERT INTO review_events VALUES(?,?,?,?,?,?,?,?,?)")
        .run(id,predictionId,revision,userId??null,reviewer,note,new Date().toISOString(),requestId,userId?'authenticated':'offline');
      return id;
    });
  }
  archiveLegacyReviews(reviews: Review[]) {
    for (const r of reviews) {
      this.db.prepare("INSERT OR IGNORE INTO legacy_reviews VALUES(?,?,?)").run(r.predictionId,JSON.stringify(r),new Date().toISOString());
      // Imported self-entered names are archived; they do not impersonate authenticated acknowledgements.
    }
  }
}
const globalDb = globalThis as typeof globalThis & { sepsisClinicalDb?: ClinicalDatabase };
export function clinicalDb() {
  return globalDb.sepsisClinicalDb ??= new ClinicalDatabase(
    process.env.SEPSIS_WEB_DB ?? path.resolve(process.cwd(),"../data/frontend_clinical.sqlite3"),
  );
}
