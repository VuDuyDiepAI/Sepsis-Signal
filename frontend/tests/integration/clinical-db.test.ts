import { afterEach,describe,it,expect } from "vitest";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ClinicalDatabase } from "@/lib/server/clinical-db";
import { dataset,reviewFor } from "@/lib/clinical/data";
import { mergeManualCases } from "@/lib/client/manual-store";
import type { ManualEntry,ManualProfile } from "@/lib/clinical/manual-schema";
const profile: ManualProfile = {id:"HS-ABCD1234",t0:"2026-11-20T08:00",age:55,sex:"F",height:null,weight:null,comorbidities:{}};
const entry: ManualEntry = {hour:1,measuredAt:"2026-11-20T09:00",availableAt:"2026-11-20T09:00",collectedAt:"2026-11-20T09:00",labAvailableAt:"2026-11-20T09:00",department:"ED",vitals:null,labs:{},symptoms:null};
const result = {predictions:[{hour:1,score:0.8,threshold:dataset.models.sepsis.threshold,modelVersion:dataset.models.sepsis.model_version,department:"ED" as const,availableFeatures:20,featureHash:"hash-a"}],errors:{}};
let databases: ClinicalDatabase[] = [], dirs: string[] = [];
function open(filename=":memory:") { const db = new ClinicalDatabase(filename); databases.push(db); return db; }
afterEach(() => { for (const db of databases) { try { db.close(); } catch {} } databases=[]; for (const dir of dirs) rmSync(dir,{recursive:true,force:true}); dirs=[]; });
describe("durable clinical history",() => {
  it("reopens cases, observations, predictions and old reviews from disk without a browser or 8-hour expiry",() => {
    const dir = mkdtempSync(path.join(tmpdir(),"sepsis-db-")); dirs.push(dir);
    const file=path.join(dir,"clinical.sqlite3"), db=open(file);
    db.create(profile); const c=db.saveEntry(profile.id,0,entry,result), p=c.predictions[0];
    db.recordReview(p.id,p.revision,"Bác sĩ A","Đã đối chiếu");
    db.db.prepare("UPDATE review_events SET timestamp=?").run("2026-01-01T00:00:00.000Z");
    db.close(); databases=[];
    const restored=open(file), state=restored.snapshot();
    expect(state.cases[0]).toEqual(c);
    expect(reviewFor(p,state.reviews)?.reviewer).toBe("Bác sĩ A");
    expect(state.reviews[p.id].localOnly).toBe(false);
  });
  it("retains audit when a result changes, becomes unavailable, then reappears",() => {
    const db=open(); db.create(profile);
    const p=db.saveEntry(profile.id,0,entry,result).predictions[0];
    db.recordReview(p.id,p.revision,"Bác sĩ A","");
    const unchanged=db.saveEntry(profile.id,1,entry,result);
    expect(unchanged.predictions[0].id).toBe(p.id);
    const missing=db.saveEntry(profile.id,2,entry,{predictions:[],errors:{1:"Thiếu sinh hiệu"}});
    expect(missing.predictions).toEqual([]);
    expect(db.snapshot().reviews[p.id].prediction?.score).toBe(0.8);
    expect(() => db.recordReview(p.id,p.revision,"Bác sĩ B","")).toThrow(/thay đổi/);
    const fresh=db.saveEntry(profile.id,3,entry,result).predictions[0];
    expect(fresh.id).not.toBe(p.id);
    expect(reviewFor(fresh,db.snapshot().reviews)).toBeUndefined();
    expect(db.db.prepare("SELECT count(*) AS n FROM entry_history").get()?.n).toBe(4);
  });
  it("rejects competing stale saves and duplicate review retries never overwrite the first reviewer",() => {
    const db=open(); db.create(profile);
    const c=db.saveEntry(profile.id,0,entry,result),p=c.predictions[0];
    expect(() => db.saveEntry(profile.id,0,{...entry,labs:{CRP:200}},result)).toThrow(/tab khác/);
    expect(db.getCase(profile.id)).toEqual(c);
    db.recordReview(p.id,p.revision,"Bác sĩ A","Ghi chú đầu","request-a","user-a");
    db.recordReview(p.id,p.revision,"Bác sĩ A","Ghi chú đầu","request-a","user-a");
    db.recordReview(p.id,p.revision,"Bác sĩ B","Đánh giá bổ sung","request-b","user-b");
    expect(db.snapshot().reviewHistory?.filter(r=>r.predictionId===p.id)).toHaveLength(2);
    expect(()=>db.recordReview(p.id,p.revision,"Bác sĩ A","Đổi nội dung","request-a","user-a")).toThrow(/thao tác/);
    expect(db.snapshot().reviews[p.id].reviewer).toBe("Bác sĩ A");
    expect(db.snapshot().reviews[p.id].note).toBe("Ghi chú đầu");
  });
  it("rolls back observations, version and prediction status together on a write failure",() => {
    const db=open(); db.create(profile); const before=db.saveEntry(profile.id,0,entry,result);
    db.db.exec("CREATE TRIGGER fail_case_update BEFORE UPDATE ON manual_cases BEGIN SELECT RAISE(ABORT,'disk test'); END");
    expect(() => db.saveEntry(profile.id,1,{...entry,labs:{CRP:200}},{predictions:[],errors:{1:"Missing"}})).toThrow();
    expect(db.getCase(profile.id)).toEqual(before);
    expect(db.db.prepare("SELECT count(*) AS n FROM entry_history").get()?.n).toBe(1);
  });
  it("only accepts reviews for existing active predictions under the current policy",() => {
    const db=open();
    expect(() => db.recordReview("invented",1,"Bác sĩ A","")).toThrow();
    db.create(profile);
    const p=db.saveEntry(profile.id,0,entry,{...result,predictions:[{...result.predictions[0],modelVersion:"old"}]}).predictions[0];
    expect(() => db.recordReview(p.id,p.revision,"Bác sĩ A","")).toThrow(/mô hình/);
  });
  it("imports once, keeps original history and does not overwrite later server changes",() => {
    const db=open();
    const first=db.importCase(profile,[entry],[1],{original:"preserved"});
    db.saveEntry(profile.id,first.revision,{...entry,labs:{CRP:100}},result);
    const again=db.importCase(profile,[entry],[1],{original:"preserved"});
    expect(again.entries[0].labs.CRP).toBe(100);
    expect(db.db.prepare("SELECT data FROM legacy_imports").get()?.data).toContain("preserved");
  });
  it("archives obsolete browser reviews without applying them to a current prediction",() => {
    const db=open(),p=db.snapshot().fixturePredictions![0];
    const old={predictionId:`${p.encounterId}:${p.hour}:old`,revision:1,reviewer:"Bác sĩ cũ",timestamp:"2026-01-01T00:00:00.000Z",note:"Lịch sử",localOnly:true};
    db.archiveLegacyReviews([old]);
    const state=db.snapshot();
    expect(state.reviews[`legacy:${old.predictionId}`].reviewer).toBe(old.reviewer);
    expect(reviewFor(p,state.reviews)).toBeUndefined();
    db.archiveLegacyReviews([{...old,predictionId:p.id,revision:p.revision}]);
    expect(reviewFor(p,db.snapshot().reviews)).toBeUndefined();
  });
});

