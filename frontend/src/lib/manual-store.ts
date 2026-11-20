"use client";
import { useMemo, useSyncExternalStore } from "react";
import { dataset, createClinicalReader } from "./clinical-data";
import type { ClinicalDataset, VitalKey } from "./clinical-types";
import type { ManualEntry, ManualProfile } from "./manual-schema";
import type { ManualCase } from "./manual-types";
export type { ManualCase, ManualPrediction, ScoreResponse } from "./manual-types";
import { getClinicalSnapshot, getServerClinicalSnapshot, subscribeClinical, persistClinical } from "./clinical-storage";
export async function createManualCase(profile: ManualProfile) {
  await persistClinical("/api/cases", "POST", profile);
}
export async function updateManualCase(id: string, revision: number, entry: ManualEntry) {
  const state = await persistClinical(`/api/cases/${id}/entries`, "PUT", { revision, entry });
  return state.cases.find(c => c.profile.id === id)!;
}
const iso = (s: string) => (s.length === 16 ? s + ":00" : s) + "+07:00";
const units: Record<string, string> = {
  WBC: "10^9/L",
  platelets: "10^9/L",
  creatinine: "mg/dL",
  bilirubin_total: "mg/dL",
  CRP: "mg/L",
  procalcitonin: "ng/mL",
};
export function mergeManualCases(manual: ManualCase[]): ClinicalDataset {
  const data: ClinicalDataset = {
    ...dataset,
    encounters: [...dataset.encounters],
    predictions: [...dataset.predictions],
    vitals: [...dataset.vitals],
    labs: [...dataset.labs],
    locations: [...dataset.locations],
  };
  for (const c of manual) {
    const id = c.profile.id;
    data.encounters.push({
      id,
      age: c.profile.age,
      sex: c.profile.sex,
      t0: iso(c.profile.t0),
      currentHour: c.currentHour,
    });
    // Retain entered data but require rescoring after model/decision-policy changes.
    data.predictions.push(
      ...c.predictions.filter(
        (p) =>
          p.modelVersion === dataset.models.sepsis.model_version &&
          p.threshold === dataset.models.sepsis.threshold,
      ),
    );
    // Mirror Python event identity replacement before availability filtering.
    const vitals = new Map<string, ClinicalDataset["vitals"][number]>(),
      labs = new Map<string, ClinicalDataset["labs"][number]>(),
      locations = new Map<string, ClinicalDataset["locations"][number]>();
    for (const e of c.entries.toSorted((a, b) => a.hour - b.hour)) {
      if (e.vitals) {
        const v = { ...e.vitals };
        if (v.map_mmhg === null && v.dbp_mmhg !== null)
          v.map_mmhg =
            Math.round(((v.sbp_mmhg + 2 * v.dbp_mmhg) / 3) * 10) / 10;
        vitals.set(e.measuredAt, {
          encounterId: id,
          measuredAt: iso(e.measuredAt),
          availableAt: iso(e.availableAt),
          values: Object.fromEntries(
            (
              [
                "heart_rate_bpm",
                "respiratory_rate_per_min",
                "sbp_mmhg",
                "map_mmhg",
                "spo2_pct",
                "temperature_c",
                "gcs",
              ] as VitalKey[]
            ).map((k) => [k, v[k]]),
          ) as Record<VitalKey, number | null>,
        });
      }
      for (const [code, value] of Object.entries(e.labs))
        labs.set(code + ":" + e.collectedAt, {
          encounterId: id,
          code,
          value: value ?? null,
          unit: units[code],
          collectedAt: iso(e.collectedAt),
          availableAt: iso(e.labAvailableAt),
        });
      locations.set(e.measuredAt, {
        encounterId: id,
        department: e.department,
        startedAt: iso(e.measuredAt),
        endedAt: null,
      });
    }
    data.vitals.push(...vitals.values());
    data.labs.push(...labs.values());
    const ordered = [...locations.values()].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
    data.locations.push(
      ...ordered.map((l, i) => ({
        ...l,
        endedAt: ordered[i + 1]?.startedAt ?? null,
      })),
    );
  }
  return data;
}
export function useManualCases() {
  return useSyncExternalStore(subscribeClinical, () => getClinicalSnapshot().cases, () => getServerClinicalSnapshot().cases);
}
export function useClinicalDataset() {
  const manual = useManualCases();
  return useMemo(() => mergeManualCases(manual), [manual]);
}
export function useClinicalReader() {
  const source = useClinicalDataset();
  return useMemo(() => createClinicalReader(source), [source]);
}
