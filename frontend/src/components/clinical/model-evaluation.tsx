"use client";
import { useState } from "react";
import { percent } from "@/lib/clinical-data";
import type { ModelMetadata, Metrics } from "@/lib/clinical-types";

type MetricKey = {
  [K in keyof Metrics]: Metrics[K] extends number | null ? K : never;
}[keyof Metrics];
type Definition = {
  key: MetricKey;
  label: string;
  format: (value: number) => string;
};
const decimal = (n: number) => n.toFixed(4);
const count = (n: number) => n.toLocaleString("vi-VN");
const groups: Record<
  string,
  { label: string; metrics: Definition[]; note: string }
> = {
  alerts: {
    label: "Cảnh báo theo người bệnh & đợt",
    metrics: [
      {
        key: "encounter_early_recall",
        label: "Độ nhạy theo người bệnh trong cửa sổ 6h",
        format: percent,
      },
      { key: "episode_ppv", label: "PPV theo đợt cảnh báo", format: percent },
      {
        key: "false_alert_episodes_per_100",
        label: "Đợt cảnh báo giả / 100 người bệnh",
        format: (n) => n.toFixed(2),
      },
      {
        key: "false_episodes_per_true_episode",
        label: "Đợt cảnh báo giả / một đợt đúng",
        format: (n) => n.toFixed(2),
      },
      {
        key: "median_lead_hours",
        label: "Báo trước trung vị (đợt đúng, cửa sổ 6h)",
        format: (n) => `${n.toFixed(1)} giờ`,
      },
      {
        key: "repeated_alert_fraction",
        label: "Lần vượt ngưỡng được gộp trong đợt",
        format: percent,
      },
    ],
    note: "Một đợt bắt đầu ở lần vượt ngưỡng đầu tiên; các lần vượt tiếp theo trong 6 giờ được gộp, không kéo dài khóa. Đợt đúng khi sepsis khởi phát trong (thời điểm bắt đầu, +6h].",
  },
  discrimination: {
    label: "Phân biệt & hiệu chỉnh",
    metrics: [
      { key: "auroc", label: "AUROC", format: decimal },
      { key: "auprc", label: "AUPRC", format: decimal },
      {
        key: "observed_prevalence",
        label: "Tỷ lệ mốc giờ dương tính (nền AUPRC)",
        format: percent,
      },
      { key: "brier", label: "Brier score", format: decimal },
      {
        key: "calibration_intercept",
        label: "Calibration intercept (lý tưởng 0)",
        format: decimal,
      },
      {
        key: "calibration_slope",
        label: "Calibration slope (lý tưởng 1)",
        format: decimal,
      },
    ],
    note: "Intercept được ước lượng với slope cố định bằng 1; slope từ hồi quy hiệu chỉnh đồng thời intercept và slope. Đây là kiểm tra xác suất hiện tại, không phải bước tái hiệu chỉnh mô hình.",
  },
  hours: {
    label: "Chỉ số bổ sung theo mốc giờ",
    metrics: [
      { key: "precision", label: "Precision theo mốc giờ", format: percent },
      { key: "recall", label: "Recall theo mốc giờ", format: percent },
      {
        key: "specificity",
        label: "Độ đặc hiệu theo mốc giờ",
        format: percent,
      },
      { key: "npv", label: "NPV theo mốc giờ", format: percent },
      { key: "f1", label: "F1-score theo mốc giờ", format: percent },
      { key: "snapshots", label: "Số mốc giờ đánh giá", format: count },
      {
        key: "positive_snapshots",
        label: "Số mốc giờ dương tính",
        format: count,
      },
    ],
    note: "Mỗi người bệnh có thể đóng góp nhiều mốc giờ. Precision theo giờ không thay thế PPV theo đợt; Recall theo giờ không phải điều kiện chọn ngưỡng.",
  },
};

function CalibrationChart({ model }: { model: ModelMetadata }) {
  const series = [
    {
      name: "Validation",
      color: "#11738c",
      points: model.validation_synthetic_metrics.calibration_curve,
    },
    {
      name: "Temporal holdout",
      color: "#8051b6",
      points: model.temporal_holdout_synthetic_metrics.calibration_curve,
    },
  ];
  return (
    <figure className="calibration-chart">
      <figcaption>Biểu đồ hiệu chỉnh xác suất</figcaption>
      <svg
        viewBox="0 0 360 270"
        role="img"
        aria-label="Biểu đồ hiệu chỉnh: xác suất dự báo và tỷ lệ sepsis quan sát tại mốc giờ"
      >
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1="50"
              x2="330"
              y1={220 - 180 * v}
              y2={220 - 180 * v}
              stroke="#e6edf3"
            />
            <text x="42" y={224 - 180 * v} textAnchor="end">
              {v * 100}%
            </text>
            <text x={50 + 280 * v} y="240" textAnchor="middle">
              {v * 100}%
            </text>
          </g>
        ))}
        <line
          x1="50"
          y1="220"
          x2="330"
          y2="40"
          stroke="#8293a3"
          strokeDasharray="5 4"
        />
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              points={s.points
                .map(
                  (p) =>
                    `${50 + 280 * p.mean_probability},${220 - 180 * p.observed_fraction}`,
                )
                .join(" ")}
            />
            {s.points.map((p, i) => (
              <circle
                key={i}
                cx={50 + 280 * p.mean_probability}
                cy={220 - 180 * p.observed_fraction}
                r="4"
                fill={s.color}
              >
                <title>
                  {s.name}: dự báo {percent(p.mean_probability)}, quan sát{" "}
                  {percent(p.observed_fraction)}, {p.snapshots} mốc giờ
                </title>
              </circle>
            ))}
          </g>
        ))}
        <text x="190" y="262" textAnchor="middle">
          Xác suất dự báo trung bình
        </text>
        <text transform="translate(13 130) rotate(-90)" textAnchor="middle">
          Tỷ lệ sepsis quan sát
        </text>
      </svg>
      <div className="calibration-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        <span>Đường đứt: lý tưởng</span>
      </div>
    </figure>
  );
}

