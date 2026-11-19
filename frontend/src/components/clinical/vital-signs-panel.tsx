import { Panel } from "@/components/layout/page-container";
import { availableVitals, vitalFields, formatTime } from "@/lib/clinical-data";
export function VitalSignsPanel({ id, hour }: { id: string; hour: number }) {
  const rows = availableVitals(id, hour);
  return (
    <Panel
      className="vitals-panel"
      title="Sinh hiệu gần nhất"
      description="Giá trị gần nhất đã có trên EMR từ T0."
      meta="7 chỉ số"
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
          return (
            <div className="vital-cell" key={key}>
              <div className="value-label">{label}</div>
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
