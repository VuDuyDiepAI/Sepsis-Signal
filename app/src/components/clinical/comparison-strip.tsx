"use client";
import { Panel } from "@/components/layout/page-container";
import { useClinicalDataset } from "@/lib/manual-store";
import { hourLabel } from "@/lib/clinical-data";
import {
  buildComparisonRows,
  evaluateLabsAt,
  evaluateVitalsAt,
} from "@/lib/clinical-reasoning";
import type { Encounter } from "@/lib/clinical-types";

export function ComparisonStrip({
  encounter,
  hour,
}: {
  encounter: Encounter;
  hour: number;
}) {
  const dataset = useClinicalDataset(encounter.id);
  const vitals = evaluateVitalsAt(encounter, hour, dataset);
  const labs = evaluateLabsAt(encounter, hour, dataset);
  const rows = buildComparisonRows(vitals, labs);

  return (
    <Panel
      title="So sánh diễn biến: Lúc vào (T0) ↔ Hiện tại"
      description="Đối chiếu lần ghi nhận đầu tiên với kết quả gần nhất để nhận diện thay đổi lâm sàng."
      meta={`T0 ↔ ${hourLabel(hour)}`}
    >
      {rows.length === 0 ? (
        <div className="panel-body">
          <p className="secondary-text">
            Chưa có dữ liệu sinh hiệu hoặc xét nghiệm để so sánh tại mốc này.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Chỉ số</th>
                <th>Mốc đầu (T0)</th>
                <th>Hiện tại</th>
                <th>Biến thiên</th>
                <th>Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowBg =
                  r.severity === "critical"
                    ? "var(--clinical-critical-soft)"
                    : r.severity === "warning"
                      ? "var(--clinical-warning-soft)"
                      : undefined;
                const valClass =
                  r.severity === "critical"
                    ? "organ-metric-val critical"
                    : r.severity === "warning"
                      ? "organ-metric-val warning"
                      : "num";
                return (
                  <tr key={`${r.source}-${r.label}`} style={{ background: rowBg }}>
                    <td>
                      <strong>{r.label}</strong>{" "}
                      <span className="secondary-text">({r.unit})</span>
                    </td>
                    <td className="num">{r.t0Text}</td>
                    <td>
                      <span className={valClass} style={{ fontSize: 13 }}>
                        {r.nowText}
                      </span>
                    </td>
                    <td className="num">{r.deltaText}</td>
                    <td>
                      <span className="source-tag" style={{ marginLeft: 0 }}>
                        {r.source}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
