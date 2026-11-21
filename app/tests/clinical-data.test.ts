import { describe, it, expect } from "vitest";
import {
  dataset,
  dataProvider,
  timeAt,
  availableLabs,
  availableVitals,
  predictionAt,
  stateOf,
  changeAt,
  monitoringRows,
  priority,
  summaryOf,
  reviewFor,
  percent,
} from "../src/lib/clinical-data";
import type { Review } from "../src/lib/clinical-types";
describe("source and prediction contract", () => {
  it("uses metadata verbatim, including all 36 features and threshold", () => {
    expect(dataset.models.sepsis.features).toHaveLength(36);
    expect(
      dataset.predictions.every(
        (p) =>
          p.threshold === dataset.models.sepsis.threshold &&
          p.modelVersion === dataset.models.sepsis.model_version &&
          p.score >= 0 &&
          p.score <= 1,
      ),
    ).toBe(true);
  });
  it("preserves provenance metadata", () => {
    expect(dataset.provenance.sourceSha256).toBeDefined();
    expect(dataset.provenance.sourceSha256.length).toBe(64);
  });
  it("does not export outcome labels into the clinical fixture", () => {
    expect(JSON.stringify(dataset)).not.toMatch(
      /sepsis_onset_at|scenario_scripted|sepsis_next_6h\"\s*:\s*[01]/,
    );
    expect(new Set(dataset.predictions.map((p) => p.id)).size).toBe(
      dataset.predictions.length,
    );
  });
  it("preserves the +07 time boundary at T0, T0+1 and midnight", () => {
    expect(timeAt("2026-02-14T23:00:00+07:00", 1)).toBe(
      "2026-02-15T00:00:00+07:00",
    );
    for (const e of dataset.encounters)
      expect(
        new Date(timeAt(e.t0, 1)).getTime() - new Date(e.t0).getTime(),
      ).toBe(3600000);
  });
  it("never invents a T0 or missing prediction", () => {
    for (const e of dataset.encounters)
      expect(predictionAt(e.id, 0)).toBeUndefined();
    expect(stateOf(undefined)).toBe("unavailable");
    expect(percent(0)).toBe("0.00%");
  });
  it("cuts off future predictions for each requested hour", async () => {
    for (const e of dataset.encounters)
      for (const h of [0, 1, 6, 12, 36]) {
        const p = await dataProvider.getPredictions(e.id, h);
        expect(
          p.every(
            (p) =>
              p.hour <= h && new Date(p.timestamp) <= new Date(timeAt(e.t0, h)),
          ),
        ).toBe(true);
      }
  });
  it("filters delayed labs by availability and clinical time, not by collection alone", () => {
    let checked = 0;
    for (const e of dataset.encounters)
      for (let h = 0; h <= 36; h++) {
        const cutoff = new Date(timeAt(e.t0, h)).getTime();
        const expected = dataset.labs.filter(
          (l) =>
            l.encounterId === e.id &&
            new Date(l.collectedAt) >= new Date(e.t0) &&
            new Date(l.collectedAt) <= new Date(l.availableAt) &&
            new Date(l.availableAt).getTime() <= cutoff,
        );
        expect(availableLabs(e.id, h)).toHaveLength(expected.length);
        checked += expected.length;
      }
    expect(checked).toBeGreaterThan(0);
  });
  it("only exposes measured and available vitals, retaining nulls", () => {
    for (const e of dataset.encounters)
      for (const h of [0, 1, 12, 36]) {
        expect(
          availableVitals(e.id, h).every(
            (v) =>
              new Date(v.measuredAt) >= new Date(e.t0) &&
              new Date(v.availableAt) <= new Date(timeAt(e.t0, h)),
          ),
        ).toBe(true);
      }
    expect(
      dataset.vitals.some((v) => Object.values(v.values).includes(null)),
    ).toBe(true);
  });
  it("computes change in percentage points for adjacent hours only", () => {
    const pair = dataset.predictions.find((p) =>
      predictionAt(p.encounterId, p.hour - 1),
    );
    expect(pair).toBeDefined();
    const previous = predictionAt(pair!.encounterId, pair!.hour - 1)!;
    expect(changeAt(pair!.encounterId, pair!.hour)).toBeCloseTo(
      (pair!.score - previous.score) * 100,
      12,
    );
    expect(changeAt(pair!.encounterId, 1)).toBeUndefined();
  });
});
describe("monitoring and revision-aware review", () => {
  const p = dataset.predictions.find(
    (p) =>
      p.score >= p.threshold &&
      p.hour ===
        dataset.encounters.find((e) => e.id === p.encounterId)!.currentHour,
  )!;
  const review: Review = {
    predictionId: p.id,
    revision: p.revision,
    reviewer: "Bác sĩ A",
    timestamp: "2026-11-19T08:00:00Z",
    note: "Đã xem",
    localOnly: true,
  };
  it("derives summaries and prioritizes unreviewed threshold crossings", () => {
    const rows = monitoringRows();
    const s = summaryOf(rows);
    expect(s.total).toBe(dataset.encounters.length);
    expect(s.unavailable).toBe(rows.filter((r) => !r.prediction).length);
    expect(rows.map(priority)).toEqual(
      rows.map(priority).sort((a, b) => a - b),
    );
  });
  it("updates current review counts without reviewing a newer revision", () => {
    const before = summaryOf(monitoringRows()),
      after = summaryOf(monitoringRows({ [p.id]: review }));
    expect(after.reviewed).toBe(before.reviewed + 1);
    expect(after.pending).toBe(before.pending - 1);
    expect(
      reviewFor({ ...p, revision: p.revision + 1 }, { [p.id]: review }),
    ).toBeUndefined();
    expect(reviewFor(undefined, { [p.id]: review })).toBeUndefined();
  });
  it("never exposes future alerts or below-threshold records", async () => {
    const alerts = await dataProvider.getAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(
      alerts.every(
        (a) =>
          a.prediction.score >= a.prediction.threshold &&
          a.prediction.hour <= a.encounter.currentHour,
      ),
    ).toBe(true);
  });
});
