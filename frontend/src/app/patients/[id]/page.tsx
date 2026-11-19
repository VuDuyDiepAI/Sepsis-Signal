import { notFound } from "next/navigation";
import { Suspense } from "react";
import { dataProvider } from "@/lib/clinical-data";
import { PatientScreen } from "@/components/clinical/patient-screen";
import Loading from "@/app/loading";
type PatientProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hour?: string }>;
};
export default function Patient(props: PatientProps) {
  return (
    <Suspense fallback={<Loading />}>
      <PatientContent {...props} />
    </Suspense>
  );
}
async function PatientContent({ params, searchParams }: PatientProps) {
  const { id } = await params;
  const e = await dataProvider.getEncounter(id);
  if (!e) notFound();
  const q = Number((await searchParams).hour);
  const hour = Number.isInteger(q) && q >= 0 && q <= 36 ? q : e.currentHour;
  return (
    <PatientScreen key={`${id}:${hour}`} encounter={e} initialHour={hour} />
  );
}
