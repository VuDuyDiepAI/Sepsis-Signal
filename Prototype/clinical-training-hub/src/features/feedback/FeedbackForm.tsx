import { post } from "@/shared/api/client";
import { useHub } from "@/shared/context/HubContext";
import { MessageSquarePlus, ShieldCheck, Star } from "lucide-react";
import { FormEvent, useState } from "react";

const features = [
  "Tìm kiếm tài liệu",
  "Chất lượng câu trả lời AI",
  "Tính hữu ích của trích dẫn",
  "Tạo nội dung khóa học",
  "Chỉnh sửa bài học",
  "Chất lượng câu hỏi kiểm tra",
  "Trải nghiệm học tập",
  "Dashboard quản lý",
  "Mức độ dễ sử dụng tổng thể",
];

export function FeedbackForm({ onDone }: { onDone: () => void }) {
  const { act, busy, notify } = useHub();
  const [rating, setRating] = useState(5);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      await post("/feedback", { ...Object.fromEntries(f), rating });
      notify("Cảm ơn bạn! Góp ý đã được lưu để nhóm pilot xử lý.");
      onDone();
    });
  }
  return (
    <form onSubmit={submit}>
      <div className="notice">
        <ShieldCheck size={18} />
        <span>
          Phản hồi giúp cải thiện prototype. Vui lòng không nhập thông tin người
          bệnh hoặc dữ liệu nhạy cảm.
        </span>
      </div>
      <label>
        Tính năng được đánh giá
        <select name="feature">
          {features.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>Mức độ hài lòng</label>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`Đánh giá ${n} sao`}
            aria-pressed={rating === n}
            onClick={() => setRating(n)}
          >
            <Star
              size={29}
              fill={n <= rating ? "#b45309" : "none"}
              stroke={n <= rating ? "#b45309" : "#cbd8df"}
            />
          </button>
        ))}
        <span>
          {rating}/5 · {rating >= 4 ? "Hài lòng" : "Cần cải thiện"}
        </span>
      </div>
      <label>
        Điểm hoạt động tốt
        <textarea
          name="positives"
          rows={2}
          maxLength={4000}
          placeholder="Điều gì hữu ích với công việc đào tạo của bạn?"
        />
      </label>
      <label>
        Vấn đề gặp phải
        <textarea
          name="issues"
          rows={2}
          maxLength={4000}
          placeholder="Mô tả lỗi hoặc bước thao tác chưa rõ…"
        />
      </label>
      <label>
        Đề xuất cải thiện
        <textarea name="suggestions" rows={2} maxLength={4000} />
      </label>
      <div className="modal-actions">
        <button className="primary" disabled={busy}>
          <MessageSquarePlus size={17} />
          {busy ? "Đang gửi…" : "Gửi phản hồi"}
        </button>
      </div>
    </form>
  );
}
