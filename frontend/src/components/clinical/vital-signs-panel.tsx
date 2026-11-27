"use client";
import { useClinicalReader } from "@/lib/client/manual-store";
import { Panel } from "@/components/layout/page-container";
import { vitalFields, formatTime } from "@/lib/clinical/data";
import { assessClinicalValue } from "@/lib/clinical/scores";
export function VitalSignsPanel({ id, hour }: { id: string; hour: number }) {
  const reader = useClinicalReader();
  const rows = reader.getAvailableVitals(id, hour);
  const abnormalCount = vitalFields.filter(({ key }) => {
    const val = rows.filter((r) => r.values[key] !== null).at(-1)?.values[key];
    const a = assessClinicalValue("vital", key, val);
    return a.status === "high" || a.status === "low";
  }).length;
  return (
    <Panel
      className="vitals-panel"
      title="Sinh hiệu gần nhất"
      description="Giá trị gần nhất đã có trên EMR từ T0."
      meta={abnormalCount > 0 ? `${abnormalCount} chỉ số ngoài ngưỡng` : "7 chỉ số"}
    >
      <div className="vital-grid">
        {vitalFields.map(({ key, label, unit, decimals }) => {
          const values = rows.filter((r) => r.values[key] !== null);
          const v = values.at(-1),
            previous = values.at(-2);
          const value = v?.values[key];
          const delta =
            value !== null && value !== undefined && previous
              ? value - previous.values[key]!
              : undefined;
          const assessment = assessClinicalValue("vital", key, value);
          const abnormal =
            assessment.status === "high" || assessment.status === "low";
          return (
            <div
              className={`vital-cell ${abnormal ? `is-abnormal is-${assessment.status}` : ""}`}
              key={key}
            >
              <div className="vital-cell-top">
                <div className="value-label">
                  {label}{" "}
                  <span className="ref-inline">({assessment.rangeLabel})</span>
                </div>
                {assessment.badge && (
                  <span className={`value-flag is-${assessment.status}`}>
                    {assessment.badge}
                  </span>
                )}
              </div>
              <strong className={value == null ? "missing-value" : ""}>
                {value == null ? "—" : value.toFixed(decimals)}{" "}
                <small>{unit}</small>
              </strong>
              {v ? (
                <>
                  <div className="secondary-text">
                    Có sẵn {formatTime(v.availableAt, true)}
                  </div>
                  <div className="secondary-text">
                    {delta === undefined
                      ? "Chưa có lần đo trước"
                      : `${delta > 0 ? "+" : ""}${delta.toFixed(decimals)} so lần đo trước`}
                  </div>
                </>
              ) : (
                <div className="missing-text">Chưa có dữ liệu</div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
