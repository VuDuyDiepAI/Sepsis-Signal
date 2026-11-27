import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, Panel } from "@/components/layout/page-container";
import { createClinicalReader, percent } from "@/lib/clinical/data";
import { ModelEvaluation } from "@/features/evaluation/model-evaluation";
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
            <ModelEvaluation model={m} />
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
            <ModelEvaluation model={s} />
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
                thời điểm bắt đầu đợt cảnh báo đúng trong 6 giờ trước khởi phát
                tham chiếu. Các lần vượt ngưỡng bị gộp không được tính là cảnh
                báo mới.
              </p>
              <p>
                Chọn ngưỡng theo độ nhạy người bệnh ≥80%, không áp điều kiện
                Recall theo giờ hoặc giới hạn ngưỡng tùy ý. Gộp cảnh báo trong 6
                giờ tính từ đầu đợt; đợt quá sớm vẫn là cảnh báo giả dù người
                bệnh sau đó có sepsis.
              </p>
              <p>
                Quy trình hiện dùng validation độc lập để chọn ngưỡng. Xác suất
                chưa qua bước tái hiệu chỉnh; intercept, slope và biểu đồ chỉ là
                đánh giá hiệu chỉnh. Chưa thay thế quy trình nested CV, dự báo
                ngoài mẫu sau hiệu chỉnh và kiểm định tiền cứu im lặng trong đề
                cương.
              </p>
              <p>
                Bootstrap giữ mô hình và ngưỡng cố định, chưa bao gồm bất định
                do lựa chọn mô hình/ngưỡng. Chưa có dữ liệu vận hành EMR thực để
                tính tỷ lệ tạo dự báo thành công, độ trễ, lỗi và uptime.
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
