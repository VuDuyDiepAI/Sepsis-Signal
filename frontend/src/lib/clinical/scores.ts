import type {
  Department,
  LaboratoryResult,
  VitalKey,
  VitalObservation,
} from "@/lib/contracts/clinical";

export interface ScoreComponent {
  score: number;
  max: number;
  known: number;
  total: number;
  elevated: boolean;
  missing: string[];
}

export interface ClinicalScores {
  qsofa: ScoreComponent;
  sirs: ScoreComponent;
  mews: ScoreComponent;
}

function latestVital(
  vitals: VitalObservation[],
  key: VitalKey,
): number | null {
  for (let i = vitals.length - 1; i >= 0; i--) {
    const val = vitals[i].values[key];
    if (val !== null && val !== undefined && Number.isFinite(val)) return val;
  }
  return null;
}

function latestLab(labs: LaboratoryResult[], code: string): number | null {
  for (let i = labs.length - 1; i >= 0; i--) {
    const item = labs[i];
    if (item.code === code && item.value !== null && Number.isFinite(item.value))
      return item.value;
  }
  return null;
}

/**
 * Compute standard bedside comparator scores (Sepsis-3 qSOFA, SIRS, Subbe MEWS)
 * strictly from observations already available at or before the selected hour.
 */
export function computeClinicalScores(
  vitals: VitalObservation[],
  labs: LaboratoryResult[],
): ClinicalScores {
  const hr = latestVital(vitals, "heart_rate_bpm");
  const rr = latestVital(vitals, "respiratory_rate_per_min");
  const sbp = latestVital(vitals, "sbp_mmhg");
  const temp = latestVital(vitals, "temperature_c");
  const gcs = latestVital(vitals, "gcs");
  const wbc = latestLab(labs, "WBC");

  // 1. qSOFA (Sepsis-3: RR >= 22, SBP <= 100, GCS < 15)
  let qScore = 0;
  let qKnown = 0;
  const qMissing: string[] = [];
  if (rr !== null) {
    qKnown++;
    if (rr >= 22) qScore++;
  } else qMissing.push("Nhịp thở");
  if (sbp !== null) {
    qKnown++;
    if (sbp <= 100) qScore++;
  } else qMissing.push("HA tâm thu");
  if (gcs !== null) {
    qKnown++;
    if (gcs < 15) qScore++;
  } else qMissing.push("GCS");

  // 2. SIRS (Temp >38 or <36, HR >90, RR >20, WBC >12 or <4)
  let sScore = 0;
  let sKnown = 0;
  const sMissing: string[] = [];
  if (temp !== null) {
    sKnown++;
    if (temp > 38.0 || temp < 36.0) sScore++;
  } else sMissing.push("Nhiệt độ");
  if (hr !== null) {
    sKnown++;
    if (hr > 90) sScore++;
  } else sMissing.push("Nhịp tim");
  if (rr !== null) {
    sKnown++;
    if (rr > 20) sScore++;
  } else sMissing.push("Nhịp thở");
  if (wbc !== null) {
    sKnown++;
    if (wbc > 12.0 || wbc < 4.0) sScore++;
  } else sMissing.push("WBC");

  // 3. MEWS (Subbe et al.: SBP, HR, RR, Temp, GCS/AVPU)
  let mScore = 0;
  let mKnown = 0;
  const mMissing: string[] = [];
  if (sbp !== null) {
    mKnown++;
    if (sbp <= 70) mScore += 3;
    else if (sbp <= 80) mScore += 2;
    else if (sbp <= 100) mScore += 1;
    else if (sbp >= 200) mScore += 2;
  } else mMissing.push("HA tâm thu");
  if (hr !== null) {
    mKnown++;
    if (hr <= 40) mScore += 2;
    else if (hr <= 50) mScore += 1;
    else if (hr <= 100) mScore += 0;
    else if (hr <= 110) mScore += 1;
    else if (hr <= 129) mScore += 2;
    else mScore += 3;
  } else mMissing.push("Nhịp tim");
  if (rr !== null) {
    mKnown++;
    if (rr < 9) mScore += 2;
    else if (rr <= 14) mScore += 0;
    else if (rr <= 20) mScore += 1;
    else if (rr <= 29) mScore += 2;
    else mScore += 3;
  } else mMissing.push("Nhịp thở");
  if (temp !== null) {
    mKnown++;
    if (temp < 35.0 || temp >= 38.5) mScore += 2;
  } else mMissing.push("Nhiệt độ");
  if (gcs !== null) {
    mKnown++;
    if (gcs <= 8) mScore += 3;
    else if (gcs <= 12) mScore += 2;
    else if (gcs <= 14) mScore += 1;
  } else mMissing.push("GCS");

  return {
    qsofa: {
      score: qScore,
      max: 3,
      known: qKnown,
      total: 3,
      elevated: qScore >= 2,
      missing: qMissing,
    },
    sirs: {
      score: sScore,
      max: 4,
      known: sKnown,
      total: 4,
      elevated: sScore >= 2,
      missing: sMissing,
    },
    mews: {
      score: mScore,
      max: 14,
      known: mKnown,
      total: 5,
      elevated: mScore >= 5,
      missing: mMissing,
    },
  };
}

