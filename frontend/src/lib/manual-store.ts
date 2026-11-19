"use client";
import { useMemo, useSyncExternalStore } from "react";
import { dataset, timeAt } from "./clinical-data";
import type { ClinicalDataset, Prediction, VitalKey } from "./clinical-types";
import type { ManualEntry, ManualProfile } from "./manual-schema";
export interface ManualPrediction extends Prediction {
  featureHash: string;
}
export interface ManualCase {
  profile: ManualProfile;
  entries: ManualEntry[];
  predictions: ManualPrediction[];
  attemptedHours: number[];
  revision: number;
  currentHour: number;
  errors: Record<string, string>;
}
export interface ScoreResponse {
  predictions: {
    hour: number;
    score: number;
    threshold: number;
    modelVersion: string;
    department: "ED" | "WARD" | "ICU";
    availableFeatures: number;
    featureHash: string;
  }[];
  errors: Record<string, string>;
}
const key = "sepsis-manual-cases-v1";
const empty: ManualCase[] = [];
let cases: ManualCase[] = empty;
let loaded = false;
const listeners = new Set<() => void>();
function snapshot() {
  if (typeof window !== "undefined" && !loaded) {
    loaded = true;
    try {
      cases = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    } catch {
      cases = empty;
    }
  }
  return cases;
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function commit(next: ManualCase[]) {
  sessionStorage.setItem(key, JSON.stringify(next));
  cases = next;
  listeners.forEach((fn) => fn());
}
export function createManualCase(profile: ManualProfile) {
  snapshot();
  commit([
    {
      profile,
      entries: [],
      predictions: [],
      attemptedHours: [],
      revision: 0,
      currentHour: 0,
      errors: {},
    },
    ...cases,
  ]);
}
export function updateManualCase(
  id: string,
  revision: number,
  entry: ManualEntry,
  response?: ScoreResponse,
) {
  const c = snapshot().find((c) => c.profile.id === id);
  if (!c || c.revision !== revision)
    throw new Error("Hồ sơ đã thay đổi. Mở lại mốc giờ trước khi lưu.");
  const entries = [
    ...c.entries.filter((e) => e.hour !== entry.hour),
    entry,
  ].sort((a, b) => a.hour - b.hour);
  const predictions = response
    ? response.predictions.map((p) => {
        const old = c.predictions.find((q) => q.hour === p.hour);
        const rev =
          old?.featureHash === p.featureHash ? old.revision : c.revision + 1;
        return {
          ...p,
          encounterId: id,
          timestamp: timeAt(iso(c.profile.t0), p.hour),
          revision: rev,
          id: `${id}:${p.hour}:${rev}`,
        };
      })
    : c.predictions;
  commit(
    cases.map((v) =>
      v === c
        ? {
            ...c,
            entries,
            predictions,
            errors: response?.errors ?? {},
            attemptedHours:
              entry.hour > 0
                ? [...new Set([...c.attemptedHours, entry.hour])]
                : c.attemptedHours,
            revision: c.revision + 1,
            currentHour: Math.max(c.currentHour, entry.hour),
          }
        : v,
    ),
  );
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
    data.predictions.push(...c.predictions);
    const entries = c.entries.toSorted((a, b) =>
      a.measuredAt.localeCompare(b.measuredAt),
    );
    entries.forEach((e, i) => {
      if (e.vitals) {
        const v = { ...e.vitals };
        if (v.map_mmhg === null && v.dbp_mmhg !== null)
          v.map_mmhg =
            Math.round(((v.sbp_mmhg + 2 * v.dbp_mmhg) / 3) * 10) / 10;
        data.vitals.push({
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
      Object.entries(e.labs).forEach(([code, value]) =>
        data.labs.push({
          encounterId: id,
          code,
          value: value ?? null,
          unit: units[code],
          collectedAt: iso(e.collectedAt),
          availableAt: iso(e.labAvailableAt),
        }),
      );
      data.locations.push({
        encounterId: id,
        department: e.department,
        startedAt: iso(e.measuredAt),
        endedAt: entries[i + 1]?.measuredAt
          ? iso(entries[i + 1].measuredAt)
          : null,
      });
    });
  }
  return data;
}
export function useManualCases() {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}
export function useClinicalDataset() {
  const manual = useManualCases();
  return useMemo(() => mergeManualCases(manual), [manual]);
}
