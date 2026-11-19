"use client";
import { useClinicalDataset } from "@/lib/manual-store";
import { useHydrated } from "@/lib/use-hydrated";
import { UserRound, ChevronLeft, ChevronRight, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/layout/page-container";
import { ClinicalNote } from "@/components/shared/empty-state";
import {
  departmentAt,
  departments,
  formatTime,
  hourLabel,
  timeAt,
  predictionAt,
  percent,
} from "@/lib/clinical-data";
import type { Encounter } from "@/lib/clinical-types";
import { RiskSummary } from "./risk-summary";
import { RiskTimeline } from "./risk-timeline";
import { VitalSignsPanel } from "./vital-signs-panel";
import { LaboratoryPanel } from "./laboratory-panel";
import { ReviewPanel } from "./review-panel";
export function PatientWorkspace({
  encounter,
  hour,
  onHourChange,
  onset,
  entryForm,
}: {
  encounter: Encounter;
  hour: number;
  onHourChange: (h: number) => void;
  onset?: string | null;
  entryForm?: React.ReactNode;
}) {
  const dataset = useClinicalDataset();
  const hydrated = useHydrated();
  const at = timeAt(encounter.t0, hour),
    meta = dataset.models.sepsis;
  return (
    <>
      <section className="patient-bar" aria-label="Thông tin hồ sơ">
        <div className="patient-identity">
          <span className="patient-icon">
            <UserRound size={25} />
          </span>
          <div>
            <strong>{encounter.id}</strong>
            <p>
              {encounter.age} tuổi · {encounter.sex === "F" ? "Nữ" : "Nam"} ·{" "}
              {departments[departmentAt(encounter.id, at, dataset)]}
            </p>
            <p className="secondary-text">
              T0 {formatTime(encounter.t0, true)} · Hoàn tất phân loại
            </p>
          </div>
        </div>
        <div className="patient-controls">
          <Button
            variant="outline"
            size="icon"
            aria-label="Mốc trước"
            onClick={() => onHourChange(hour - 1)}
            disabled={!hydrated || hour === 0}
          >
            <ChevronLeft />
          </Button>
          <label className="filter-label">
            Mốc giờ đang xem
            <select
              disabled={!hydrated}
              value={hour}
              onChange={(e) => onHourChange(Number(e.target.value))}
            >
              {Array.from({ length: 37 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)} · {formatTime(timeAt(encounter.t0, h))}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mốc tiếp theo"
            onClick={() => onHourChange(hour + 1)}
            disabled={!hydrated || hour === 36}
          >
            <ChevronRight />
          </Button>
        </div>
      </section>
      {entryForm}
      <div className="workspace-grid">
        <div className="workspace-column">
          <RiskSummary encounter={encounter} hour={hour} />
          <RiskTimeline
            encounter={encounter}
            hour={hour}
            onHourChange={onHourChange}
            onset={onset}
          />
          <ReviewPanel
            key={`${encounter.id}:${hour}`}
            prediction={predictionAt(encounter.id, hour, dataset)}
          />
          <Panel
            title="Mô hình đang sử dụng"
            meta={<Cpu size={14} />}
            className="model-panel"
          >
            <div className="panel-body model-details">
              <dl>
                <dt>Thuật toán</dt>
                <dd>Logistic Regression</dd>
                <dt>Đầu vào</dt>
                <dd>{meta.features.length} đặc trưng</dd>
                <dt>Cửa sổ quan sát</dt>
                <dd>T0 đến giờ dự báo</dd>
                <dt>Dự báo tương lai</dt>
                <dd>{meta.horizon_hours} giờ</dd>
                <dt>Ngưỡng</dt>
                <dd>{percent(meta.threshold)}</dd>
              </dl>
              <p className="model-version mt-4">{meta.model_version}</p>
            </div>
          </Panel>
        </div>
        <div className="workspace-column">
          <VitalSignsPanel id={encounter.id} hour={hour} />
          <LaboratoryPanel id={encounter.id} hour={hour} />
          <details className="panel secondary-details">
            <summary>Dữ liệu và cách đọc kết quả</summary>
            <div className="panel-body">
              <p>
                Chỉ sử dụng thông tin có sẵn trên EMR từ T0 đến{" "}
                {formatTime(at, true)}. Kết quả cũ trả muộn không thay thế lần
                lấy mẫu mới hơn.
              </p>
              <p className="secondary-text mt-3">
                Màu cảnh báo thể hiện điểm vượt ngưỡng, không phải mức độ bệnh
                hay chẩn đoán. Mô hình sử dụng dữ liệu EMR mô phỏng.
              </p>
            </div>
          </details>
        </div>
      </div>
      <ClinicalNote />
    </>
  );
}
