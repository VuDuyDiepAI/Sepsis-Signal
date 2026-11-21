import encounterContextRaw from "@/data/encounter-context.json";
import { getWorkspaceContext } from "./workspace-data";
import {
  availableLabs,
  availableVitals,
  changeAt,
  dataset as defaultDataset,
  formatTime,
  hourLabel,
  percent,
  predictionAt,
  stateOf,
  timeAt,
} from "./clinical-data";
import type {
  ClinicalDataset,
  ClinicalDecision,
  Encounter,
  EncounterContext,
  MetricSeverity,
  Prediction,
  Review,
  VitalKey,
  VitalObservation,
} from "./clinical-types";

const contextMap = encounterContextRaw as Record<string, EncounterContext>;

export const COMORBIDITY_LABELS: Record<string, string> = {
  diabetes: "Đái tháo đường",
  cardiovascular_disease: "Bệnh tim mạch",
  chronic_kidney_disease: "Thận mạn",
  chronic_liver_disease: "Gan mạn",
  chronic_lung_disease: "Hô hấp mạn",
  cancer: "Ung thư",
  immunosuppression: "Suy giảm miễn dịch",
};

export const SITE_LABELS: Record<string, string> = {
  respiratory: "Hô hấp",
  urinary: "Tiết niệu",
  abdominal: "Ổ bụng · Tiêu hóa",
  skin: "Da & mô mềm",
  cns: "Thần kinh TW",
};

export const DECISION_LABELS: Record<
  ClinicalDecision,
  { label: string; short: string; tone: "critical" | "warning" | "ok" }
> = {
  activate: {
    label: "Xác nhận nghi ngờ · Đánh giá/Kích hoạt Sepsis",
    short: "Đã kích hoạt đánh giá",
    tone: "critical",
  },
  monitor: {
    label: "Theo dõi sát · Hẹn điều dưỡng đo lại",
    short: "Đang theo dõi sát",
    tone: "warning",
  },
  dismiss: {
    label: "Tạm loại trừ · Không lạm dụng kháng sinh",
    short: "Tạm loại trừ",
    tone: "ok",
  },
};

export const HOUR_ONE_BUNDLE = [
  { key: "lactate", label: "Đo Lactate máu", hint: "Lặp lại nếu > 2 mmol/L" },
  {
    key: "blood_culture",
    label: "Cấy máu trước kháng sinh",
    hint: "Không trì hoãn kháng sinh quá 45p",
  },
  {
    key: "antibiotics",
    label: "Kháng sinh phổ rộng đường TM",
    hint: "Trong 1 giờ đầu",
  },
  {
    key: "fluids_map",
    label: "Bù dịch & giữ HATB (MAP) ≥ 65 mmHg",
    hint: "30 mL/kg nếu tụt áp / Lactate ≥ 4",
  },
] as const;

export interface VitalEval {
  key: VitalKey;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  refRange: string;
  value: number | null;
  previous: number | null;
  delta: number | null;
  baseline: number | null;
  severity: MetricSeverity;
  statusText: string;
  measuredAt?: string;
  availableAt?: string;
  ageMinutes?: number;
}

export interface LabEval {
  code: string;
  label: string;
  unit: string;
  refRange: string;
  value: number | null;
  previous: number | null;
  delta: number | null;
  baseline: number | null;
  severity: MetricSeverity;
  statusText: string;
  collectedAt?: string;
  availableAt?: string;
  isNewThisHour: boolean;
}

export interface ClinicalScores {
  qsofa: { score: number; available: number; met: string[] };
  sirs: { score: number; available: number; met: string[] };
  mews: { score: number; available: number; tier: "low" | "medium" | "high" };
  sofaOrgans: { affected: number; available: number; details: string[] };
}

export interface ClinicalDriver {
  id: string;
  text: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  source: "eForm" | "Labtc" | "AI";
}

export interface OrganSystemCard {
  id:
    | "circulation"
    | "respiratory"
    | "inflammation"
    | "neuro"
    | "renal"
    | "liver_coag";
  title: string;
  severity: MetricSeverity;
  summary: string;
  hasNewLab: boolean;
  metrics: {
    label: string;
    valueText: string;
    unit: string;
    deltaText?: string;
    severity: MetricSeverity;
    statusText: string;
    source: "eForm" | "Labtc";
    timeText?: string;
    isNew?: boolean;
  }[];
}

export interface ComparisonRow {
  label: string;
  unit: string;
  t0Text: string;
  nowText: string;
  deltaText: string;
  severity: MetricSeverity;
  source: "eForm" | "Labtc";
}

export interface AlertEpisode {
  encounter: Encounter;
  department: Prediction["department"];
  firstAboveHour: number;
  latestPrediction: Prediction;
  peakScore: number;
  hoursAbove: number;
  isActiveNow: boolean;
  review?: Review;
  drivers: ClinicalDriver[];
  triage: TriageInfo;
  scores: ClinicalScores;
}

export interface TriageInfo {
  level: 1 | 2 | 3 | 4;
  label: string;
  cadenceLabel: string;
  cadenceMinutes: number;
  zoneLabel: string;
}

