"use client";
import { useClinicalReader } from "@/lib/manual-store";
import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReviewStatus } from "./alert-status";
import { useReviews } from "@/components/review-context";
import { ClinicalNote, EmptyState } from "@/components/shared/empty-state";
import {
  departments,
  formatTime,
  hourLabel,
  percent,
  reviewFor,
} from "@/lib/clinical-data";
export function AlertsScreen() {
  const reader = useClinicalReader();
  const { reviews } = useReviews();
  const [tab, setTab] = useState("active"),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState("all");
  const alerts = reader.getAlerts().map((a) => a.prediction);
  const active = alerts.filter(
    (p) =>
      p.hour === reader.getEncounter(p.encounterId)!.currentHour &&
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
      <section className="panel alerts-panel" aria-label="Danh sách cảnh báo">
        <div className="alert-toolbar" role="group" aria-label="Lọc cảnh báo">
          {[
            ["active", `Chưa xem xét (${active.length})`],
            ["reviewed", `Đã xem xét (${reviewed.length})`],
            ["history", `Lịch sử (${alerts.length})`],
          ].map(([key, label]) => (
            <Button
              key={key}
              variant="ghost"
              className={tab === key ? "selected" : ""}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="filters alert-filters">
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
        {shown.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="Không có cảnh báo phù hợp"
              description="Thử chuyển trạng thái hoặc điều chỉnh bộ lọc."
            />
          </div>
        ) : (
          <div
            className="table-scroll"
            role="region"
            aria-label="Bảng cảnh báo có thể cuộn ngang"
            tabIndex={0}
          >
            <table className="clinical-table alert-table">
              <caption className="sr-only">
                {tab === "active"
                  ? "Cảnh báo hiện tại chưa xem xét"
                  : tab === "reviewed"
                    ? "Cảnh báo đã xem xét"
                    : "Lịch sử các bản vượt ngưỡng"}
              </caption>
              <thead>
                <tr>
                  <th>Hồ sơ · Khoa</th>
                  <th>Mốc cảnh báo</th>
                  <th>Điểm / Ngưỡng</th>
                  <th>Cần xem xét</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const current =
                    p.hour === reader.getEncounter(p.encounterId)?.currentHour;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link
                          className="encounter-id"
                          href={`/patients/${p.encounterId}?hour=${p.hour}`}
                        >
                          {p.encounterId}
                        </Link>
                        <span className="alert-cell-note">
                          {departments[p.department]}
                        </span>
                      </td>
                      <td>
                        <span>{hourLabel(p.hour)}</span>
                        <span className="alert-cell-note">
                          {formatTime(p.timestamp, true)}
                        </span>
                      </td>
                      <td>
                        <strong className="score-value above">
                          {percent(p.score)}
                        </strong>
                        <span className="alert-cell-note">
                          Ngưỡng {percent(p.threshold)}
                        </span>
                      </td>
                      <td>
                        <span>Điểm vượt ngưỡng</span>
                        <span className="alert-cell-note">
                          {current ? "Mốc hiện tại" : "Bản lịch sử"} · Bản #
                          {p.revision}
                        </span>
                      </td>
                      <td>
                        <ReviewStatus reviewed={!!reviewFor(p, reviews)} />
                      </td>
                      <td>
                        <Link
                          className="link-button"
                          href={`/patients/${p.encounterId}?hour=${p.hour}`}
                        >
                          {reviewFor(p, reviews) ? "Mở hồ sơ" : "Xem xét"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {shown.length} bản dự báo phù hợp ·{" "}
            {tab === "active"
              ? "Chỉ mốc hiện tại chưa xem xét"
              : tab === "reviewed"
                ? "Đúng phiên bản đã ghi nhận"
                : "Gồm các mốc lịch sử"}
          </span>
        </div>
      </section>
      <ClinicalNote>
        Cảnh báo hiện tại chỉ tính bản dự báo đúng mốc đang theo dõi của mỗi hồ
        sơ. Lịch sử giữ từng bản vượt ngưỡng; không gộp thành các đợt cảnh báo
        lâm sàng. Xem xét chỉ lưu trong phiên trải nghiệm.
      </ClinicalNote>
    </>
  );
}
