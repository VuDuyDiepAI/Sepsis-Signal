"use client";
import { useSyncExternalStore } from "react";
import { useClinicalReader } from "@/lib/client/manual-store";
import {
  getClinicalSnapshot,
  getServerClinicalSnapshot,
  subscribeClinical,
} from "@/lib/client/clinical-storage";
import { Clock3 } from "lucide-react";
import { Panel } from "@/components/layout/page-container";
import { AlertStatus, Trend } from "@/components/clinical/alert-status";
import {
  stateOf,
  formatTime,
  timeAt,
  percent,
  hourLabel,
  contributorsFor,
} from "@/lib/clinical/data";
import {
  computeClinicalScores,
  formatScoreCue,
  HOUR_ONE_BUNDLE,
} from "@/lib/clinical/scores";
import type { Encounter } from "@/lib/contracts/clinical";
export function RiskSummary({
  encounter,
  hour,
}: {
  encounter: Encounter;
  hour: number;
}) {
  const reader = useClinicalReader();
  const snapshot = useSyncExternalStore(
    subscribeClinical,
    getClinicalSnapshot,
    getServerClinicalSnapshot,
  );
  const p = reader.getPrediction(encounter.id, hour),
    state = stateOf(p),
    meta = reader.getModelMetadata();
  const scores = computeClinicalScores(
    reader.getAvailableVitals(encounter.id, hour),
    reader.getAvailableLabs(encounter.id, hour),
  );
  const drivers = snapshot.silentMode ? [] : contributorsFor(p);
  const maxDriver = Math.max(0.5, ...drivers.map((d) => d.contribution));
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
              {percent(p?.threshold ?? meta.threshold)}
            </div>
          </div>
        </div>
        {drivers.length > 0 && (
          <div
            className="risk-drivers"
            aria-label="Yếu tố chính đẩy nguy cơ tăng"
            data-testid="risk-drivers"
          >
            <div className="drivers-heading">
              <strong>Yếu tố chính làm tăng điểm</strong>
              <span>Đóng góp log-odds trong mô hình</span>
            </div>
            <ul>
              {drivers.map((d) => (
                <li key={d.feature} className="driver-row">
                  <span className="driver-label">{d.labelVi}</span>
                  <span className="driver-meter">
                    <i
                      className="driver-bar"
                      style={{
                        width: `${Math.min(100, Math.round((d.contribution / maxDriver) * 100))}%`,
                      }}
                    />
                    <b>+{d.contribution.toFixed(2)}</b>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div
          className="baseline-scores"
          aria-label="Đối chứng thang điểm lâm sàng"
          data-testid="baseline-scores"
        >
          {(
            [
              { key: "qSOFA", item: scores.qsofa },
              { key: "SIRS", item: scores.sirs },
              { key: "MEWS", item: scores.mews },
            ] as const
          ).map(({ key, item }) => {
            const cue = formatScoreCue(key, item);
            return (
              <span
                key={key}
                className={`score-chip ${item.elevated ? "is-elevated" : ""}`}
                title={
                  cue.missingText
                    ? `${key}: ${cue.valueText} (${cue.missingText})`
                    : `${key}: ${cue.valueText} · ${cue.statusText}`
                }
              >
                <strong>{key}</strong> {cue.valueText}
                {cue.statusText && (
                  <em className="score-state">· {cue.statusText}</em>
                )}
                {cue.missingText && <small>({cue.missingText})</small>}
              </span>
            );
          })}
        </div>
        <details className="scores-help">
          <summary>Cách đọc nhanh qSOFA · SIRS · MEWS</summary>
          <p>
            <b>qSOFA</b> (≥2/3 tiêu chí cảnh báo: thở ≥22, HA ≤100, GCS &lt;15)
            · <b>SIRS</b> (≥2/4 tiêu chí: sốt/hạ thân nhiệt, mạch &gt;90, thở
            &gt;20, WBC bất thường) · <b>MEWS</b> (≥5 điểm cảnh báo từ 5 sinh
            hiệu).
          </p>
        </details>
        <div className="risk-time">
          <Clock3 size={16} />
          {formatTime(timeAt(encounter.t0, hour), true)} · {hourLabel(hour)}
          {p && " · Dự báo 6 giờ tiếp theo"}
        </div>
        <p className="risk-info">
          {snapshot.silentMode
            ? "Chế độ kiểm định tiền cứu im lặng (Silent Mode): hệ thống lưu dự báo phục vụ nghiên cứu, không hiển thị cảnh báo lâm sàng."
            : p
              ? "Điểm nguy cơ và yếu tố đóng góp chỉ hỗ trợ rà soát, không xác định chẩn đoán hay căn nguyên sepsis."
              : hour === 0
                ? "T0 là mốc dữ liệu ban đầu. Lần dự báo đầu tiên từ T0+1h."
                : "Không có bản dự báo nguồn tại mốc này. Không suy diễn kết quả thành điểm 0 hoặc trạng thái an toàn."}
        </p>
        {state === "above" && (
          <details className="bundle-reference">
            <summary>Tham khảo nhanh: SSC Hour-1 Sepsis Bundle</summary>
            <ul>
              {HOUR_ONE_BUNDLE.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <p className="secondary-text">
              Chỉ mang tính tham khảo quy trình — không thay thế đánh giá bác sĩ
              hoặc phác đồ chính thức của khoa.
            </p>
          </details>
        )}
      </div>
    </Panel>
  );
}
