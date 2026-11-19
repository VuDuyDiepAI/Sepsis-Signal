import {
  TriangleAlert,
  CircleMinus,
  Clock3,
  CheckCheck,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { stateLabels } from "@/lib/clinical-data";
import type { ClinicalState } from "@/lib/clinical-types";
export function AlertStatus({ state }: { state: ClinicalState }) {
  const Icon =
    state === "above"
      ? TriangleAlert
      : state === "below"
        ? CircleMinus
        : Clock3;
  return (
    <span className={`status-pill ${state}`}>
      <Icon size={14} />
      {stateLabels[state]}
    </span>
  );
}
export function ReviewStatus({
  reviewed,
  unavailable = false,
}: {
  reviewed: boolean;
  unavailable?: boolean;
}) {
  return (
    <span className={`review-label ${reviewed ? "done" : ""}`}>
      {reviewed && <CheckCheck size={15} />}{" "}
      {unavailable ? "—" : reviewed ? "Đã xem xét" : "Chưa xem xét"}
    </span>
  );
}
export function Trend({ value }: { value?: number }) {
  const Icon =
    value === undefined || Math.abs(value) < 0.005
      ? Minus
      : value > 0
        ? TrendingUp
        : TrendingDown;
  return (
    <span
      className={`trend ${value !== undefined && value > 0 ? "rising" : ""}`}
    >
      <Icon size={15} />
      {value === undefined
        ? "Chưa đủ mốc"
        : `${value > 0 ? "+" : ""}${value.toFixed(2)} đ.%`}
    </span>
  );
}
