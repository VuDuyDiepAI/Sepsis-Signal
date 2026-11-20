"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PatientWorkspace } from "@/components/clinical/patient-workspace";
import { useHydrated } from "@/hooks/use-hydrated";
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
  const router = useRouter();
  const hydrated = useHydrated();
  const [navigationPending, startNavigation] = useTransition();
  const hour = initialHour;
  const setHour = (next: number) =>
    startNavigation(() =>
      router.replace(patientHref(encounter.id, next, returnTo), {
        scroll: false,
      }),
    );
  // Authenticated interactive patient details render only after hydration.
  // This avoids SSR/client races while the streamed patient route resolves.
  if (!hydrated) return <div role="status" className="section-stack">Đang tải hồ sơ…</div>;
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
