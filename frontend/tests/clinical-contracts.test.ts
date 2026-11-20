import { describe, it, expect } from "vitest";
import {
  createClinicalReader,
  dataset,
  reviewFor,
  summaryOf,
  timeAt,
} from "../src/lib/clinical-data";
import { localTimestamp, predictionHour } from "../src/lib/clinical-time";
import { scoreRequestSchema } from "../src/lib/manual-schema";
import { decodeReviews } from "../src/lib/review-store";
import { mergeManualCases, type ManualCase } from "../src/lib/manual-store";
import type { Review } from "../src/lib/clinical-types";
const profile = {
  id: "HS-ABCDEF12",
  t0: "2026-11-19T08:00",
  age: 55,
  sex: "F" as const,
  height: null,
  weight: null,
  comorbidities: {},
};
const entry = {
  hour: 0,
  measuredAt: profile.t0,
  availableAt: profile.t0,
  collectedAt: profile.t0,
  labAvailableAt: "2026-11-19T10:00",
  department: "ED" as const,
  vitals: {
    heart_rate_bpm: 90,
    respiratory_rate_per_min: 18,
    sbp_mmhg: 120,
    dbp_mmhg: 75,
    map_mmhg: null,
    spo2_pct: null,
    temperature_c: null,
    gcs: null,
  },
  labs: { CRP: 180 },
  symptoms: null,
};
describe("time contracts", () => {
  it("rejects impossible dates rather than normalizing them", () => {
    expect(Number.isNaN(localTimestamp("2026-02-31T08:00"))).toBe(true);
    expect(localTimestamp("2026-11-19T08:00")).toBe(
      Date.parse("2026-11-19T08:00:00+07:00"),
    );
  });
  it("allows delayed results, but not measurements after the selected hour", () => {
    expect(
      scoreRequestSchema.safeParse({ profile, entries: [entry], hours: [1] })
        .success,
    ).toBe(true);
    expect(
      scoreRequestSchema.safeParse({
        profile,
        entries: [
          {
            ...entry,
            measuredAt: "2026-11-19T09:00",
            availableAt: "2026-11-19T09:00",
          },
        ],
        hours: [1],
      }).success,
    ).toBe(false);
    expect(
      scoreRequestSchema.safeParse({
        profile,
        entries: [{ ...entry, labAvailableAt: "2026-11-19T07:00" }],
        hours: [1],
      }).success,
    ).toBe(false);
  });
  it.each([
    ["0", 0],
    ["36", 36],
    ["37", 7],
    ["-1", 7],
    ["1.5", 7],
    ["", 7],
    [undefined, 7],
  ])("parses URL hour %s correctly", (value, expected) =>
    expect(predictionHour(value as string | undefined, 7)).toBe(expected),
  );
  it("preserves the local midnight boundary", () =>
    expect(timeAt("2026-11-19T23:00:00+07:00", 1)).toBe(
      "2026-11-20T00:00:00+07:00",
    ));
});
describe("reader and source corrections", () => {
  const record: ManualCase = {
    profile,
    entries: [entry],
    predictions: [],
    attemptedHours: [],
    revision: 1,
    currentHour: 1,
    errors: {},
  };
  it("does not expose delayed lab values; distinguishes missing from zero", () => {
    const reader = createClinicalReader(mergeManualCases([record]));
    expect(reader.getAvailableLabs(profile.id, 1)).toHaveLength(0);
    expect(reader.getAvailableLabs(profile.id, 2)[0].value).toBe(180);
    expect(reader.getAvailableVitals(profile.id, 1)[0].values.map_mmhg).toBe(
      90,
    );
    expect(
      reader.getAvailableVitals(profile.id, 1)[0].values.spo2_pct,
    ).toBeNull();
    expect(reader.getPrediction(profile.id, 1)).toBeUndefined();
  });
  it("replaces a corrected identity BEFORE availability filtering", () => {
    const correction = {
      ...entry,
      hour: 1,
      availableAt: "2026-11-19T09:30",
      labAvailableAt: "2026-11-19T10:30",
      vitals: { ...entry.vitals, heart_rate_bpm: 120 },
      labs: { CRP: 200 },
    };
    const reader = createClinicalReader(
      mergeManualCases([{ ...record, entries: [entry, correction] }]),
    );
    expect(reader.getAvailableVitals(profile.id, 1)).toHaveLength(0);
    expect(
      reader.getAvailableVitals(profile.id, 2)[0].values.heart_rate_bpm,
    ).toBe(120);
    expect(reader.getAvailableLabs(profile.id, 2)).toHaveLength(0);
    expect(reader.getAvailableLabs(profile.id, 3)[0].value).toBe(200);
  });
  it("exposes no future predictions or alert history beyond the current hour", () => {
    const reader = createClinicalReader();
    for (const e of reader.listEncounters()) {
      expect(
        reader.getPredictions(e.id).every((p) => p.hour <= e.currentHour),
      ).toBe(true);
      expect(
        reader.getAvailableVitals(e.id, 0).every((v) => v.availableAt <= e.t0),
      ).toBe(true);
    }
    expect(
      reader
        .getAlerts()
        .every(
          (a) =>
            a.prediction.hour <= a.encounter.currentHour &&
            a.prediction.score >= a.prediction.threshold,
        ),
    ).toBe(true);
    const rows = reader.getMonitoringRows();
    expect(summaryOf(rows).pending).toBe(
      rows.filter((r) => r.state === "above" && !r.review).length,
    );
    expect(reader.getModelMetadata().features).toHaveLength(36);
    expect(reader.getModelMetadata()).toEqual(dataset.models.sepsis);
  });
});
describe("persisted review safety", () => {
  const p = dataset.predictions[0],
    now = Date.now();
  const r: Review = {
    predictionId: p.id,
    revision: p.revision,
    reviewer: "Bác sĩ A",
    timestamp: new Date(now).toISOString(),
    note: "Đã đối chiếu",
    localOnly: true,
  };
  it("round-trips a valid review but does not apply it to a new revision", () => {
    const restored = decodeReviews(JSON.stringify({ [p.id]: r }), now);
    expect(reviewFor(p, restored)).toEqual(r);
    expect(
      reviewFor({ ...p, revision: p.revision + 1 }, restored),
    ).toBeUndefined();
  });
  it("keeps older history and ignores damaged, future or mismatched records", () => {
    expect(decodeReviews("broken", now)).toEqual({});
    expect(decodeReviews(JSON.stringify({ wrong: r }), now)).toEqual({});
    expect(
      decodeReviews(
        JSON.stringify({
          [p.id]: {
            ...r,
            timestamp: new Date(now - 8 * 3600000).toISOString(),
          },
        }),
        now,
      ),
    ).toHaveProperty(p.id);
    expect(
      decodeReviews(
        JSON.stringify({
          [p.id]: { ...r, timestamp: new Date(now + 1000).toISOString() },
        }),
        now,
      ),
    ).toEqual({});
  });
});
