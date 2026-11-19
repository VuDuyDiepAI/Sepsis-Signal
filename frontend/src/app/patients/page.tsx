import { PageHeader } from "@/components/layout/page-container";
import { PatientTable } from "@/components/dashboard/patient-table";
import { ClinicalNote } from "@/components/shared/empty-state";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";
export default function Patients() {
  return (
    <>
      <PageHeader
        title="Hồ sơ theo dõi"
        description="Tra cứu, tạo và quản lý toàn bộ hồ sơ. Chọn mã hồ sơ để xem diễn biến và cập nhật chỉ số."
        action={
          <Link href="/patients/new" className="link-button primary">
            <Plus size={17} />
            Tạo ca mới
          </Link>
        }
      />
      <Suspense
        fallback={
          <div role="status" className="panel panel-body">
            Đang tải danh sách hồ sơ…
          </div>
        }
      >
        <PatientTable />
      </Suspense>
      <ClinicalNote />
    </>
  );
}
