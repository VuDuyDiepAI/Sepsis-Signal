import { afterEach, expect, it } from "vitest";
import golden from "../../../tests/fixtures/sepsis_scoring_golden.json";
import { scoreRequestSchema } from "@/lib/clinical/manual-schema";
import { scoreCase } from "@/lib/server/score-case";
import { scoreSavedCase } from "@/lib/server/score-saved-case";
import { ClinicalDatabase } from "@/lib/server/clinical-db";
import { reviewFor, stateOf, timeAt } from "@/lib/clinical/data";

let db: ClinicalDatabase | undefined;
afterEach(() => { db?.close(); db = undefined; });

it.each(golden.cases)("preserves the real Next.js → Python scoring contract: $name", async (fixture) => {
  const input = scoreRequestSchema.parse(fixture.input);
  const actual = await scoreCase(input);
  expect(Object.keys(actual.errors).sort((a, b) => Number(a) - Number(b))).toEqual(fixture.expected.errorHours);
  expect(actual.predictions).toHaveLength(fixture.expected.predictions.length);
  for (const [index, reference] of fixture.expected.predictions.entries()) {
    const { alert, score, ...identity } = reference;
    const prediction = actual.predictions[index];
    expect(prediction).toMatchObject(identity);
    expect(Math.abs(prediction.score - score)).toBeLessThanOrEqual(1e-12);
    expect(stateOf({
      ...prediction,
      id: `golden:${fixture.name}:${prediction.hour}`,
      encounterId: input.profile.id,
      revision: 1,
      timestamp: timeAt(input.profile.t0 + "+07:00", prediction.hour),
    })).toBe(alert ? "above" : "below");
  }
}, 60000);

it("keeps golden results and review history coherent through unchanged, missing and restored observations", async () => {
  const fixture = golden.cases.find((value) => value.name === "stable")!;
  const input = scoreRequestSchema.parse(fixture.input);
  const entry = { ...input.entries[0], hour: 1 };
  db = new ClinicalDatabase(":memory:");
  db.create(input.profile);
  await scoreSavedCase(db, db.saveInput(input.profile.id, 0, entry));
  const first = db.getCase(input.profile.id)!.predictions[0];
  const reference = fixture.expected.predictions.find((value) => value.hour === 1)!;
  expect(first).toMatchObject({ threshold: reference.threshold, modelVersion: reference.modelVersion, revision: 1 });
  expect(Math.abs(first.score - reference.score)).toBeLessThanOrEqual(1e-12);
  db.recordReview(first.id, first.revision, "Golden fixture reviewer", "Fixed test data");

  await scoreSavedCase(db, db.saveInput(input.profile.id, 1, entry));
  expect(db.getCase(input.profile.id)!.predictions[0].id).toBe(first.id);
  expect(reviewFor(first, db.snapshot().reviews)).toBeDefined();

  const missing = db.saveInput(input.profile.id, 2, { ...entry, vitals: null });
  expect(missing.predictions).toEqual([]);
  await scoreSavedCase(db, missing);
  expect(db.getCase(input.profile.id)!.predictions).toEqual([]);
  expect(() => db!.recordReview(first.id, first.revision, "Other reviewer", "")).toThrow();

  await scoreSavedCase(db, db.saveInput(input.profile.id, 3, entry));
  const restored = db.getCase(input.profile.id)!.predictions[0];
  expect(restored).toMatchObject({ score: first.score, threshold: first.threshold, modelVersion: first.modelVersion, featureHash: first.featureHash, revision: 4 });
  expect(restored.id).not.toBe(first.id);
  expect(reviewFor(restored, db.snapshot().reviews)).toBeUndefined();
  expect(db.snapshot().reviewHistory!.some((review) => review.predictionId === first.id)).toBe(true);
}, 60000);