export const HOUR_ONE_BUNDLE = [
  "Đo lactate máu (lặp lại nếu lactate ban đầu > 2 mmol/L)",
  "Lấy mẫu cấy máu trước khi dùng kháng sinh (không trì hoãn kháng sinh)",
  "Kháng sinh phổ rộng đường tĩnh mạch",
  "Bù dịch tinh thể 30 mL/kg nếu hạ huyết áp hoặc lactate ≥ 4 mmol/L; cân nhắc vận mạch duy trì MAP ≥ 65 mmHg",
] as const;

export const REVIEW_DISPOSITIONS = [
  { value: "", label: "Chọn phân loại nhanh (không bắt buộc)" },
  { value: "Phát hiện sớm hữu ích", label: "Phát hiện sớm hữu ích (cảnh báo mới)" },
  {
    value: "Đã nghi ngờ nhiễm trùng trước đó",
    label: "Đã nghi ngờ / đang theo dõi nhiễm trùng trước đó",
  },
  {
    value: "Không phù hợp lâm sàng / cảnh báo giả",
    label: "Không phù hợp lâm sàng / cảnh báo giả",
  },
] as const;

export function composeReviewNote(disposition: string, note: string): string {
  const cleanDisposition = disposition.trim();
  const cleanNote = note.trim();
  if (!cleanDisposition) return cleanNote;
  if (!cleanNote) return `[${cleanDisposition}]`;
  return `[${cleanDisposition}] ${cleanNote}`;
}

export interface ReferenceRange {
  low?: number;
  high?: number;
  label: string;
}

export const VITAL_REFERENCES: Record<VitalKey, ReferenceRange> = {
  heart_rate_bpm: { low: 60, high: 100, label: "60–100" },
  respiratory_rate_per_min: { low: 12, high: 20, label: "12–20" },
  sbp_mmhg: { low: 90, high: 140, label: "90–140" },
  map_mmhg: { low: 65, label: "≥ 65" },
  spo2_pct: { low: 95, label: "≥ 95%" },
  temperature_c: { low: 36.0, high: 38.0, label: "36,0–38,0" },
  gcs: { low: 15, label: "15" },
};

export const LAB_REFERENCES: Record<string, ReferenceRange> = {
  WBC: { low: 4.0, high: 12.0, label: "4,0–12,0" },
  platelets: { low: 150, high: 400, label: "150–400" },
  creatinine: { high: 1.2, label: "≤ 1,2" },
  bilirubin_total: { high: 1.2, label: "≤ 1,2" },
  CRP: { high: 10.0, label: "≤ 10" },
  procalcitonin: { high: 0.5, label: "≤ 0,5" },
};

export interface ValueAssessment {
  status: "normal" | "high" | "low" | "missing";
  badge: "↑ Cao" | "↓ Thấp" | null;
  rangeLabel: string;
}

