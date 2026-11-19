"use client";
import { useClinicalDataset } from "@/lib/manual-store";
import { UsersRound, BellRing, ClipboardCheck, Clock3 } from "lucide-react";
import { monitoringRows, summaryOf } from "@/lib/clinical-data";
import { useReviews } from "@/components/review-context";
export function SummaryCards() {
  const dataset = useClinicalDataset();
  const { reviews } = useReviews();
  const s = summaryOf(monitoringRows(reviews, dataset));
  return (
    <div className="stats-grid">
      {[
        {
          label: "Hồ sơ theo dõi",
          value: s.total,
          caption: "Trong tập hồ sơ trải nghiệm",
          icon: UsersRound,
        },
        {
          label: "Cảnh báo chờ xem xét",
          value: s.pending,
          caption: "Vượt ngưỡng tại mốc hiện tại",
          icon: BellRing,
          alert: true,
        },
        {
          label: "Đã xem xét",
          value: s.reviewed,
          caption: "Đúng phiên bản kết quả mới nhất",
          icon: ClipboardCheck,
        },
        {
          label: "Chưa có kết quả",
          value: s.unavailable,
          caption: "Chưa có điểm tại mốc hiện tại",
          icon: Clock3,
        },
      ].map(({ label, value, caption, icon: Icon, alert }) => (
        <div className={`stat ${alert ? "alert" : ""}`} key={label}>
          <div className="stat-top">
            <span>{label}</span>
            <span className="stat-icon">
              <Icon size={18} />
            </span>
          </div>
          <div className="stat-value">{value}</div>
          <small>{caption}</small>
        </div>
      ))}
    </div>
  );
}
