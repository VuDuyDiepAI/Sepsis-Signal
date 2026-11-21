import {
  Clock3,
  Cpu,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { Panel } from "@/components/layout/page-container";
import { dataset, percent } from "@/lib/clinical-data";
import type { Metrics, ModelMetadata } from "@/lib/clinical-types";

const METRIC_ROWS: {
  key: keyof Metrics;
  label: string;
  format: (n: number) => string;
  clinicalMeaning: string;
}[] = [
  {
    key: "auroc",
    label: "AUROC",
    format: (n) => n.toFixed(4),
    clinicalMeaning:
      "Khả năng phân tách giữa mốc sắp khởi phát Sepsis và mốc ổn định (càng gần 1,0 càng tốt).",
  },
  {
    key: "auprc",
    label: "AUPRC",
    format: (n) => n.toFixed(4),
    clinicalMeaning:
      "Độ tin cậy trong bối cảnh tỷ lệ ca Sepsis thấp tại khoa Cấp cứu (phản ánh cân bằng độ nhạy và báo động giả).",
  },
  {
    key: "precision",
    label: "Precision theo mốc giờ",
    format: percent,
    clinicalMeaning:
      "Tỷ lệ mốc giờ vượt ngưỡng thực sự nằm trong cửa sổ 6 giờ trước khởi phát — giúp kiểm soát mệt mỏi cảnh báo.",
  },
  {
    key: "recall",
    label: "Recall theo mốc giờ",
    format: percent,
    clinicalMeaning:
      "Tỷ lệ mốc giờ nguy cơ thực sự được hệ thống phát hiện kịp thời.",
  },
  {
    key: "brier",
    label: "Brier score",
    format: (n) => n.toFixed(4),
    clinicalMeaning:
      "Sai số hiệu chuẩn xác suất (càng gần 0, điểm phần trăm càng sát xác suất thực tế).",
  },
  {
    key: "median_lead_hours",
    label: "Báo trước trung vị (trong cửa sổ 6h)",
    format: (n) => `${n} giờ`,
    clinicalMeaning:
      "Khoảng thời gian trung vị hệ thống phát tín hiệu trước thời điểm khởi phát lâm sàng để kích hoạt gói 1 giờ.",
  },
  {
    key: "encounter_early_recall",
    label: "Recall theo ca trong cửa sổ 6h",
    format: percent,
    clinicalMeaning:
      "Tỷ lệ người bệnh Sepsis nhận được ít nhất 1 cảnh báo sớm trong khung giờ vàng 6 giờ trước khởi phát.",
  },
  {
    key: "snapshots",
    label: "Số mốc giờ đánh giá",
    format: (n) => n.toLocaleString("vi-VN"),
    clinicalMeaning:
      "Tổng số điểm thời gian theo giờ được chấm điểm trong tập kiểm định.",
  },
  {
    key: "positive_snapshots",
    label: "Số mốc giờ dương tính",
    format: (n) => n.toLocaleString("vi-VN"),
    clinicalMeaning:
      "Số mốc giờ nằm trong cửa sổ 6 giờ trước mốc khởi phát tham chiếu.",
  },
];

function EvaluationTable({ model }: { model: ModelMetadata }) {
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
            <th>Ý nghĩa lâm sàng tại khoa Cấp cứu</th>
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map(({ key, label, format, clinicalMeaning }) => (
            <tr key={key}>
              <td style={{ fontWeight: 600 }}>{label}</td>
              {[
                model.validation_synthetic_metrics,
                model.temporal_holdout_synthetic_metrics,
              ].map((m, i) => (
                <td key={i}>{m[key] === null ? "Chưa có" : format(m[key])}</td>
              ))}
              <td
                style={{
                  fontFamily: "var(--font-ui)",
                  fontWeight: 400,
                  color: "var(--ink-secondary)",
                }}
              >
                {clinicalMeaning}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Monitoring() {
  const m = dataset.models.sepsis;
  const s = dataset.models.shock;

  const summaryCards = [
    {
      label: "Thuật toán",
      value: "Logistic L2",
      sub: `${m.model_name} · minh bạch hệ số`,
      tone: "",
      icon: Cpu,
    },
    {
      label: "Đặc trưng sạch đầu vào",
      value: String(m.features.length),
      sub: `Schema ${m.feature_schema_version}`,
      tone: "",
      icon: Layers,
    },
    {
      label: "Cửa sổ dự báo",
      value: `${m.horizon_hours} giờ`,
      sub: "Dự báo sớm từ T0+1h đến T0+36h",
      tone: "is-ok",
      icon: Clock3,
    },
    {
      label: "Ngưỡng kích hoạt",
      value: percent(m.threshold),
      sub: "Chọn trên validation · giữ cố định khi holdout",
      tone: "is-warning",
      icon: SlidersHorizontal,
    },
  ];

  return (
    <>
      <h1 className="sr-only">Hồ sơ kiểm định và giám sát mô hình</h1>

      <div className="research-notice" role="note">
        <TriangleAlert size={20} />
        <p>
          <strong>Giới hạn sử dụng lâm sàng:</strong> Đây là mô hình hỗ trợ
          quyết định lâm sàng (CDSS) huấn luyện và đánh giá trên tập dữ liệu EMR
          mô phỏng ({dataset.provenance.dataKind}), chưa được xác thực lâm sàng
          tiến cứu trên người bệnh thực tế. Mọi quyết định chẩn đoán, cấy máu,
          dùng kháng sinh và bù dịch do bác sĩ trực tiếp thăm khám quyết định.
        </p>
      </div>

      <section
        className="priority-bar"
        aria-label="Tóm tắt cấu hình mô hình đang chạy"
      >
        {summaryCards.map(({ label, value, sub, tone, icon: Icon }) => (
          <div className={`priority-card ${tone}`} key={label}>
            <div>
              <span className="priority-card-label">{label}</span>
              <span className="priority-card-sub">{sub}</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 4,
              }}
            >
              <Icon size={16} color="var(--ink-muted)" />
              <span className="priority-card-num" style={{ fontSize: 21 }}>
                {value}
              </span>
            </div>
          </div>
        ))}
      </section>

      <div className="section-stack">
        <Panel
          title="Hiệu năng mô hình dự báo Sepsis"
          description="Validation được dùng để chọn ngưỡng tối ưu; Temporal holdout tách theo dòng thời gian sau cùng để đánh giá độc lập."
          meta={
            <>
              <ShieldCheck size={13} />
              Metadata trực tiếp từ artifact
            </>
          }
        >
          <div
            className="panel-body"
            style={{ borderBottom: "1px solid var(--line-default)" }}
          >
            <p className="model-version">{m.model_version}</p>
            <p className="secondary-text" style={{ marginTop: 6 }}>
              Số ca dương tính theo từng tập:{" "}
              <strong className="num">{m.train_positive_encounters}</strong>{" "}
              train ·{" "}
              <strong className="num">
                {m.validation_positive_encounters}
              </strong>{" "}
              validation ·{" "}
              <strong className="num">
                {m.temporal_holdout_positive_encounters}
              </strong>{" "}
              temporal holdout.
            </p>
          </div>
          <EvaluationTable model={m} />
        </Panel>

        <details className="panel secondary-details">
          <summary>Mô hình shock · Mở rộng nghiên cứu riêng</summary>
          <div
            className="panel-body"
            style={{ borderBottom: "1px solid var(--line-default)" }}
          >
            <p className="model-version">{s.model_version}</p>
            <p className="secondary-text" style={{ marginTop: 6 }}>
              Ngưỡng kích hoạt{" "}
              <strong className="num">{percent(s.threshold)}</strong> · Số ca
              dương tính: {s.train_positive_encounters} train,{" "}
              {s.validation_positive_encounters} validation,{" "}
              {s.temporal_holdout_positive_encounters} temporal holdout. Số biến
              cố thấp nên chỉ trình bày ở phạm vi mở rộng nghiên cứu, không diễn
              giải thành hiệu năng lâm sàng.
            </p>
          </div>
          <EvaluationTable model={s} />
        </details>

        <details className="panel secondary-details">
          <summary>Nguồn dữ liệu, chống rò rỉ thời gian &amp; SHA-256</summary>
          <div className="panel-body section-stack" style={{ gap: 10 }}>
            <div>
              <div className="section-kicker">Tệp dữ liệu nguồn</div>
              <p style={{ fontWeight: 600 }}>{dataset.provenance.source}</p>
              <p className="model-version" style={{ marginTop: 4 }}>
                SHA-256: {dataset.provenance.sourceSha256}
              </p>
            </div>

            <div>
              <div className="section-kicker">
                Nguyên tắc chống rò rỉ thời gian (As-of / Anti-Leakage)
              </div>
              <p className="secondary-text">
                Cửa sổ quan sát mở rộng{" "}
                <strong className="num">
                  {dataset.provenance.observationWindow}
                </strong>{" "}
                tính từ T0 (hoàn tất phân loại Triage) đến mốc dự báo, chấm định
                kỳ từ T0+1h đến T0+36h. Mọi sinh hiệu eForm và xét nghiệm Labtc
                chỉ được đưa vào đặc trưng khi thỏa mãn quy tắc khả dụng{" "}
                <strong className="num">
                  {dataset.provenance.availabilityRule}
                </strong>
                . Thời gian báo trước chỉ tính cho các cảnh báo phát trong đúng
                cửa sổ 6 giờ trước mốc khởi phát tham chiếu.
              </p>
            </div>

            <p className="secondary-text">
              Lưu ý kiểm định: Bộ dữ liệu mô phỏng được làm giàu biến cố và sinh
              theo luật; khi triển khai thực tế tại bệnh viện cần hiệu chuẩn lại
              ngưỡng và kiểm định tiến cứu trên quần thể khoa Cấp cứu thực tế.
            </p>
          </div>
        </details>
      </div>
    </>
  );
}
