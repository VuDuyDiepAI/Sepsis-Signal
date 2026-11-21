export type Department = "ED" | "WARD" | "ICU";
export type ClinicalState = "above" | "below" | "unavailable";
export type ClinicalDecision = "activate" | "monitor" | "dismiss";
export type MetricSeverity = "critical" | "warning" | "normal" | "missing";

export interface Encounter {
  id: string;
  age: number;
  sex: "F" | "M";
  t0: string;
  currentHour: number;
}
export interface Prediction {
  id: string;
  encounterId: string;
  hour: number;
  timestamp: string;
  score: number;
  threshold: number;
  revision: number;
  modelVersion: string;
  department: Department;
  availableFeatures: number;
}
export type VitalKey =
  | "heart_rate_bpm"
  | "respiratory_rate_per_min"
  | "sbp_mmhg"
  | "map_mmhg"
  | "spo2_pct"
  | "temperature_c"
  | "gcs";
export interface VitalObservation {
  encounterId: string;
  measuredAt: string;
  availableAt: string;
  values: Record<VitalKey, number | null>;
}
export interface LaboratoryResult {
  encounterId: string;
  code: string;
  value: number | null;
  unit: string;
  collectedAt: string;
  availableAt: string;
}
export interface Location {
  encounterId: string;
  department: Department;
  startedAt: string;
  endedAt: string | null;
}
export interface Review {
  predictionId: string;
  revision: number;
  reviewer: string;
  timestamp: string;
  note: string;
  localOnly: true;
  decision?: ClinicalDecision;
  recheckMinutes?: number;
  bundleItems?: string[];
}
export interface SymptomSnapshot {
  recordedAt: string;
  availableAt: string;
  suspectedSite: string | null;
  flags: string[];
}
export interface EncounterContext {
  bmi: number | null;
  weightKg: number | null;
  heightCm: number | null;
  comorbidities: string[];
  triageLevel?: number | null;
  chiefComplaint?: string | null;
  symptoms: SymptomSnapshot[];
}
export interface Metrics {
  auroc: number | null;
  auprc: number | null;
  precision: number;
  recall: number;
  brier: number;
  median_lead_hours: number | null;
  snapshots: number;
  positive_snapshots: number;
  encounter_early_recall: number;
}
export interface ModelMetadata {
  model_name: string;
  model_version: string;
  horizon_hours: number;
  features: string[];
  threshold: number;
  first_prediction_hour: number;
  feature_schema_version: string;
  source_sha256: string;
  train_positive_encounters: number;
  validation_positive_encounters: number;
  temporal_holdout_positive_encounters: number;
  validation_synthetic_metrics: Metrics;
  temporal_holdout_synthetic_metrics: Metrics;
}
export interface ClinicalDataset {
  encounters: Encounter[];
  predictions: Prediction[];
  vitals: VitalObservation[];
  labs: LaboratoryResult[];
  locations: Location[];
  models: { sepsis: ModelMetadata; shock: ModelMetadata };
  provenance: {
    source: string;
    sourceSha256: string;
    featureCount: number;
    dataKind: string;
    availabilityRule: string;
    observationWindow: string;
  };
}
export interface AlertView {
  encounter: Encounter;
  prediction: Prediction;
  department: Department;
}
export interface MonitoringRow {
  encounter: Encounter;
  prediction?: Prediction;
  department: Department;
  state: ClinicalState;
  change?: number;
  review?: Review;
  timestamp: string;
}
export interface ClinicalDataProvider {
  listEncounters(): Promise<Encounter[]>;
  getEncounter(id: string): Promise<Encounter | null>;
  getPredictions(id: string, hour?: number): Promise<Prediction[]>;
  getAvailableVitals(id: string, hour: number): Promise<VitalObservation[]>;
  getAvailableLabs(id: string, hour: number): Promise<LaboratoryResult[]>;
  getAlerts(): Promise<AlertView[]>;
  getModelMetadata(): Promise<ModelMetadata>;
}
