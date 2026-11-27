import type { Prediction } from "@/lib/contracts/clinical";
import type { ManualEntry, ManualProfile } from "@/lib/clinical/manual-schema";
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
  silentPredictionsCount?: number;
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
  reviews: Record<string, import("@/lib/contracts/clinical").Review>;
  reviewHistory?: import("@/lib/contracts/clinical").Review[];
  fixturePredictions?: Prediction[];
  silentMode?: boolean;
}
export interface ClinicalWriteResponse extends ClinicalSnapshot {
  jobId?: string | null;
}
export interface ScoringJobStatus {
  id: string;
  encounter_id: string;
  revision: number;
  status: "pending" | "running" | "succeeded" | "failed" | "superseded";
  attempts: number;
  error: string | null;
  duration_ms?: number | null;
  created_at: string;
  finished_at: string | null;
}
