"use client";
import { useMemo } from "react";
import { useClinicalDataset } from "@/lib/manual-store";
import { monitoringRows } from "@/lib/clinical-data";
import { useReviews } from "@/components/review-context";

export type PriorityFilter =
  | "all"
  | "critical_pending"
  | "above_reviewed"
  | "below";

export interface SummaryCardsProps {
  activeFilter?: PriorityFilter;
  onSelectFilter?: (filter: PriorityFilter) => void;
}

export function SummaryCards({
  activeFilter = "all",
  onSelectFilter,
}: SummaryCardsProps) {
  const dataset = useClinicalDataset();
  const { reviews } = useReviews();

  const counts = useMemo(() => {
    const rows = monitoringRows(reviews, dataset);
    const criticalPending = rows.filter(
      (r) => r.state === "above" && !r.review,
    ).length;
    const aboveReviewed = rows.filter(
      (r) => r.state === "above" && !!r.review,
    ).length;
    const totalAbove = criticalPending + aboveReviewed;
    const below = rows.filter((r) => r.state === "below").length;
    const unavailable = rows.filter((r) => !r.prediction).length;
    return {
      criticalPending,
      aboveReviewed,
      totalAbove,
      below,
      unavailable,
      total: rows.length,
    };
  }, [reviews, dataset]);

  const cards: {
    id: PriorityFilter;
    label: string;
    sub: string;
    value: number;
    toneClass: string;
  }[] = [
    {
      id: "critical_pending",
      label: "Cần BS đánh giá ngay",
      sub: "Vượt ngưỡng · Chưa ghi nhận xử trí",
      value: counts.criticalPending,
      toneClass: "is-critical",
    },
    {
      id: "above_reviewed",
      label: "Đang vượt ngưỡng / Đã xem",
      sub:
        counts.totalAbove > 0
          ? `Trong tổng ${counts.totalAbove} ca vượt ngưỡng`
          : "Chưa có ca vượt ngưỡng",
      value: counts.aboveReviewed,
      toneClass: "is-warning",
    },
    {
      id: "below",
      label: "Ổn định / Dưới ngưỡng",
      sub: "Theo dõi thường quy tại khoa",
      value: counts.below,
      toneClass: "is-ok",
    },
    {
      id: "all",
      label: "Toàn khoa đang lưu",
      sub:
        counts.unavailable > 0
          ? `Gồm ${counts.unavailable} ca T0 chưa chấm điểm`
          : "Tất cả người bệnh đang theo dõi",
      value: counts.total,
      toneClass: "",
    },
  ];

  function handleClick(id: PriorityFilter) {
    if (!onSelectFilter) return;
    if (id !== "all" && activeFilter === id) {
      onSelectFilter("all");
      return;
    }
    onSelectFilter(id);
  }

  return (
    <div
      className="priority-bar"
      role="group"
      aria-label="Bộ lọc ưu tiên theo dõi ca trực"
    >
      {cards.map((card) => {
        const isActive = activeFilter === card.id;
        return (
          <button
            key={card.id}
            type="button"
            className={`priority-card ${card.toneClass} ${isActive ? "is-active" : ""}`.trim()}
            aria-pressed={isActive}
            onClick={() => handleClick(card.id)}
          >
            <div>
              <span className="priority-card-label">{card.label}</span>
              <span className="priority-card-sub">{card.sub}</span>
            </div>
            <span className="priority-card-num">{card.value}</span>
          </button>
        );
      })}
    </div>
  );
}
