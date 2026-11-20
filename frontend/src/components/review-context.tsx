"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
  useEffect,
} from "react";
import {
  getReviews,
  serverReviews,
  subscribeReviews,
  recordSessionReview,
} from "@/lib/review-store";
import type { Prediction, Review } from "@/lib/clinical-types";
import { startClinicalSync } from "@/lib/clinical-storage";
const Context = createContext<{
  reviews: Record<string, Review>;
  recordReview: (p: Prediction, reviewer: string, note: string) => Promise<void>;
} | null>(null);
export function ReviewProvider({ children }: { children: ReactNode }) {
  useEffect(startClinicalSync, []);
  const reviews = useSyncExternalStore(
    subscribeReviews,
    getReviews,
    serverReviews,
  );
  return (
    <Context.Provider
      value={{
        reviews,
        recordReview: recordSessionReview,
      }}
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
