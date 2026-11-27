"use client";
import { useAppNavigation } from "@/app/navigation";
import { useTransition } from "react";
import { PatientWorkspace } from "@/features/patients/patient-workspace";
import type { Encounter } from "@/lib/contracts/clinical";
import { patientHref } from "@/lib/clinical/navigation";
export function PatientScreen({
  encounter,
  initialHour,
  returnTo,
}: {
  encounter: Encounter;
  initialHour: number;
  returnTo: string;
}) {
  const router = useAppNavigation();
  const [navigationPending, startNavigation] = useTransition();
  const hour = initialHour;
  const setHour = (next: number) =>
    startNavigation(() =>
      router.replace(patientHref(encounter.id, next, returnTo), {
        scroll: false,
      }),
    );
  return (
    <>
      <PatientWorkspace
        encounter={encounter}
        hour={hour}
        onHourChange={setHour}
        navigationPending={navigationPending}
        returnTo={returnTo}
      />
    </>
  );
}
