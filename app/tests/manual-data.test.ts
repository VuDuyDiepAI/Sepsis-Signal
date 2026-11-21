import { it, expect } from "vitest";
import { scoreRequestSchema } from "../src/lib/manual-schema";
import { mergeManualCases, type ManualCase } from "../src/lib/manual-store";
import { availableVitals, availableLabs } from "../src/lib/clinical-data";
const profile = {
  id: "HS-ABCDEF12",
  age: 55,
  sex: "F" as const,
  t0: "2026-11-19T08:00",
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
it("accepts partial or absent labs, but refuses invalid timestamps and missing required vitals", () => {
  expect(
    scoreRequestSchema.safeParse({
      profile,
      entries: [{ ...entry, labs: {} }],
      hours: [1],
    }).success,
  ).toBe(true);
  expect(
    scoreRequestSchema.safeParse({
      profile,
      entries: [{ ...entry, availableAt: "2026-11-19T07:00" }],
      hours: [1],
    }).success,
  ).toBe(false);
  expect(
    scoreRequestSchema.safeParse({
      profile,
      entries: [
        { ...entry, vitals: { ...entry.vitals, heart_rate_bpm: null } },
      ],
      hours: [1],
    }).success,
  ).toBe(false);
});
it("shows manual data with source units, computed MAP and no future lab leakage", () => {
  const record: ManualCase = {
    profile,
    entries: [entry],
    predictions: [],
    attemptedHours: [],
    revision: 1,
    currentHour: 1,
    errors: {},
  };
  const source = mergeManualCases([record]);
  expect(availableVitals(profile.id, 1, source)[0].values.map_mmhg).toBe(90);
  expect(availableVitals(profile.id, 1, source)[0].values.spo2_pct).toBeNull();
  expect(availableLabs(profile.id, 1, source)).toHaveLength(0);
  expect(availableLabs(profile.id, 2, source)[0].value).toBe(180);
});
