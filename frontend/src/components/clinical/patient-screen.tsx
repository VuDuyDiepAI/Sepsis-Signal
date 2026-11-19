"use client";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-container";
import { PatientWorkspace } from "./patient-workspace";
import type { Encounter } from "@/lib/clinical-types";
export function PatientScreen({
  encounter,
  initialHour,
}: {
  encounter: Encounter;
  initialHour: number;
}) {
  const [hour, setHour] = useState(initialHour);
  return (
    <>
      <PageHeader
        title="Không gian đánh giá người bệnh"
        description="Đối chiếu cảnh báo, diễn biến và dữ kiện tại từng thời điểm."
        section="Hồ sơ người bệnh"
      />
      <PatientWorkspace
        encounter={encounter}
        hour={hour}
        onHourChange={setHour}
      />
    </>
  );
}
