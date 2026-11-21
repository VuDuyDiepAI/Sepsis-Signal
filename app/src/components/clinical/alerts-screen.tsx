"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useClinicalDataset } from "@/lib/manual-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReviewStatus } from "./alert-status";
import { useReviews } from "@/components/review-context";
import { EmptyState } from "@/components/shared/empty-state";
import {
  departments,
  formatTime,
  hourLabel,
  percent,
} from "@/lib/clinical-data";
import { groupAlertEpisodes } from "@/lib/clinical-reasoning";

type EpisodeTab = "pending" | "reviewed" | "all";

export function AlertsScreen() {
  const dataset = useClinicalDataset();
  const { reviews } = useReviews();
  const [tab, setTab] = useState<EpisodeTab>("pending");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");

  const episodes = useMemo(
    () => groupAlertEpisodes(reviews, dataset),
    [reviews, dataset],
  );

  const pendingEpisodes = useMemo(
    () => episodes.filter((ep) => ep.isActiveNow && !ep.review),
    [episodes],
  );
  const reviewedEpisodes = useMemo(
    () => episodes.filter((ep) => !!ep.review),
    [episodes],
  );

  const shown = useMemo(() => {
    const base =
      tab === "pending"
        ? pendingEpisodes
        : tab === "reviewed"
          ? reviewedEpisodes
          : episodes;
    const q = search.trim().toLowerCase();
    return base.filter(
      (ep) =>
        ep.encounter.id.toLowerCase().includes(q) &&
        (department === "all" || ep.department === department),
    );
  }, [tab, pendingEpisodes, reviewedEpisodes, episodes, search, department]);

  function resetFilters() {
    setSearch("");
    setDepartment("all");
    setTab("all");
  }

  return (
    <>
      <h1 className="sr-only">Đợt cảnh báo nhiễm khuẩn huyết</h1>

      <div className="panel">
        <div className="watch-toolbar">
          <div
            className="segment-group"
            role="group"
            aria-label="Lọc trạng thái đợt cảnh báo"
          >
            <button
              type="button"
              className={`segment-btn is-critical ${tab === "pending" ? "active" : ""}`}
              aria-pressed={tab === "pending"}
              onClick={() => setTab("pending")}
            >
              {pendingEpisodes.length > 0 && (
                <span className="driver-dot critical" aria-hidden="true" />
              )}
              <span>Chờ xử trí</span>
              <span className="segment-count">{pendingEpisodes.length}</span>
            </button>
            <button
              type="button"
              className={`segment-btn ${tab === "reviewed" ? "active" : ""}`}
              aria-pressed={tab === "reviewed"}
              onClick={() => setTab("reviewed")}
            >
              <span>Đã xử trí</span>
              <span className="segment-count">{reviewedEpisodes.length}</span>
            </button>
            <button
              type="button"
              className={`segment-btn ${tab === "all" ? "active" : ""}`}
              aria-pressed={tab === "all"}
              onClick={() => setTab("all")}
            >
              <span>Tất cả</span>
              <span className="segment-count">{episodes.length}</span>
            </button>
          </div>

          <div className="toolbar-controls">
            <span className="search-field">
              <Search aria-hidden="true" />
              <Input
                aria-label="Tìm mã hồ sơ cảnh báo"
                placeholder="Tìm mã hồ sơ…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
            <select
              aria-label="Khoa điều trị"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="all">Tất cả khoa</option>
              {Object.entries(departments).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            title="Không có đợt cảnh báo phù hợp"
            description="Thử chuyển nhóm trạng thái hoặc đặt lại bộ lọc tìm kiếm."
            action={
              tab !== "all" || search || department !== "all" ? (
                <Button variant="outline" onClick={resetFilters}>
                  Xem tất cả đợt cảnh báo
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="alerts-grid">
            {shown.map((ep) => {
              const triageLevel = Math.min(3, ep.triage.level);
              const qsofa = ep.scores.qsofa;
              const mews = ep.scores.mews;
              const qsofaTone =
                qsofa.score >= 2 ? "crit" : qsofa.score >= 1 ? "warn" : "";
              const mewsTone =
                mews.tier === "high"
                  ? "crit"
                  : mews.tier === "medium"
                    ? "warn"
                    : "";
              const topDrivers = ep.drivers.slice(0, 2);

              return (
                <article
                  key={ep.encounter.id}
                  className={`alert-card ${ep.review ? "is-reviewed" : ""}`}
                >
                  <div className="patient-cell min-w-0">
                    <span
                      className={`triage-badge t${triageLevel}`}
                      title={ep.triage.label}
                    >
                      T{ep.triage.level}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[14px] font-bold leading-snug">
                        <Link
                          className="encounter-id"
                          href={`/patients/${ep.encounter.id}?hour=${ep.latestPrediction.hour}`}
                        >
                          {ep.encounter.id}
                        </Link>
                      </h2>
                      <p className="encounter-sub">
                        {ep.encounter.age}t ·{" "}
                        {ep.encounter.sex === "F" ? "Nữ" : "Nam"} ·{" "}
                        {ep.triage.zoneLabel} · vượt ngưỡng từ{" "}
                        <span className="num">
                          {hourLabel(ep.firstAboveHour)}
                        </span>
                        {!ep.isActiveNow ? " (đã hạ)" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="driver-list-inline max-w-none">
                      {topDrivers.length > 0 ? (
                        topDrivers.map((d) => (
                          <div key={d.id} className="driver-chip-inline">
                            <span>
                              <strong>{d.text}</strong>{" "}
                              <span className="muted">({d.detail})</span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="secondary-text">
                          Chưa có bất thường nổi bật
                        </span>
                      )}
                    </div>

                    <div className="scores-inline-row !mt-1">
                      <span className={`scores-inline-item ${qsofaTone}`.trim()}>
                        qSOFA {qsofa.available > 0 ? `${qsofa.score}/3` : "—"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`scores-inline-item ${mewsTone}`.trim()}>
                        MEWS {mews.available > 0 ? mews.score : "—"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {ep.hoursAbove}h ·{" "}
                        {formatTime(ep.latestPrediction.timestamp, true)}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <strong
                      className="num block text-lg font-bold leading-tight"
                      style={{
                        color: ep.isActiveNow
                          ? "var(--clinical-critical)"
                          : "var(--ink-primary)",
                      }}
                    >
                      {percent(ep.latestPrediction.score)}
                    </strong>
                    <span className="block text-xs text-slate-500">
                      Đỉnh{" "}
                      <span className="num font-semibold text-slate-700">
                        {percent(ep.peakScore)}
                      </span>
                    </span>
                  </div>

                  <div className="alert-card-actions">
                    <ReviewStatus
                      reviewed={!!ep.review}
                      decision={ep.review?.decision}
                    />
                    <Link
                      className="link-button"
                      href={`/patients/${ep.encounter.id}?hour=${ep.latestPrediction.hour}`}
                    >
                      Mở hồ sơ
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