export function getEncounterContext(
  encounterId: string,
  manualProfile?: {
    comorbidities?: Record<string, boolean>;
    symptoms?: Record<string, boolean> | null;
    height?: number | null;
    weight?: number | null;
  },
): EncounterContext | null {
  const wsCtx = getWorkspaceContext(encounterId);
  if (wsCtx) return wsCtx;
  if (contextMap[encounterId]) return contextMap[encounterId];
  if (!manualProfile) return null;
  const comorbs = Object.entries(manualProfile.comorbidities ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  const bmi =
    manualProfile.height && manualProfile.weight
      ? Math.round(
          (manualProfile.weight / (manualProfile.height / 100) ** 2) * 10,
        ) / 10
      : null;
  return {
    bmi,
    weightKg: manualProfile.weight ?? null,
    heightCm: manualProfile.height ?? null,
    comorbidities: comorbs,
    symptoms: [],
  };
}

export function getActiveSiteAt(
  encounter: Encounter,
  hour: number,
  manualSymptoms?: Record<string, boolean> | null,
): { suspectedSite: string | null; flags: string[] } {
  if (manualSymptoms) {
    const flags = Object.entries(manualSymptoms)
      .filter(([, v]) => v)
      .map(([k]) => k);
    return { suspectedSite: flags[0] ?? null, flags };
  }
  const ctx = getWorkspaceContext(encounter.id) ?? contextMap[encounter.id];
  if (!ctx) return { suspectedSite: null, flags: [] };
  const cutoff = timeAt(encounter.t0, hour);
  const available = ctx.symptoms
    .filter((s) => s.availableAt <= cutoff)
    .sort((a, b) => a.availableAt.localeCompare(b.availableAt));
  const latestWithSite = [...available]
    .reverse()
    .find((s) => s.suspectedSite || s.flags.length > 0);
  return {
    suspectedSite: latestWithSite?.suspectedSite ?? null,
    flags: latestWithSite?.flags ?? [],
  };
}

const VITAL_META: {
  key: VitalKey;
  label: string;
  shortLabel: string;
  unit: string;
  decimals: number;
  refRange: string;
}[] = [
  {
    key: "sbp_mmhg",
    label: "Huyết áp tâm thu (HATT)",
    shortLabel: "HATT",
    unit: "mmHg",
    decimals: 0,
    refRange: "100 – 140",
  },
  {
    key: "map_mmhg",
    label: "Huyết áp TB (HATB/MAP)",
    shortLabel: "HATB (MAP)",
    unit: "mmHg",
    decimals: 0,
    refRange: "≥ 65",
  },
  {
    key: "heart_rate_bpm",
    label: "Nhịp tim",
    shortLabel: "Mạch",
    unit: "l/p",
    decimals: 0,
    refRange: "60 – 90",
  },
  {
    key: "respiratory_rate_per_min",
    label: "Nhịp thở",
    shortLabel: "Nhịp thở",
    unit: "l/p",
    decimals: 0,
    refRange: "12 – 20",
  },
  {
    key: "spo2_pct",
    label: "SpO₂",
    shortLabel: "SpO₂",
    unit: "%",
    decimals: 1,
    refRange: "≥ 95",
  },
  {
    key: "temperature_c",
    label: "Nhiệt độ",
    shortLabel: "Nhiệt độ",
    unit: "°C",
    decimals: 1,
    refRange: "36,0 – 38,0",
  },
  {
    key: "gcs",
    label: "Tri giác (GCS)",
    shortLabel: "GCS",
    unit: "điểm",
    decimals: 0,
    refRange: "15",
  },
];

export function evaluateVitalValue(
  key: VitalKey,
  val: number | null,
): { severity: MetricSeverity; statusText: string } {
  if (val === null) return { severity: "missing", statusText: "Chưa đo" };
  switch (key) {
    case "sbp_mmhg":
      if (val <= 90) return { severity: "critical", statusText: "Tụt áp nặng" };
      if (val <= 100)
        return { severity: "warning", statusText: "≤ 100 (qSOFA)" };
      return { severity: "normal", statusText: "Ổn định" };
    case "map_mmhg":
      if (val < 65) return { severity: "critical", statusText: "< 65 mmHg" };
      if (val < 70) return { severity: "warning", statusText: "Sát ngưỡng" };
      return { severity: "normal", statusText: "Ổn định" };
    case "heart_rate_bpm":
      if (val >= 120 || val < 45)
        return { severity: "critical", statusText: val >= 120 ? "Rất nhanh" : "Rất chậm" };
      if (val > 90 || val < 55)
        return { severity: "warning", statusText: val > 90 ? "Nhanh (>90)" : "Chậm" };
      return { severity: "normal", statusText: "Ổn định" };
    case "respiratory_rate_per_min":
      if (val >= 25 || val < 10)
        return { severity: "critical", statusText: val >= 25 ? "Thở rất nhanh" : "Thở chậm" };
      if (val >= 22)
        return { severity: "warning", statusText: "≥ 22 (qSOFA)" };
      if (val > 20)
        return { severity: "warning", statusText: "> 20 (SIRS)" };
      return { severity: "normal", statusText: "Ổn định" };
    case "spo2_pct":
      if (val < 92) return { severity: "critical", statusText: "Giảm oxy nặng" };
      if (val < 95) return { severity: "warning", statusText: "SpO₂ giảm" };
      return { severity: "normal", statusText: "Ổn định" };
    case "temperature_c":
      if (val >= 39.0 || val < 35.5)
        return {
          severity: "critical",
          statusText: val >= 39 ? "Sốt cao" : "Hạ thân nhiệt",
        };
      if (val > 38.0 || val < 36.0)
        return {
          severity: "warning",
          statusText: val > 38 ? "Sốt (SIRS)" : "Thân nhiệt thấp",
        };
      return { severity: "normal", statusText: "Ổn định" };
    case "gcs":
      if (val <= 12) return { severity: "critical", statusText: "Rối loạn ý thức" };
      if (val < 15) return { severity: "warning", statusText: "< 15 (qSOFA)" };
      return { severity: "normal", statusText: "Tỉnh táo" };
  }
}

const LAB_META: {
  code: string;
  label: string;
  defaultUnit: string;
  refRange: string;
  decimals: number;
}[] = [
  {
    code: "WBC",
    label: "Bạch cầu (WBC)",
    defaultUnit: "10⁹/L",
    refRange: "4,0 – 12,0",
    decimals: 1,
  },
  {
    code: "CRP",
    label: "CRP",
    defaultUnit: "mg/L",
    refRange: "< 10",
    decimals: 1,
  },
  {
    code: "procalcitonin",
    label: "Procalcitonin (PCT)",
    defaultUnit: "ng/mL",
    refRange: "< 0,5",
    decimals: 2,
  },
  {
    code: "platelets",
    label: "Tiểu cầu",
    defaultUnit: "10⁹/L",
    refRange: "≥ 150",
    decimals: 0,
  },
  {
    code: "creatinine",
    label: "Creatinine",
    defaultUnit: "mg/dL",
    refRange: "< 1,2",
    decimals: 2,
  },
  {
    code: "bilirubin_total",
    label: "Bilirubin toàn phần",
    defaultUnit: "mg/dL",
    refRange: "< 1,2",
    decimals: 2,
  },
];

export function evaluateLabValue(
  code: string,
  val: number | null,
): { severity: MetricSeverity; statusText: string } {
  if (val === null) return { severity: "missing", statusText: "Chưa có KQ" };
  switch (code) {
    case "WBC":
      if (val > 18 || val < 3)
        return { severity: "critical", statusText: val > 18 ? "Tăng rất cao" : "Giảm nặng" };
      if (val > 12 || val < 4)
        return { severity: "warning", statusText: val > 12 ? "Tăng (SIRS)" : "Giảm (SIRS)" };
      return { severity: "normal", statusText: "Bình thường" };
    case "CRP":
      if (val >= 100) return { severity: "critical", statusText: "Viêm rất cao" };
      if (val >= 20) return { severity: "warning", statusText: "Tăng cao" };
      if (val >= 10) return { severity: "warning", statusText: "Tăng nhẹ" };
      return { severity: "normal", statusText: "Bình thường" };
    case "procalcitonin":
      if (val >= 2.0) return { severity: "critical", statusText: "Gợi ý NKH cao" };
      if (val >= 0.5) return { severity: "warning", statusText: "Tăng (≥0,5)" };
      return { severity: "normal", statusText: "Bình thường" };
    case "platelets":
      if (val < 100) return { severity: "critical", statusText: "Giảm nặng (SOFA≥2)" };
      if (val < 150) return { severity: "warning", statusText: "Giảm (SOFA 1)" };
      return { severity: "normal", statusText: "Bình thường" };
    case "creatinine":
      if (val >= 2.0) return { severity: "critical", statusText: "Tăng mạnh (SOFA≥2)" };
      if (val >= 1.2) return { severity: "warning", statusText: "Tăng (SOFA 1)" };
      return { severity: "normal", statusText: "Bình thường" };
    case "bilirubin_total":
      if (val >= 2.0) return { severity: "critical", statusText: "Tăng mạnh (SOFA≥2)" };
      if (val >= 1.2) return { severity: "warning", statusText: "Tăng (SOFA 1)" };
      return { severity: "normal", statusText: "Bình thường" };
    default:
      return { severity: "normal", statusText: "Bình thường" };
  }
}

export function evaluateVitalsAt(
  encounter: Encounter,
  hour: number,
  source: ClinicalDataset = defaultDataset,
): VitalEval[] {
  const rows = availableVitals(encounter.id, hour, source);
  const cutoffMs = new Date(timeAt(encounter.t0, hour)).getTime();
  return VITAL_META.map((m) => {
    const valid = rows.filter((r) => r.values[m.key] !== null);
    const latest = valid.at(-1);
    const prev = valid.at(-2);
    const first = valid.at(0);
    const value = latest?.values[m.key] ?? null;
    const previous = prev?.values[m.key] ?? null;
    const baseline = first?.values[m.key] ?? null;
    const delta =
      value !== null && previous !== null ? value - previous : null;
    const ev = evaluateVitalValue(m.key, value);
    const ageMinutes = latest
      ? Math.max(
          0,
          Math.round((cutoffMs - new Date(latest.measuredAt).getTime()) / 60000),
        )
      : undefined;
    return {
      ...m,
      value,
      previous,
      delta,
      baseline,
      severity: ev.severity,
      statusText: ev.statusText,
      measuredAt: latest?.measuredAt,
      availableAt: latest?.availableAt,
      ageMinutes,
    };
  });
}

export function evaluateLabsAt(
  encounter: Encounter,
  hour: number,
  source: ClinicalDataset = defaultDataset,
): LabEval[] {
  const labs = availableLabs(encounter.id, hour, source);
  const prevLabs = hour > 0 ? availableLabs(encounter.id, hour - 1, source) : [];
  const prevSet = new Set(prevLabs);
  return LAB_META.map((m) => {
    const valid = labs.filter((l) => l.code === m.code && l.value !== null);
    const latest = valid.at(-1);
    const prev = valid.at(-2);
    const first = valid.at(0);
    const value = latest?.value ?? null;
    const previous = prev?.value ?? null;
    const baseline = first?.value ?? null;
    const delta =
      value !== null && previous !== null ? value - previous : null;
    const ev = evaluateLabValue(m.code, value);
    return {
      code: m.code,
      label: m.label,
      unit: latest?.unit ?? m.defaultUnit,
      refRange: m.refRange,
      value,
      previous,
      delta,
      baseline,
      severity: ev.severity,
      statusText: ev.statusText,
      collectedAt: latest?.collectedAt,
      availableAt: latest?.availableAt,
      isNewThisHour: latest ? !prevSet.has(latest) : false,
    };
  });
}

export function computeClinicalScores(
  vitals: VitalEval[],
  labs: LabEval[],
): ClinicalScores {
  const vMap = Object.fromEntries(vitals.map((v) => [v.key, v.value])) as Record<
    VitalKey,
    number | null
  >;
  const lMap = Object.fromEntries(labs.map((l) => [l.code, l.value])) as Record<
    string,
    number | null
  >;

  // qSOFA: RR >= 22, SBP <= 100, GCS < 15
  let qScore = 0;
  let qAvail = 0;
  const qMet: string[] = [];
  if (vMap.respiratory_rate_per_min !== null) {
    qAvail++;
    if (vMap.respiratory_rate_per_min >= 22) {
      qScore++;
      qMet.push(`Nhịp thở ${vMap.respiratory_rate_per_min} (≥22)`);
    }
  }
  if (vMap.sbp_mmhg !== null) {
    qAvail++;
    if (vMap.sbp_mmhg <= 100) {
      qScore++;
      qMet.push(`HATT ${vMap.sbp_mmhg} (≤100)`);
    }
  }
  if (vMap.gcs !== null) {
    qAvail++;
    if (vMap.gcs < 15) {
      qScore++;
      qMet.push(`GCS ${vMap.gcs} (<15)`);
    }
  }

  // SIRS: Temp >38/<36, HR >90, RR >20, WBC >12/<4
  let sirsScore = 0;
  let sirsAvail = 0;
  const sirsMet: string[] = [];
  if (vMap.temperature_c !== null) {
    sirsAvail++;
    if (vMap.temperature_c > 38 || vMap.temperature_c < 36) {
      sirsScore++;
      sirsMet.push(`Nhiệt độ ${vMap.temperature_c.toFixed(1)}°C`);
    }
  }
  if (vMap.heart_rate_bpm !== null) {
    sirsAvail++;
    if (vMap.heart_rate_bpm > 90) {
      sirsScore++;
      sirsMet.push(`Mạch ${vMap.heart_rate_bpm} (>90)`);
    }
  }
  if (vMap.respiratory_rate_per_min !== null) {
    sirsAvail++;
    if (vMap.respiratory_rate_per_min > 20) {
      sirsScore++;
      sirsMet.push(`Thở ${vMap.respiratory_rate_per_min} (>20)`);
    }
  }
  if (lMap.WBC !== null && lMap.WBC !== undefined) {
    sirsAvail++;
    if (lMap.WBC > 12 || lMap.WBC < 4) {
      sirsScore++;
      sirsMet.push(`WBC ${lMap.WBC.toFixed(1)}`);
    }
  }

  // MEWS (5 params: SBP, HR, RR, Temp, GCS/AVPU)
  let mews = 0;
  let mewsAvail = 0;
  if (vMap.sbp_mmhg !== null) {
    mewsAvail++;
    const x = vMap.sbp_mmhg;
    if (x <= 70) mews += 3;
    else if (x <= 80) mews += 2;
    else if (x <= 100) mews += 1;
    else if (x >= 200) mews += 2;
  }
  if (vMap.heart_rate_bpm !== null) {
    mewsAvail++;
    const x = vMap.heart_rate_bpm;
    if (x < 40) mews += 2;
    else if (x <= 50) mews += 1;
    else if (x >= 130) mews += 3;
    else if (x >= 111) mews += 2;
    else if (x >= 101) mews += 1;
  }
  if (vMap.respiratory_rate_per_min !== null) {
    mewsAvail++;
    const x = vMap.respiratory_rate_per_min;
    if (x < 9) mews += 2;
    else if (x >= 30) mews += 3;
    else if (x >= 21) mews += 2;
    else if (x >= 15) mews += 1;
  }
  if (vMap.temperature_c !== null) {
    mewsAvail++;
    const x = vMap.temperature_c;
    if (x < 35 || x >= 38.5) mews += 2;
  }
  if (vMap.gcs !== null) {
    mewsAvail++;
    const x = vMap.gcs;
    if (x <= 8) mews += 3;
    else if (x <= 12) mews += 2;
    else if (x < 15) mews += 1;
  }

  // SOFA organ screening (from available labs & vitals)
  let sofaAvail = 0;
  let sofaAffected = 0;
  const sofaDetails: string[] = [];
  if (vMap.map_mmhg !== null) {
    sofaAvail++;
    if (vMap.map_mmhg < 70) {
      sofaAffected++;
      sofaDetails.push(`Tuần hoàn: HATB ${vMap.map_mmhg.toFixed(0)} mmHg`);
    }
  }
  if (vMap.spo2_pct !== null) {
    sofaAvail++;
    if (vMap.spo2_pct < 94) {
      sofaAffected++;
      sofaDetails.push(`Hô hấp: SpO₂ ${vMap.spo2_pct.toFixed(1)}%`);
    }
  }
  if (vMap.gcs !== null) {
    sofaAvail++;
    if (vMap.gcs < 15) {
      sofaAffected++;
      sofaDetails.push(`Thần kinh: GCS ${vMap.gcs}`);
    }
  }
  if (lMap.platelets !== null && lMap.platelets !== undefined) {
    sofaAvail++;
    if (lMap.platelets < 150) {
      sofaAffected++;
      sofaDetails.push(`Đông máu: Tiểu cầu ${lMap.platelets.toFixed(0)}`);
    }
  }
  if (lMap.creatinine !== null && lMap.creatinine !== undefined) {
    sofaAvail++;
    if (lMap.creatinine >= 1.2) {
      sofaAffected++;
      sofaDetails.push(`Thận: Creatinine ${lMap.creatinine.toFixed(2)}`);
    }
  }
  if (lMap.bilirubin_total !== null && lMap.bilirubin_total !== undefined) {
    sofaAvail++;
    if (lMap.bilirubin_total >= 1.2) {
      sofaAffected++;
      sofaDetails.push(`Gan: Bilirubin ${lMap.bilirubin_total.toFixed(2)}`);
    }
  }

  return {
    qsofa: { score: qScore, available: qAvail, met: qMet },
    sirs: { score: sirsScore, available: sirsAvail, met: sirsMet },
    mews: {
      score: mews,
      available: mewsAvail,
      tier: mews >= 5 ? "high" : mews >= 3 ? "medium" : "low",
    },
    sofaOrgans: {
      affected: sofaAffected,
      available: sofaAvail,
      details: sofaDetails,
    },
  };
}

export function deriveTriage(
  scores: ClinicalScores,
  department: Prediction["department"],
  prediction?: Prediction,
): TriageInfo {
  const highRisk =
    scores.mews.score >= 5 ||
    scores.qsofa.score >= 2 ||
    department === "ICU";
  const medRisk =
    (prediction && prediction.score >= prediction.threshold) ||
    scores.mews.score >= 3 ||
    scores.sirs.score >= 2;
  if (highRisk) {
    return {
      level: 1,
      label: "Mức 1 · Cấp cứu ngay",
      cadenceLabel: "Đo lại mỗi 15p",
      cadenceMinutes: 15,
      zoneLabel: department === "ICU" ? "Hồi sức tích cực (ICU)" : "Phòng Hồi sức P1-138",
    };
  }
  if (medRisk) {
    return {
      level: 2,
      label: "Mức 2 · Ưu tiên (≤10p)",
      cadenceLabel: "Đo lại mỗi 1h",
      cadenceMinutes: 60,
      zoneLabel: department === "WARD" ? "Nội trú theo dõi" : "Khu lưu theo dõi Cấp cứu",
    };
  }
  return {
    level: 3,
    label: "Mức 3 · Theo dõi (≤30p)",
    cadenceLabel: "Đo lại mỗi 2h",
    cadenceMinutes: 120,
    zoneLabel: department === "WARD" ? "Nội trú" : "Khu khám chính Cấp cứu",
  };
}

function worstSeverity(items: MetricSeverity[]): MetricSeverity {
  if (items.includes("critical")) return "critical";
  if (items.includes("warning")) return "warning";
  if (items.includes("normal")) return "normal";
  return "missing";
}

function fmtAge(mins?: number): string | undefined {
  if (mins === undefined) return undefined;
  if (mins < 5) return "Vừa đo";
  if (mins < 60) return `${mins}p trước`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}p trước` : `${h}h trước`;
}

function fmtDelta(delta: number | null, decimals: number): string | undefined {
  if (delta === null || Math.abs(delta) < Math.pow(10, -decimals) / 2) {
    return undefined;
  }
  return `${delta > 0 ? "↑ +" : "↓ "}${delta.toFixed(decimals)}`;
}

export function buildOrganSystems(
  vitals: VitalEval[],
  labs: LabEval[],
): OrganSystemCard[] {
  const v = Object.fromEntries(vitals.map((x) => [x.key, x])) as Record<
    VitalKey,
    VitalEval
  >;
  const l = Object.fromEntries(labs.map((x) => [x.code, x])) as Record<
    string,
    LabEval
  >;

  const makeVitalMetric = (item: VitalEval) => ({
    label: item.shortLabel,
    valueText:
      item.value === null ? "—" : item.value.toFixed(item.decimals),
    unit: item.unit,
    deltaText: fmtDelta(item.delta, item.decimals),
    severity: item.severity,
    statusText: item.statusText,
    source: "eForm" as const,
    timeText: item.availableAt
      ? `${formatTime(item.availableAt)} (${fmtAge(item.ageMinutes) ?? ""})`
      : undefined,
  });

  const makeLabMetric = (item: LabEval, decimals = 2) => ({
    label: item.label.replace(/\s*\([^)]*\)/, ""),
    valueText: item.value === null ? "—" : item.value.toFixed(decimals),
    unit: item.unit,
    deltaText: fmtDelta(item.delta, decimals),
    severity: item.severity,
    statusText: item.statusText,
    source: "Labtc" as const,
    timeText: item.availableAt ? `Trả ${formatTime(item.availableAt)}` : undefined,
    isNew: item.isNewThisHour,
  });

  const circMetrics = [
    makeVitalMetric(v.sbp_mmhg),
    makeVitalMetric(v.map_mmhg),
    makeVitalMetric(v.heart_rate_bpm),
  ];
  const respMetrics = [
    makeVitalMetric(v.respiratory_rate_per_min),
    makeVitalMetric(v.spo2_pct),
  ];
  const inflMetrics = [
    makeVitalMetric(v.temperature_c),
    makeLabMetric(l.WBC, 1),
    makeLabMetric(l.CRP, 1),
    makeLabMetric(l.procalcitonin, 2),
  ];
  const neuroMetrics = [makeVitalMetric(v.gcs)];
  const renalMetrics = [makeLabMetric(l.creatinine, 2)];
  const liverMetrics = [
    makeLabMetric(l.platelets, 0),
    makeLabMetric(l.bilirubin_total, 2),
  ];

  const summarize = (
    sev: MetricSeverity,
    metrics: { label: string; severity: MetricSeverity; statusText: string }[],
  ) => {
    const bad = metrics.filter(
      (m) => m.severity === "critical" || m.severity === "warning",
    );
    if (bad.length > 0) {
      return bad.map((b) => `${b.label}: ${b.statusText}`).join(" · ");
    }
    if (sev === "missing") return "Chưa có dữ liệu";
    return "Trong giới hạn ổn định";
  };

  const cards: OrganSystemCard[] = [
    {
      id: "circulation",
      title: "Tuần hoàn",
      severity: worstSeverity(circMetrics.map((m) => m.severity)),
      summary: "",
      hasNewLab: false,
      metrics: circMetrics,
    },
    {
      id: "respiratory",
      title: "Hô hấp",
      severity: worstSeverity(respMetrics.map((m) => m.severity)),
      summary: "",
      hasNewLab: false,
      metrics: respMetrics,
    },
    {
      id: "inflammation",
      title: "Đáp ứng viêm · Nhiễm trùng",
      severity: worstSeverity(inflMetrics.map((m) => m.severity)),
      summary: "",
      hasNewLab: inflMetrics.some((m) => "isNew" in m && m.isNew),
      metrics: inflMetrics,
    },
    {
      id: "neuro",
      title: "Thần kinh · Ý thức",
      severity: worstSeverity(neuroMetrics.map((m) => m.severity)),
      summary: "",
      hasNewLab: false,
      metrics: neuroMetrics,
    },
    {
      id: "renal",
      title: "Thận",
      severity: worstSeverity(renalMetrics.map((m) => m.severity)),
      summary: "",
      hasNewLab: renalMetrics.some((m) => m.isNew),
      metrics: renalMetrics,
    },
    {
      id: "liver_coag",
      title: "Gan & Đông máu",
      severity: worstSeverity(liverMetrics.map((m) => m.severity)),
      summary: "",
      hasNewLab: liverMetrics.some((m) => m.isNew),
      metrics: liverMetrics,
    },
  ];

  for (const c of cards) {
    c.summary = summarize(c.severity, c.metrics);
  }
  return cards;
}

export function extractClinicalDrivers(
  encounter: Encounter,
  hour: number,
  source: ClinicalDataset = defaultDataset,
): ClinicalDriver[] {
  const vitals = evaluateVitalsAt(encounter, hour, source);
  const labs = evaluateLabsAt(encounter, hour, source);
  const deltaRisk = changeAt(encounter.id, hour, source);
  const drivers: ClinicalDriver[] = [];

  for (const v of vitals) {
    if (v.value === null) continue;
    if (v.severity === "critical" || v.severity === "warning") {
      const deltaStr = fmtDelta(v.delta, v.decimals);
      drivers.push({
        id: `v-${v.key}`,
        text: `${v.shortLabel} ${v.value.toFixed(v.decimals)} ${v.unit}`,
        detail: `${v.statusText}${deltaStr ? ` (${deltaStr})` : ""}`,
        severity: v.severity,
        source: "eForm",
      });
    }
  }

  for (const l of labs) {
    if (l.value === null) continue;
    if (l.severity === "critical" || l.severity === "warning" || l.isNewThisHour) {
      const dec = l.code === "platelets" ? 0 : l.code === "WBC" || l.code === "CRP" ? 1 : 2;
      drivers.push({
        id: `l-${l.code}`,
        text: `${l.label.replace(/\s*\([^)]*\)/, "")} ${l.value.toFixed(dec)} ${l.unit}`,
        detail: `${l.isNewThisHour ? "Mới trả Labtc · " : ""}${l.statusText}`,
        severity:
          l.severity === "critical"
            ? "critical"
            : l.severity === "warning"
              ? "warning"
              : "info",
        source: "Labtc",
      });
    }
  }

  if (deltaRisk !== undefined && deltaRisk >= 2) {
    drivers.push({
      id: "risk-jump",
      text: `Điểm nguy cơ tăng +${deltaRisk.toFixed(1)} đ.%`,
      detail: `So với mốc ${hourLabel(hour - 1)}`,
      severity: deltaRisk >= 10 ? "critical" : "warning",
      source: "AI",
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  drivers.sort((a, b) => order[a.severity] - order[b.severity]);
  return drivers.slice(0, 4);
}

export function buildComparisonRows(
  vitals: VitalEval[],
  labs: LabEval[],
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const v of vitals) {
    if (v.value === null && v.baseline === null) continue;
    const diff =
      v.value !== null && v.baseline !== null ? v.value - v.baseline : null;
    rows.push({
      label: v.shortLabel,
      unit: v.unit,
      t0Text: v.baseline === null ? "—" : v.baseline.toFixed(v.decimals),
      nowText: v.value === null ? "—" : v.value.toFixed(v.decimals),
      deltaText:
        diff === null
          ? "Mới đo lần đầu"
          : Math.abs(diff) < 0.05
            ? "Không đổi"
            : `${diff > 0 ? "+" : ""}${diff.toFixed(v.decimals)}`,
      severity: v.severity,
      source: "eForm",
    });
  }
  for (const l of labs) {
    if (l.value === null && l.baseline === null) continue;
    const dec = l.code === "platelets" ? 0 : l.code === "WBC" || l.code === "CRP" ? 1 : 2;
    const diff =
      l.value !== null && l.baseline !== null ? l.value - l.baseline : null;
    rows.push({
      label: l.label.replace(/\s*\([^)]*\)/, ""),
      unit: l.unit,
      t0Text: l.baseline === null ? "—" : l.baseline.toFixed(dec),
      nowText: l.value === null ? "—" : l.value.toFixed(dec),
      deltaText:
        diff === null
          ? "Chưa có trước đó"
          : Math.abs(diff) < 0.05
            ? "1 lần XN"
            : `${diff > 0 ? "+" : ""}${diff.toFixed(dec)}`,
      severity: l.severity,
      source: "Labtc",
    });
  }
  return rows;
}

export function groupAlertEpisodes(
  reviews: Record<string, Review>,
  source: ClinicalDataset = defaultDataset,
): AlertEpisode[] {
  const episodes: AlertEpisode[] = [];
  for (const encounter of source.encounters) {
    const preds = source.predictions
      .filter(
        (p) =>
          p.encounterId === encounter.id &&
          p.hour <= encounter.currentHour &&
          p.score >= p.threshold,
      )
      .sort((a, b) => a.hour - b.hour);
    if (preds.length === 0) continue;
    const latest = preds.at(-1)!;
    const first = preds[0];
    const peak = Math.max(...preds.map((p) => p.score));
    const currentPred = predictionAt(encounter.id, encounter.currentHour, source);
    const isActiveNow =
      !!currentPred && currentPred.score >= currentPred.threshold;
    const vitals = evaluateVitalsAt(encounter, latest.hour, source);
    const labs = evaluateLabsAt(encounter, latest.hour, source);
    const scores = computeClinicalScores(vitals, labs);
    const triage = deriveTriage(scores, latest.department, latest);
    const drivers = extractClinicalDrivers(encounter, latest.hour, source);
    const rev = reviews[latest.id];
    const validReview = rev && rev.revision === latest.revision ? rev : undefined;

    episodes.push({
      encounter,
      department: latest.department,
      firstAboveHour: first.hour,
      latestPrediction: latest,
      peakScore: peak,
      hoursAbove: preds.length,
      isActiveNow,
      review: validReview,
      drivers,
      triage,
      scores,
    });
  }
  return episodes.sort((a, b) => {
    const aUrg = a.isActiveNow && !a.review ? 0 : a.isActiveNow ? 1 : 2;
    const bUrg = b.isActiveNow && !b.review ? 0 : b.isActiveNow ? 1 : 2;
    return aUrg - bUrg || b.latestPrediction.score - a.latestPrediction.score;
  });
}

export function narrativeForHour(
  encounter: Encounter,
  hour: number,
  onset?: string | null,
  source: ClinicalDataset = defaultDataset,
): string {
  const p = predictionAt(encounter.id, hour, source);
  const st = stateOf(p);
  const drivers = extractClinicalDrivers(encounter, hour, source);
  const labs = evaluateLabsAt(encounter, hour, source);
  const newLabs = labs.filter((l) => l.isNewThisHour);

  if (hour === 0) {
    return "Thời điểm T0 (hoàn tất phân loại Triage). Hệ thống chỉ lưu hồ sơ gốc ban đầu; chưa phát điểm cảnh báo cho tới mốc T0+1h để tránh sai lệch khi dữ liệu còn trống.";
  }
  if (!p) {
    return `Tại ${hourLabel(hour)}, chưa có bản dự báo từ mô hình. Hệ thống giữ trạng thái chưa có kết quả thay vì suy diễn thành an toàn.`;
  }

  const parts: string[] = [];
  if (st === "above") {
    parts.push(
      `Tại ${hourLabel(hour)}, nguy cơ Sepsis 6h tới đạt ${percent(p.score)} (vượt ngưỡng cảnh báo ${percent(p.threshold)}).`,
    );
  } else {
    parts.push(
      `Tại ${hourLabel(hour)}, nguy cơ Sepsis đang ở mức ${percent(p.score)} (dưới ngưỡng ${percent(p.threshold)}).`,
    );
  }

  if (newLabs.length > 0) {
    parts.push(
      `Vừa có ${newLabs.length} kết quả xét nghiệm mới trả từ Labtc (${newLabs.map((l) => l.label.replace(/\s*\([^)]*\)/, "")).join(", ")}).`,
    );
  }

  if (drivers.length > 0) {
    parts.push(
      `Tín hiệu nổi bật: ${drivers
        .slice(0, 2)
        .map((d) => `${d.text} (${d.detail})`)
        .join("; ")}.`,
    );
  }

  if (onset) {
    const onsetMs = new Date(onset).getTime();
    const curMs = new Date(timeAt(encounter.t0, hour)).getTime();
    const leadHrs = Math.round(((onsetMs - curMs) / 3600000) * 10) / 10;
    if (st === "above" && leadHrs > 0) {
      parts.push(
        `Phát hiện sớm hơn mốc khởi phát tham chiếu ${leadHrs} giờ (trong khung giờ vàng).`,
      );
    } else if (leadHrs <= 0) {
      parts.push("Đã chạm hoặc vượt qua mốc khởi phát tham chiếu trên hồ sơ mẫu.");
    }
  }
  return parts.join(" ");
}

export function vitalSeriesForChart(
  encounter: Encounter,
  hour: number,
  source: ClinicalDataset = defaultDataset,
): {
  hour: number;
  score: number | null;
  hr: number | null;
  sbp: number | null;
  rr: number | null;
  temp: number | null;
}[] {
  const preds = source.predictions.filter(
    (p) => p.encounterId === encounter.id && p.hour <= hour,
  );
  const vitals: VitalObservation[] = availableVitals(encounter.id, hour, source);
  const t0Ms = new Date(encounter.t0).getTime();

  return Array.from({ length: hour + 1 }, (_, h) => {
    const pred = preds.find((p) => p.hour === h);
    const cutoff = t0Ms + h * 3600000;
    const prevCutoff = h === 0 ? t0Ms - 1 : t0Ms + (h - 1) * 3600000;
    const inBucket = vitals.filter((v) => {
      const m = new Date(v.measuredAt).getTime();
      return m > prevCutoff && m <= cutoff;
    });
    const latest = inBucket.at(-1);
    return {
      hour: h,
      score: pred?.score ?? null,
      hr: latest?.values.heart_rate_bpm ?? null,
      sbp: latest?.values.sbp_mmhg ?? null,
      rr: latest?.values.respiratory_rate_per_min ?? null,
      temp: latest?.values.temperature_c ?? null,
    };
  });
}

export function firstAlertHourOf(
  encounterId: string,
  upToHour: number,
  source: ClinicalDataset = defaultDataset,
): number | null {
  const first = source.predictions
    .filter(
      (p) =>
        p.encounterId === encounterId &&
        p.hour <= upToHour &&
        p.score >= p.threshold,
    )
    .sort((a, b) => a.hour - b.hour)[0];
  return first ? first.hour : null;
}
