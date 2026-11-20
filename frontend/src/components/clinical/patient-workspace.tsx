"use client";
import { useClinicalReader } from "@/lib/manual-store";
import { useHydrated } from "@/lib/use-hydrated";
import { UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClinicalNote } from "@/components/shared/empty-state";
import {
  departments,
  formatTime,
  hourLabel,
  timeAt,
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
  navigationPending = false,
  action,
  embedded = false,
}: {
  encounter: Encounter;
  hour: number;
  onHourChange: (h: number) => void;
  onset?: string | null;
  entryForm?: React.ReactNode;
  navigationPending?: boolean;
  action?: React.ReactNode;
  embedded?: boolean;
}) {
  const reader = useClinicalReader();
  const hydrated = useHydrated();
  const at = timeAt(encounter.t0, hour);
  const IdentityHeading = embedded ? "strong" : "h1";
  const updates = reader.getUpdates(encounter.id, hour);
  return (
    <>
      <section className="patient-bar" aria-label="Thông tin hồ sơ">
        <div className="patient-identity">
          <span className="patient-icon">
            <UserRound size={25} />
          </span>
          <div>
            <IdentityHeading>{encounter.id}</IdentityHeading>
            <p>
              {encounter.age} tuổi · {encounter.sex === "F" ? "Nữ" : "Nam"} ·{" "}
              {departments[reader.getDepartment(encounter.id, at)]}
            </p>
            <p className="secondary-text">
              T0 {formatTime(encounter.t0, true)}
            </p>
          </div>
        </div>
        <div className="patient-controls">
          {action}
          <Button
            variant="outline"
            size="icon"
            aria-label="Mốc trước"
            onClick={() => onHourChange(hour - 1)}
            disabled={!hydrated || navigationPending || hour === 0}
          >
            <ChevronLeft />
          </Button>
          <label className="filter-label">
            Mốc giờ đang xem
            <select
              disabled={!hydrated || navigationPending}
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
            disabled={!hydrated || navigationPending || hour === 36}
          >
            <ChevronRight />
          </Button>
        </div>
        <p className="patient-updates" role="status">
          <span>Đang xem {formatTime(at, true)}</span>
          <span>
            {updates.vitals} bản đo mới · {updates.labs} kết quả xét nghiệm mới
            trong giờ
          </span>
        </p>
      </section>
      {navigationPending && (
        <p role="status" className="secondary-text">
          Đang chuyển mốc dữ liệu…
        </p>
      )}
      {entryForm && (
        <fieldset
          className="entry-boundary"
          disabled={navigationPending}
          aria-busy={navigationPending}
        >
          {entryForm}
        </fieldset>
      )}
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
            prediction={reader.getPrediction(encounter.id, hour)}
          />
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
