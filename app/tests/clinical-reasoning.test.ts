import { describe, it, expect } from "vitest";
import { dataset } from "../src/lib/clinical-data";
import {
  buildOrganSystems,
  computeClinicalScores,
  evaluateLabsAt,
  evaluateVitalsAt,
  extractClinicalDrivers,
  getActiveSiteAt,
  groupAlertEpisodes,
  narrativeForHour,
} from "../src/lib/clinical-reasoning";

describe("clinical reasoning & Vinmec ED workflow helpers", () => {
  const e0009 = dataset.encounters.find((e) => e.id === "E0009")!;

  it("gates suspected site strictly by availableAt (no future leakage at T0)", () => {
    expect(getActiveSiteAt(e0009, 0).suspectedSite).toBeNull();
    expect(getActiveSiteAt(e0009, 2).suspectedSite).toBe("urinary");
  });

  it("builds 6 SOFA-aligned organ systems with missing-safe semantics at T0", () => {
    const vitals0 = evaluateVitalsAt(e0009, 0);
    const labs0 = evaluateLabsAt(e0009, 0);
    const organs0 = buildOrganSystems(vitals0, labs0);
    expect(organs0).toHaveLength(6);
    expect(organs0.every((o) => o.severity === "missing")).toBe(true);

    const vitals8 = evaluateVitalsAt(e0009, 8);
    const labs8 = evaluateLabsAt(e0009, 8);
    const organs8 = buildOrganSystems(vitals8, labs8);
    expect(organs8.some((o) => o.severity !== "missing")).toBe(true);
  });

  it("computes qSOFA, SIRS, MEWS and clinical drivers without inventing missing data", () => {
    const vitals8 = evaluateVitalsAt(e0009, 8);
    const labs8 = evaluateLabsAt(e0009, 8);
    const scores = computeClinicalScores(vitals8, labs8);
    expect(scores.qsofa.available).toBeLessThanOrEqual(3);
    expect(scores.sirs.available).toBeLessThanOrEqual(4);
    expect(scores.mews.available).toBeLessThanOrEqual(5);

    const drivers = extractClinicalDrivers(e0009, 8);
    expect(drivers.length).toBeGreaterThan(0);
    expect(narrativeForHour(e0009, 0)).toContain("T0");
  });

  it("groups hourly threshold crossings into 1 alert episode per patient (F1-radio rule)", () => {
    const episodes = groupAlertEpisodes({});
    const uniquePatients = new Set(episodes.map((e) => e.encounter.id));
    expect(episodes.length).toBe(uniquePatients.size);
    expect(episodes.length).toBeGreaterThan(0);
  });
});
