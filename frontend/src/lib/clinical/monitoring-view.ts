import {
  createClinicalReader,
  labFields,
  reviewFor,
  timeAt,
  vitalFields,
} from "@/lib/clinical/data";
import type { Review } from "@/lib/contracts/clinical";
export type ClinicalReader = ReturnType<typeof createClinicalReader>;
export type AlertScope = "current" | "history";
export interface ObservationChange {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  unit: string;
  observedAt: string;
  availableAt: string;
  kind: "vital" | "lab";
}
/** Describes newly available observations, never feature attribution or a causal explanation. */
export function observationChanges(
  reader: ClinicalReader,
  id: string,
  hour: number,
): ObservationChange[] {
  const encounter = reader.getEncounter(id);
  if (!encounter) return [];
  const from = Date.parse(timeAt(encounter.t0, hour - 1));
  const vitals = reader.getAvailableVitals(id, hour),
    before = reader.getAvailableVitals(id, hour - 1);
  const labs = reader.getAvailableLabs(id, hour),
    priorLabs = reader.getAvailableLabs(id, hour - 1);
  const changes: ObservationChange[] = [];
  for (const field of vitalFields) {
    const latest = vitals.filter((v) => v.values[field.key] != null).at(-1);
    const previous =
      before.filter((v) => v.values[field.key] != null).at(-1)?.values[
        field.key
      ] ?? null;
    if (
      latest &&
      Date.parse(latest.availableAt) > from &&
      latest.values[field.key] !== previous
    ) {
      changes.push({
        key: field.key,
        label: field.label,
        value: latest.values[field.key]!,
        previous,
        unit: field.unit,
        observedAt: latest.measuredAt,
        availableAt: latest.availableAt,
        kind: "vital",
      });
    }
  }
  for (const [code, label] of labFields) {
    const latest = labs.filter((l) => l.code === code).at(-1);
    const previous =
      priorLabs.filter((l) => l.code === code).at(-1)?.value ?? null;
    if (
      latest &&
      latest.value != null &&
      Date.parse(latest.availableAt) > from &&
      latest.value !== previous
    ) {
      changes.push({
        key: code,
        label,
        value: latest.value!,
        previous,
        unit: latest.unit,
        observedAt: latest.collectedAt,
        availableAt: latest.availableAt,
        kind: "lab",
      });
    }
  }
  return changes.sort((a, b) => b.availableAt.localeCompare(a.availableAt));
}
export function alertQueue(
  reader: ClinicalReader,
  reviews: Record<string, Review>,
  scope: AlertScope,
) {
  return reader
    .getAlerts()
    .filter(({ encounter, prediction }) =>
      scope === "current"
        ? prediction.hour === encounter.currentHour
        : prediction.hour < encounter.currentHour,
    )
    .map(({ encounter, prediction }) => ({
      encounter,
      prediction,
      review: reviewFor(prediction, reviews),
      change: reader.getChange(encounter.id, prediction.hour),
      changes: observationChanges(reader, encounter.id, prediction.hour),
    }))
    .sort((a, b) =>
      scope === "current"
        ? Number(!!a.review) - Number(!!b.review) ||
          b.prediction.score - a.prediction.score
        : b.prediction.timestamp.localeCompare(a.prediction.timestamp),
    );
}
