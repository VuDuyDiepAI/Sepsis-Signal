"use client";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pause,
  Play,
  RotateCcw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClinicalNote } from "@/components/shared/empty-state";
import { AlertStatus, Trend } from "./alert-status";
import { RiskTimeline } from "./risk-timeline";
import { OrganSystemMap } from "./organ-system-map";
import { ClinicalDecisionTree } from "./clinical-decision-tree";
import {
  availableLabs,
  availableVitals,
  changeAt,
  dataset,
  departmentAt,
  departments,
  formatTime,
  hourLabel,
  percent,
  predictionAt,
  stateOf,
  timeAt,
} from "@/lib/clinical-data";
import {
  COMORBIDITY_LABELS,
  computeClinicalScores,
  deriveTriage,
  evaluateLabsAt,
  evaluateVitalsAt,
  extractClinicalDrivers,
  firstAlertHourOf,
  getActiveSiteAt,
  getEncounterContext,
  narrativeForHour,
  SITE_LABELS,
} from "@/lib/clinical-reasoning";

const SCENARIOS = [
  {
    id: "E0009",
    startHour: 7,
    shortLabel: "E0009 · Nhiễm khuẩn tiết niệu",
    diseaseTitle: "Nhiễm khuẩn tiết niệu diễn biến âm thầm",
  },
  {
    id: "E0015",
    startHour: 7,
    shortLabel: "E0015 · Nhiễm khuẩn ổ bụng (Bệnh nền)",
    diseaseTitle: "Nhiễm khuẩn ổ bụng trên nền Tim mạch & Thận mạn",
  },
  {
    id: "E0002",
    startHour: 8,
    shortLabel: "E0002 · Hô hấp ổn định (Đối chứng)",
    diseaseTitle: "Viêm đường hô hấp ổn định · Đối chứng không Sepsis",
  },
] as const;

type LensTab = "organs" | "tree";