describe("decision-policy changes", () => {
  it("keeps input but hides obsolete results, and rescoring invalidates an old review", async () => {
    const db = open();
    const store = { createManualCase: db.create.bind(db), updateManualCase: db.saveEntry.bind(db), mergeManualCases };
    const profile: ManualProfile = {
      id: "HS-ABCDEF34",
      t0: "2026-11-20T08:00",
      age: 55,
      sex: "F",
      height: null,
      weight: null,
      comorbidities: {},
    };
    const entry: ManualEntry = {
      hour: 1,
      measuredAt: "2026-11-20T09:00",
      availableAt: "2026-11-20T09:00",
      collectedAt: "2026-11-20T09:00",
      labAvailableAt: "2026-11-20T09:00",
      department: "ED",
      vitals: null,
      labs: {},
      symptoms: null,
    };
    store.createManualCase(profile);
    const prediction = {
      hour: 1,
      score: 0.8,
      threshold: 0.02,
      modelVersion: "old-policy",
      department: "ED" as const,
      availableFeatures: 20,
      featureHash: "same-input",
    };
    store.updateManualCase(profile.id, 0, entry, {
      predictions: [prediction],
      errors: {},
    });
    const getRecord = () => db.getCase(profile.id)!;
    const before = getRecord();
    const source = store.mergeManualCases([before]);
    expect(source.encounters.some((e) => e.id === profile.id)).toBe(true);
    expect(
      source.predictions.filter((p) => p.encounterId === profile.id),
    ).toHaveLength(0);
    const fresh = {
      ...prediction,
      modelVersion: dataset.models.sepsis.model_version,
      threshold: dataset.models.sepsis.threshold,
    };
    store.updateManualCase(profile.id, 1, entry, {
      predictions: [fresh],
      errors: {},
    });
    const after = getRecord();
    expect(after.entries).toEqual(before.entries);
    expect(after.predictions[0].revision).toBeGreaterThan(
      before.predictions[0].revision,
    );
    expect(
      store
        .mergeManualCases([after])
        .predictions.find((p) => p.encounterId === profile.id)?.threshold,
    ).toBe(fresh.threshold);
    const old = before.predictions[0];
    expect(
      reviewFor(after.predictions[0], {
        [old.id]: {
          predictionId: old.id,
          revision: old.revision,
          reviewer: "Bác sĩ A",
          timestamp: new Date().toISOString(),
          note: "",
          localOnly: true,
        },
      }),
    ).toBeUndefined();
    store.updateManualCase(profile.id, 2, entry, {
      predictions: [fresh],
      errors: {},
    });
    expect(getRecord().predictions[0].revision).toBe(
      after.predictions[0].revision,
    );
  });
});

