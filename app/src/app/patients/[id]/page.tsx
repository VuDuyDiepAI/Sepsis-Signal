import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findEncounterAcrossAll } from "@/lib/workspace-data";
import { PatientScreen } from "@/components/clinical/patient-screen";
import Loading from "@/app/loading";
import { ManualCaseScreen } from "@/components/clinical/manual-case-screen";

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
  const rawHour = (await searchParams).hour;
  const parsedHour =
    rawHour !== undefined && rawHour !== "" ? Number(rawHour) : undefined;
  const validHour =
    parsedHour !== undefined &&
    Number.isInteger(parsedHour) &&
    parsedHour >= 0 &&
    parsedHour <= 36
      ? parsedHour
      : undefined;

  if (id.startsWith("HS-")) {
    return <ManualCaseScreen key={id} id={id} initialHour={validHour} />;
  }

  const found = findEncounterAcrossAll(id);
  if (!found) notFound();

  const hour = validHour ?? found.encounter.currentHour;
  return (
    <PatientScreen
      key={`${id}:${hour}`}
      encounter={found.encounter}
      initialHour={hour}
      sourceId={found.sourceId}
    />
  );
}
