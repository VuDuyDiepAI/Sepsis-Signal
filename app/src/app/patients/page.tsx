import { PatientTable } from "@/components/dashboard/patient-table";
import { ClinicalNote } from "@/components/shared/empty-state";

export default function Patients() {
  return (
    <>
      <h1 className="sr-only">Danh sách người bệnh</h1>
      <PatientTable />
      <ClinicalNote />
    </>
  );
}
