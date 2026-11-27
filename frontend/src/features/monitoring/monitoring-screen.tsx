"use client";
import { Link } from "react-router";
import { useQuery, useAppNavigation } from "@/app/navigation";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useClinicalReader } from "@/lib/client/manual-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePageCapacity } from "@/hooks/use-page-capacity";
import { useReviews } from "@/components/providers/review-provider";
import { PageHeader } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClinicalNote, EmptyState } from "@/components/shared/empty-state";
import {
  departments,
  formatTime,
  hourLabel,
  percent,
  summaryOf,
} from "@/lib/clinical/data";
import {
  alertQueue,
  type AlertScope,
  type ObservationChange,
} from "@/lib/clinical/monitoring-view";
import { patientHref } from "@/lib/clinical/navigation";
import {
  ALERT_ROUTING,
  ALERT_SOP_STEPS,
  assessClinicalValue,
} from "@/lib/clinical/scores";
import { ReviewStatus, Trend } from "@/components/clinical/alert-status";
const number = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(n);
function isAbnormalChange(item: ObservationChange) {
  const status = assessClinicalValue(item.kind, item.key, item.value).status;
  return status === "high" || status === "low";
}
function ChangedValue({ item }: { item: ObservationChange }) {
  const assessment = assessClinicalValue(item.kind, item.key, item.value);
  const abnormal = assessment.status === "high" || assessment.status === "low";
  return (
    <div className="queue-change">
      <span>
        <strong>{item.label}</strong>:{" "}
        <span className="queue-prev">
          {item.previous === null ? "Mới ghi nhận" : number(item.previous) + " →"}
        </span>{" "}
        <b className={abnormal ? `queue-val is-${assessment.status}` : "queue-val"}>
          {number(item.value)}
        </b>{" "}
        {item.unit}
        {assessment.badge && (
          <span
            className={`value-flag is-${assessment.status}`}
            title={
              assessment.rangeLabel
                ? `Tham chiếu người lớn: ${assessment.rangeLabel}`
                : undefined
            }
          >
            {assessment.badge}
          </span>
        )}
      </span>
      <span className="alert-cell-note">
        {item.kind === "vital" ? "Đo" : "Lấy mẫu"}{" "}
        {formatTime(item.observedAt, true)} · Có sẵn{" "}
        {formatTime(item.availableAt, true)}
      </span>
    </div>
  );
}
export function MonitoringScreen() {
  const reader = useClinicalReader(),
    { reviews } = useReviews(),
    hydrated = useHydrated();
  const params = useQuery();
  const router = useAppNavigation();
  const {
    ref: tableRef,
    capacity,
    ready: capacityReady,
  } = usePageCapacity(112, 4, 8);
  const scope: AlertScope =
    params.get("scope") === "history" ? "history" : "current";
  const review = ["pending", "reviewed", "all"].includes(
    params.get("review") ?? "",
  )
    ? params.get("review")!
    : "pending";
  const search = params.get("search") ?? "",
    department = Object.hasOwn(departments, params.get("department") ?? "")
      ? params.get("department")!
      : "all";
  function update(key: string, value: string) {
    const next = new URLSearchParams(window.location.search);
    if (key !== "page") next.delete("page");
    if (
      !value ||
      (key === "scope" && value === "current") ||
      (key === "review" && value === "pending") ||
      (key === "department" && value === "all")
    )
      next.delete(key);
    else next.set(key, value);
    router.replace("/dashboard" + (next.size ? "?" + next.toString() : ""), { scroll: false });
  }
  const summary = summaryOf(reader.getMonitoringRows(reviews));
  const current = alertQueue(reader, reviews, "current"),
    history = alertQueue(reader, reviews, "history");
  const shown = (scope === "current" ? current : history).filter(
    (row) =>
      row.encounter.id.toLowerCase().includes(search.trim().toLowerCase()) &&
      (department === "all" || row.prediction.department === department) &&
      (review === "all" || (review === "reviewed") === !!row.review),
  );
  const totalPages = Math.max(1, Math.ceil(shown.length / capacity));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
  );
  const visible = shown.slice((page - 1) * capacity, page * capacity);
  const returnTo = "/dashboard" + (params.size ? "?" + params.toString() : "");
  return (
    <div className="viewport-screen list-screen">
      <PageHeader
        title="Theo dõi & Cảnh báo"
        action={
          <nav className="overview-summary" aria-label="Tóm tắt theo dõi">
            <Link className="summary-alert" to="/dashboard">
              <span>Chờ xem xét</span>
              <strong>{summary.pending}</strong>
            </Link>
            <Link to="/dashboard?review=reviewed">
              <span>Đã xem xét</span>
              <strong>{current.filter((r) => r.review).length}</strong>
            </Link>
            <Link to="/patients?state=unavailable">
              <span>Chưa có kết quả</span>
              <strong>{summary.unavailable}</strong>
            </Link>
          </nav>
        }
      />
      <section
        className="panel monitoring-panel"
        aria-label="Danh sách theo dõi và cảnh báo"
      >
        <div
          className="alert-toolbar"
          role="group"
          aria-label="Phạm vi thời gian"
        >
          {[
            ["current", "Hiện tại"],
            ["history", "Lịch sử"],
          ].map(([key, label]) => (
            <Button
              key={key}
              variant="ghost"
              disabled={!hydrated}
              className={scope === key ? "selected" : ""}
              aria-pressed={scope === key}
              onClick={() => update("scope", key)}
            >
              {label}
            </Button>
          ))}
          <div className="filters monitoring-filters">
            <label className="filter-label">
              Tìm hồ sơ
              <span className="search-field">
                <Search />
                <Input
                  aria-label="Tìm mã hồ sơ cảnh báo"
                  disabled={!hydrated}
                  placeholder="Nhập mã hồ sơ…"
                  value={search}
                  onChange={(e) => update("search", e.target.value)}
                />
              </span>
            </label>
            <label className="filter-label">
              Khoa điều trị
              <select
                disabled={!hydrated}
                value={department}
                onChange={(e) => update("department", e.target.value)}
              >
                <option value="all">Tất cả các khoa</option>
                {Object.entries(departments).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-label">
              Trạng thái xem xét
              <select
                disabled={!hydrated}
                value={review}
                onChange={(e) => update("review", e.target.value)}
              >
                <option value="pending">Chưa xem xét</option>
                <option value="reviewed">Đã xem xét</option>
                <option value="all">Tất cả trạng thái</option>
              </select>
            </label>
          </div>
        </div>
        {shown.length === 0 ? (
          <EmptyState
            title="Không có cảnh báo phù hợp"
            description="Thử đổi phạm vi thời gian hoặc trạng thái xem xét. Hồ sơ chưa có điểm được xem trong danh sách hồ sơ."
            action={
              <Button
                variant="outline"
                onClick={() =>
                  router.replace("/dashboard?review=all", { scroll: false })
                }
              >
                Xem tất cả cảnh báo hiện tại
              </Button>
            }
          />
        ) : (
          <div
            ref={tableRef}
            className="table-scroll"
            role="region"
            aria-label="Bảng theo dõi và cảnh báo"
            tabIndex={0}
          >
            <table className="clinical-table monitoring-table">
              <caption className="sr-only">
                {scope === "current"
                  ? "Cảnh báo tại mốc hiện tại"
                  : "Lịch sử cảnh báo"}
              </caption>
              <thead>
                <tr>
                  <th>Hồ sơ · Khoa</th>
                  <th>Điểm nguy cơ</th>
                  <th>Mốc dự báo</th>
                  <th>Dữ liệu vừa thay đổi</th>
                  <th>Xem xét</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(
                  ({
                    encounter,
                    prediction: p,
                    review: acknowledged,
                    changes,
                    change,
                  }) => {
                    const href = patientHref(encounter.id, p.hour, returnTo);
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link className="encounter-id" to={href}>
                            {encounter.id}
                          </Link>
                          <span className="alert-cell-note">
                            {encounter.age} tuổi ·{" "}
                            {encounter.sex === "F" ? "Nữ" : "Nam"} ·{" "}
                            {departments[p.department]}
                          </span>
                        </td>
                        <td>
                          <strong className="score-value above">
                            {percent(p.score)}
                          </strong>
                          <span className="alert-cell-note">
                            Ngưỡng {percent(p.threshold)}
                          </span>
                          <Trend value={change} />
                        </td>
                        <td>
                          {hourLabel(p.hour)}
                          <span className="alert-cell-note">
                            {formatTime(p.timestamp, true)}
                          </span>
                        </td>
                        <td className="queue-changes">
                          {changes.length ? (
                            <>
                              <ChangedValue item={changes[0]} />
                              {changes.length > 1 && (() => {
                                const rest = changes.slice(1);
                                const restAbnormal = rest.filter(isAbnormalChange).length;
                                return (
                                  <details>
                                    <summary>
                                      Thêm {rest.length} chỉ số
                                      {restAbnormal > 0 && (
                                        <span className="queue-summary-alert">
                                          {" "}
                                          ({restAbnormal} ngoài ngưỡng)
                                        </span>
                                      )}
                                    </summary>
                                    {rest.map((item) => (
                                      <ChangedValue key={item.key} item={item} />
                                    ))}
                                  </details>
                                );
                              })()}
                            </>
                          ) : (
                            <span className="secondary-text">
                              Không có giá trị mới thay đổi trong giờ này.
                            </span>
                          )}
                        </td>
                        <td>
                          <ReviewStatus reviewed={!!acknowledged} />
                          <span className="alert-cell-note">
                            Bản #{p.revision}
                          </span>
                          {acknowledged ? (
                            <span className="alert-cell-note">
                              {acknowledged.reviewer} ·{" "}
                              {formatTime(acknowledged.timestamp, true)}
                            </span>
                          ) : (
                            <span className="alert-cell-note alert-route-note">
                              Tiếp nhận: {ALERT_ROUTING[p.department].team} ·{" "}
                              {ALERT_ROUTING[p.department].sla}
                            </span>
                          )}
                        </td>
                        <td>
                          <Link className="link-button" to={href}>
                            {acknowledged ? "Mở hồ sơ" : "Xem xét"}
                          </Link>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {shown.length} bản dự báo ·{" "}
            {scope === "current" ? "Hiện tại" : "Lịch sử"} ·{" "}
            {review === "pending"
              ? "Chưa xem xét"
              : review === "reviewed"
                ? "Đã xem xét"
                : "Tất cả trạng thái"}
          </span>
          <div className="pagination">
            <Button
              variant="outline"
              size="icon"
              aria-label="Trang cảnh báo trước"
              disabled={!capacityReady || page === 1}
              onClick={() => update("page", String(page - 1))}
            >
              <ChevronLeft />
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Trang cảnh báo sau"
              disabled={!capacityReady || page === totalPages}
              onClick={() => update("page", String(page + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <span className="sr-only">
            {scope === "current"
              ? "Chưa xem xét trước, sau đó điểm nguy cơ giảm dần"
              : "Mốc dự báo mới nhất trước"}
          </span>
        </div>
      </section>
      <details className="screen-help sop-panel">
        <summary>
          Quy trình tiếp nhận &amp; xử lý cảnh báo (SOP 4 bước · không còi ồn ·
          khóa lặp 6 giờ)
        </summary>
        <div className="sop-grid">
          {ALERT_SOP_STEPS.map((item) => (
            <div key={item.step} className="sop-step">
              <strong>{item.step}</strong>
              <span className="sop-owner">{item.owner}</span>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
        <ClinicalNote>
          Dữ liệu vừa thay đổi là giá trị mới có trên EMR trong giờ dự báo
          (nhãn ↑ Cao / ↓ Thấp đối chiếu theo khoảng tham chiếu người lớn),
          không phải giải thích nguyên nhân làm tăng điểm. Đã xem xét không có
          nghĩa đã hoàn tất xử trí; mọi y lệnh do bác sĩ quyết định trên hệ
          thống bệnh viện.
        </ClinicalNote>
      </details>
    </div>
  );
}
