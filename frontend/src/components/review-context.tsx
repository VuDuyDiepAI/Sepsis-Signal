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
  getReviewHistory,
  serverReviewHistory,
} from "@/lib/review-store";
import type { Prediction, Review } from "@/lib/clinical-types";
import { startClinicalSync } from "@/lib/clinical-storage";
import { useAuth } from "./auth-provider";
const Context = createContext<{
  reviews: Record<string, Review>;
  recordReview: (p: Prediction, note: string, requestId: string) => Promise<void>;
  reviewHistory: Review[];
} | null>(null);
export function ReviewProvider({ children }: { children: ReactNode }) {
  const {user}=useAuth();
  useEffect(()=>{if(user)return startClinicalSync();}, [user]);
  const reviewHistory=useSyncExternalStore(subscribeReviews,getReviewHistory,serverReviewHistory);
  const reviews = useSyncExternalStore(
    subscribeReviews,
    getReviews,
    serverReviews,
  );
  return (
    <Context.Provider
      value={{
        reviews,
        reviewHistory,
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
