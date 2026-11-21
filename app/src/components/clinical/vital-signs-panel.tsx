"use client";
import { Panel } from "@/components/layout/page-container";
import { useClinicalDataset } from "@/lib/manual-store";
import { formatTime } from "@/lib/clinical-data";
import { evaluateVitalsAt } from "@/lib/clinical-reasoning";

export function VitalSignsPanel({ id, hour }: { id: string; hour: number }) {
  const dataset = useClinicalDataset(id);
  const encounter = dataset.encounters.find((e) => e.id === id);
  const vitals = encounter
    ? evaluateVitalsAt(encounter, hour, dataset)
    : [];
  const availableCount = vitals.filter((v) => v.value !== null).length;

  return (
    <Panel
      className="vitals-panel"
      title="Sinh hiệu gần nhất"
      description="Giá trị gần nhất đã ghi nhận trên eForm từ T0, kèm ngưỡng tham chiếu."
      meta={`${availableCount}/7 chỉ số`}
    >
      {vitals.length === 0 ? (
        <div className="panel-body">
          <p className="missing-text">Chưa có dữ liệu</p>
        </div>
      ) : (
        <div className="vital-grid">
          {vitals.map((v) => {
            const sevClass =
              v.severity === "critical"
                ? "sev-critical"
                : v.severity === "warning"
                  ? "sev-warning"
                  : "";
            return (
              <div className={`vital-cell ${sevClass}`} key={v.key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span className="secondary-text" style={{ fontWeight: 600 }}>
                    {v.label}
                  </span>
                  <span className="source-tag" style={{ marginLeft: 0 }}>
                    eForm
                  </span>
                </div>
                <strong className={v.value === null ? "missing-value" : ""}>
                  {v.value === null ? "—" : v.value.toFixed(v.decimals)}{" "}
                  <small>{v.unit}</small>
                </strong>
                {v.value !== null && v.availableAt ? (
                  <>
                    <div className="secondary-text">
                      {v.statusText} · Tham chiếu {v.refRange}
                    </div>
                    <div className="secondary-text">
                      Có sẵn {formatTime(v.availableAt, true)}
                    </div>
                    <div className="secondary-text">
                      {v.delta === null
                        ? "Chưa có lần đo trước"
                        : `${v.delta > 0 ? "+" : ""}${v.delta.toFixed(v.decimals)} so lần đo trước`}
                    </div>
                  </>
                ) : (
                  <div className="missing-text">Chưa có dữ liệu</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
