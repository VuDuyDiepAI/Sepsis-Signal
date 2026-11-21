"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { Panel } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReviews } from "@/components/review-context";
import { useClinicalDataset } from "@/lib/manual-store";
import { formatTime, hourLabel, reviewFor } from "@/lib/clinical-data";
import {
  DECISION_LABELS,
  firstAlertHourOf,
  HOUR_ONE_BUNDLE,
} from "@/lib/clinical-reasoning";
import type {
  ClinicalDecision,
  Encounter,
  Prediction,
} from "@/lib/clinical-types";

const schema = z.object({
  reviewer: z
    .string()
    .trim()
    .min(2, "Nhập tên người xem xét (ít nhất 2 ký tự).")
    .max(80, "Tối đa 80 ký tự."),
  note: z.string().trim().max(1000, "Ghi chú tối đa 1.000 ký tự."),
});
type Values = z.infer<typeof schema>;

const RECHECK_OPTIONS = [15, 30, 60, 120] as const;

const DECISION_OPTIONS: {
  key: ClinicalDecision;
  title: string;
  tone: "critical" | "warning" | "ok";
}[] = [
  {
    key: "activate",
    title: "Xác nhận nghi ngờ · Kích hoạt Sepsis",
    tone: "critical",
  },
  {
    key: "monitor",
    title: "Theo dõi sát · Hẹn điều dưỡng đo lại",
    tone: "warning",
  },
  {
    key: "dismiss",
    title: "Tạm loại trừ · Không lạm dụng kháng sinh",
    tone: "ok",
  },
];

