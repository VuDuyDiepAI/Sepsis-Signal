import { PageHeader } from "@/components/layout/page-container";
import { PatientTable } from "@/components/dashboard/patient-table";
import { ClinicalNote } from "@/components/shared/empty-state";
export default function Patients() {
  return (
    <>
      <PageHeader
        title="Hồ sơ theo dõi"
        description="Tìm hồ sơ và mở không gian đánh giá nguy cơ theo giờ."
      />
      <PatientTable />
      <ClinicalNote />
    </>
  );
}
