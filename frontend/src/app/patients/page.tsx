import { PageHeader } from "@/components/layout/page-container";
import { PatientTable } from "@/components/dashboard/patient-table";
import { ClinicalNote } from "@/components/shared/empty-state";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";
export default function Patients() {
  return (
    <div className="viewport-screen list-screen">
      <PageHeader
        title="Hồ sơ theo dõi"
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
      <details className="screen-help">
        <summary>Cách đọc kết quả</summary>
        <ClinicalNote />
      </details>
    </div>
  );
}
