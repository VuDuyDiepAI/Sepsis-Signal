import { PageHeader } from "@/components/layout/page-container";
import { PatientTable } from "@/components/dashboard/patient-table";
import { ClinicalNote } from "@/components/shared/empty-state";
import Link from "next/link";
import { Plus } from "lucide-react";
export default function Patients() {
  return (
    <>
      <PageHeader
        title="Hồ sơ theo dõi"
        description="Tìm hồ sơ và mở không gian đánh giá nguy cơ theo giờ."
        action={
          <Link href="/patients/new" className="link-button primary">
            <Plus size={17} />
            Tạo ca mới
          </Link>
        }
      />
      <PatientTable />
      <ClinicalNote />
    </>
  );
}
