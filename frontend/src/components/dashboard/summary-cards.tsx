"use client";
import { useClinicalReader } from "@/lib/manual-store";
import Link from "next/link";
import { summaryOf } from "@/lib/clinical-data";
import { useReviews } from "@/components/review-context";
export function SummaryCards() {
  const reader = useClinicalReader();
  const { reviews } = useReviews();
  const s = summaryOf(reader.getMonitoringRows(reviews));
  return (
    <nav className="overview-summary" aria-label="Tóm tắt theo dõi">
      {[
        {
          label: "Hồ sơ",
          value: s.total,
          href: "/patients",
        },
        {
          label: "Chờ xem xét",
          value: s.pending,
          href: "/alerts",
          alert: true,
        },
        {
          label: "Chưa có kết quả",
          value: s.unavailable,
          href: "/patients?state=unavailable",
        },
      ].map(({ label, value, href, alert }) => (
        <Link className={alert ? "summary-alert" : ""} key={label} href={href}>
          <span>{label}</span>
          <strong>{value}</strong>
        </Link>
      ))}
    </nav>
  );
}