export function ModelEvaluation({ model }: { model: ModelMetadata }) {
  const [group, setGroup] = useState("alerts");
  const selected = groups[group];
  return (
    <>
      <div className="evaluation-toolbar">
        <label>
          Nhóm chỉ số
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Nhóm chỉ số đánh giá"
          >
            {Object.entries(groups).map(([id, g]) => (
              <option key={id} value={id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <p>
          Ngưỡng chọn trên validation: độ nhạy người bệnh{" "}
          {percent(model.threshold_selection.validation_encounter_recall)} · mục
          tiêu ≥{percent(model.threshold_selection.minimum_recall)}. Khóa khi
          đánh giá holdout.
        </p>
      </div>
      <div className="evaluation-sample" aria-label="Số ca và đợt cảnh báo">
        {[
          ["Validation", model.validation_synthetic_metrics],
          ["Holdout", model.temporal_holdout_synthetic_metrics],
        ].map(([name, value]) => {
          const m = value as Metrics;
          return (
            <span key={String(name)}>
              <strong>{String(name)}:</strong> {m.encounters} người bệnh ·{" "}
              {m.true_alert_episodes} đợt đúng · {m.false_alert_episodes} đợt
              giả
            </span>
          );
        })}
      </div>
      <div
        className={`evaluation-content ${group === "discrimination" ? "with-calibration" : ""}`}
      >
        <div className="table-scroll">
          <table className="metric-table">
            <caption className="sr-only">
              Chỉ số validation và temporal holdout của {model.model_version}
            </caption>
            <thead>
              <tr>
                <th>Chỉ số</th>
                <th>Validation</th>
                <th>Temporal holdout</th>
              </tr>
            </thead>
            <tbody>
              {selected.metrics.map(({ key, label, format }) => (
                <tr key={key}>
                  <td>{label}</td>
                  {[
                    model.validation_synthetic_metrics,
                    model.temporal_holdout_synthetic_metrics,
                  ].map((m, i) => {
                    const value = m[key],
                      ci = m.confidence_intervals[key];
                    const isCount = [
                      "snapshots",
                      "positive_snapshots",
                      "encounters",
                      "true_alert_episodes",
                      "false_alert_episodes",
                    ].includes(key);
                    return (
                      <td key={i}>
                        <strong>
                          {value == null ? "Chưa ước lượng" : format(value)}
                        </strong>
                        {!isCount && (
                          <small className="metric-ci">
                            {ci?.lower != null && ci?.upper != null
                              ? `KTC 95%: ${format(ci.lower)} – ${format(ci.upper)}`
                              : "KTC 95%: chưa ước lượng"}
                          </small>
                        )}
                        {key === "median_lead_hours" && m.iqr_lead_hours && (
                          <small className="metric-ci">
                            IQR:{" "}
                            {m.iqr_lead_hours
                              .map((n) => n.toFixed(1))
                              .join(" – ")}{" "}
                            giờ
                          </small>
                        )}
                        {key === "encounter_early_recall" && (
                          <small className="metric-ci">
                            {m.timely_alert_encounters}/{m.positive_encounters}{" "}
                            người bệnh sepsis
                          </small>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {group === "discrimination" && <CalibrationChart model={model} />}
      </div>
      <details className="evaluation-method">
        <summary>
          Cách tính · KTC 95% bootstrap{" "}
          {model.validation_synthetic_metrics.bootstrap.resamples.toLocaleString(
            "vi-VN",
          )}{" "}
          lần theo người bệnh
        </summary>
        <p className="compact-panel-note">{selected.note}</p>
        <p className="compact-panel-note">
          Bootstrap giữ nguyên mô hình và ngưỡng. Chỉ số không xác định được
          hiển thị là “Chưa ước lượng”. KTC không bao gồm bất định do lựa chọn
          mô hình/ngưỡng.
        </p>
      </details>
    </>
  );
}