export function ReplayScreen() {
  const [id, setId] = useState("E0009");
  const [hour, setHour] = useState(7);
  const [playing, setPlaying] = useState(false);
  const [lens, setLens] = useState<LensTab>("organs");
  const [reveal, setReveal] = useState(false);
  const [reference, setReference] = useState<{
    id: string;
    onset: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [referenceError, setReferenceError] = useState(false);

  const encounter = dataset.encounters.find((e) => e.id === id)!;
  const encounterPreds = dataset.predictions.filter((pr) => pr.encounterId === id);
  const maxAvailableHour = Math.min(
    36,
    Math.max(
      12,
      Math.min(
        encounterPreds.length
          ? Math.max(...encounterPreds.map((pr) => pr.hour))
          : 12,
        16,
      ),
    ),
  );

  // Auto-play progression
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setHour((prev) => {
        if (prev >= maxAvailableHour) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [playing, maxAvailableHour]);

  const at = timeAt(encounter.t0, hour);
  const dept = departmentAt(encounter.id, at, dataset);
  const p = predictionAt(encounter.id, hour, dataset);
  const state = stateOf(p);
  const deltaRisk = changeAt(encounter.id, hour, dataset);
  const meta = dataset.models.sepsis;

  const vitals = evaluateVitalsAt(encounter, hour, dataset);
  const labs = evaluateLabsAt(encounter, hour, dataset);
  const scores = computeClinicalScores(vitals, labs);
  const triage = deriveTriage(scores, dept, p);
  const drivers = extractClinicalDrivers(encounter, hour, dataset);
  const ctx = getEncounterContext(encounter.id);
  const siteInfo = getActiveSiteAt(encounter, hour);
  const firstAlertHour = firstAlertHourOf(encounter.id, 36, dataset);
  const onset = reveal && reference?.id === id ? reference.onset : undefined;
  const narrative = narrativeForHour(encounter, hour, onset, dataset);

  const scenarioMatch = SCENARIOS.find((s) => s.id === id);
  const diseaseTitle =
    scenarioMatch?.diseaseTitle ??
    (siteInfo.suspectedSite
      ? `Nghi nhiễm khuẩn ổ ${SITE_LABELS[siteInfo.suspectedSite] ?? siteInfo.suspectedSite}`
      : "Ca cấp cứu đang lưu theo dõi");

  // Precompute markers for the visual timeline scrubber (0..maxAvailableHour)
  const t0Ms = new Date(encounter.t0).getTime();
  const onsetHourMark = onset
    ? Math.round((new Date(onset).getTime() - t0Ms) / 3600000)
    : null;
  const timelineMarks = Array.from({ length: maxAvailableHour + 1 }, (_, h) => {
    const pred = predictionAt(encounter.id, h, dataset);
    const isAlert = !!pred && pred.score >= pred.threshold;
    const curL = availableLabs(encounter.id, h, dataset);
    const prevL = h > 0 ? availableLabs(encounter.id, h - 1, dataset) : [];
    const hasNewLab = curL.length > prevL.length;
    const curVH = availableVitals(encounter.id, h, dataset);
    const prevVH = h > 0 ? availableVitals(encounter.id, h - 1, dataset) : [];
    const hasNewVital = curVH.length > prevVH.length;
    return {
      h,
      isAlert,
      hasNewLab,
      hasNewVital,
      isOnset: onsetHourMark === h,
    };
  });

  // Lead time badge if reference onset is revealed
  let leadHours: number | null = null;
  if (onset && p && state === "above") {
    const diff =
      (new Date(onset).getTime() - new Date(timeAt(encounter.t0, hour)).getTime()) /
      3600000;
    if (diff > 0) leadHours = Math.round(diff * 10) / 10;
  }

  function selectCase(nextId: string, nextHour: number) {
    setPlaying(false);
    setId(nextId);
    setHour(nextHour);
    setReveal(false);
    setReference(null);
    setReferenceError(false);
  }

  async function toggleReference(checked: boolean) {
    setReveal(checked);
    if (checked) {
      setLoading(true);
      setReferenceError(false);
      try {
        const data = await import("@/data/reference-onsets.json");
        const references = data.default as Record<
          string,
          { sepsisOnset: string | null }
        >;
        setReference({ id, onset: references[id]?.sepsisOnset ?? null });
      } catch {
        setReferenceError(true);
      } finally {
        setLoading(false);
      }
    }
  }

  const qsofaTone =
    scores.qsofa.score >= 2 ? "crit" : scores.qsofa.score >= 1 ? "warn" : "";
  const sirsTone =
    scores.sirs.score >= 3 ? "crit" : scores.sirs.score >= 2 ? "warn" : "";
  const mewsTone =
    scores.mews.tier === "high"
      ? "crit"
      : scores.mews.tier === "medium"
        ? "warn"
        : "";
  const sofaTone =
    scores.sofaOrgans.affected >= 2
      ? "crit"
      : scores.sofaOrgans.affected >= 1
        ? "warn"
        : "";

  return (
    <>
      {/* 1. UNIFIED CASE IDENTITY & INTERACTIVE TIME SCRUBBER */}
      <section className="replay-stage" aria-label="Tua diễn biến ca mẫu">
        <div className="replay-bar-top">
          <div
            className="segment-group"
            role="group"
            aria-label="Ba kịch bản bệnh cảnh tiêu biểu"
          >
            {SCENARIOS.map((sc) => {
              const active = id === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  className={`segment-btn ${active ? "active" : ""}`}
                  aria-pressed={active}
                  onClick={() => selectCase(sc.id, sc.startHour)}
                >
                  {sc.shortLabel}
                </button>
              );
            })}
          </div>

          <div className="toolbar-controls">
            <select
              aria-label="Hồ sơ mô phỏng"
              value={id}
              onChange={(e) => {
                const nextId = e.target.value;
                const match = dataset.encounters.find((r) => r.id === nextId);
                selectCase(nextId, match?.currentHour ?? 0);
              }}
            >
              {dataset.encounters.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id} · {e.age}t {e.sex === "F" ? "Nữ" : "Nam"}
                </option>
              ))}
            </select>

            <label className="reference-toggle">
              <input
                type="checkbox"
                checked={reveal}
                onChange={(e) => void toggleReference(e.target.checked)}
              />
              Hiện khởi phát tham chiếu
            </label>
          </div>
        </div>

        {/* Disease Picture Line */}
        <div className="replay-case-banner">
          <div className="replay-case-title">
            <span className={`triage-badge t${Math.min(3, triage.level)}`}>
              T{triage.level}
            </span>
            <h1>{encounter.id}</h1>
            <span className="replay-disease-label">{diseaseTitle}</span>
            <span className="secondary-text">
              {encounter.age}t {encounter.sex === "F" ? "Nữ" : "Nam"} ·{" "}
              {departments[dept]} · T0 {formatTime(encounter.t0, true)}
              {ctx?.bmi != null ? ` · BMI ${ctx.bmi}` : ""}
            </span>
            {ctx?.comorbidities.map((c) => (
              <span key={c} className="context-tag comorb">
                {COMORBIDITY_LABELS[c] ?? c}
              </span>
            ))}
          </div>

          <div className="hour-select-group">
            <Button
              type="button"
              variant={playing ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (!playing && hour >= maxAvailableHour) setHour(0);
                setPlaying((v) => !v);
              }}
              aria-label={playing ? "Tạm dừng tua" : "Tua tự động theo giờ"}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Tạm dừng" : "Tua tự động"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Mốc trước"
              onClick={() => {
                setPlaying(false);
                setHour((h) => Math.max(0, h - 1));
              }}
              disabled={hour === 0}
            >
              <ChevronLeft />
            </Button>
            <select
              aria-label="Mốc giờ đang xem"
              value={hour}
              onChange={(e) => {
                setPlaying(false);
                setHour(Number(e.target.value));
              }}
            >
              {Array.from({ length: 37 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)} · {formatTime(timeAt(encounter.t0, h))}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Mốc tiếp theo"
              onClick={() => {
                setPlaying(false);
                setHour((h) => Math.min(36, h + 1));
              }}
              disabled={hour === 36}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        {/* Interactive Visual Timeline Scrubber */}
        <div className="scrubber-row">
          <div
            className="scrubber-track"
            role="group"
            aria-label="Dải mốc giờ trực quan"
          >
            {timelineMarks.map((m) => (
              <button
                key={m.h}
                type="button"
                className={`scrubber-step ${m.isAlert ? "is-alert" : ""} ${
                  hour === m.h ? "is-current" : ""
                }`}
                onClick={() => {
                  setPlaying(false);
                  setHour(m.h);
                }}
                title={`${hourLabel(m.h)} · ${formatTime(timeAt(encounter.t0, m.h))}${
                  m.isAlert ? " · Vượt ngưỡng" : ""
                }${m.hasNewLab ? " · Có XN mới trả" : ""}`}
              >
                <span>{m.h === 0 ? "T0" : `+${m.h}h`}</span>
                <span className="scrubber-dots" aria-hidden="true">
                  {m.hasNewVital && <i className="scrubber-dot vital" />}
                  {m.hasNewLab && <i className="scrubber-dot lab" />}
                  {m.isAlert && <i className="scrubber-dot alert" />}
                </span>
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              className="btn-clinical"
              style={{ minHeight: 32, padding: "0 9px", fontSize: 12 }}
              disabled={hour === 0}
              onClick={() => {
                setPlaying(false);
                setHour(0);
              }}
            >
              <RotateCcw size={12} aria-hidden="true" />
              T0
            </button>
            {firstAlertHour !== null && (
              <button
                type="button"
                className="btn-clinical"
                style={{ minHeight: 32, padding: "0 9px", fontSize: 12 }}
                disabled={hour === firstAlertHour}
                onClick={() => {
                  setPlaying(false);
                  setHour(firstAlertHour);
                }}
              >
                <Zap size={12} aria-hidden="true" />
                Báo sớm ({hourLabel(firstAlertHour)})
              </button>
            )}
          </div>
        </div>

        {/* Scrubber Legend + Onset status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 11.5,
            color: "var(--ink-muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <i className="scrubber-dot vital" /> Đo sinh hiệu (eForm)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <i className="scrubber-dot lab" /> Trả XN mới (Labtc)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <i className="scrubber-dot alert" /> Vượt ngưỡng cảnh báo
            </span>
          </div>
          {reveal && (
            <span role="status" style={{ fontWeight: 600, color: "var(--clinical-critical)" }}>
              {loading
                ? "Đang tải tham chiếu…"
                : referenceError
                  ? "Không tải được tham chiếu. Bỏ chọn rồi bật lại để thử lại."
                  : onset
                    ? `Khởi phát tham chiếu: ${formatTime(onset, true)}`
                    : "Không có mốc khởi phát trong hồ sơ này."}
            </span>
          )}
        </div>
      </section>

      {/* 2. UNIFIED TOP PANEL: Left = Risk / Narrative / Clinical Scores; Right = 6-Organ-System Map */}
      <section
        className="replay-unified-card"
        aria-label="Tổng quan bệnh cảnh và 6 hệ cơ quan"
      >
        <div
          className="replay-unified-left"
          aria-label="Cảnh báo tại mốc đang xem"
        >
          {/* Block 1: Risk Signal & Threshold */}
          <div>
            <div className="risk-headline">
              <AlertStatus state={state} />
              {p && <Trend value={deltaRisk} />}
              {leadHours !== null && (
                <span className="status-pill below">
                  Báo sớm {leadHours}h trước khởi phát
                </span>
              )}
            </div>
            <div className="risk-score-row">
              <div
                className={`risk-main ${state === "above" ? "alert" : ""}`}
                data-testid="risk-score"
              >
                {p ? percent(p.score) : "—"}
              </div>
              <div className="risk-threshold-meta">
                Ngưỡng{" "}
                <strong data-testid="risk-threshold">
                  {percent(meta.threshold)}
                </strong>
              </div>
            </div>
            <p
              className="secondary-text"
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              <Clock3 size={12} aria-hidden="true" />
              {hourLabel(hour)} · {formatTime(at, true)}
            </p>
          </div>

          {/* Block 2: Narrative & Clinical Drivers */}
          <div
            style={{
              borderTop: "1px solid var(--line-subtle)",
              paddingTop: 12,
            }}
          >
            <div className="section-kicker">
              Diễn biến &amp; Cảnh báo tại {hourLabel(hour)}
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-primary)",
                marginBottom: drivers.length > 0 ? 10 : 0,
                lineHeight: 1.55,
              }}
            >
              {hour === 0
                ? "T0 là mốc hoàn tất phân loại ban đầu. Lần dự báo đầu tiên từ T0+1h."
                : narrative}
            </p>
            {drivers.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {drivers.slice(0, 3).map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    <span
                      className={`driver-dot ${d.severity}`}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{d.text}</strong>{" "}
                      <span className="muted">({d.detail})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Block 3: Clinical Scores Comparison */}
          <div
            style={{
              borderTop: "1px solid var(--line-subtle)",
              paddingTop: 12,
            }}
          >
            <div className="section-kicker">Thang điểm đối chiếu</div>
            <div className="scores-strip-clean">
              <div className={`score-kv ${qsofaTone}`}>
                <span>qSOFA</span>
                <strong>
                  {scores.qsofa.available > 0 ? `${scores.qsofa.score}/3` : "—"}
                </strong>
              </div>
              <div className={`score-kv ${sirsTone}`}>
                <span>SIRS</span>
                <strong>
                  {scores.sirs.available > 0 ? `${scores.sirs.score}/4` : "—"}
                </strong>
              </div>
              <div className={`score-kv ${mewsTone}`}>
                <span>MEWS</span>
                <strong>
                  {scores.mews.available > 0 ? `${scores.mews.score} đ` : "—"}
                </strong>
              </div>
              <div className={`score-kv ${sofaTone}`}>
                <span>Cơ quan SOFA</span>
                <strong>
                  {scores.sofaOrgans.available > 0
                    ? `${scores.sofaOrgans.affected}/${scores.sofaOrgans.available}`
                    : "—"}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right: 6-Organ-System Map / Decision Tree */}
        <div className="replay-unified-right">
          <div className="replay-unified-right-bar">
            <div
              className="segment-group"
              role="tablist"
              aria-label="Góc nhìn lâm sàng"
            >
              <button
                type="button"
                role="tab"
                aria-selected={lens === "organs"}
                className={`segment-btn ${lens === "organs" ? "active" : ""}`}
                onClick={() => setLens("organs")}
              >
                6 Hệ cơ quan
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={lens === "tree"}
                className={`segment-btn ${lens === "tree" ? "active" : ""}`}
                onClick={() => setLens("tree")}
              >
                Lưu đồ nhánh Sepsis
              </button>
            </div>
            <span className="secondary-text">
              Dữ liệu EMR tính đến {formatTime(at, true)}
            </span>
          </div>

          {lens === "organs" ? (
            <OrganSystemMap encounter={encounter} hour={hour} />
          ) : (
            <ClinicalDecisionTree encounter={encounter} hour={hour} />
          )}
        </div>
      </section>

      {/* 3. FULL-WIDTH TRAJECTORY CHART BELOW */}
      <RiskTimeline
        encounter={encounter}
        hour={hour}
        onHourChange={(nextH) => {
          setPlaying(false);
          setHour(nextH);
        }}
        onset={onset}
      />

      <ClinicalNote />
    </>
  );
}
