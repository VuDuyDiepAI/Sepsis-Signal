import { afterEach,it,expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ClinicalDatabase } from "../src/lib/server/clinical-db";
import { migrateDatabase,migrations } from "../src/lib/server/migrations";
import { scoreSavedCase } from "../src/lib/server/score-saved-case";
import { dataset,reviewFor } from "../src/lib/clinical-data";
import type { ManualEntry,ManualProfile } from "../src/lib/manual-schema";
const profile:ManualProfile={id:"HS-1234ABCD",t0:"2026-11-20T08:00",age:55,sex:"M",height:null,weight:null,comorbidities:{}};
const entry:ManualEntry={hour:1,measuredAt:"2026-11-20T09:00",availableAt:"2026-11-20T09:00",collectedAt:"2026-11-20T09:00",labAvailableAt:"2026-11-20T09:00",department:"ED",vitals:null,labs:{},symptoms:null};
const result={predictions:[{hour:1,score:0.9,threshold:dataset.models.sepsis.threshold,modelVersion:dataset.models.sepsis.model_version,department:"ED" as const,availableFeatures:20,featureHash:"hash-a"}],errors:{}};
let db:ClinicalDatabase|undefined;const dirs:string[]=[];
afterEach(()=>{db?.close();db=undefined;for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function temporaryFile() {const dir=mkdtempSync(path.join(tmpdir(),"sepsis-hardening-"));dirs.push(dir);return path.join(dir,"web.sqlite3");}
it("preserves inputs across Python failure/restart and later retries the saved revision",async()=>{
  const file=temporaryFile();db=new ClinicalDatabase(file);db.create(profile);
  const prior=db.saveEntry(profile.id,0,entry,result).predictions[0];
  db.recordReview(prior.id,prior.revision,"Bác sĩ A","");
  const saved=db.saveInput(profile.id,1,{...entry,labs:{CRP:200}});
  expect(saved.predictions).toEqual([]);
  await scoreSavedCase(db,saved,async()=>{throw new Error("Python timeout");});
  expect(db.getCase(profile.id)?.entries[0].labs.CRP).toBe(200);
  expect(db.getCase(profile.id)?.scoringStatus).toBe("error");
  db.close();db=new ClinicalDatabase(file);
  const current=db.getCase(profile.id)!;
  await scoreSavedCase(db,current,async()=>({...result,predictions:[{...result.predictions[0],featureHash:"hash-b"}]}));
  const fresh=db.getCase(profile.id)!.predictions[0];
  expect(fresh.revision).toBe(current.revision);
  expect(reviewFor(fresh,db.snapshot().reviews)).toBeUndefined();
  expect(db.snapshot().reviewHistory?.some(r=>r.predictionId===prior.id)).toBe(true);
});
it("rejects scores from a superseded input revision and from an expired scoring attempt",()=>{
  db=new ClinicalDatabase(":memory:");db.create(profile);
  const a=db.saveInput(profile.id,0,entry),token=db.startScoring(profile.id,a.revision,1000);
  expect(token).toBeTruthy();
  const b=db.saveInput(profile.id,a.revision,{...entry,labs:{CRP:200}});
  expect(db.finishScoring(profile.id,a.revision,result,token as string)).toBe(false);
  const first=db.startScoring(profile.id,b.revision,1000) as string;
  expect(db.startScoring(profile.id,b.revision,59999)).toBe(false);
  const retry=db.startScoring(profile.id,b.revision,61001) as string;
  expect(retry).not.toBe(first);
  expect(db.finishScoring(profile.id,b.revision,result,first)).toBe(false);
  db.failScoring(profile.id,b.revision,"Late worker error",first);
  expect(db.finishScoring(profile.id,b.revision,result,retry)).toBe(true);
  expect(db.getCase(profile.id)?.scoringStatus).toBe("ready");
});
it("creates new immutable fixture identities when the same input ID changes content or source data",()=>{
  const file=temporaryFile(),source=structuredClone(dataset);db=new ClinicalDatabase(file,source);
  const original=db.snapshot().fixturePredictions![0];
  db.recordReview(original.id,original.revision,"Bác sĩ A","Old result");db.close();
  source.predictions[0].score=0.99;
  db=new ClinicalDatabase(file,source);
  const changed=db.snapshot().fixturePredictions!.find(p=>p.encounterId===source.predictions[0].encounterId&&p.hour===source.predictions[0].hour)!;
  expect(changed.id).not.toBe(original.id);
  expect(reviewFor(changed,db.snapshot().reviews)).toBeUndefined();
  expect(db.snapshot().reviews[original.id].prediction?.score).toBe(original.score);
  db.close();source.provenance.sourceSha256="corrected-input";
  db=new ClinicalDatabase(file,source);
  expect(db.snapshot().fixturePredictions!.find(p=>p.encounterId===changed.encounterId&&p.hour===changed.hour)?.id).not.toBe(changed.id);
});
it("migrates a v1 database without losing inputs, predictions or original review timestamps",()=>{
  const file=temporaryFile(),old=new DatabaseSync(file),now="2026-01-01T00:00:00.000Z";
  old.exec(migrations[0].sql);old.exec("PRAGMA user_version=1");
  old.prepare("INSERT INTO manual_cases VALUES(?,?,1,1,'[1]','{}',?,?)").run(profile.id,JSON.stringify(profile),now,now);
  old.prepare("INSERT INTO manual_entries VALUES(?,?,?)").run(profile.id,1,JSON.stringify(entry));
  const p={...result.predictions[0],id:`${profile.id}:1:1`,encounterId:profile.id,revision:1,timestamp:now};
  old.prepare("INSERT INTO predictions VALUES(?,?,?,?,1,'manual',?,?)").run(p.id,profile.id,1,1,JSON.stringify(p),now);
  old.prepare("INSERT INTO reviews VALUES(?,1,'Original reviewer','Original note',?)").run(p.id,now);old.close();
  db=new ClinicalDatabase(file);
  expect(db.db.prepare("PRAGMA user_version").get()?.user_version).toBe(2);
  expect(db.getCase(profile.id)?.entries).toEqual([entry]);
  expect(db.snapshot().reviews[p.id]).toMatchObject({timestamp:now,reviewer:"Original reviewer",provenance:"legacy-v1"});
  expect(db.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("rolls back the whole migration and leaves user_version unchanged on failure",()=>{
  const sqlite=new DatabaseSync(":memory:");
  try {
    expect(()=>migrateDatabase(sqlite,[migrations[0],{version:2,sql:"CREATE TABLE migration_marker(x INTEGER); INSERT INTO missing_table VALUES(1);"}])).toThrow();
    expect(sqlite.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
  } finally {sqlite.close();}
});
