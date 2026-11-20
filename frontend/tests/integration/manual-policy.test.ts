import { describe, it, expect, vi, afterEach } from "vitest";
import { dataset, reviewFor } from "@/lib/clinical/data";
import type { ManualEntry, ManualProfile } from "@/lib/clinical/manual-schema";

import { ClinicalDatabase } from "@/lib/server/clinical-db";
import { mergeManualCases } from "@/lib/client/manual-store";
let db: ClinicalDatabase | undefined;
afterEach(() => { db?.close(); db = undefined; vi.unstubAllGlobals(); });
describe("decision-policy changes", () => {
  it("keeps input but hides obsolete results, and rescoring invalidates an old review", async () => {
    db = new ClinicalDatabase(":memory:");
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
    const getRecord = () => db!.getCase(profile.id)!;
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
