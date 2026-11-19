import {
  TriangleAlert,
  Cpu,
  Layers,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader, Panel } from "@/components/layout/page-container";
import { dataset, percent } from "@/lib/clinical-data";
import type { ModelMetadata, Metrics } from "@/lib/clinical-types";
function Evaluation({ model }: { model: ModelMetadata }) {
  const metrics: {
    key: keyof Metrics;
    label: string;
    format: (n: number) => string;
  }[] = [
    { key: "auroc", label: "AUROC", format: (n) => n.toFixed(4) },
    { key: "auprc", label: "AUPRC", format: (n) => n.toFixed(4) },
    { key: "precision", label: "Precision theo mốc giờ", format: percent },
    { key: "recall", label: "Recall theo mốc giờ", format: percent },
    { key: "brier", label: "Brier score", format: (n) => n.toFixed(4) },
    {
      key: "median_lead_hours",
      label: "Báo trước trung vị (trong cửa sổ 6h)",
      format: (n) => `${n} giờ`,
    },
    {
      key: "encounter_early_recall",
      label: "Recall theo ca trong cửa sổ 6h",
      format: percent,
    },
    {
      key: "snapshots",
      label: "Số mốc giờ đánh giá",
      format: (n) => n.toLocaleString("vi-VN"),
    },
    {
      key: "positive_snapshots",
      label: "Số mốc giờ dương tính",
      format: (n) => n.toLocaleString("vi-VN"),
    },
  ];
  return (
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
          {metrics.map(({ key, label, format }) => (
            <tr key={key}>
              <td>{label}</td>
              {[
                model.validation_synthetic_metrics,
                model.temporal_holdout_synthetic_metrics,
              ].map((m, i) => (
                <td key={i}>{m[key] === null ? "Chưa có" : format(m[key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function Monitoring() {
  const m = dataset.models.sepsis,
    s = dataset.models.shock;
  return (
    <>
      <PageHeader
        title="Đánh giá mô hình"
        description="Thông số đang phục vụ và kết quả đánh giá trên dữ liệu nghiên cứu."
        section="Dữ liệu & mô hình"
      />
      <div className="research-notice">
        <TriangleAlert size={22} />
        <p>
          <strong>Giới hạn sử dụng</strong>
          <br />
          Đây là mô hình nghiên cứu trên dữ liệu EMR mô phỏng, chưa được xác
          thực lâm sàng trên người bệnh thực tế.
        </p>
      </div>
      <div className="stats-grid">
        {[
          {
            label: "Thuật toán",
            value: "Logistic",
            caption: "Regression · L2",
            icon: Cpu,
          },
          {
            label: "Đặc trưng đầu vào",
            value: m.features.length,
            caption: "Theo schema expanding-t0-v1",
            icon: Layers,
          },
          {
            label: "Cửa sổ dự báo",
            value: `${m.horizon_hours} giờ`,
            caption: "Tương lai từ giờ dự báo",
            icon: Clock3,
          },
          {
            label: "Ngưỡng cảnh báo",
            value: percent(m.threshold),
            caption: "Lấy trực tiếp từ metadata",
            icon: SlidersHorizontal,
          },
        ].map(({ label, value, caption, icon: Icon }) => (
          <div className="stat" key={label}>
            <div className="stat-top">
              {label}
              <span className="stat-icon">
                <Icon size={18} />
              </span>
            </div>
            <div className="stat-value" style={{ fontSize: 28 }}>
              {value}
            </div>
            <small>{caption}</small>
          </div>
        ))}
      </div>
      <div className="section-stack">
        <Panel
          title="Mô hình sepsis · Hiệu năng mô tả"
          description="Validation dùng chọn ngưỡng; temporal holdout dùng đánh giá riêng."
          meta="Nguồn: metadata"
        >
          <div className="panel-body">
            <p className="model-version">{m.model_version}</p>
            <p className="secondary-text mt-2">
              Ca dương tính: {m.train_positive_encounters} train ·{" "}
              {m.validation_positive_encounters} validation ·{" "}
              {m.temporal_holdout_positive_encounters} holdout.
            </p>
          </div>
          <Evaluation model={m} />
        </Panel>
        <details className="panel secondary-details">
          <summary>Mô hình shock · Mở rộng nghiên cứu riêng</summary>
          <div className="panel-body">
            <p className="model-version">{s.model_version}</p>
            <p className="secondary-text mt-2">
              Ngưỡng {percent(s.threshold)} · Ca dương tính:{" "}
              {s.train_positive_encounters} train,{" "}
              {s.validation_positive_encounters} validation,{" "}
              {s.temporal_holdout_positive_encounters} holdout. Số ca ít, không
              diễn giải thành hiệu năng lâm sàng.
            </p>
          </div>
          <Evaluation model={s} />
        </details>
        <details className="panel secondary-details">
          <summary>Nguồn dữ liệu và hợp đồng đặc trưng</summary>
          <div className="panel-body">
            <p>{dataset.provenance.source}</p>
            <p className="secondary-text mt-2">
              Quan sát tăng dần từ T0 đến giờ dự báo; chỉ dùng dữ liệu đã có
              trên EMR. Chấm từ T0+1h đến T0+36h. Thời gian báo trước chỉ xét
              cảnh báo trong 6 giờ trước khởi phát tham chiếu.
            </p>
            <p className="model-version mt-3">
              SHA-256: {dataset.provenance.sourceSha256}
            </p>
            <p className="secondary-text mt-3">
              Các chỉ số từ tập mô phỏng được làm giàu biến cố và tạo theo luật;
              chưa phản ánh quần thể khoa Cấp cứu thực tế.
            </p>
          </div>
        </details>
      </div>
    </>
  );
}
