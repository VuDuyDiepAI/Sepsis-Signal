"use client";
import { useEffect, useState } from "react";
import { useDemoOptional } from "@/components/demo-context";
import { PatientWorkspace } from "./patient-workspace";
import type { Encounter } from "@/lib/clinical-types";
import type { DataSourceId } from "@/lib/workspace-data";

export function PatientScreen({
  encounter,
  initialHour,
  sourceId,
}: {
  encounter: Encounter;
  initialHour: number;
  sourceId?: DataSourceId;
}) {
  const demo = useDemoOptional();
  const [manualHour, setManualHour] = useState<number | null>(null);

  // Keep active dataset aligned if user opened a patient URL directly
  const demoSetSource = demo?.setSourceId;
  const currentSource = demo?.sourceId;
  useEffect(() => {
    if (sourceId && demoSetSource && currentSource && currentSource !== sourceId) {
      demoSetSource(sourceId);
    }
  }, [sourceId, demoSetSource, currentSource]);

  const activeHour =
    demo?.demoActive && manualHour === null
      ? demo.demoHour
      : (manualHour ?? initialHour);

  return (
    <PatientWorkspace
      encounter={encounter}
      hour={activeHour}
      onHourChange={(nextH) => {
        if (demo?.demoRunning) demo.togglePause();
        setManualHour(nextH);
      }}
    />
  );
}
