"use client";
import { Activity, Clock3, Gauge } from "lucide-react";
import { useClinicalDataset } from "@/lib/manual-store";
import { AlertStatus, Trend } from "./alert-status";
import {
  changeAt,
  formatTime,
  hourLabel,
  percent,
  predictionAt,
  stateOf,
  timeAt,
} from "@/lib/clinical-data";
import {
  computeClinicalScores,
  evaluateLabsAt,
  evaluateVitalsAt,
  extractClinicalDrivers,
} from "@/lib/clinical-reasoning";
import type { Encounter } from "@/lib/clinical-types";

export function RiskSummary({
  encounter,
  hour,
}: {
  encounter: Encounter;
  hour: number;
}) {
  const dataset = useClinicalDataset(encounter.id);
  const p = predictionAt(encounter.id, hour, dataset);
  const state = stateOf(p);
  const meta = dataset.models.sepsis;
  const vitals = evaluateVitalsAt(encounter, hour, dataset);
  const labs = evaluateLabsAt(encounter, hour, dataset);
  const scores = computeClinicalScores(vitals, labs);
  const drivers = extractClinicalDrivers(encounter, hour, dataset).slice(0, 3);

  const qsofaTone =
    scores.qsofa.score >= 2
      ? "crit"
      : scores.qsofa.score === 1
        ? "warn"
        : "";
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
      : scores.sofaOrgans.affected === 1
        ? "warn"
        : "";

  const bannerClass =
    state === "above"
      ? "risk-banner is-above"
      : state === "below"
        ? "risk-banner is-below"
        : "risk-banner";

  return (
    <section className={bannerClass} aria-label="Trạng thái nguy cơ Sepsis">
      <div className="risk-banner-grid">
        {/* Column 1: AI Risk Signal */}
        <div>
          <div className="risk-headline">
            <AlertStatus state={state} />
            {p && <Trend value={changeAt(encounter.id, hour, dataset)} />}
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

          <div
            className="secondary-text"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Clock3 size={13} aria-hidden="true" />
            <span>
              {hourLabel(hour)} · {formatTime(timeAt(encounter.t0, hour), true)}
            </span>
          </div>

          <p className="secondary-text" style={{ marginTop: 4 }}>
            {p
              ? `Dự báo ${meta.horizon_hours}h tới · ${p.availableFeatures}/36 đặc trưng EMR.`
              : hour === 0
                ? "T0 (hoàn tất Triage). Lần dự báo đầu tiên từ T0+1h."
                : "Chưa có bản dự báo nguồn tại mốc này."}
          </p>
        </div>

        {/* Column 2: Clinical Drivers */}
        <div className="drivers-box">
          <div className="section-kicker">
            <Activity size={13} aria-hidden="true" />
            <span>Tại sao cần chú ý?</span>
          </div>
          {drivers.length > 0 ? (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {drivers.map((d) => (
                <li
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    fontSize: 12.5,
                    lineHeight: 1.4,
                  }}
                >
                  <span
                    className={`driver-dot ${d.severity}`}
                    style={{ position: "relative", top: -1 }}
                    aria-hidden="true"
                  />
                  <span>
                    <strong style={{ color: "var(--ink-primary)" }}>
                      {d.text}
                    </strong>{" "}
                    <span className="muted">· {d.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="secondary-text">
              Chưa ghi nhận sinh hiệu hoặc xét nghiệm vượt ngưỡng bất thường.
            </p>
          )}
        </div>

        {/* Column 3: Familiar Clinical Scores */}
        <div className="scores-box">
          <div className="section-kicker">
            <Gauge size={13} aria-hidden="true" />
            <span>Thang điểm đối chiếu</span>
          </div>
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
    </section>
  );
}
