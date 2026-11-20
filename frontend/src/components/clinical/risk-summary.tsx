"use client";
import { useClinicalReader } from "@/lib/manual-store";
import { Clock3 } from "lucide-react";
import { Panel } from "@/components/layout/page-container";
import { AlertStatus, Trend } from "./alert-status";
import {
  stateOf,
  formatTime,
  timeAt,
  percent,
  hourLabel,
} from "@/lib/clinical-data";
import type { Encounter } from "@/lib/clinical-types";
export function RiskSummary({
  encounter,
  hour,
}: {
  encounter: Encounter;
  hour: number;
}) {
  const reader = useClinicalReader();
  const p = reader.getPrediction(encounter.id, hour),
    state = stateOf(p),
    meta = reader.getModelMetadata();
  return (
    <Panel
      title="Trạng thái nguy cơ"
      meta={p ? `Bản tính #${p.revision}` : hourLabel(hour)}
      className={`risk-panel ${state === "above" ? "is-alert" : ""}`}
    >
      <div className="panel-body">
        <div className="risk-state-row">
          <AlertStatus state={state} />
          {p && <Trend value={reader.getChange(encounter.id, hour)} />}
        </div>
        <div className="risk-numbers">
          <div>
            <div className="value-label">Điểm sepsis</div>
            <div
              className={`risk-main ${state === "above" ? "alert" : ""}`}
              data-testid="risk-score"
            >
              {p ? percent(p.score) : "—"}
            </div>
          </div>
          <div>
            <div className="value-label">Ngưỡng cảnh báo</div>
            <div className="risk-main threshold" data-testid="risk-threshold">
              {percent(meta.threshold)}
            </div>
          </div>
        </div>
        <div className="risk-time">
          <Clock3 size={16} />
          {formatTime(timeAt(encounter.t0, hour), true)} · {hourLabel(hour)}
          {p && " · Dự báo 6 giờ tiếp theo"}
        </div>
        <p className="risk-info">
          {p
            ? "Điểm nguy cơ hỗ trợ đánh giá, không xác định chẩn đoán sepsis."
            : hour === 0
              ? "T0 là mốc dữ liệu ban đầu. Lần dự báo đầu tiên từ T0+1h."
              : "Không có bản dự báo nguồn tại mốc này. Không suy diễn kết quả thành điểm 0 hoặc trạng thái an toàn."}
        </p>
      </div>
    </Panel>
  );
}
