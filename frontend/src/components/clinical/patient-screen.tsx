"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PatientWorkspace } from "./patient-workspace";
import type { Encounter } from "@/lib/clinical-types";
export function PatientScreen({
  encounter,
  initialHour,
}: {
  encounter: Encounter;
  initialHour: number;
}) {
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  const hour = initialHour;
  const setHour = (next: number) =>
    startNavigation(() =>
      router.replace(`/patients/${encounter.id}?hour=${next}`, {
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
      />
    </>
  );
}
