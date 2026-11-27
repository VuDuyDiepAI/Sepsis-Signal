import fixture from "@/data/clinical-demo.json";
import demoExplanationsRaw from "@/data/demo-explanations.json";
import type {
  ClinicalDataset,
  ClinicalDataProvider,
  ClinicalState,
  Department,
  MonitoringRow,
  Prediction,
  Review,
  RiskContributor,
  VitalKey,
} from "@/lib/contracts/clinical";

export const dataset = fixture as ClinicalDataset;
const demoExplanations = demoExplanationsRaw as Record<
  string,
  RiskContributor[]
>;
export function contributorsFor(p?: Prediction): RiskContributor[] {
  if (!p) return [];
  if (p.contributors && p.contributors.length > 0) return p.contributors;
  return demoExplanations[`${p.encounterId}:${p.hour}`] ?? [];
}
export const departments: Record<Department, string> = {
  ED: "Cấp cứu",
  WARD: "Nội trú",
  ICU: "Hồi sức tích cực",
};
export const stateLabels = {
  above: "Vượt ngưỡng",
  below: "Dưới ngưỡng",
  unavailable: "Chưa có kết quả",
};
export const vitalFields: {
  key: VitalKey;
  label: string;
  unit: string;
  decimals: number;
}[] = [
  { key: "heart_rate_bpm", label: "Nhịp tim", unit: "lần/phút", decimals: 0 },
  {
    key: "respiratory_rate_per_min",
    label: "Nhịp thở",
    unit: "lần/phút",
    decimals: 0,
  },
  { key: "sbp_mmhg", label: "HA tâm thu", unit: "mmHg", decimals: 0 },
  { key: "map_mmhg", label: "MAP", unit: "mmHg", decimals: 0 },
  { key: "spo2_pct", label: "SpO₂", unit: "%", decimals: 1 },
  { key: "temperature_c", label: "Nhiệt độ", unit: "°C", decimals: 1 },
  { key: "gcs", label: "GCS", unit: "điểm", decimals: 0 },
];
export const labFields = [
  ["WBC", "Bạch cầu"],
  ["platelets", "Tiểu cầu"],
  ["creatinine", "Creatinine"],
  ["bilirubin_total", "Bilirubin toàn phần"],
  ["CRP", "CRP"],
  ["procalcitonin", "Procalcitonin"],
];
export const percent = (n: number) => `${(n * 100).toFixed(2)}%`;
export const hourLabel = (h: number) => (h === 0 ? "T0" : `T0+${h}h`);
export const timeAt = (t0: string, h: number) =>
  new Date(new Date(t0).getTime() + (h + 7) * 3600000)
    .toISOString()
    .replace(/\.000Z$/, "+07:00");
export function formatTime(t: string, date = false) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    ...(date ? ({ day: "2-digit", month: "2-digit" } as const) : {}),
  }).format(new Date(t));
}
export const stateOf = (p?: Prediction): ClinicalState =>
  p ? (p.score >= p.threshold ? "above" : "below") : "unavailable";
