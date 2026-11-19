"use client";
import Link from "next/link";
import { useState } from "react";
import { Search, BellRing, ClipboardCheck, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertStatus, ReviewStatus } from "./alert-status";
import { useReviews } from "@/components/review-context";
import { ClinicalNote, EmptyState } from "@/components/shared/empty-state";
import {
  dataset,
  departments,
  formatTime,
  hourLabel,
  percent,
  reviewFor,
} from "@/lib/clinical-data";
export function AlertsScreen() {
  const { reviews } = useReviews();
  const [tab, setTab] = useState("active"),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState("all");
  const alerts = dataset.predictions.filter(
    (p) =>
      p.score >= p.threshold &&
      p.hour <=
        dataset.encounters.find((e) => e.id === p.encounterId)!.currentHour,
  );
  const active = alerts.filter(
    (p) =>
      p.hour ===
        dataset.encounters.find((e) => e.id === p.encounterId)!.currentHour &&
      !reviewFor(p, reviews),
  );
  const reviewed = alerts.filter((p) => !!reviewFor(p, reviews));
  const shown = (
    tab === "active" ? active : tab === "reviewed" ? reviewed : alerts
  )
    .filter(
      (p) =>
        p.encounterId.toLowerCase().includes(search.trim().toLowerCase()) &&
        (department === "all" || p.department === department),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return (
    <>
      <PageHeader
        title="Trung tâm cảnh báo"
        description="Theo dõi các kết quả vượt ngưỡng và trạng thái xem xét của từng bản dự báo."
      />
      <div className="stats-grid">
        {[
          {
            label: "Bản dự báo vượt ngưỡng",
            value: alerts.length,
            icon: BellRing,
          },
          {
            label: "Cảnh báo hiện tại chờ xem xét",
            value: active.length,
            icon: BellRing,
            alert: true,
          },
          {
            label: "Bản dự báo đã xem xét",
            value: reviewed.length,
            icon: ClipboardCheck,
          },
          {
            label: "Hồ sơ có cảnh báo",
            value: new Set(alerts.map((p) => p.encounterId)).size,
            icon: History,
          },
        ].map(({ label, value, icon: Icon, alert }) => (
          <div key={label} className={`stat ${alert ? "alert" : ""}`}>
            <div className="stat-top">
              {label}
              <span className="stat-icon">
                <Icon size={18} />
              </span>
            </div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      <div className="panel mb-5">
        <div
          className="filters"
          style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}
        >
          <label className="filter-label">
            Tìm hồ sơ
            <span className="search-field">
              <Search />
              <Input
                aria-label="Tìm mã hồ sơ cảnh báo"
                placeholder="Nhập mã hồ sơ…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </label>
          <label className="filter-label">
            Khoa điều trị
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="all">Tất cả các khoa</option>
              {Object.entries(departments).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="alert-toolbar" role="group" aria-label="Lọc cảnh báo">
        {[
          ["active", `Chưa xem xét (${active.length})`],
          ["reviewed", `Đã xem xét (${reviewed.length})`],
          ["history", `Lịch sử (${alerts.length})`],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant="outline"
            className={tab === key ? "selected" : ""}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="Không có cảnh báo phù hợp"
            description="Thử chuyển trạng thái hoặc điều chỉnh bộ lọc."
          />
        </div>
      ) : (
        <div className="alerts-grid">
          {shown.map((p) => (
            <article key={p.id} className="panel alert-card">
              <div className="alert-card-top">
                <div>
                  <h2>{p.encounterId}</h2>
                  <p className="secondary-text">
                    {departments[p.department]} · {hourLabel(p.hour)} ·{" "}
                    {formatTime(p.timestamp, true)}
                  </p>
                </div>
                <AlertStatus state="above" />
              </div>
              <div className="risk-numbers" style={{ paddingBottom: 0 }}>
                <div>
                  <p className="value-label">Điểm sepsis</p>
                  <strong className="risk-main alert" style={{ fontSize: 33 }}>
                    {percent(p.score)}
                  </strong>
                </div>
                <div>
                  <p className="value-label">Ngưỡng cảnh báo</p>
                  <strong
                    className="risk-main threshold"
                    style={{ fontSize: 24 }}
                  >
                    {percent(p.threshold)}
                  </strong>
                </div>
              </div>
              <div className="alert-card-bottom">
                <ReviewStatus reviewed={!!reviewFor(p, reviews)} />
                <Link
                  className="link-button"
                  href={`/patients/${p.encounterId}?hour=${p.hour}`}
                >
                  Xem hồ sơ · Bản #{p.revision}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      <ClinicalNote>
        Cảnh báo hiện tại chỉ tính bản dự báo đúng mốc đang theo dõi của mỗi hồ
        sơ. Lịch sử giữ từng bản vượt ngưỡng; không gộp thành các đợt cảnh báo
        lâm sàng. Xem xét chỉ lưu trong phiên trải nghiệm.
      </ClinicalNote>
    </>
  );
}
