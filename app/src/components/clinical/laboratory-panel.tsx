"use client";
import { Panel } from "@/components/layout/page-container";
import { useClinicalDataset } from "@/lib/manual-store";
import { formatTime } from "@/lib/clinical-data";
import { evaluateLabsAt } from "@/lib/clinical-reasoning";

export function LaboratoryPanel({ id, hour }: { id: string; hour: number }) {
  const dataset = useClinicalDataset(id);
  const encounter = dataset.encounters.find((e) => e.id === id);
  const labs = encounter ? evaluateLabsAt(encounter, hour, dataset) : [];
  const newly = labs.filter((l) => l.isNewThisHour).length;

  return (
    <Panel
      className="labs-panel"
      title="Kết quả xét nghiệm"
      description="Chỉ sử dụng kết quả đã trả trên Labtc tính đến mốc giờ đang xem."
      meta={`${newly} kết quả mới trong giờ`}
    >
      {labs.length === 0 ? (
        <div className="panel-body">
          <p className="missing-text">Chưa có kết quả</p>
        </div>
      ) : (
        <table className="labs-table">
          <caption className="sr-only">Xét nghiệm tại mốc đang xem</caption>
          <tbody>
            {labs.map((l) => {
              const dec =
                l.code === "platelets"
                  ? 0
                  : l.code === "WBC" || l.code === "CRP"
                    ? 1
                    : 2;
              const rowClass =
                l.severity === "critical"
                  ? "sev-critical"
                  : l.severity === "warning"
                    ? "sev-warning"
                    : "";
              return (
                <tr key={l.code} className={rowClass}>
                  <td>
                    <div>
                      <strong>{l.label}</strong>
                      <span className="source-tag">Labtc</span>
                      {l.isNewThisHour && (
                        <span className="lab-new-badge">Mới trả</span>
                      )}
                    </div>
                    <span className="lab-time">
                      Tham chiếu: {l.refRange} {l.unit}
                    </span>
                    {l.availableAt && (
                      <span className="lab-time">
                        Có sẵn {formatTime(l.availableAt, true)}
                        {l.delta !== null
                          ? ` · ${l.delta > 0 ? "+" : ""}${l.delta.toFixed(dec)} so lần trước`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td>
                    {l.value !== null ? (
                      <>
                        <span
                          className={`lab-value ${
                            l.severity === "critical"
                              ? "organ-metric-val critical"
                              : l.severity === "warning"
                                ? "organ-metric-val warning"
                                : ""
                          }`}
                        >
                          {l.value.toFixed(dec)} <small>{l.unit}</small>
                        </span>
                        <span className="lab-time">{l.statusText}</span>
                      </>
                    ) : (
                      <span className="missing-text">Chưa có kết quả</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
