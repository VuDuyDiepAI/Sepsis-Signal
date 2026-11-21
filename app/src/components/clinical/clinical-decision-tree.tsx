"use client";
import { Panel } from "@/components/layout/page-container";
import { useClinicalDataset } from "@/lib/manual-store";
import {
  departmentAt,
  hourLabel,
  percent,
  predictionAt,
  stateOf,
  timeAt,
} from "@/lib/clinical-data";
import {
  buildOrganSystems,
  COMORBIDITY_LABELS,
  computeClinicalScores,
  deriveTriage,
  evaluateLabsAt,
  evaluateVitalsAt,
  getActiveSiteAt,
  getEncounterContext,
  SITE_LABELS,
} from "@/lib/clinical-reasoning";
import type { Encounter } from "@/lib/clinical-types";

export interface ManualContextInput {
  comorbidities?: Record<string, boolean>;
  symptoms?: Record<string, boolean> | null;
  height?: number | null;
  weight?: number | null;
}

export function ClinicalDecisionTree({
  encounter,
  hour,
  manualContext,
}: {
  encounter: Encounter;
  hour: number;
  manualContext?: ManualContextInput;
}) {
  const dataset = useClinicalDataset(encounter.id);
  const p = predictionAt(encounter.id, hour, dataset);
  const state = stateOf(p);
  const at = timeAt(encounter.t0, hour);
  const dept = departmentAt(encounter.id, at, dataset);
  const vitals = evaluateVitalsAt(encounter, hour, dataset);
  const labs = evaluateLabsAt(encounter, hour, dataset);
  const scores = computeClinicalScores(vitals, labs);
  const triage = deriveTriage(scores, dept, p);
  const organs = buildOrganSystems(vitals, labs);
  const ctx = getEncounterContext(encounter.id, manualContext);
  const siteInfo = getActiveSiteAt(encounter, hour, manualContext?.symptoms);

  const siteLabel = siteInfo.suspectedSite
    ? (SITE_LABELS[siteInfo.suspectedSite] ?? siteInfo.suspectedSite)
    : "Chưa ghi nhận ổ rõ";
  const comorbidityText =
    ctx && ctx.comorbidities.length > 0
      ? ctx.comorbidities
          .map((c) => COMORBIDITY_LABELS[c] ?? c)
          .join(", ")
      : "Không ghi nhận bệnh nền";

  // Step 2 classification
  const screenCritical =
    state === "above" || scores.qsofa.score >= 2 || scores.mews.tier === "high";
  const screenWarning =
    !screenCritical &&
    (scores.sirs.score >= 2 ||
      scores.mews.score >= 3 ||
      scores.qsofa.score >= 1);
  const step2Class = screenCritical
    ? "is-critical"
    : screenWarning
      ? "is-warning"
      : p
        ? "is-ok"
        : "";
  const step2Badge = screenCritical
    ? { text: "Vượt ngưỡng", tone: "crit" }
    : screenWarning
      ? { text: "Cần theo dõi", tone: "warn" }
      : p
        ? { text: "Ổn định", tone: "ok" }
        : { text: "Chưa có AI", tone: "muted" };

  // Step 3 classification
  const affectedOrgans = organs.filter(
    (o) => o.severity === "critical" || o.severity === "warning",
  );
  const missingLabs = labs.filter((l) => l.value === null);
  const organCritical =
    organs.some((o) => o.severity === "critical") ||
    scores.sofaOrgans.affected >= 2;
  const organWarning =
    !organCritical &&
    (organs.some((o) => o.severity === "warning") ||
      scores.sofaOrgans.affected >= 1);
  const step3Class = organCritical
    ? "is-critical"
    : organWarning
      ? "is-warning"
      : scores.sofaOrgans.available > 0
        ? "is-ok"
        : "";
  const step3Badge = organCritical
    ? { text: "Tổn thương nặng", tone: "crit" }
    : organWarning
      ? { text: "Có biến đổi", tone: "warn" }
      : scores.sofaOrgans.available > 0
        ? { text: "Chưa suy cơ quan", tone: "ok" }
        : { text: "Chờ dữ liệu", tone: "muted" };

  // Step 4 branching clinical cue
  const actionLevel: "critical" | "warning" | "stable" =
    state === "above" || organCritical || scores.qsofa.score >= 2
      ? "critical"
      : screenWarning || organWarning
        ? "warning"
        : "stable";

  const step4Config =
    actionLevel === "critical"
      ? {
          cls: "is-critical",
          badge: { text: "Ưu tiên 1", tone: "crit" },
          heading: "Đánh giá ngay tại giường",
          items: [
            "Ưu tiên 1: BS đánh giá tại giường · Cân nhắc đánh giá Gói 1 giờ (Lactate, Cấy máu, Kháng sinh, giữ HATB ≥ 65).",
            "Tái đánh giá sinh hiệu mỗi 15 phút và rà soát ngay kết quả Labtc.",
          ],
        }
      : actionLevel === "warning"
        ? {
            cls: "is-warning",
            badge: { text: "Theo dõi sát", tone: "warn" },
            heading: "Tăng tần suất theo dõi",
            items: [
              "Ưu tiên theo dõi: Điều dưỡng tái đánh giá sinh hiệu theo lịch Triage · Theo dõi kết quả Labtc trả về.",
              "Báo bác sĩ trực ngay nếu HATT giảm ≤ 100 mmHg hoặc nhịp thở ≥ 22 l/p.",
            ],
          }
        : {
            cls: "is-ok",
            badge: { text: "Thường quy", tone: "ok" },
            heading: "Theo dõi thường quy",
            items: [
              "Tiếp tục theo dõi thường quy · Tránh chỉ định kháng sinh quá mức khi chưa đủ bằng chứng.",
              `Duy trì lịch đo sinh hiệu (${triage.cadenceLabel}) và đánh giá lại khi có xét nghiệm mới.`,
            ],
          };

  const triageBadgeTone =
    triage.level === 1 ? "crit" : triage.level === 2 ? "warn" : "muted";

  return (
    <Panel
      title="Lưu đồ tiếp cận Sepsis theo dữ liệu hiện có"
      description="Phân nhánh theo bối cảnh lâm sàng, sàng lọc sớm, dấu hiệu cơ quan và hướng ưu tiên xử trí."
      meta={hourLabel(hour)}
    >
      <div className="decision-tree">
        {/* Step 1: Context */}
        <div className="tree-node is-active">
          <div className="tree-step-num">
            <span>01 · Bối cảnh</span>
            <span className={`tree-branch-badge ${triageBadgeTone}`}>
              Triage mức {triage.level}
            </span>
          </div>
          <h3>Ổ nhiễm & Nền người bệnh</h3>
          <ul>
            <li>Ổ nghi nhiễm: {siteLabel}</li>
            <li>Bệnh nền: {comorbidityText}</li>
            <li>
              {triage.label} · {triage.zoneLabel}
            </li>
          </ul>
        </div>

        {/* Step 2: Early Screening & AI 6h */}
        <div className={`tree-node ${step2Class}`}>
          <div className="tree-step-num">
            <span>02 · Sàng lọc sớm & AI 6h</span>
            <span className={`tree-branch-badge ${step2Badge.tone}`}>
              {step2Badge.text}
            </span>
          </div>
          <h3>Tín hiệu AI & Thang điểm</h3>
          <ul>
            <li>
              AI 6h:{" "}
              {p
                ? `${percent(p.score)} (ngưỡng ${percent(p.threshold)})`
                : "Chưa có kết quả dự báo"}
            </li>
            <li>
              qSOFA:{" "}
              {scores.qsofa.available > 0 ? `${scores.qsofa.score}/3` : "—"} ·
              MEWS: {scores.mews.available > 0 ? `${scores.mews.score} đ` : "—"}
            </li>
            <li>
              SIRS:{" "}
              {scores.sirs.available > 0 ? `${scores.sirs.score}/4` : "—"}
              {scores.sirs.met.length > 0
                ? ` (${scores.sirs.met.slice(0, 2).join(", ")})`
                : ""}
            </li>
          </ul>
        </div>

        {/* Step 3: Organ Dysfunction */}
        <div className={`tree-node ${step3Class}`}>
          <div className="tree-step-num">
            <span>03 · Dấu hiệu suy cơ quan</span>
            <span className={`tree-branch-badge ${step3Badge.tone}`}>
              {step3Badge.text}
            </span>
          </div>
          <h3>Hệ cơ quan & Labtc</h3>
          <ul>
            {scores.sofaOrgans.details.length > 0 ? (
              scores.sofaOrgans.details
                .slice(0, 2)
                .map((d) => <li key={d}>{d}</li>)
            ) : affectedOrgans.length > 0 ? (
              affectedOrgans.slice(0, 2).map((o) => (
                <li key={o.id}>
                  {o.title}: {o.summary}
                </li>
              ))
            ) : (
              <li>Chưa ghi nhận dấu hiệu suy cơ quan trên các chỉ số đã có.</li>
            )}
            <li>
              {missingLabs.length > 0
                ? `Chưa có KQ Labtc: ${missingLabs
                    .map((l) => l.label.replace(/\s*\([^)]*\)/, ""))
                    .join(", ")}`
                : "Đã có đủ 6 xét nghiệm cơ bản từ Labtc."}
            </li>
          </ul>
        </div>

        {/* Step 4: Clinical Priority */}
        <div className={`tree-node ${step4Config.cls}`}>
          <div className="tree-step-num">
            <span>04 · Hướng ưu tiên lâm sàng</span>
            <span className={`tree-branch-badge ${step4Config.badge.tone}`}>
              {step4Config.badge.text}
            </span>
          </div>
          <h3>{step4Config.heading}</h3>
          <ul>
            {step4Config.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
