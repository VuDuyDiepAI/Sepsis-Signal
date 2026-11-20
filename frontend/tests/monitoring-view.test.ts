import { describe, it, expect } from "vitest";
import {
  createClinicalReader,
  dataset,
  timeAt,
} from "../src/lib/clinical-data";
import { alertQueue, observationChanges } from "../src/lib/monitoring-view";
import { patientHref, safeReturnTo } from "../src/lib/clinical-navigation";
import type {
  ClinicalDataset,
  Prediction,
  Review,
  VitalObservation,
} from "../src/lib/clinical-types";
const t0 = "2026-11-20T08:00:00+07:00",
  id = "E0009";
const p = (hour: number, revision = 1): Prediction => ({
  id: `${id}:${hour}:${revision}`,
  encounterId: id,
  hour,
  timestamp: timeAt(t0, hour),
  score: 0.8,
  threshold: 0.1,
  revision,
  modelVersion: "test",
  department: "ED",
  availableFeatures: 20,
});
function source(): ClinicalDataset {
  return {
    ...dataset,
    encounters: [{ id, t0, age: 55, sex: "F", currentHour: 2 }],
    predictions: [p(1), p(2), p(3)],
    vitals: [],
    labs: [],
    locations: [],
  };
}
const review = (prediction: Prediction): Review => ({
  predictionId: prediction.id,
  revision: prediction.revision,
  reviewer: "Test doctor",
  timestamp: new Date().toISOString(),
  note: "",
  localOnly: true,
});
describe("one monitoring queue", () => {
  it("partitions current and historical alerts, excluding future snapshots", () => {
    const reader = createClinicalReader(source());
    expect(
      alertQueue(reader, {}, "current").map((r) => r.prediction.hour),
    ).toEqual([2]);
    expect(
      alertQueue(reader, {}, "history").map((r) => r.prediction.hour),
    ).toEqual([1]);
  });
  it("keeps review separate from time scope and never inherits an older revision", () => {
    const reader = createClinicalReader(source()),
      old = review(p(1)),
      current = review(p(2));
    const reviews = {
      [old.predictionId]: old,
      [current.predictionId]: current,
    };
    expect(alertQueue(reader, reviews, "history")[0].review).toEqual(old);
    expect(alertQueue(reader, reviews, "current")[0].review).toEqual(current);
    const revised = source();
    revised.predictions = [p(1), p(2, 2)];
    expect(
      alertQueue(createClinicalReader(revised), reviews, "current")[0].review,
    ).toBeUndefined();
  });
  it("orders unreviewed current predictions ahead of reviewed ones", () => {
    const data = source(),
      other = { ...p(2), id: "E0010:2", encounterId: "E0010", score: 0.99 };
    data.encounters.push({ ...data.encounters[0], id: "E0010" });
    data.predictions.push(other);
    const r = review(other);
    expect(
      alertQueue(
        createClinicalReader(data),
        { [r.predictionId]: r },
        "current",
      ).map((r) => r.encounter.id),
    ).toEqual([id, "E0010"]);
  });
});
describe("observation changes are as-of comparisons", () => {
  it("does not replace a newer missing lab result with an older sample returned late", () => {
    const data = source();
    data.labs = [
      {
        encounterId: id,
        code: "CRP",
        value: 5,
        unit: "mg/L",
        collectedAt: timeAt(t0, 0),
        availableAt: timeAt(t0, 2),
      },
      {
        encounterId: id,
        code: "CRP",
        value: null,
        unit: "mg/L",
        collectedAt: timeAt(t0, 1),
        availableAt: timeAt(t0, 1),
      },
    ];
    expect(observationChanges(createClinicalReader(data), id, 2)).toEqual([]);
  });
  it("shows changed/new values with both source times, but no unchanged, superseded or future results", () => {
    const data = source();
    const values: VitalObservation["values"] = {
      heart_rate_bpm: 90,
      respiratory_rate_per_min: 18,
      sbp_mmhg: 120,
      map_mmhg: null,
      spo2_pct: null,
      temperature_c: null,
      gcs: null,
    };
    data.vitals = [
      {
        encounterId: id,
        measuredAt: timeAt(t0, 0),
        availableAt: timeAt(t0, 0),
        values,
      },
      {
        encounterId: id,
        measuredAt: timeAt(t0, 1.5),
        availableAt: timeAt(t0, 2),
        values: { ...values, heart_rate_bpm: 110 },
      },
    ];
    data.labs = [
      {
        encounterId: id,
        code: "CRP",
        value: 100,
        unit: "mg/L",
        collectedAt: timeAt(t0, 1),
        availableAt: timeAt(t0, 1),
      },
      {
        encounterId: id,
        code: "CRP",
        value: 30,
        unit: "mg/L",
        collectedAt: timeAt(t0, 0),
        availableAt: timeAt(t0, 2),
      },
      {
        encounterId: id,
        code: "WBC",
        value: 11,
        unit: "10^9/L",
        collectedAt: timeAt(t0, 1.5),
        availableAt: timeAt(t0, 2),
      },
      {
        encounterId: id,
        code: "procalcitonin",
        value: 8,
        unit: "ng/mL",
        collectedAt: timeAt(t0, 2),
        availableAt: timeAt(t0, 3),
      },
    ];
    const changes = observationChanges(createClinicalReader(data), id, 2);
    expect(changes.map((c) => c.key)).toEqual(["heart_rate_bpm", "WBC"]);
    expect(changes[0]).toMatchObject({
      previous: 90,
      value: 110,
      observedAt: timeAt(t0, 1.5),
      availableAt: timeAt(t0, 2),
    });
    expect(changes[1].previous).toBeNull();
  });
});
describe("return navigation", () => {
  it("preserves the independent filters while changing snapshot hour", () => {
    const back = "/dashboard?scope=history&review=reviewed&search=E0009";
    const url = new URL(patientHref(id, 2, back), "https://sepsis.invalid");
    expect(url.searchParams.get("returnTo")).toBe(back);
    expect(url.searchParams.get("hour")).toBe("2");
  });
  it.each([
    "https://external.example/",
    "//external.example/dashboard",
    "/patients/E0009",
    "/api/manual-score",
    "javascript:alert(1)",
  ])("rejects a return outside the two clinical lists: %s", (raw) =>
    expect(safeReturnTo(raw)).toBe("/patients"),
  );
});
