import {
  type Assignment,
  dueInDays,
  trainingSummary,
} from "@/shared/lib/training";

export type ReportAssignment = Assignment & {
  name: string;
  duration: number;
  best_score: number | null;
  attempt_count: number;
};

export type ReportView = { keyword: string; status: string; dueSoon: boolean };

const searchText = (value: string) =>
  value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .trim();

export function filterReportRows(
  rows: ReportAssignment[],
  filters: ReportView,
  today?: string,
) {
  const keyword = searchText(filters.keyword);
  return rows
    .filter(
      (row) =>
        (!keyword ||
          searchText(`${row.name} ${row.title}`).includes(keyword)) &&
        (!filters.status || row.status === filters.status) &&
        (!filters.dueSoon ||
          (row.status !== "COMPLETED" &&
            row.status !== "OVERDUE" &&
            dueInDays(row.due_date, today) >= 0 &&
            dueInDays(row.due_date, today) <= 7)),
    )
    .sort((a, b) => {
      const rank = (row: ReportAssignment) =>
        row.status === "OVERDUE"
          ? 0
          : row.status === "COMPLETED"
            ? 3
            : dueInDays(row.due_date, today) <= 7
              ? 1
              : 2;
      return (
        rank(a) - rank(b) ||
        a.due_date.localeCompare(b.due_date) ||
        a.name.localeCompare(b.name, "vi") ||
        a.id.localeCompare(b.id)
      );
    });
}

export function reportSummary(rows: ReportAssignment[]) {
  const summary = trainingSummary(rows);
  return {
    people: summary.people,
    completed: summary.completedPeople,
    rate: summary.people
      ? Math.round((summary.completedPeople / summary.people) * 1000) / 10
      : null,
  };
}
