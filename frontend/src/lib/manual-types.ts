import type { Prediction } from "./clinical-types";
import type { ManualEntry, ManualProfile } from "./manual-schema";
export interface ManualPrediction extends Prediction { featureHash: string }
export interface ManualCase {
  profile: ManualProfile;
  entries: ManualEntry[];
  predictions: ManualPrediction[];
  attemptedHours: number[];
  revision: number;
  currentHour: number;
  errors: Record<string, string>;
  scoringStatus?: "idle" | "pending" | "running" | "ready" | "error";
  scoringError?: string;
}
export interface ScoreResponse {
  predictions: {
    hour: number; score: number; threshold: number; modelVersion: string;
    department: "ED" | "WARD" | "ICU"; availableFeatures: number; featureHash: string;
  }[];
  errors: Record<string, string>;
}
export interface ClinicalSnapshot {
  cases: ManualCase[];
  reviews: Record<string, import("./clinical-types").Review>;
  reviewHistory?: import("./clinical-types").Review[];
  fixturePredictions?: Prediction[];
}