describe("evaluation metadata", () => {
  it("does not inherit reviews from fixture IDs created under the previous policy", () => {
    const p = dataset.predictions[0];
    const previousId = `${p.encounterId}:${p.hour}:1`;
    expect(p.id).not.toBe(previousId);
    expect(
      reviewFor(p, {
        [previousId]: {
          predictionId: previousId,
          revision: 1,
          reviewer: "Bác sĩ A",
          timestamp: new Date().toISOString(),
          note: "",
          localOnly: true,
        },
      }),
    ).toBeUndefined();
  });
  it("keeps episode denominators and patient bootstrap explicit", () => {
    const model = dataset.models.sepsis;
    expect(model.threshold_selection.branch).toBe("patient_episode_recall");
    expect(
      model.threshold_selection.validation_encounter_recall,
    ).toBeGreaterThanOrEqual(0.8);
    expect(model.threshold_selection.hourly_recall_constraint).toBe(false);
    for (const metrics of [
      model.validation_synthetic_metrics,
      model.temporal_holdout_synthetic_metrics,
    ]) {
      expect(metrics.alert_episodes).toBe(
        metrics.true_alert_episodes + metrics.false_alert_episodes,
      );
      expect(metrics.episode_ppv).toBeCloseTo(
        metrics.true_alert_episodes / metrics.alert_episodes,
      );
      expect(metrics.encounter_early_recall).toBeCloseTo(
        metrics.timely_alert_encounters / metrics.positive_encounters,
      );
      expect(metrics.bootstrap.unit).toBe("encounter");
      expect(metrics.bootstrap.resamples).toBe(1000);
      expect(
        metrics.confidence_intervals.episode_ppv.lower,
      ).toBeLessThanOrEqual(metrics.episode_ppv!);
      expect(
        metrics.confidence_intervals.episode_ppv.upper,
      ).toBeGreaterThanOrEqual(metrics.episode_ppv!);
    }
  });
});
