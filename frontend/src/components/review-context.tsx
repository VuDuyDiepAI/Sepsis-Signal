"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Prediction, Review } from "@/lib/clinical-types";
const Context = createContext<{
  reviews: Record<string, Review>;
  recordReview: (p: Prediction, reviewer: string, note: string) => void;
  reset: () => void;
} | null>(null);
export function ReviewProvider({ children }: { children: ReactNode }) {
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  function recordReview(p: Prediction, reviewer: string, note: string) {
    setReviews((old) => ({
      ...old,
      [p.id]:
        old[p.id]?.revision === p.revision
          ? old[p.id]
          : {
              predictionId: p.id,
              revision: p.revision,
              reviewer: reviewer.trim(),
              note: note.trim(),
              timestamp: new Date().toISOString(),
              localOnly: true,
            },
    }));
  }
  return (
    <Context.Provider
      value={{ reviews, recordReview, reset: () => setReviews({}) }}
    >
      {children}
    </Context.Provider>
  );
}
export function useReviews() {
  const v = useContext(Context);
  if (!v) throw new Error("ReviewProvider required");
  return v;
}
