import { notFound } from "next/navigation";
import { Suspense } from "react";
import { dataProvider } from "@/lib/clinical/data";
import { PatientScreen } from "@/components/clinical/patient-screen";
import Loading from "@/app/loading";
import { ManualCaseScreen } from "@/components/clinical/manual-case-screen";
import { predictionHour } from "@/lib/clinical/time";
import { safeReturnTo } from "@/lib/clinical/navigation";
type PatientProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hour?: string; returnTo?: string }>;
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
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  if (id.startsWith("HS-")) {
    const raw = query.hour;
    const q = predictionHour(raw, -1);
    return (
      <ManualCaseScreen
        key={`${id}:${q}`}
        id={id}
        initialHour={q >= 0 ? q : undefined}
        returnTo={returnTo}
      />
    );
  }
  const e = await dataProvider.getEncounter(id);
  if (!e) notFound();
  const hour = predictionHour(query.hour, e.currentHour);
  return (
    <PatientScreen
      key={`${id}:${hour}`}
      encounter={e}
      initialHour={hour}
      returnTo={returnTo}
    />
  );
}
