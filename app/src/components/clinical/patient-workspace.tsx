"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useClinicalDataset } from "@/lib/manual-store";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { ClinicalNote } from "@/components/shared/empty-state";
import {
  departmentAt,
  departments,
  formatTime,
  hourLabel,
  predictionAt,
  timeAt,
} from "@/lib/clinical-data";
import {
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
import { RiskSummary } from "./risk-summary";
import { ClinicalDecisionTree } from "./clinical-decision-tree";
import { OrganSystemMap } from "./organ-system-map";
import { RiskTimeline } from "./risk-timeline";
import { ComparisonStrip } from "./comparison-strip";
import { VitalSignsPanel } from "./vital-signs-panel";
import { LaboratoryPanel } from "./laboratory-panel";
import { ReviewPanel } from "./review-panel";

type ClinicalLens = "organs" | "tree" | "details";

const LENS_TABS: { key: ClinicalLens; label: string }[] = [
  { key: "organs", label: "6 Hệ cơ quan" },
  { key: "tree", label: "Lưu đồ nhánh Sepsis" },
  { key: "details", label: "So sánh T0 & Chi tiết" },
];

export function PatientWorkspace({
  encounter,
  hour,
  onHourChange,
  onset,
  entryForm,
  headerAction,
  manualContext,
}: {
  encounter: Encounter;
  hour: number;
  onHourChange: (h: number) => void;
  onset?: string | null;
  entryForm?: React.ReactNode;
  headerAction?: React.ReactNode;
  manualContext?: {
    comorbidities?: Record<string, boolean>;
    symptoms?: Record<string, boolean> | null;
    height?: number | null;
    weight?: number | null;
  };
}) {
  const [lens, setLens] = useState<ClinicalLens>("organs");
  const dataset = useClinicalDataset();
  const hydrated = useHydrated();
  const at = timeAt(encounter.t0, hour);
  const prediction = predictionAt(encounter.id, hour, dataset);
  const dept = departmentAt(encounter.id, at, dataset);
  const vitals = evaluateVitalsAt(encounter, hour, dataset);
  const labs = evaluateLabsAt(encounter, hour, dataset);
  const scores = computeClinicalScores(vitals, labs);
  const triage = deriveTriage(scores, dept, prediction);
  const ctx = getEncounterContext(encounter.id, manualContext);
  const siteInfo = getActiveSiteAt(encounter, hour, manualContext?.symptoms);

  return (
    <>
      {/* 1-Row Patient Context Strip */}
      <section className="patient-strip" aria-label="Thông tin hồ sơ">
        <div className="patient-strip-left">
          <Link href="/dashboard" className="btn-clinical">
            <ArrowLeft size={14} aria-hidden="true" />
            Ca trực
          </Link>

          <div className="patient-strip-id">
            <span className={`triage-badge t${triage.level}`}>
              T{triage.level}
            </span>
            <h1 className="num text-[18px] font-bold leading-none">
              {encounter.id}
            </h1>
          </div>

          <span className="secondary-text">
            {encounter.age}t {encounter.sex === "F" ? "Nữ" : "Nam"} ·{" "}
            {departments[dept]} · T0 {formatTime(encounter.t0, true)}
            {ctx?.bmi !== null && ctx?.bmi !== undefined
              ? ` · BMI ${ctx.bmi}`
              : ""}
          </span>

          {(siteInfo.suspectedSite ||
            (ctx && ctx.comorbidities.length > 0)) && (
            <div className="patient-tags">
              {siteInfo.suspectedSite && (
                <span className="context-tag site">
                  Ổ:{" "}
                  {SITE_LABELS[siteInfo.suspectedSite] ??
                    siteInfo.suspectedSite}
                </span>
              )}
              {ctx?.comorbidities.map((c) => (
                <span key={c} className="context-tag comorb">
                  {COMORBIDITY_LABELS[c] ?? c}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="patient-strip-controls">
          {headerAction}
          <div className="hour-select-group">
            <Button
              variant="outline"
              size="icon"
              aria-label="Mốc trước"
              onClick={() => onHourChange(hour - 1)}
              disabled={!hydrated || hour === 0}
            >
              <ChevronLeft />
            </Button>
            <select
              aria-label="Mốc giờ đang xem"
              disabled={!hydrated}
              value={hour}
              onChange={(e) => onHourChange(Number(e.target.value))}
            >
              {Array.from({ length: 37 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)} · {formatTime(timeAt(encounter.t0, h))}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Mốc tiếp theo"
              onClick={() => onHourChange(hour + 1)}
              disabled={!hydrated || hour === 36}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </section>

      {entryForm}

      {/* Full-width 1-Row Hero Risk Banner */}
      <RiskSummary encounter={encounter} hour={hour} />

      {/* 2-Column Clinical Workspace (62% Left / 38% Right) */}
      <div className="workspace-grid">
        <div className="workspace-column">
          {/* Unified Progressive-Disclosure Clinical Lens */}
          <div
            className={lens !== "details" ? "labs-panel" : undefined}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div
                className="segment-group"
                role="tablist"
                aria-label="Góc nhìn dữ liệu lâm sàng"
              >
                {LENS_TABS.map((tab) => {
                  const active = lens === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`segment-btn ${active ? "active" : ""}`}
                      onClick={() => setLens(tab.key)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <span className="secondary-text">
                Dữ liệu EMR đến {formatTime(at, true)}
              </span>
            </div>

            {lens === "organs" && (
              <OrganSystemMap encounter={encounter} hour={hour} />
            )}
            {lens === "tree" && (
              <ClinicalDecisionTree
                encounter={encounter}
                hour={hour}
                manualContext={manualContext}
              />
            )}
            {lens === "details" && (
              <div className="section-stack">
                <ComparisonStrip encounter={encounter} hour={hour} />
                <VitalSignsPanel id={encounter.id} hour={hour} />
                <LaboratoryPanel id={encounter.id} hour={hour} />
              </div>
            )}
          </div>

          <RiskTimeline
            encounter={encounter}
            hour={hour}
            onHourChange={onHourChange}
            onset={onset}
          />
        </div>

        <div className="workspace-column">
          <ReviewPanel
            key={`${encounter.id}:${hour}`}
            prediction={prediction}
            encounter={encounter}
            hour={hour}
          />
        </div>
      </div>

      <ClinicalNote />
    </>
  );
}