export function ReviewPanel({
  prediction,
  encounter,
  hour,
}: {
  prediction?: Prediction;
  encounter?: Encounter;
  hour?: number;
}) {
  const dataset = useClinicalDataset();
  const { reviews, auditLog, recordReview, toggleBundleItem } = useReviews();
  const review = reviewFor(prediction, reviews);

  const resolvedEncounter =
    encounter ??
    (prediction
      ? dataset.encounters.find((e) => e.id === prediction.encounterId)
      : undefined);
  const resolvedHour = hour ?? prediction?.hour ?? 0;

  const defaultDecision: ClinicalDecision =
    prediction && prediction.score >= prediction.threshold
      ? "activate"
      : "monitor";
  const [decision, setDecision] = useState<ClinicalDecision>(defaultDecision);
  const [recheckMinutes, setRecheckMinutes] = useState<number>(30);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reviewer: "", note: "" },
  });

  const firstAlertHour = resolvedEncounter
    ? firstAlertHourOf(resolvedEncounter.id, resolvedHour, dataset)
    : null;

  const encounterAudit = resolvedEncounter
    ? auditLog.filter((a) => a.encounterId === resolvedEncounter.id).slice(0, 4)
    : [];

  const checkedBundle = new Set(review?.bundleItems ?? []);
  const activeDecision: ClinicalDecision = review?.decision ?? "activate";

  return (
    <Panel
      title="Quyết định lâm sàng"
      meta={prediction ? `Bản tính #${prediction.revision}` : "Phiên trải nghiệm"}
      className="review-panel"
    >
      {/* Compact Horizontal 3-Chip ED Evidence Bar */}
      {resolvedEncounter && (
        <div
          className="evidence-inline"
          aria-label="Mốc thời gian Khoa Cấp cứu"
        >
          <div className="evidence-chip done">
            <strong>T0 Triage</strong>
            <span>{formatTime(resolvedEncounter.t0)}</span>
          </div>

          <div
            className={`evidence-chip ${firstAlertHour !== null ? "alert" : ""}`}
          >
            <strong>AI báo sớm</strong>
            <span>
              {firstAlertHour !== null ? hourLabel(firstAlertHour) : "Chưa báo"}
            </span>
          </div>

          <div className={`evidence-chip ${review ? "done" : ""}`}>
            <strong>BS xử trí</strong>
            <span>
              {review
                ? DECISION_LABELS[activeDecision].short
                : "Chờ xác nhận"}
            </span>
          </div>
        </div>
      )}

      <div className="panel-body">
        {!prediction ? (
          <p className="muted">
            Chưa có bản dự báo tại mốc này để ghi nhận quyết định xem xét.
          </p>
        ) : review ? (
          <div>
            <div className="review-success" role="status">
              <strong
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <CheckCheck size={18} aria-hidden="true" />
                Đã xem xét trong phiên trải nghiệm
              </strong>
              <div>
                <span
                  className={`tree-branch-badge ${
                    DECISION_LABELS[activeDecision].tone === "critical"
                      ? "crit"
                      : DECISION_LABELS[activeDecision].tone === "warning"
                        ? "warn"
                        : "ok"
                  }`}
                >
                  {DECISION_LABELS[activeDecision].label}
                </span>
              </div>
              {activeDecision === "monitor" && review.recheckMinutes && (
                <span>
                  Lịch hẹn điều dưỡng đo lại: sau {review.recheckMinutes} phút
                </span>
              )}
              <span>
                {review.reviewer} · {formatTime(review.timestamp, true)}
              </span>
              {review.note && <p>{review.note}</p>}
            </div>

            {activeDecision === "activate" && (
              <div className="bundle-checklist">
                <div className="section-kicker" style={{ marginBottom: 4 }}>
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>
                    Bảng kiểm Gói 1 Giờ ({checkedBundle.size}/
                    {HOUR_ONE_BUNDLE.length})
                  </span>
                </div>
                {HOUR_ONE_BUNDLE.map((item) => {
                  const isChecked = checkedBundle.has(item.key);
                  return (
                    <label
                      key={item.key}
                      className={`bundle-item ${isChecked ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          toggleBundleItem(prediction.id, item.key)
                        }
                      />
                      <span>
                        <strong style={{ display: "block" }}>
                          {item.label}
                        </strong>
                        <span className="secondary-text">{item.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <form
            className="review-form"
            onSubmit={handleSubmit((v) =>
              recordReview(prediction, v.reviewer, v.note, {
                decision,
                recheckMinutes:
                  decision === "monitor" ? recheckMinutes : undefined,
              }),
            )}
            noValidate
          >
            <div
              className="decision-options"
              role="radiogroup"
              aria-label="Hướng xử trí lâm sàng"
            >
              {DECISION_OPTIONS.map((opt) => {
                const selected = decision === opt.key;
                const Icon =
                  opt.tone === "critical"
                    ? AlertTriangle
                    : opt.tone === "warning"
                      ? Clock3
                      : ShieldCheck;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`decision-option ${
                      selected ? `selected tone-${opt.tone}` : ""
                    }`}
                    style={{ alignItems: "center", padding: "8px 10px" }}
                    onClick={() => setDecision(opt.key)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <strong>{opt.title}</strong>
                  </button>
                );
              })}
            </div>

            {decision === "monitor" && (
              <div className="recheck-row">
                <span className="secondary-text" style={{ fontWeight: 600 }}>
                  Hẹn đo lại:
                </span>
                {RECHECK_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`chip-btn ${
                      recheckMinutes === mins ? "selected" : ""
                    }`}
                    onClick={() => setRecheckMinutes(mins)}
                  >
                    {mins} phút
                  </button>
                ))}
              </div>
            )}

            <label>
              Người xem xét
              <Input
                {...register("reviewer")}
                autoComplete="off"
                aria-invalid={!!errors.reviewer}
                aria-describedby={
                  errors.reviewer ? "reviewer-error" : undefined
                }
                placeholder="VD: BS. Nguyễn Văn A"
              />
            </label>
            {errors.reviewer && (
              <p id="reviewer-error" className="form-error" role="alert">
                {errors.reviewer.message}
              </p>
            )}

            <label>
              Ghi chú (không bắt buộc)
              <textarea
                {...register("note")}
                placeholder="Nhận định tại giường hoặc chỉ định…"
                aria-invalid={!!errors.note}
              />
            </label>
            {errors.note && (
              <p className="form-error" role="alert">
                {errors.note.message}
              </p>
            )}

            <Button type="submit">
              <ClipboardCheck size={16} aria-hidden="true" />
              Ghi nhận đã xem xét
            </Button>
          </form>
        )}

        {encounterAudit.length > 0 && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--line-default)",
            }}
          >
            <div className="section-kicker">Nhật ký phiên</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {encounterAudit.map((entry) => (
                <div
                  key={entry.id}
                  className="secondary-text"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <span>
                    <strong style={{ color: "var(--ink-primary)" }}>
                      {hourLabel(entry.hour)}
                    </strong>{" "}
                    · {DECISION_LABELS[entry.decision].short} ({entry.reviewer})
                  </span>
                  <span className="num">{formatTime(entry.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="clinical-note" style={{ marginTop: 12 }}>
          Chỉ lưu cục bộ trong phiên trình duyệt; chưa đồng bộ HIS/EMR.
        </p>
      </div>
    </Panel>
  );
}
