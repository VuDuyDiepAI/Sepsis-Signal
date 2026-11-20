"use client";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCheck, ClipboardCheck } from "lucide-react";
import { Panel } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReviews } from "@/components/review-context";
import { formatTime, reviewFor } from "@/lib/clinical-data";
import type { Prediction } from "@/lib/clinical-types";
import { useState } from "react";
const schema = z.object({
  reviewer: z
    .string()
    .trim()
    .min(2, "Nhập tên người xem xét (ít nhất 2 ký tự).")
    .max(80, "Tối đa 80 ký tự."),
  note: z.string().trim().max(1000, "Ghi chú tối đa 1.000 ký tự."),
});
type Values = z.infer<typeof schema>;
export function ReviewPanel({
  prediction,
  returnTo,
  compact = false,
  encounterId,
  hour,
}: {
  prediction?: Prediction;
  returnTo?: string;
  compact?: boolean;
  encounterId?: string;
  hour?: number;
}) {
  const { reviews, recordReview } = useReviews();
  const [storageError, setStorageError] = useState("");
  const review = reviewFor(prediction, reviews);
  const prior = Object.values(reviews).filter(r => r.encounterId === (encounterId ?? prediction?.encounterId) && r.hour === (hour ?? prediction?.hour) && r.predictionId !== prediction?.id);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reviewer: "", note: "" },
  });
  return (
    <Panel
      title="Ghi nhận xem xét"
      meta={
        compact
          ? prediction
            ? `Bản tính #${prediction.revision} · ${review ? "Đã xem xét" : "Chưa xem xét"}`
            : "Chưa có dự báo"
          : "Lịch sử lưu trên máy chủ"
      }
      className={`review-panel ${compact ? "review-compact" : ""}`}
    >
      <div className="panel-body">
        {!prediction ? (
          <p className="muted">Chưa có bản dự báo để ghi nhận xem xét.</p>
        ) : review ? (
          <div className="review-success" role="status">
            <strong className="flex gap-2 items-center">
              <CheckCheck size={18} />
              Đã ghi nhận xem xét
            </strong>
            <span>
              {review.reviewer} · {formatTime(review.timestamp, true)}
            </span>
            <span className="secondary-text">Bản tính #{review.revision}</span>
            {review.note && <p>{review.note}</p>}
            {returnTo && (
              <Link className="link-button" href={returnTo}>
                Quay về danh sách
              </Link>
            )}
          </div>
        ) : (
          <form
            className="review-form"
            onSubmit={handleSubmit(async (v) => {
              try {
                await recordReview(prediction, v.reviewer, v.note);
                setStorageError("");
              } catch (error) {
                setStorageError(
                  error instanceof Error ? error.message : "Chưa lưu được ghi nhận trên máy chủ. Vui lòng thử lại.",
                );
              }
            })}
            noValidate
          >
            {!compact && (
              <p className="secondary-text">
                Chưa xem xét · Bản tính #{prediction.revision}. Ghi nhận này gắn
                riêng với kết quả tại mốc đang xem.
              </p>
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
                placeholder="Nhập tên người xem xét"
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
                placeholder="Nhận xét tại mốc này…"
                aria-invalid={!!errors.note}
              />
            </label>
            {errors.note && (
              <p className="form-error" role="alert">
                {errors.note.message}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting}>
              <ClipboardCheck size={17} />
              {isSubmitting ? "Đang lưu…" : "Ghi nhận đã xem xét"}
            </Button>
          </form>
        )}
        {storageError && (
          <p role="alert" className="form-error">
            {storageError}
          </p>
        )}
        <p className="clinical-note">
          Lưu trên máy chủ, gắn với từng phiên bản kết quả. Đã xem xét không có nghĩa đã hoàn tất xử trí.
        </p>
        {prior.length > 0 && (
          <details className="clinical-note">
            <summary>Lịch sử xem xét các phiên bản trước</summary>
            {prior.map(r => (
              <p key={r.predictionId}>Bản tính #{r.revision} · {r.reviewer} · {formatTime(r.timestamp,true)}{r.note ? ` — ${r.note}` : ""}</p>
            ))}
          </details>
        )}
      </div>
    </Panel>
  );
}
