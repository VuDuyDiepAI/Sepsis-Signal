"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useClinicalDataset, useManualCases } from "@/lib/manual-store";
import { useDemoOptional } from "@/components/demo-context";
import { DATA_SOURCES, type DataSourceId } from "@/lib/workspace-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ReviewStatus, Trend } from "@/components/clinical/alert-status";
import { useReviews } from "@/components/review-context";
import {
  departments,
  formatTime,
  hourLabel,
  monitoringRows,
  percent,
} from "@/lib/clinical-data";
import {
  SITE_LABELS,
  computeClinicalScores,
  deriveTriage,
  evaluateLabsAt,
  evaluateVitalsAt,
  extractClinicalDrivers,
  getActiveSiteAt,
  type ClinicalDriver,
  type ClinicalScores,
  type TriageInfo,
} from "@/lib/clinical-reasoning";
import type { MonitoringRow } from "@/lib/clinical-types";

type WatchTab = "all" | "critical" | "monitoring";

interface WatchRow extends MonitoringRow {
  scores: ClinicalScores;
  triage: TriageInfo;
  drivers: ClinicalDriver[];
  siteLabel: string | null;
}

const columns: ColumnDef<WatchRow>[] = [
  {
    id: "patient",
    accessorFn: (r) => r.encounter.id,
    header: "Người bệnh",
    cell: ({ row: { original: r } }) => {
      const triageLevel = Math.min(3, r.triage.level);
      const sexLabel = r.encounter.sex === "F" ? "Nữ" : "Nam";
      return (
        <div className="patient-cell">
          <span
            className={`triage-badge t${triageLevel}`}
            title={r.triage.label}
          >
            T{r.triage.level}
          </span>
          <div className="min-w-0">
            <Link
              className="encounter-id"
              href={`/patients/${r.encounter.id}?hour=${r.encounter.currentHour}`}
              onClick={(e) => e.stopPropagation()}
            >
              {r.encounter.id}
            </Link>
            <div className="encounter-sub">
              {r.encounter.age}t · {sexLabel}
              {r.siteLabel ? ` · ${r.siteLabel}` : ""}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: "hour",
    accessorFn: (r) => r.encounter.currentHour,
    header: "Lưu khoa",
    cell: ({ row: { original: r } }) => (
      <div className="whitespace-nowrap">
        <div className="num font-semibold text-slate-900">
          {hourLabel(r.encounter.currentHour)}
        </div>
        <div className="encounter-sub">{formatTime(r.timestamp, true)}</div>
      </div>
    ),
  },
  {
    id: "score",
    accessorFn: (r) => r.prediction?.score ?? -1,
    header: "Nguy cơ 6h",
    cell: ({ row: { original: r } }) => {
      const qsofa = r.scores.qsofa;
      const mews = r.scores.mews;
      const sirs = r.scores.sirs;
      const qsofaTone =
        qsofa.score >= 2 ? "crit" : qsofa.score >= 1 ? "warn" : "";
      const mewsTone =
        mews.tier === "high" ? "crit" : mews.tier === "medium" ? "warn" : "";
      const sirsTone =
        sirs.score >= 3 ? "crit" : sirs.score >= 2 ? "warn" : "";

      return (
        <div>
          <div className="score-cell-main flex-wrap items-center">
            <span className={`score-value ${r.state}`}>
              {r.prediction ? percent(r.prediction.score) : "—"}
            </span>
            <Trend value={r.change} />
            {r.state === "above" && (
              <span className="status-pill above !px-1.5 !py-0.5 !text-[11px]">
                Vượt ngưỡng
              </span>
            )}
          </div>
          <div className="scores-inline-row">
            <span className={`scores-inline-item ${qsofaTone}`.trim()}>
              qSOFA {qsofa.available > 0 ? `${qsofa.score}/3` : "—"}
            </span>
            <span aria-hidden="true">·</span>
            <span className={`scores-inline-item ${mewsTone}`.trim()}>
              MEWS {mews.available > 0 ? mews.score : "—"}
            </span>
            <span aria-hidden="true">·</span>
            <span className={`scores-inline-item ${sirsTone}`.trim()}>
              SIRS {sirs.available > 0 ? `${sirs.score}/4` : "—"}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    id: "drivers",
    accessorFn: (r) =>
      r.drivers.filter((d) => d.severity === "critical").length * 10 +
      r.drivers.length,
    header: "Tại sao cần chú ý?",
    cell: ({ row: { original: r } }) => {
      const topDrivers = r.drivers.slice(0, 2);
      if (topDrivers.length === 0) {
        return (
          <span className="secondary-text">Chưa có bất thường nổi bật</span>
        );
      }
      return (
        <div className="driver-list-inline">
          {topDrivers.map((d) => (
            <div key={d.id} className="driver-chip-inline">
              <span
                className={`driver-dot ${d.severity}`}
                aria-hidden="true"
              />
              <span>
                <strong>{d.text}</strong>{" "}
                <span className="muted">({d.detail})</span>
              </span>
            </div>
          ))}
        </div>
      );
    },
  },
  {
    id: "review",
    accessorFn: (r) => (r.review ? 1 : 0),
    header: "Xử trí BS",
    cell: ({ row: { original: r } }) => (
      <ReviewStatus
        reviewed={!!r.review}
        unavailable={!r.prediction}
        decision={r.review?.decision}
      />
    ),
  },
];

export function PatientTable() {
  "use no memo"; // TanStack's stateful table instance must not be compiler-memoized.
  const dataset = useClinicalDataset();
  const manualCases = useManualCases();
  const demo = useDemoOptional();
  const { reviews } = useReviews();
  const router = useRouter();

  const [tab, setTab] = useState<WatchTab>("all");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);

  const enrichedRows = useMemo<WatchRow[]>(() => {
    const manualById = new Map(manualCases.map((c) => [c.profile.id, c]));
    return monitoringRows(reviews, dataset).map((row) => {
      const hour = row.encounter.currentHour;
      const vitals = evaluateVitalsAt(row.encounter, hour, dataset);
      const labs = evaluateLabsAt(row.encounter, hour, dataset);
      const scores = computeClinicalScores(vitals, labs);
      const triage = deriveTriage(scores, row.department, row.prediction);
      const drivers = extractClinicalDrivers(row.encounter, hour, dataset);

      const manualCase = manualById.get(row.encounter.id);
      const manualEntry = manualCase?.entries
        .filter((e) => e.hour <= hour && e.symptoms)
        .at(-1);
      const siteInfo = getActiveSiteAt(
        row.encounter,
        hour,
        manualEntry?.symptoms,
      );
      const siteLabel = siteInfo.suspectedSite
        ? (SITE_LABELS[siteInfo.suspectedSite] ?? siteInfo.suspectedSite)
        : null;

      return {
        ...row,
        scores,
        triage,
        drivers,
        siteLabel,
      };
    });
  }, [reviews, dataset, manualCases]);

  const totalCount = enrichedRows.length;
  const criticalCount = useMemo(
    () => enrichedRows.filter((r) => r.state === "above").length,
    [enrichedRows],
  );
  const monitoringCount = useMemo(
    () => enrichedRows.filter((r) => r.state !== "above").length,
    [enrichedRows],
  );

  const data = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedRows.filter((r) => {
      if (q && !r.encounter.id.toLowerCase().includes(q)) return false;
      if (department !== "all" && r.department !== department) return false;
      if (tab === "critical") return r.state === "above";
      if (tab === "monitoring") return r.state !== "above";
      return true;
    });
  }, [enrichedRows, search, department, tab]);

  // TanStack Table owns sorting and pagination; the adapter owns default clinical priority.
  // eslint-disable-next-line react-hooks/incompatible-library -- Stateful TanStack instance is intentionally outside compiler memoization (use no memo above).
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  function reset() {
    setSearch("");
    setDepartment("all");
    setTab("all");
    setSorting([]);
  }

  return (
    <section className="panel" aria-label="Bảng theo dõi ca trực">
      <div className="watch-toolbar">
        <div
          className="segment-group"
          role="group"
          aria-label="Lọc nhanh theo mức ưu tiên"
        >
          <button
            type="button"
            className={`segment-btn ${tab === "all" ? "active" : ""}`}
            aria-pressed={tab === "all"}
            onClick={() => setTab("all")}
          >
            <span>Tất cả</span>
            <span className="segment-count">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`segment-btn is-critical ${tab === "critical" ? "active" : ""}`}
            aria-pressed={tab === "critical"}
            onClick={() => setTab("critical")}
          >
            <span>Nguy cấp</span>
            <span className="segment-count">{criticalCount}</span>
          </button>
          <button
            type="button"
            className={`segment-btn ${tab === "monitoring" ? "active" : ""}`}
            aria-pressed={tab === "monitoring"}
            onClick={() => setTab("monitoring")}
          >
            <span>Đang theo dõi</span>
            <span className="segment-count">{monitoringCount}</span>
          </button>
        </div>

        <div className="toolbar-controls">
          {demo && (
            <select
              aria-label="Nguồn dữ liệu"
              value={demo.sourceId}
              onChange={(e) =>
                demo.setSourceId(e.target.value as DataSourceId)
              }
            >
              {DATA_SOURCES.map((src) => (
                <option value={src.id} key={src.id}>
                  {src.shortLabel}
                </option>
              ))}
            </select>
          )}
          <span className="search-field">
            <Search aria-hidden="true" />
            <Input
              aria-label="Tìm mã hồ sơ"
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
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="Không tìm thấy hồ sơ"
          description="Thử nhập mã hồ sơ khác hoặc đặt lại bộ lọc để xem toàn khoa."
          action={
            <Button variant="outline" onClick={reset}>
              Xóa bộ lọc
            </Button>
          }
        />
      ) : (
        <div
          className="table-scroll"
          role="region"
          aria-label="Bảng theo dõi người bệnh có thể cuộn ngang"
          tabIndex={0}
        >
          <table className="watch-table">
            <thead>
              {table.getHeaderGroups().map((g) => (
                <tr key={g.id}>
                  {g.headers.map((h) => (
                    <th
                      key={h.id}
                      aria-sort={
                        h.column.getIsSorted() === "asc"
                          ? "ascending"
                          : h.column.getIsSorted() === "desc"
                            ? "descending"
                            : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        aria-label={`Sắp xếp ${typeof h.column.columnDef.header === "string" ? h.column.columnDef.header : h.id}`}
                      >
                        {flexRender(
                          h.column.columnDef.header,
                          h.getContext(),
                        )}
                        <ArrowUpDown size={12} aria-hidden="true" />
                      </button>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isCriticalPending =
                  row.original.state === "above" && !row.original.review;
                return (
                  <tr
                    key={row.original.encounter.id}
                    className={isCriticalPending ? "row-critical" : undefined}
                    onClick={() =>
                      router.push(
                        `/patients/${row.original.encounter.id}?hour=${row.original.encounter.currentHour}`,
                      )
                    }
                  >
                    {row.getVisibleCells().map((c) => (
                      <td key={c.id}>
                        {flexRender(
                          c.column.columnDef.cell,
                          c.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <span>
          {data.length} hồ sơ phù hợp ·{" "}
          {sorting.length
            ? "Đang sắp xếp theo cột"
            : "Ưu tiên ca vượt ngưỡng chờ BS xử trí"}
        </span>
        <div className="pagination">
          <Button
            variant="outline"
            size="icon"
            aria-label="Trang trước"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft />
          </Button>
          <span className="num">
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Trang sau"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
