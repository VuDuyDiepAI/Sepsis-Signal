"use client";
import { useClinicalReader } from "@/lib/client/manual-store";
import { Link } from "react-router";
import { useAppNavigation } from "@/app/navigation";
import { useQuery } from "@/app/navigation";
import { usePageCapacity } from "@/hooks/use-page-capacity";
import { useHydrated } from "@/hooks/use-hydrated";
import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Search,
  FileHeart,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertStatus,
  ReviewStatus,
  Trend,
} from "@/components/clinical/alert-status";
import { useReviews } from "@/components/providers/review-provider";
import {
  departments,
  hourLabel,
  formatTime,
  percent,
} from "@/lib/clinical/data";
import type { MonitoringRow } from "@/lib/contracts/clinical";
const columns: ColumnDef<MonitoringRow>[] = [
  {
    id: "id",
    accessorFn: (r) => r.encounter.id,
    header: "Mã hồ sơ",
    cell: ({ row: { original: r } }) => (
      <Link
        className="encounter-id"
        to={`/patients/${r.encounter.id}?hour=${r.encounter.currentHour}`}
      >
        <span className="encounter-symbol">
          <FileHeart size={16} />
        </span>
        {r.encounter.id}
      </Link>
    ),
  },
  {
    id: "department",
    accessorFn: (r) => departments[r.department],
    header: "Khoa",
    cell: ({ row: { original: r } }) => departments[r.department],
  },
  {
    id: "age",
    accessorFn: (r) => r.encounter.age,
    header: "Tuổi · Giới",
    cell: ({ row: { original: r } }) => (
      <span className="whitespace-nowrap">
        {r.encounter.age} · {r.encounter.sex === "F" ? "Nữ" : "Nam"}
      </span>
    ),
  },
  {
    id: "hour",
    accessorFn: (r) => r.encounter.currentHour,
    header: "Mốc dự báo",
    cell: ({ row: { original: r } }) => hourLabel(r.encounter.currentHour),
  },
  {
    id: "score",
    accessorFn: (r) => r.prediction?.score ?? -1,
    header: "Điểm sepsis",
    cell: ({ row: { original: r } }) => (
      <span className={`score-value ${r.state}`}>
        {r.prediction ? percent(r.prediction.score) : "—"}
      </span>
    ),
  },
  {
    id: "change",
    accessorFn: (r) => r.change,
    header: "So giờ trước",
    cell: ({ row: { original: r } }) => <Trend value={r.change} />,
  },
  {
    id: "state",
    accessorFn: (r) => r.state,
    header: "Cảnh báo",
    cell: ({ row: { original: r } }) => <AlertStatus state={r.state} />,
  },
  {
    id: "review",
    accessorFn: (r) => !!r.review,
    header: "Xem xét",
    cell: ({ row: { original: r } }) => (
      <ReviewStatus reviewed={!!r.review} unavailable={!r.prediction} />
    ),
  },
  {
    id: "updated",
    accessorFn: (r) => r.timestamp,
    header: "Cập nhật",
    cell: ({ row: { original: r } }) => (
      <span className="whitespace-nowrap">{formatTime(r.timestamp, true)}</span>
    ),
  },
];
export function PatientTable() {
  "use no memo"; // TanStack's stateful table instance must not be compiler-memoized.
  const reader = useClinicalReader();
  const { reviews } = useReviews();
  const router = useAppNavigation();
  const params = useQuery();
  const hydrated = useHydrated();
  const {
    ref: tableRef,
    capacity,
    ready: capacityReady,
  } = usePageCapacity(66, 5, 8);
  const [pageIndex, setPageIndex] = useState(0);
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const requestedState = params.get("state") ?? "all";
  const state = ["all", "above", "below", "unavailable"].includes(
    requestedState,
  )
    ? requestedState
    : "all";
  const setState = (next: string) =>
    router.replace("/patients" + (next === "all" ? "" : "?state=" + next), {
      scroll: false,
    });
  const [review, setReview] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const data = useMemo(
    () =>
      reader
        .getMonitoringRows(reviews)
        .toSorted((a, b) => b.encounter.t0.localeCompare(a.encounter.t0))
        .filter(
          (r) =>
            r.encounter.id
              .toLowerCase()
              .includes(search.trim().toLowerCase()) &&
            (source === "all" ||
              (source === "manual") === r.encounter.id.startsWith("HS-")) &&
            (department === "all" || r.department === department) &&
            (state === "all" || r.state === state) &&
            (review === "all" ||
              (review === "done" ? !!r.review : !!r.prediction && !r.review)),
        ),
    [reviews, reader, search, department, state, review, source],
  );
  // TanStack Table owns sorting and pagination; the adapter owns default clinical priority.
  // eslint-disable-next-line react-hooks/incompatible-library -- Stateful TanStack instance is intentionally outside compiler memoization (use no memo above).
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination: {
        pageIndex: Math.min(
          pageIndex,
          Math.max(0, Math.ceil(data.length / capacity) - 1),
        ),
        pageSize: capacity,
      },
    },
    onPaginationChange: (change) => {
      const previous = {
        pageIndex: Math.min(
          pageIndex,
          Math.max(0, Math.ceil(data.length / capacity) - 1),
        ),
        pageSize: capacity,
      };
      setPageIndex(
        (typeof change === "function" ? change(previous) : change).pageIndex,
      );
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  function reset() {
    setSearch("");
    setDepartment("all");
    setState("all");
    setReview("all");
    setSorting([]);
    setSource("all");
  }
  return (
    <section className="panel registry-panel" aria-label="Danh sách hồ sơ">
      <div className="registry-toolbar">
        <h2>Danh sách hồ sơ</h2>
        <div className="source-switch" role="group" aria-label="Nguồn hồ sơ">
          {[
            ["all", "Tất cả"],
            ["manual", "Nhập tay"],
            ["sample", "Hồ sơ mẫu"],
          ].map(([key, label]) => (
            <Button
              key={key}
              variant="ghost"
              disabled={!hydrated}
              aria-pressed={source === key}
              onClick={() => setSource(key)}
            >
              {label}
              <span>
                {
                  reader
                    .listEncounters()
                    .filter(
                      (e) =>
                        key === "all" ||
                        (key === "manual") === e.id.startsWith("HS-"),
                    ).length
                }
              </span>
            </Button>
          ))}
        </div>
        <span className="secondary-text registry-count">
          {data.length} hồ sơ
        </span>
      </div>
      <div className="filters">
        <label className="filter-label">
          Tìm hồ sơ
          <span className="search-field">
            <Search />
            <Input
              aria-label="Tìm mã hồ sơ"
              placeholder="Nhập mã hồ sơ…"
              value={search}
              disabled={!hydrated}
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
        </label>
        <label className="filter-label">
          Khoa điều trị
          <select
            disabled={!hydrated}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="all">Tất cả các khoa</option>
            {Object.entries(departments).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-label">
          Trạng thái cảnh báo
          <select
            disabled={!hydrated}
            aria-label="Trạng thái cảnh báo"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="above">Vượt ngưỡng</option>
            <option value="below">Dưới ngưỡng</option>
            <option value="unavailable">Chưa có kết quả</option>
          </select>
        </label>
        <label className="filter-label">
          Trạng thái xem xét
          <select
            disabled={!hydrated}
            aria-label="Trạng thái xem xét"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          >
            <option value="all">Tất cả hồ sơ</option>
            <option value="pending">Chưa xem xét</option>
            <option value="done">Đã xem xét</option>
          </select>
        </label>
      </div>
      {data.length === 0 ? (
        <EmptyState
          title="Không tìm thấy hồ sơ"
          description="Thử mã hồ sơ khác hoặc bỏ bớt bộ lọc."
          action={
            <Button variant="outline" onClick={reset}>
              Xóa bộ lọc
            </Button>
          }
        />
      ) : (
        <div
          ref={tableRef}
          className="table-scroll"
          role="region"
          aria-label="Bảng hồ sơ có thể cuộn ngang"
          tabIndex={0}
        >
          <table className="clinical-table">
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
                        onClick={h.column.getToggleSortingHandler()}
                        aria-label={`Sắp xếp ${typeof h.column.columnDef.header === "string" ? h.column.columnDef.header : h.id}`}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown size={12} />
                      </button>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.original.encounter.id}
                  onClick={() =>
                    router.push(
                      `/patients/${row.original.encounter.id}?hour=${row.original.encounter.currentHour}`,
                    )
                  }
                >
                  {row.getVisibleCells().map((c) => (
                    <td key={c.id}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-footer">
        <span>
          {data.length} hồ sơ phù hợp ·{" "}
          {sorting.length ? "Đang sắp xếp theo cột" : "Hồ sơ mới trước"}
        </span>
        <div className="pagination">
          <Button
            variant="outline"
            size="icon"
            aria-label="Trang trước"
            disabled={!capacityReady || !table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft />
          </Button>
          <span>
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Trang sau"
            disabled={!capacityReady || !table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
