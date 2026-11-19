"use client";
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
const schema = z.object({
  reviewer: z
    .string()
    .trim()
    .min(2, "Nhập tên người xem xét (ít nhất 2 ký tự).")
    .max(80, "Tối đa 80 ký tự."),
  note: z.string().trim().max(1000, "Ghi chú tối đa 1.000 ký tự."),
});
type Values = z.infer<typeof schema>;
export function ReviewPanel({ prediction }: { prediction?: Prediction }) {
  const { reviews, recordReview } = useReviews();
  const review = reviewFor(prediction, reviews);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reviewer: "", note: "" },
  });
  return (
    <Panel
      title="Ghi nhận xem xét"
      meta="Thao tác trải nghiệm"
      className="review-panel"
    >
      <div className="panel-body">
        {!prediction ? (
          <p className="muted">Chưa có bản dự báo để ghi nhận xem xét.</p>
        ) : review ? (
          <div className="review-success" role="status">
            <strong className="flex gap-2 items-center">
              <CheckCheck size={18} />
              Đã xem xét trong phiên trải nghiệm
            </strong>
            <span>
              {review.reviewer} · {formatTime(review.timestamp, true)}
            </span>
            <span className="secondary-text">
              Bản tính #{review.revision} · {prediction.modelVersion}
            </span>
            {review.note && <p>{review.note}</p>}
          </div>
        ) : (
          <form
            className="review-form"
            onSubmit={handleSubmit((v) =>
              recordReview(prediction, v.reviewer, v.note),
            )}
            noValidate
          >
            <p className="secondary-text">
              Chưa xem xét · Bản tính #{prediction.revision}. Ghi nhận này gắn
              riêng với kết quả tại mốc đang xem.
            </p>
            <label>
              Người xem xét
              <Input
                {...register("reviewer")}
                autoComplete="off"
                aria-invalid={!!errors.reviewer}
                aria-describedby={
                  errors.reviewer ? "reviewer-error" : undefined
                }
                placeholder="Nhập tên để trải nghiệm"
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
            <Button type="submit">
              <ClipboardCheck size={17} />
              Ghi nhận đã xem xét
            </Button>
          </form>
        )}
        <p className="clinical-note">
          Chỉ lưu trong phiên trình duyệt; mất khi tải lại trang. Chưa gửi hoặc
          lưu lên hệ thống bệnh viện.
        </p>
      </div>
    </Panel>
  );
}
