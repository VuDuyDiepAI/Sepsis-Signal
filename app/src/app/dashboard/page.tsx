import { PatientTable } from "@/components/dashboard/patient-table";
import { ClinicalNote } from "@/components/shared/empty-state";

export default function Dashboard() {
  return (
    <>
      <h1 className="sr-only">Bảng theo dõi ca trực Cấp cứu</h1>
      <PatientTable />
      <ClinicalNote />
    </>
  );
}
