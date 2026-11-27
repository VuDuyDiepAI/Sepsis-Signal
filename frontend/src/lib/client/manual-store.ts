"use client";
import { useMemo, useSyncExternalStore } from "react";
import { dataset, createClinicalReader } from "@/lib/clinical/data";
import type { ClinicalDataset, VitalKey } from "@/lib/contracts/clinical";
import type { ManualEntry, ManualProfile } from "@/lib/clinical/manual-schema";
import type { ManualCase, ScoringJobStatus } from "@/lib/contracts/manual";
export type { ManualCase, ManualPrediction, ScoreResponse } from "@/lib/contracts/manual";
import {
  fetchScoringJob,
  getClinicalSnapshot,
  getServerClinicalSnapshot,
  subscribeClinical,
  persistClinical,
  refreshClinical,
} from "@/lib/client/clinical-storage";
export interface WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}
export async function createManualCase(profile: ManualProfile) {
  await persistClinical("/api/cases", "POST", profile);
}
export async function waitForScoringJob(
  id: string,
  initialRecord: ManualCase,
  jobId: string | null | undefined,
  { timeoutMs = 60000, pollIntervalMs = 400 }: WaitOptions = {},
): Promise<ManualCase> {
  const expectedRevision = initialRecord.revision;
  if (
    !initialRecord.attemptedHours.length ||
    !["pending", "running"].includes(initialRecord.scoringStatus ?? "")
  ) {
    return initialRecord;
  }
  const deadline = Date.now() + timeoutMs;
  let lastJob: ScoringJobStatus | null = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    if (jobId) {
      const job = await fetchScoringJob(jobId);
      lastJob = job;
      if (!job) break;
      if (job.encounter_id !== id) {
        throw new Error("Trạng thái lượt chấm không khớp hồ sơ hiện tại.");
      }
      if (job.status === "pending" || job.status === "running") continue;
      break;
    } else {
      await refreshClinical();
      const fresh = getClinicalSnapshot().cases.find((c) => c.profile.id === id);
      if (!fresh || fresh.revision !== expectedRevision) {
        throw new Error("Hồ sơ đã thay đổi trong khi chấm. Tải lại dữ liệu.");
      }
      if (!["pending", "running"].includes(fresh.scoringStatus ?? "")) {
        return fresh;
      }
    }
  }
  await refreshClinical();
  const fresh = getClinicalSnapshot().cases.find((c) => c.profile.id === id);
  if (!fresh || fresh.revision !== expectedRevision) {
    throw new Error("Hồ sơ đã thay đổi trong khi chấm. Tải lại dữ liệu.");
  }
  if (lastJob?.status === "superseded" && fresh.scoringStatus !== "error") {
    return {
      ...fresh,
      scoringStatus: "error",
      scoringError:
        fresh.scoringError ||
        lastJob.error ||
        "Lượt chấm đã bị thay thế. Vui lòng chấm lại dữ liệu đã lưu.",
    };
  }
  return fresh;
}
export async function updateManualCase(
  id: string,
  revision: number,
  entry: ManualEntry,
  options?: WaitOptions,
) {
  const state = await persistClinical(`/api/cases/${id}/entries`, "PUT", { revision, entry });
  const saved = state.cases.find((c) => c.profile.id === id)!;
  if (!saved.attemptedHours.length) return saved;
  try {
    return await waitForScoringJob(id, saved, state.jobId, options);
  } catch (error) {
    return {
      ...saved,
      scoringStatus: "error" as const,
      scoringError: `Đã lưu dữ liệu. ${error instanceof Error ? error.message : "Chưa chấm được; vui lòng chấm lại dữ liệu đã lưu."}`,
    };
  }
}
export async function rescoreManualCase(
  id: string,
  revision: number,
  options?: WaitOptions,
) {
  const state = await persistClinical(`/api/cases/${id}/rescore`, "POST", { revision });
  const record = state.cases.find((c) => c.profile.id === id)!;
  return waitForScoringJob(id, record, state.jobId, options);
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
export function mergeManualCases(manual: ManualCase[],fixturePredictions=dataset.predictions): ClinicalDataset {
  const data: ClinicalDataset = {
    ...dataset,
    encounters: [...dataset.encounters],
    predictions: [...fixturePredictions],
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
      const measuredAt = iso(e.measuredAt);
      const collectedAt = iso(e.collectedAt);
      if (e.vitals) {
        const v = { ...e.vitals };
        if (v.map_mmhg === null && v.dbp_mmhg !== null)
          v.map_mmhg =
            Math.round(((v.sbp_mmhg + 2 * v.dbp_mmhg) / 3) * 10) / 10;
        vitals.set(measuredAt, {
          encounterId: id,
          measuredAt,
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
        labs.set(code + ":" + collectedAt, {
          encounterId: id,
          code,
          value: value ?? null,
          unit: units[code],
          collectedAt,
          availableAt: iso(e.labAvailableAt),
        });
      locations.set(measuredAt, {
        encounterId: id,
        department: e.department,
        startedAt: measuredAt,
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
  const state=useSyncExternalStore(subscribeClinical,getClinicalSnapshot,getServerClinicalSnapshot);
  return useMemo(() => mergeManualCases(state.cases,state.fixturePredictions??[]), [state]);
}
export function useClinicalReader() {
  const source = useClinicalDataset();
  return useMemo(() => createClinicalReader(source), [source]);
}
