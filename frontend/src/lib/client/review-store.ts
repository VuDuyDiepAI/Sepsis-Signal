"use client";
import { z } from "zod";
import type { Prediction, Review } from "@/lib/contracts/clinical";
import { getClinicalSnapshot,getServerClinicalSnapshot,subscribeClinical,persistClinical } from "@/lib/client/clinical-storage";
export const REVIEW_STORAGE_KEY = "sepsis-reviews-v1";
const reviewSchema = z.object({
  predictionId:z.string().min(1).max(200),revision:z.number().int().min(1),
  reviewer:z.string().min(2).max(80),timestamp:z.string().datetime(),note:z.string().max(1000),localOnly:z.boolean(),
});
/** Decode old tab records for migration. History no longer expires after eight hours. */
export function decodeReviews(raw: string | null, now = Date.now()): Record<string,Review> {
  try {
    const values = z.record(z.string(),reviewSchema).parse(JSON.parse(raw ?? "{}"));
    return Object.fromEntries(Object.entries(values).filter(([key,r]) => key === r.predictionId && Date.parse(r.timestamp) <= now));
  } catch { return {}; }
}
export const getReviews = () => getClinicalSnapshot().reviews;
export const serverReviews = () => getServerClinicalSnapshot().reviews;
export const subscribeReviews = subscribeClinical;
const emptyHistory: Review[]=[];
export const getReviewHistory=()=>getClinicalSnapshot().reviewHistory??emptyHistory;
export const serverReviewHistory=()=>emptyHistory;
export async function recordSessionReview(p: Prediction, note: string,requestId: string) {
  await persistClinical("/api/reviews","POST",{predictionId:p.id,revision:p.revision,note,requestId});
}
