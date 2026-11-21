"use client";
import { Link } from "react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useClinicalReader } from "@/lib/client/manual-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClinicalNote } from "@/components/shared/empty-state";
import {
  departments,
  formatTime,
  hourLabel,
  timeAt,
} from "@/lib/clinical/data";
import type { Encounter } from "@/lib/contracts/clinical";
import { RiskSummary } from "@/components/clinical/risk-summary";
import { RiskTimeline } from "@/components/clinical/risk-timeline";
import { VitalSignsPanel } from "@/components/clinical/vital-signs-panel";
import { LaboratoryPanel } from "@/components/clinical/laboratory-panel";
import { ReviewPanel } from "@/components/clinical/review-panel";
export function PatientWorkspace({
  encounter,
  hour,
  onHourChange,
  onset,
  entryForm,
  navigationPending = false,
  action,
  embedded = false,
  returnTo,
  statusMessage,
}: {
  encounter: Encounter;
  hour: number;
  onHourChange: (h: number) => void;
  onset?: string | null;
  entryForm?: (onScored: (message: string) => void) => React.ReactNode;
  navigationPending?: boolean;
  action?: React.ReactNode;
  embedded?: boolean;
  returnTo?: string;
  statusMessage?: string;
}) {
  const reader = useClinicalReader();
  const [activeTab, setActiveTab] = useState(
    entryForm ? "entry" : "assessment",
  );
  const [savedNotice, setSavedNotice] = useState("");
  const hydrated = useHydrated();
  const at = timeAt(encounter.t0, hour);
  const IdentityHeading = embedded ? "strong" : "h1";
  const updates = reader.getUpdates(encounter.id, hour);
  const assessment = (
    <div className="clinical-board">
      <div className="clinical-board-data">
        <div className="clinical-board-column">
          <RiskSummary encounter={encounter} hour={hour} />
          <RiskTimeline
            encounter={encounter}
            hour={hour}
            onHourChange={onHourChange}
            onset={onset}
          />
        </div>
        <div className="clinical-board-column">
          <VitalSignsPanel id={encounter.id} hour={hour} />
          <LaboratoryPanel id={encounter.id} hour={hour} />
        </div>
      </div>
      <ReviewPanel
        key={`${encounter.id}:${hour}`}
        prediction={reader.getPrediction(encounter.id, hour)}
        encounterId={encounter.id}
        hour={hour}
        returnTo={returnTo}
        compact
      />
    </div>
  );
  return (
    <div className="viewport-screen patient-workspace">
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
          </div>
        </div>
        <div className="patient-controls">
          {returnTo && (
            <Link className="link-button" to={returnTo}>
              {returnTo.startsWith("/dashboard")
                ? "Về theo dõi & cảnh báo"
                : "Về danh sách hồ sơ"}
            </Link>
          )}
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
          <span>
            Đang xem {formatTime(at, true)} · T0{" "}
            {formatTime(encounter.t0, true)}
          </span>
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

      {(savedNotice || statusMessage) && (
        <p role="status" className="workspace-notice">
          {statusMessage || savedNotice}
        </p>
      )}
      {!entryForm ? (
        assessment
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(String(value))}
          className="workspace-tabs"
        >
          <TabsList variant="line" aria-label="Nội dung hồ sơ">
            <TabsTrigger value="assessment">Tổng hợp</TabsTrigger>
            <TabsTrigger value="entry">Nhập chỉ số</TabsTrigger>
          </TabsList>
          <TabsContent
            value="assessment"
            keepMounted
            className="workspace-pane board-pane"
          >
            {assessment}
          </TabsContent>
          {entryForm && (
            <TabsContent
              value="entry"
              keepMounted
              className="workspace-pane entry-pane"
            >
              <fieldset
                className="entry-boundary"
                disabled={navigationPending}
                aria-busy={navigationPending}
              >
                {entryForm((message) => {
                  setSavedNotice(message);
                  setActiveTab("assessment");
                })}
              </fieldset>
            </TabsContent>
          )}
        </Tabs>
      )}
      <details className="screen-help">
        <summary>Dữ liệu và cách đọc kết quả</summary>
        <ClinicalNote>
          Chỉ dùng dữ liệu đã có trên EMR từ T0 đến {formatTime(at, true)}. Điểm
          nguy cơ không xác định chẩn đoán; dưới ngưỡng không loại trừ sepsis.
          Đã xem xét chưa đồng nghĩa đã hoàn tất xử trí.
        </ClinicalNote>
      </details>
    </div>
  );
}