export function assessClinicalValue(
  kind: "vital" | "lab",
  key: string,
  value: number | null | undefined,
): ValueAssessment {
  const ref =
    kind === "vital"
      ? VITAL_REFERENCES[key as VitalKey]
      : LAB_REFERENCES[key];
  const rangeLabel = ref?.label ?? "";
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { status: "missing", badge: null, rangeLabel };
  }
  if (ref?.high !== undefined && value > ref.high) {
    return { status: "high", badge: "↑ Cao", rangeLabel };
  }
  if (ref?.low !== undefined && value < ref.low) {
    return { status: "low", badge: "↓ Thấp", rangeLabel };
  }
  return { status: "normal", badge: null, rangeLabel };
}

export function estimateMap(
  sbp: number | null,
  dbp: number | null,
): number | null {
  if (
    sbp === null ||
    dbp === null ||
    !Number.isFinite(sbp) ||
    !Number.isFinite(dbp) ||
    dbp >= sbp
  ) {
    return null;
  }
  return Math.round((sbp + 2 * dbp) / 3);
}

export function formatScoreCue(
  kind: "qSOFA" | "SIRS" | "MEWS",
  item: ScoreComponent,
): { valueText: string; statusText: string; missingText: string } {
  if (item.known === 0) {
    return { valueText: "Chưa đủ dữ liệu", statusText: "", missingText: "" };
  }
  const valueText =
    kind === "MEWS" ? `${item.score} điểm` : `${item.score}/${item.max} tiêu chí`;
  const statusText = item.elevated
    ? "Cảnh báo"
    : kind === "MEWS" && item.score >= 3
      ? "Theo dõi"
      : "Chưa báo";
  const missingText =
    item.missing.length > 0 ? `thiếu ${item.missing.join(", ")}` : "";
  return { valueText, statusText, missingText };
}

export interface AlertRouteInfo {
  team: string;
  sla: string;
  escalation: string;
}

export const ALERT_ROUTING: Record<Department, AlertRouteInfo> = {
  ED: {
    team: "Kíp trực Cấp cứu",
    sla: "SLA ≤ 15p",
    escalation: "BS trực chính / Trưởng tua Cấp cứu",
  },
  WARD: {
    team: "Kíp trực Nội trú",
    sla: "SLA ≤ 15p",
    escalation: "BS trực chính khoa Nội trú",
  },
  ICU: {
    team: "Bác sĩ trực ICU",
    sla: "SLA ≤ 10p",
    escalation: "BS phụ trách tua Hồi sức",
  },
};

export const ALERT_SOP_STEPS = [
  {
    step: "1. Phát tín hiệu êm dịu",
    owner: "Hệ thống · Khóa lặp 6h",
    detail:
      "Đẩy ca lên đầu hàng đợi trực quan (không còi ồn tại giường) và định tuyến đúng khoa ED / Nội trú / ICU.",
  },
  {
    step: "2. Lọc nhiễu & báo bác sĩ",
    owner: "Điều dưỡng · ≤ 5–10 phút",
    detail:
      "Kiểm tra lỗi nhập liệu hoặc tuột cảm biến, đo kiểm tra lại sinh hiệu tại giường nếu nghi nhiễu và báo bác sĩ phụ trách.",
  },
  {
    step: "3. Đánh giá & quyết định",
    owner: "Bác sĩ trực · ≤ 15 phút",
    detail:
      "Xem Top yếu tố tăng điểm + đối chứng qSOFA/SIRS/MEWS, khám trực tiếp người bệnh, tự ra y lệnh trên OH (tham khảo Gói 1 giờ) và bấm “Đã xem xét”.",
  },
  {
    step: "4. Leo thang quá hạn",
    owner: "Trưởng tua trực · 15–20p",
    detail:
      "Nếu quá 15 phút chưa có xác nhận xem xét, điều dưỡng nhắc trực tiếp và chuyển tuyến lên Bác sĩ trực chính để không bỏ sót ca nặng.",
  },
] as const;
