import {
  CheckCheck,
  CircleCheck,
  Clock3,
  Eye,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { stateLabels } from "@/lib/clinical-data";
import { DECISION_LABELS } from "@/lib/clinical-reasoning";
import type { ClinicalDecision, ClinicalState } from "@/lib/clinical-types";

export function AlertStatus({ state }: { state: ClinicalState }) {
  const Icon =
    state === "above"
      ? TriangleAlert
      : state === "below"
        ? CircleCheck
        : Clock3;
  return (
    <span className={`status-pill ${state}`}>
      <Icon size={13} aria-hidden="true" />
      {stateLabels[state]}
    </span>
  );
}

export function ReviewStatus({
  reviewed,
  unavailable = false,
  decision,
}: {
  reviewed: boolean;
  unavailable?: boolean;
  decision?: ClinicalDecision;
}) {
  if (unavailable) {
    return <span className="review-label">—</span>;
  }

  if (!reviewed) {
    return <span className="review-label">Chưa xem xét</span>;
  }

  const meta = decision ? DECISION_LABELS[decision] : undefined;
  const label = meta?.short ?? "Đã xem xét";

  if (decision === "activate") {
    return (
      <span
        className="review-label font-semibold"
        style={{ color: "var(--clinical-critical)" }}
      >
        <ShieldAlert size={14} aria-hidden="true" />
        {label}
      </span>
    );
  }

  if (decision === "monitor") {
    return (
      <span
        className="review-label font-semibold"
        style={{ color: "var(--clinical-warning)" }}
      >
        <Eye size={14} aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <span className="review-label done">
      <CheckCheck size={14} aria-hidden="true" />
      {label}
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
      <Icon size={14} aria-hidden="true" />
      {value === undefined
        ? "Chưa đủ mốc"
        : `${value > 0 ? "+" : ""}${value.toFixed(2)} đ.%`}
    </span>
  );
}
