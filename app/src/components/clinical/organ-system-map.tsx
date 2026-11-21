"use client";
import {
  Brain,
  Droplets,
  Flame,
  HeartPulse,
  ShieldAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { Panel } from "@/components/layout/page-container";
import { useClinicalDataset } from "@/lib/manual-store";
import {
  buildOrganSystems,
  evaluateLabsAt,
  evaluateVitalsAt,
  type OrganSystemCard,
} from "@/lib/clinical-reasoning";
import type { Encounter, MetricSeverity } from "@/lib/clinical-types";

const ORGAN_ICONS: Record<OrganSystemCard["id"], LucideIcon> = {
  circulation: HeartPulse,
  respiratory: Wind,
  inflammation: Flame,
  neuro: Brain,
  renal: Droplets,
  liver_coag: ShieldAlert,
};

const SEVERITY_BADGE: Record<
  MetricSeverity,
  { text: string; tone: "crit" | "warn" | "ok" | "muted" }
> = {
  critical: { text: "Bất thường nặng", tone: "crit" },
  warning: { text: "Cần lưu ý", tone: "warn" },
  normal: { text: "Ổn định", tone: "ok" },
  missing: { text: "Chưa có dữ liệu", tone: "muted" },
};

export function OrganSystemMap({
  encounter,
  hour,
}: {
  encounter: Encounter;
  hour: number;
}) {
  const dataset = useClinicalDataset(encounter.id);
  const vitals = evaluateVitalsAt(encounter, hour, dataset);
  const labs = evaluateLabsAt(encounter, hour, dataset);
  const organs = buildOrganSystems(vitals, labs);
  const flaggedCount = organs.filter(
    (o) => o.severity === "critical" || o.severity === "warning",
  ).length;

  return (
    <Panel
      title="Bản đồ 6 hệ cơ quan (theo hướng SOFA / Sepsis-3)"
      description="Tổng hợp sinh hiệu (eForm) và xét nghiệm (Labtc) theo từng hệ cơ quan tại mốc đang xem."
      meta={
        flaggedCount > 0
          ? `${flaggedCount}/6 hệ có bất thường`
          : "Chưa ghi nhận suy cơ quan"
      }
    >
      <div className="organ-grid">
        {organs.map((card) => {
          const Icon = ORGAN_ICONS[card.id];
          const badge = SEVERITY_BADGE[card.severity];
          return (
            <article
              key={card.id}
              className={`organ-card sev-${card.severity}`}
            >
              <div className="organ-head">
                <div className="organ-title">
                  <Icon size={15} />
                  <span>{card.title}</span>
                </div>
                <span className={`tree-branch-badge ${badge.tone}`}>
                  {badge.text}
                </span>
              </div>

              <div className="organ-metrics">
                {card.metrics.map((m) => (
                  <div key={m.label} className="organ-metric-row">
                    <div className="organ-metric-label">
                      <span>{m.label}</span>
                      <span className="source-tag">{m.source}</span>
                      {m.isNew && (
                        <span className="lab-new-badge">MỚI TRẢ</span>
                      )}
                      {m.timeText && (
                        <span className="organ-metric-sub">{m.timeText}</span>
                      )}
                    </div>
                    <div className={`organ-metric-val ${m.severity}`}>
                      {m.valueText} <small>{m.unit}</small>
                      {m.deltaText && (
                        <span className="organ-metric-sub">{m.deltaText}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
