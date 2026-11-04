import { type Assignment, dueInDays, localDay } from "@/shared/lib/training";

export type WorkGroup = "waiting" | "editing" | "action";

export type DashboardTask = {
  id: string;
  title: string;
  kind: string;
  status: string;
  date: string;
  dateLabel: string;
  action: string;
  path: string;
  priority: number;
  group?: WorkGroup;
};

export const quizReady = (a: Assignment) =>
  a.status !== "COMPLETED" &&
  a.lesson_count > 0 &&
  a.completed_lessons.length >= a.lesson_count;

export const learnPath = (a: Assignment) =>
  `learn/${a.id}/${a.course_id}/${a.version_id}?resume=1`;

export const learnAction = (a: Assignment) =>
  quizReady(a)
    ? "Làm bài kiểm tra"
    : a.started_at || a.completed_lessons.length
      ? "Tiếp tục học"
      : "Bắt đầu học";

export function employeeWork(
  assignments: Assignment[],
  credentials: any[],
  today = localDay(),
) {
  const pending = assignments.filter((a) => a.status !== "COMPLETED");
  const urgent = (a: Assignment) =>
    dueInDays(a.due_date, today) <= 7 || quizReady(a);
  // started_at is the start time, not a last-visited timestamp.
  const continuing = pending
    .filter((a) => (a.started_at || a.completed_lessons.length) && !urgent(a))
    .sort(
      (a, b) =>
        (b.started_at || "").localeCompare(a.started_at || "") ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 2);
  const continuingIds = new Set(continuing.map((a) => a.id));
  const tasks: DashboardTask[] = pending
    .filter((a) => !continuingIds.has(a.id))
    .map((a) => ({
      id: "assignment:" + a.id,
      title: a.title,
      kind: quizReady(a) ? "Bài kiểm tra cuối khóa" : "Khóa học được giao",
      status: a.status,
      date: a.due_date,
      dateLabel: "Hạn hoàn thành",
      action: learnAction(a),
      path: learnPath(a),
      priority:
        dueInDays(a.due_date, today) < 0
          ? 0
          : dueInDays(a.due_date, today) <= 7
            ? 1
            : quizReady(a)
              ? 2
              : 3,
    }));
  for (const c of credentials.filter((c) => c.days_left <= 30))
    tasks.push({
      id: "credential:" + c.id,
      title: c.title,
      kind: "Chứng chỉ",
      status: c.days_left < 0 ? "EXPIRED" : "EXPIRING",
      date: c.expiry_date,
      dateLabel: "Ngày hết hạn",
      action: "Xem chứng chỉ",
      path: `credentials?open=${encodeURIComponent(c.id)}`,
      priority: c.days_left < 0 ? 0 : c.days_left <= 7 ? 1 : 3,
    });
  tasks.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id),
  );
  return { tasks, continuing };
}

export function managementWork(
  documents: any[],
  courses: any[],
  jobs: any[],
  assignments: Assignment[],
  feedback: any[],
): DashboardTask[] {
  const tasks: DashboardTask[] = [];
  for (const d of documents.filter((d) => d.can_manage)) {
    const status = d.version.status;
    if (
      status !== "PENDING_REVIEW" &&
      !(
        ["DRAFT", "REJECTED"].includes(status) &&
        d.version.processing === "COMPLETED"
      )
    )
      continue;
    const waiting = status === "PENDING_REVIEW";
    tasks.push({
      id: "document:" + d.id,
      title: d.title,
      kind: "Tài liệu",
      status,
      date: d.version.created_at,
      dateLabel: "Cập nhật",
      group: waiting ? "waiting" : "editing",
      priority: waiting ? 5 : status === "REJECTED" ? 1 : 3,
      action: waiting ? "Theo dõi" : "Hoàn thiện tài liệu",
      path: `manage-documents?open=${encodeURIComponent(d.id)}`,
    });
  }
  for (const c of courses.filter((c) => c.can_manage)) {
    const waiting = c.status === "PENDING_REVIEW";
    const editing =
      !waiting && (["DRAFT", "REJECTED"].includes(c.status) || c.needs_review);
    if (!waiting && !editing && c.status !== "APPROVED") continue;
    tasks.push({
      id: "course:" + c.id,
      title: c.title,
      kind: "Học liệu",
      status: c.needs_review && !waiting ? "NEEDS_REVIEW" : c.status,
      date: c.created_at,
      dateLabel: "Cập nhật",
      group: waiting ? "waiting" : editing ? "editing" : "action",
      priority: waiting
        ? 5
        : c.status === "REJECTED" || c.needs_review
          ? 1
          : c.status === "APPROVED"
            ? 2
            : 3,
      action: waiting
        ? "Theo dõi"
        : editing
          ? "Tiếp tục biên soạn"
          : "Xem & xuất bản",
      path: `builder/${c.id}${editing ? "?edit=1" : ""}`,
    });
  }
  for (const j of jobs.filter((j) => j.status === "FAILED"))
    tasks.push({
      id: "job:" + j.id,
      title:
        j.kind === "INGEST"
          ? "Trích xuất tài liệu gặp lỗi"
          : "Tạo học liệu gặp lỗi",
      kind: "Tác vụ xử lý",
      status: j.status,
      date: j.created_at,
      dateLabel: "Ghi nhận",
      group: "action",
      priority: 1,
      action: "Kiểm tra lỗi",
      path: `jobs?open=${encodeURIComponent(j.id)}`,
    });
  const overdueCourses = new Map<string, Assignment[]>();
  for (const a of assignments.filter((a) => a.status === "OVERDUE"))
    overdueCourses.set(a.course_id, [
      ...(overdueCourses.get(a.course_id) || []),
      a,
    ]);
  for (const [courseId, items] of overdueCourses) {
    const a = [...items].sort((a, b) =>
      a.due_date.localeCompare(b.due_date),
    )[0];
    tasks.push({
      id: "overdue:" + courseId,
      title: a.title,
      kind: `Đào tạo · ${new Set(items.map((a) => a.user_id)).size} nhân viên`,
      status: a.status,
      date: a.due_date,
      dateLabel: "Hạn hoàn thành",
      group: "action",
      priority: 0,
      action: "Xem tiến độ",
      path: `reports?course_id=${encodeURIComponent(a.course_id)}`,
    });
  }
  for (const f of feedback.filter((f) => f.status !== "RESOLVED"))
    tasks.push({
      id: "feedback:" + f.id,
      title: f.feature,
      kind: "Góp ý",
      status: f.status,
      date: f.created_at,
      dateLabel: "Gửi lúc",
      group: "action",
      priority: f.status === "NEW" ? 2 : 3,
      action: "Xử lý góp ý",
      path: `feedback?open=${encodeURIComponent(f.id)}`,
    });
  return tasks.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id),
  );
}