export const predictionAt = (
  id: string,
  h: number,
  source: ClinicalDataset = dataset,
) => source.predictions.find((p) => p.encounterId === id && p.hour === h);
export function departmentAt(
  id: string,
  t: string,
  source: ClinicalDataset = dataset,
): Department {
  return (
    source.locations
      .filter(
        (l) =>
          l.encounterId === id &&
          l.startedAt <= t &&
          (!l.endedAt || l.endedAt > t),
      )
      .at(-1)?.department ?? "ED"
  );
}
export function changeAt(
  id: string,
  h: number,
  source: ClinicalDataset = dataset,
) {
  const p = predictionAt(id, h, source),
    previous = predictionAt(id, h - 1, source);
  return p && previous && p.modelVersion === previous.modelVersion
    ? (p.score - previous.score) * 100
    : undefined;
}
export function availableVitals(
  id: string,
  h: number,
  source: ClinicalDataset = dataset,
) {
  const e = source.encounters.find((e) => e.id === id);
  if (!e) return [];
  const at = timeAt(e.t0, h);
  return source.vitals
    .filter(
      (v) =>
        v.encounterId === id &&
        v.measuredAt >= e.t0 &&
        v.measuredAt <= v.availableAt &&
        v.availableAt <= at,
    )
    .sort(
      (a, b) =>
        a.measuredAt.localeCompare(b.measuredAt) ||
        a.availableAt.localeCompare(b.availableAt),
    );
}
export function availableLabs(
  id: string,
  h: number,
  source: ClinicalDataset = dataset,
) {
  const e = source.encounters.find((e) => e.id === id);
  if (!e) return [];
  const at = timeAt(e.t0, h);
  return source.labs
    .filter(
      (l) =>
        l.encounterId === id &&
        l.collectedAt >= e.t0 &&
        l.collectedAt <= l.availableAt &&
        l.availableAt <= at,
    )
    .sort(
      (a, b) =>
        a.collectedAt.localeCompare(b.collectedAt) ||
        a.availableAt.localeCompare(b.availableAt),
    );
}
export const dataProvider: ClinicalDataProvider = {
  async listEncounters() {
    return createClinicalReader().listEncounters();
  },
  async getEncounter(id) {
    return createClinicalReader().getEncounter(id);
  },
  async getPredictions(id, hour) {
    return createClinicalReader().getPredictions(id, hour);
  },
  async getAvailableVitals(id, hour) {
    return createClinicalReader().getAvailableVitals(id, hour);
  },
  async getAvailableLabs(id, hour) {
    return createClinicalReader().getAvailableLabs(id, hour);
  },
  async getAlerts() {
    return createClinicalReader().getAlerts();
  },
  async getModelMetadata() {
    return createClinicalReader().getModelMetadata();
  },
};
export function reviewFor(
  p: Prediction | undefined,
  reviews: Record<string, Review>,
) {
  const review = p ? reviews[p.id] : undefined;
  return review && review.revision === p?.revision ? review : undefined;
}
export function monitoringRows(
  reviews: Record<string, Review> = {},
  source: ClinicalDataset = dataset,
): MonitoringRow[] {
  return source.encounters
    .map((encounter) => {
      const prediction = predictionAt(
        encounter.id,
        encounter.currentHour,
        source,
      );
      const timestamp = timeAt(encounter.t0, encounter.currentHour);
      return {
        encounter,
        prediction,
        timestamp,
        department: departmentAt(encounter.id, timestamp, source),
        state: stateOf(prediction),
        change: changeAt(encounter.id, encounter.currentHour, source),
        review: reviewFor(prediction, reviews),
      };
    })
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        (b.prediction?.score ?? -1) - (a.prediction?.score ?? -1),
    );
}
export const priority = (r: MonitoringRow) =>
  r.state === "above" ? (r.review ? 1 : 0) : r.state === "below" ? 2 : 3;
export function summaryOf(rows: MonitoringRow[]) {
  return {
    total: rows.length,
    pending: rows.filter((r) => r.state === "above" && !r.review).length,
    reviewed: rows.filter((r) => r.review).length,
    unavailable: rows.filter((r) => !r.prediction).length,
  };
}
/** One read boundary for fixture and session data. Backend adapters can populate the same snapshot. */
export function createClinicalReader(source: ClinicalDataset = dataset) {
  const getEncounter = (id: string) =>
    source.encounters.find((e) => e.id === id) ?? null;
  const getPredictions = (id: string, hour?: number) => {
    const e = getEncounter(id);
    return e
      ? source.predictions
          .filter(
            (p) => p.encounterId === id && p.hour <= (hour ?? e.currentHour),
          )
          .sort((a, b) => a.hour - b.hour)
      : [];
  };
  return {
    listEncounters: () => source.encounters,
    getEncounter,
    getPredictions,
    getPrediction: (id: string, hour: number) => predictionAt(id, hour, source),
    getChange: (id: string, hour: number) => changeAt(id, hour, source),
    getDepartment: (id: string, at: string) => departmentAt(id, at, source),
    getAvailableVitals: (id: string, hour: number) =>
      availableVitals(id, hour, source),
    getAvailableLabs: (id: string, hour: number) =>
      availableLabs(id, hour, source),
    getMonitoringRows: (reviews: Record<string, Review> = {}) =>
      monitoringRows(reviews, source),
    getAlerts: () =>
      source.encounters.flatMap((e) =>
        getPredictions(e.id)
          .filter((p) => p.score >= p.threshold)
          .map((prediction) => ({
            encounter: e,
            prediction,
            department: prediction.department,
          })),
      ),
    getModelMetadata: (target: "sepsis" | "shock" = "sepsis") =>
      source.models[target],
    getProvenance: () => source.provenance,
    getUpdates: (id: string, hour: number) => {
      const e = getEncounter(id);
      if (!e) return { vitals: 0, labs: 0 };
      const from = timeAt(e.t0, hour - 1);
      return {
        vitals: availableVitals(id, hour, source).filter(
          (v) => v.availableAt > from,
        ).length,
        labs: availableLabs(id, hour, source).filter(
          (l) => l.availableAt > from,
        ).length,
      };
    },
  };
}
