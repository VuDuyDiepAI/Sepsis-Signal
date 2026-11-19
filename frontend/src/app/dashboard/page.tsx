import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-container";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { PatientTable } from "@/components/dashboard/patient-table";
import { ClinicalNote } from "@/components/shared/empty-state";
export default function Dashboard() {
  return (
    <>
      <PageHeader
        title="Tổng quan lâm sàng"
        description="Theo dõi diễn biến nguy cơ. Nhận diện hồ sơ cần xem xét sớm."
        action={
          <div className="flex gap-3 flex-wrap">
            <Link href="/sample-cases" className="link-button">
              <FlaskConical size={17} />
              Mở ca mẫu
            </Link>
            <Link href="/patients/new" className="link-button primary">
              <Plus size={17} />
              Tạo ca mới
            </Link>
          </div>
        }
      />
      <SummaryCards />
      <PatientTable />
      <ClinicalNote />
    </>
  );
}
