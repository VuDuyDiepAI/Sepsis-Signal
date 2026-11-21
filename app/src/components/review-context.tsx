"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type {
  ClinicalDecision,
  Prediction,
  Review,
} from "@/lib/clinical-types";

export interface RecordReviewOptions {
  decision?: ClinicalDecision;
  recheckMinutes?: number;
  bundleItems?: string[];
}

export interface AuditEntry {
  id: string;
  encounterId: string;
  hour: number;
  predictionId: string;
  revision: number;
  reviewer: string;
  decision: ClinicalDecision;
  recheckMinutes?: number;
  bundleItems?: string[];
  note: string;
  timestamp: string;
}

const Context = createContext<{
  reviews: Record<string, Review>;
  auditLog: AuditEntry[];
  recordReview: (
    p: Prediction,
    reviewer: string,
    note: string,
    options?: RecordReviewOptions,
  ) => void;
  toggleBundleItem: (predictionId: string, itemKey: string) => void;
  reset: () => void;
} | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  function recordReview(
    p: Prediction,
    reviewer: string,
    note: string,
    options?: RecordReviewOptions,
  ) {
    const decision: ClinicalDecision = options?.decision ?? "activate";
    const ts = new Date().toISOString();
    const entry: Review = {
      predictionId: p.id,
      revision: p.revision,
      reviewer: reviewer.trim(),
      note: note.trim(),
      timestamp: ts,
      localOnly: true,
      decision,
      recheckMinutes: options?.recheckMinutes,
      bundleItems: options?.bundleItems ?? [],
    };
    setReviews((old) => ({
      ...old,
      [p.id]: old[p.id]?.revision === p.revision ? old[p.id] : entry,
    }));
    setAuditLog((old) => [
      {
        id: `${p.id}:${ts}`,
        encounterId: p.encounterId,
        hour: p.hour,
        predictionId: p.id,
        revision: p.revision,
        reviewer: reviewer.trim(),
        decision,
        recheckMinutes: options?.recheckMinutes,
        bundleItems: options?.bundleItems ?? [],
        note: note.trim(),
        timestamp: ts,
      },
      ...old,
    ]);
  }

  function toggleBundleItem(predictionId: string, itemKey: string) {
    setReviews((old) => {
      const current = old[predictionId];
      if (!current) return old;
      const set = new Set(current.bundleItems ?? []);
      if (set.has(itemKey)) set.delete(itemKey);
      else set.add(itemKey);
      return {
        ...old,
        [predictionId]: {
          ...current,
          bundleItems: [...set],
        },
      };
    });
  }

  function reset() {
    setReviews({});
    setAuditLog([]);
  }

  return (
    <Context.Provider
      value={{ reviews, auditLog, recordReview, toggleBundleItem, reset }}
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
