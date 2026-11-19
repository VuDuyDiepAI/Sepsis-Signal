"use client";
import { z } from "zod";
import type { Prediction, Review } from "./clinical-types";
export const REVIEW_STORAGE_KEY = "sepsis-reviews-v1";
const reviewSchema = z.object({
  predictionId: z.string().min(1).max(200),
  revision: z.number().int().min(1),
  reviewer: z.string().min(2).max(80),
  timestamp: z.string().datetime(),
  note: z.string().max(1000),
  localOnly: z.literal(true),
});
export function decodeReviews(
  raw: string | null,
  now = Date.now(),
): Record<string, Review> {
  try {
    const parsed = z
      .record(z.string(), reviewSchema)
      .parse(JSON.parse(raw ?? "{}"));
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([key, r]) =>
            key === r.predictionId &&
            Date.parse(r.timestamp) <= now &&
            now - Date.parse(r.timestamp) < 8 * 3600000,
        )
        .slice(-500),
    );
  } catch {
    return {};
  }
}
const empty: Record<string, Review> = {};
let snapshot = empty;
let loaded = false;
const listeners = new Set<() => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const timestamps = Object.values(snapshot).map(
    (r) => Date.parse(r.timestamp) + 8 * 3600000,
  );
  if (listeners.size && timestamps.length) {
    expiryTimer = setTimeout(
      () => {
        snapshot = decodeReviews(JSON.stringify(snapshot));
        listeners.forEach((fn) => fn());
        scheduleExpiry();
      },
      Math.max(1, Math.min(...timestamps) - Date.now()),
    );
  }
}
export const serverReviews = () => empty;
export function getReviews() {
  if (typeof window !== "undefined" && !loaded) {
    loaded = true;
    try {
      snapshot = decodeReviews(sessionStorage.getItem(REVIEW_STORAGE_KEY));
    } catch {
      snapshot = empty;
    }
  }
  return snapshot;
}
export function subscribeReviews(fn: () => void) {
  listeners.add(fn);
  scheduleExpiry();
  return () => {
    listeners.delete(fn);
    scheduleExpiry();
  };
}
function save(next: Record<string, Review>) {
  sessionStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next));
  snapshot = next;
  scheduleExpiry();
  listeners.forEach((fn) => fn());
}
export function recordSessionReview(
  p: Prediction,
  reviewer: string,
  note: string,
) {
  const old = getReviews();
  if (old[p.id]?.revision === p.revision) return;
  const review = reviewSchema.parse({
    predictionId: p.id,
    revision: p.revision,
    reviewer: reviewer.trim(),
    note: note.trim(),
    timestamp: new Date().toISOString(),
    localOnly: true,
  });
  save(decodeReviews(JSON.stringify({ ...old, [p.id]: review })));
}
export function resetSessionReviews() {
  save({});
}
