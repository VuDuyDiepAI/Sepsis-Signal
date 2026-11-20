export type Department = "ED" | "WARD" | "ICU";
export type ClinicalState = "above" | "below" | "unavailable";
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
  id?: string;
  reviewerId?: string;
  provenance?: string;
  predictionId: string;
  revision: number;
  reviewer: string;
  timestamp: string;
  note: string;
  localOnly: boolean;
  encounterId?: string;
  hour?: number;
  prediction?: Prediction;
}
export interface Metrics {
  auroc: number | null;
  auprc: number | null;
  precision: number | null;
  recall: number | null;
  specificity: number | null;
  npv: number | null;
  f1: number | null;
  brier: number;
  median_lead_hours: number | null;
  snapshots: number;
  positive_snapshots: number;
  encounter_early_recall: number | null;
  encounters: number;
  positive_encounters: number;
  timely_alert_encounters: number;
  episode_ppv: number | null;
  alert_episodes: number;
  true_alert_episodes: number;
  false_alert_episodes: number;
  false_alert_episodes_per_100: number | null;
  false_episodes_per_true_episode: number | null;
  repeated_alert_fraction: number | null;
  observed_prevalence: number;
  calibration_intercept: number | null;
  calibration_slope: number | null;
  iqr_lead_hours: number[] | null;
  calibration_curve: {
    mean_probability: number;
    observed_fraction: number;
    snapshots: number;
  }[];
  confidence_intervals: Record<
    string,
    { lower: number | null; upper: number | null; valid_resamples: number }
  >;
  bootstrap: {
    unit: string;
    resamples: number;
    level: number;
    seed: number;
    fixed_model_and_threshold: boolean;
  };
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
  evaluation_version: string;
  decision_policy_version: string;
  evaluation_limitations: string[];
  threshold_selection: {
    branch: string;
    minimum_recall: number;
    validation_encounter_recall: number;
    validation_snapshot_recall: number;
    hourly_recall_constraint: boolean;
    selection_data: string;
    probability_calibration: string;
    cooldown_hours: number;
  };
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
