import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, Panel } from "@/components/layout/page-container";
import { createClinicalReader, percent } from "@/lib/clinical-data";
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
  const reader = createClinicalReader(),
    m = reader.getModelMetadata(),
    s = reader.getModelMetadata("shock");
  return (
    <div className="viewport-screen research-screen">
      <PageHeader title="Đánh giá mô hình" />
      <div className="model-summary" aria-label="Cấu hình mô hình">
        <span>Logistic Regression · L2</span>
        <span>
          <strong>{m.features.length}</strong> đặc trưng
        </span>
        <span>
          Dự báo <strong>{m.horizon_hours} giờ</strong>
        </span>
        <span>
          Ngưỡng <strong>{percent(m.threshold)}</strong>
        </span>
      </div>
      <Tabs defaultValue="sepsis" className="workspace-tabs">
        <TabsList variant="line" aria-label="Nội dung đánh giá mô hình">
          <TabsTrigger value="sepsis">Hiệu năng sepsis</TabsTrigger>
          <TabsTrigger value="shock">Mở rộng shock</TabsTrigger>
          <TabsTrigger value="source">Thông tin & nguồn</TabsTrigger>
        </TabsList>
        <TabsContent value="sepsis" className="workspace-pane">
          <Panel
            title="Mô hình sepsis"
            meta={`${m.validation_positive_encounters} ca validation · ${m.temporal_holdout_positive_encounters} ca holdout`}
          >
            <Evaluation model={m} />
          </Panel>
        </TabsContent>
        <TabsContent value="shock" className="workspace-pane">
          <Panel
            title="Mô hình shock · Nghiên cứu mở rộng"
            meta={`${s.validation_positive_encounters} ca validation · ${s.temporal_holdout_positive_encounters} ca holdout`}
          >
            <p className="compact-panel-note">
              Số ca ít, không diễn giải thành hiệu năng lâm sàng. Ngưỡng{" "}
              {percent(s.threshold)}.
            </p>
            <Evaluation model={s} />
          </Panel>
        </TabsContent>
        <TabsContent value="source" className="workspace-pane">
          <Panel title="Nguồn dữ liệu và hợp đồng đặc trưng">
            <div className="panel-body source-details">
              <p>
                <strong>Phiên bản sepsis:</strong> {m.model_version}
              </p>
              <p>
                <strong>Phiên bản shock:</strong> {s.model_version}
              </p>
              <p>
                Ca sepsis dương tính: {m.train_positive_encounters} train ·{" "}
                {m.validation_positive_encounters} validation ·{" "}
                {m.temporal_holdout_positive_encounters} holdout.
              </p>
              <p>{reader.getProvenance().source}</p>
              <p>
                Quan sát tăng dần từ T0 đến giờ dự báo; chỉ dùng dữ liệu đã có
                trên EMR. Chấm từ T0+1h đến T0+36h. Thời gian báo trước chỉ xét
                cảnh báo trong 6 giờ trước khởi phát tham chiếu.
              </p>
              <p className="model-version">
                SHA-256: {reader.getProvenance().sourceSha256}
              </p>
              <p>
                Các chỉ số từ tập mô phỏng được làm giàu biến cố và tạo theo
                luật; chưa phản ánh quần thể khoa Cấp cứu thực tế. Chưa được xác
                thực lâm sàng trên người bệnh thực tế.
              </p>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
      <p className="screen-footnote">
        Dữ liệu nghiên cứu mô phỏng. Validation dùng chọn ngưỡng; temporal
        holdout đánh giá riêng.
      </p>
    </div>
  );
}
