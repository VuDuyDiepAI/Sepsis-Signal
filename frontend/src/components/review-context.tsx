"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getReviews,
  serverReviews,
  subscribeReviews,
  recordSessionReview,
  resetSessionReviews,
} from "@/lib/review-store";
import type { Prediction, Review } from "@/lib/clinical-types";
const Context = createContext<{
  reviews: Record<string, Review>;
  recordReview: (p: Prediction, reviewer: string, note: string) => void;
  reset: () => void;
} | null>(null);
export function ReviewProvider({ children }: { children: ReactNode }) {
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
        reset: resetSessionReviews,
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
