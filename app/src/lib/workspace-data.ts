import workspaceRaw from "@/data/workspace-datasets.json";
import { dataset as defaultDataset } from "./clinical-data";
import type {
  ClinicalDataset,
  Encounter,
  EncounterContext,
  LaboratoryResult,
  Location,
  Prediction,
  VitalObservation,
} from "./clinical-types";

export type DataSourceId = "vinmec_mock" | "mimic_real" | "emr_full" | "default";

interface RawSubDataset {
  label: string;
  shortLabel: string;
  sourceFile: string;
  encounters: Encounter[];
  predictions: Prediction[];
  vitals: VitalObservation[];
  labs: LaboratoryResult[];
  locations: Location[];
}

interface WorkspaceBundle {
  datasets: {
    vinmec_mock: RawSubDataset;
    mimic_real: RawSubDataset;
    emr_full: RawSubDataset;
  };
  contexts: Record<string, EncounterContext>;
  onsets: Record<string, { sepsisOnset: string | null }>;
}

const bundle = workspaceRaw as unknown as WorkspaceBundle;

export const DATA_SOURCES: {
  id: DataSourceId;
  label: string;
  shortLabel: string;
  count: number;
  sourceFile: string;
}[] = [
  {
    id: "vinmec_mock",
    label: bundle.datasets.vinmec_mock.label,
    shortLabel: `${bundle.datasets.vinmec_mock.shortLabel} (${bundle.datasets.vinmec_mock.encounters.length} ca)`,
    count: bundle.datasets.vinmec_mock.encounters.length,
    sourceFile: bundle.datasets.vinmec_mock.sourceFile,
  },
  {
    id: "mimic_real",
    label: bundle.datasets.mimic_real.label,
    shortLabel: `${bundle.datasets.mimic_real.shortLabel} (${bundle.datasets.mimic_real.encounters.length} ca)`,
    count: bundle.datasets.mimic_real.encounters.length,
    sourceFile: bundle.datasets.mimic_real.sourceFile,
  },
  {
    id: "emr_full",
    label: bundle.datasets.emr_full.label,
    shortLabel: `EMR mở rộng (${bundle.datasets.emr_full.encounters.length} ca)`,
    count: bundle.datasets.emr_full.encounters.length,
    sourceFile: bundle.datasets.emr_full.sourceFile,
  },
  {
    id: "default",
    label: "EMR mô phỏng mặc định (9 ca)",
    shortLabel: `EMR chuẩn (${defaultDataset.encounters.length} ca)`,
    count: defaultDataset.encounters.length,
    sourceFile: defaultDataset.provenance.source,
  },
];

const cachedDatasets: Partial<Record<DataSourceId, ClinicalDataset>> = {
  default: defaultDataset,
};

export function getDatasetBySource(sourceId: DataSourceId): ClinicalDataset {
  const existing = cachedDatasets[sourceId];
  if (existing) return existing;
  const sub = bundle.datasets[sourceId as keyof WorkspaceBundle["datasets"]];
  const built: ClinicalDataset = {
    encounters: sub.encounters,
    predictions: sub.predictions,
    vitals: sub.vitals,
    labs: sub.labs,
    locations: sub.locations,
    models: defaultDataset.models,
    provenance: {
      ...defaultDataset.provenance,
      source: sub.sourceFile,
      dataKind:
        sourceId === "mimic_real"
          ? "MIMIC_IV_ED_NORMALIZED_VINMEC"
          : sourceId === "vinmec_mock"
            ? "VINMEC_MOCK_OH_EFORM_LIS"
            : defaultDataset.provenance.dataKind,
    },
  };
  cachedDatasets[sourceId] = built;
  return built;
}

export function getWorkspaceContext(id: string): EncounterContext | null {
  return bundle.contexts[id] ?? null;
}

export function getWorkspaceOnset(id: string): string | null | undefined {
  return bundle.onsets[id]?.sepsisOnset;
}

export function findEncounterAcrossAll(id: string): {
  encounter: Encounter;
  sourceId: DataSourceId;
} | null {
  const order: DataSourceId[] = [
    "vinmec_mock",
    "mimic_real",
    "emr_full",
    "default",
  ];
  for (const sid of order) {
    const ds = getDatasetBySource(sid);
    const match = ds.encounters.find((e) => e.id === id);
    if (match) return { encounter: match, sourceId: sid };
  }
  return null;
}
