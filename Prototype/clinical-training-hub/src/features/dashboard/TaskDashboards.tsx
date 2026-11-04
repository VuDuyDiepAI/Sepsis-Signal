import {
  type DashboardTask,
  employeeWork,
  learnAction,
  learnPath,
  managementWork,
  type WorkGroup,
} from "@/features/dashboard/dashboard-data";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr } from "@/shared/lib/dates";
import { statusNames } from "@/shared/lib/labels";
import { type Assignment, trainingSummary } from "@/shared/lib/training";
import { Badge } from "@/shared/ui/Badge";
import { LoadState } from "@/shared/ui/LoadState";
import {
  Award,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
} from "lucide-react";
import { type ReactNode, useState } from "react";

function Section({
  title,
  children,
  action,
  primary = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  primary?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`dashboard-section ${primary ? "dashboard-primary" : ""} ${className}`}
      aria-label={title}
    >
      <header className="dashboard-section-head">
        <h2>{title}</h2>
        {action && <div className="actions">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function State({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading) return <LoadState loading error="" />;
  return error ? (
    <div className="dashboard-error" role="alert">
      <span>{error}</span>
      <button className="secondary" onClick={retry}>
        <RefreshCw size={15} />
        Thử lại
      </button>
    </div>
  ) : (
    <LoadState loading={loading} error="" />
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="dashboard-empty">{children}</p>;
}

function StateBadge({ status }: { status: string }) {
  const special: Record<string, string> = {
    EXPIRED: "Đã hết hạn",
    EXPIRING: "Sắp hết hạn",
    NEEDS_REVIEW: "Cần rà soát nguồn",
  };
  return special[status] ? (
    <span className={`badge ${status.toLowerCase()}`}>{special[status]}</span>
  ) : (
    <Badge status={status} />
  );
}

const utcDate = (value: string) =>
  new Date(
    value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value) ? value : value + "Z",
  );

const shortTime = (value: string) =>
  utcDate(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

const shortStamp = (value: string) => `${dateStr(value)} · ${shortTime(value)}`;

function PageControls({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  if (total <= 5) return null;
  return (
    <div className="dashboard-pagination">
      <span>
        {page * 5 + 1}–{Math.min(page * 5 + 5, total)}/{total} công việc
      </span>
      <div className="actions">
        <button
          className="secondary icon"
          aria-label="Công việc trước"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="secondary icon"
          aria-label="Công việc tiếp theo"
          disabled={(page + 1) * 5 >= total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function WorkList({
  tasks,
  admin = false,
}: {
  tasks: DashboardTask[];
  admin?: boolean;
}) {
  const { go } = useHub(),
    [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(tasks.length / 5) - 1)),
    visible = tasks.slice(current * 5, current * 5 + 5);
  if (!tasks.length)
    return <EmptyText>Không có công việc cần xử lý.</EmptyText>;
  return (
    <>
      {admin ? (
        <table className="management-task-table">
          <caption className="sr-only">Công việc cần xử lý</caption>
          <thead>
            <tr>
              <th>Nội dung công việc</th>
              <th>Loại</th>
              <th>Trạng thái</th>
              <th>Thời hạn / cập nhật</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((task) => (
              <tr key={task.id} data-task-id={task.id}>
                <td>
                  <b>{task.title}</b>
                </td>
                <td className="dashboard-task-kind">{task.kind}</td>
                <td>
                  <StateBadge status={task.status} />
                </td>
                <td>
                  <time dateTime={task.date} aria-label={task.dateLabel}>
                    {task.date.length === 10
                      ? dateStr(task.date)
                      : shortStamp(task.date)}
                  </time>
                </td>
                <td>
                  <button className="secondary" onClick={() => go(task.path)}>
                    {task.action}
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="employee-work-list">
          {visible.map((task, i) => (
            <li key={task.id} data-task-id={task.id}>
              <span
                className={`dashboard-task-icon ${task.priority === 0 ? "attention" : ""}`}
              >
                {task.kind === "Chứng chỉ" ? (
                  <Award size={19} />
                ) : (
                  <BookOpen size={19} />
                )}
              </span>
              <div className="dashboard-work-content">
                <b>{task.title}</b>
                <div className="dashboard-work-meta">
                  <StateBadge status={task.status} />
                  <span>
                    {task.dateLabel}: <time>{dateStr(task.date)}</time>
                  </span>
                </div>
              </div>
              <button
                className={i === 0 ? "primary" : "secondary"}
                onClick={() => go(task.path)}
              >
                {task.action}
                <ChevronRight size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PageControls page={current} total={tasks.length} setPage={setPage} />
    </>
  );
}

function CourseProgress({ assignment }: { assignment: Assignment }) {
  const { go } = useHub();
  return (
    <article className="continuing-course" data-assignment={assignment.id}>
      <h3>{assignment.title}</h3>
      <div className="dashboard-progress-label">
        <span>
          {assignment.completed_lessons.length}/{assignment.lesson_count} bài đã
          hoàn thành
        </span>
        <strong>{assignment.progress}%</strong>
      </div>
      <progress
        max={100}
        value={assignment.progress}
        aria-label={`Tiến độ ${assignment.title}`}
      />
      <div className="continuing-course-bottom">
        <span>Hạn {dateStr(assignment.due_date)}</span>
        <button className="secondary" onClick={() => go(learnPath(assignment))}>
          {learnAction(assignment)}
          <ChevronRight size={14} />
        </button>
      </div>
    </article>
  );
}

export function EmployeeDashboard() {
  const { go, source } = useHub(),
    [revision, setRevision] = useState(0);
  const courses = useLoad<Assignment[]>("/training/my-courses", [revision]),
    credentials = useLoad<any[]>("/credentials", [revision]);
  const docs = useLoad<any[]>("/documents?status=APPROVED", [revision]),
    calendar = useLoad<any[]>("/training/calendar", [revision]);
  const retry = () => setRevision((n) => n + 1),
    work = employeeWork(courses.data || [], credentials.data || []);
  const workLoading = courses.loading || credentials.loading,
    workError = [courses.error, credentials.error].filter(Boolean).join(" ");
  const recent = (docs.data || [])
    .filter((d) => d.version.status === "APPROVED")
    .sort((a, b) => b.version.created_at.localeCompare(a.version.created_at))
    .slice(0, 4);
  const events = (calendar.data || [])
    .filter(
      (e) => e.type === "event" && new Date(e.date).getTime() >= Date.now(),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  return (
    <div className="task-dashboard employee-dashboard">
      <Section
        title="Việc cần hoàn thành"
        primary
        action={
          <button className="text-button" onClick={() => go("my-training")}>
            Tất cả khóa học
            <ChevronRight size={14} />
          </button>
        }
      >
        <State loading={workLoading} error={workError} retry={retry} />
        {!workLoading && !workError && <WorkList tasks={work.tasks} />}
      </Section>
      {!courses.error &&
        (courses.loading ||
          work.continuing.length > 0 ||
          !work.tasks.some((t) => t.id.startsWith("assignment:"))) && (
          <Section
            title="Học tiếp"
            action={
              <button className="text-button" onClick={() => go("my-training")}>
                Khóa học của tôi
                <ChevronRight size={14} />
              </button>
            }
          >
            <State
              loading={courses.loading}
              error={courses.error}
              retry={retry}
            />
            {!courses.loading &&
              !courses.error &&
              (work.continuing.length ? (
                <div className="continuing-courses">
                  {work.continuing.map((a) => (
                    <CourseProgress key={a.id} assignment={a} />
                  ))}
                </div>
              ) : (
                <EmptyText>
                  {work.tasks.some((t) => t.id.startsWith("assignment:"))
                    ? "Các khóa cần ưu tiên đã có trong danh sách công việc phía trên."
                    : "Chưa có khóa học đang học."}
                </EmptyText>
              ))}
          </Section>
        )}
      <div className="dashboard-secondary-grid">
        <Section
          title="Lịch đào tạo sắp tới"
          action={
            <button className="text-button" onClick={() => go("calendar")}>
              Xem toàn bộ lịch
              <ChevronRight size={14} />
            </button>
          }
        >
          <State
            loading={calendar.loading}
            error={calendar.error}
            retry={retry}
          />
          {!calendar.loading &&
            !calendar.error &&
            (events.length ? (
              <ul className="dashboard-resource-list">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="dashboard-date">
                      <b>{new Date(e.date).getDate()}</b>
                      <small>Thg {new Date(e.date).getMonth() + 1}</small>
                    </span>
                    <div>
                      <b>{e.title}</b>
                      <small>
                        {shortTime(e.date)} · {e.location || "Chưa có địa điểm"}
                      </small>
                    </div>
                    <button
                      className="icon"
                      aria-label={`Xem lịch ${e.title}`}
                      onClick={() => go(`calendar?date=${e.date.slice(0, 10)}`)}
                    >
                      <CalendarDays size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyText>Chưa có lịch đào tạo sắp tới.</EmptyText>
            ))}
        </Section>
        <Section
          title="Tài liệu mới cập nhật"
          action={
            <button className="text-button" onClick={() => go("documents")}>
              Mở thư viện
              <ChevronRight size={14} />
            </button>
          }
        >
          <State loading={docs.loading} error={docs.error} retry={retry} />
          {!docs.loading &&
            !docs.error &&
            (recent.length ? (
              <ul className="dashboard-resource-list">
                {recent.map((d) => (
                  <li key={d.id}>
                    <FileText size={19} />
                    <div>
                      <b>{d.title}</b>
                      <small>
                        {d.version.filename.split(".").at(-1)?.toUpperCase()} ·{" "}
                        {dateStr(d.version.created_at)} ·{" "}
                        {statusNames[d.version.status]}
                      </small>
                    </div>
                    <button
                      className="icon"
                      aria-label={`Mở tài liệu ${d.title}`}
                      onClick={() => source(d.version.id)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyText>Chưa có tài liệu được duyệt.</EmptyText>
            ))}
        </Section>
      </div>
    </div>
  );
}

const groupLabels: Record<WorkGroup, string> = {
  waiting: "Đang chờ kiểm duyệt",
  editing: "Cần hoàn thiện",
  action: "Cần xử lý",
};

function TrainingOverview({ assignments }: { assignments: Assignment[] }) {
  const { go } = useHub(),
    summary = trainingSummary(assignments);
  if (!assignments.length)
    return <EmptyText>Chưa có dữ liệu phân công đào tạo.</EmptyText>;
  return (
    <>
      <dl className="training-facts">
        <div>
          <dt>Khóa đã phân công</dt>
          <dd>{summary.rows.length}</dd>
        </div>
        <div>
          <dt>Nhân viên được giao</dt>
          <dd>{summary.people}</dd>
        </div>
        <div>
          <dt>Hoàn thành mọi phân công</dt>
          <dd>{summary.completedPeople}</dd>
        </div>
      </dl>
      <ul className="training-course-list">
        {summary.rows.slice(0, 3).map((row) => (
          <li key={row.id}>
            <div className="training-course-heading">
              <b>{row.title}</b>
              <button
                className="text-button"
                aria-label={`Xem báo cáo ${row.title}`}
                onClick={() =>
                  go(`reports?course_id=${encodeURIComponent(row.id)}`)
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="dashboard-progress-label">
              <span>
                {row.completed}/{row.people} nhân viên hoàn thành
              </span>
              <strong>{row.percent}%</strong>
            </div>
            <progress
              max={100}
              value={row.percent ?? 0}
              aria-label={`Hoàn thành ${row.title}`}
            />
            {row.overdue > 0 && (
              <small className="training-overdue">
                {row.overdue} nhân viên có phân công quá hạn
              </small>
            )}
          </li>
        ))}
      </ul>
      <details className="context-help">
        <summary>Cách tính</summary>
        <p>
          Mỗi người chỉ được tính hoàn thành khi đã hoàn tất mọi phân công của
          khóa, kể cả các phiên bản được giao. Tổng số nhân viên được đếm riêng,
          không cộng lặp giữa các khóa.
        </p>
      </details>
    </>
  );
}

function RecentActivity({
  audit,
  documents,
  courses,
  assignments,
  users,
}: {
  audit: any[];
  documents: any[];
  courses: any[];
  assignments: Assignment[];
  users: any[];
}) {
  const { go, user } = useHub();
  const objects = new Map<string, { title: string; path: string }>();
  for (const d of documents) {
    const obj = {
      title: d.title,
      path: `manage-documents?open=${encodeURIComponent(d.id)}`,
    };
    objects.set(d.id, obj);
    objects.set(d.version.id, obj);
  }
  for (const c of courses) {
    const obj = { title: c.title, path: `builder/${c.id}` };
    objects.set(c.id, obj);
    objects.set(c.version_id, obj);
  }
  for (const a of assignments)
    objects.set(a.id, {
      title: a.title,
      path: `reports?course_id=${encodeURIComponent(a.course_id)}`,
    });
  const names = new Map(users.map((u) => [u.id, u.name]));
  names.set(user.id, user.name);
  const labels: Record<string, string> = {
    "document.upload": "Tải lên tài liệu",
    "document.submit-review": "Gửi duyệt tài liệu",
    "document.approve": "Phê duyệt tài liệu",
    "document.reject": "Yêu cầu sửa tài liệu",
    "course.generate": "Tạo học liệu",
    "course.edit": "Cập nhật học liệu",
    "course.submit-review": "Gửi duyệt học liệu",
    "course.approve": "Phê duyệt học liệu",
    "course.publish": "Xuất bản khóa học",
    "training.assign": "Phân công đào tạo",
  };
  const seen = new Set<string>();
  const events = [...audit]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((e) => {
      const key = [e.action, e.target_id, e.user_id].join(":");
      if (seen.has(key) || !labels[e.action] || !objects.has(e.target_id))
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
  return events.length ? (
    <ul className="dashboard-activity-list">
      {events.map((e) => {
        const obj = objects.get(e.target_id)!;
        return (
          <li key={e.id}>
            <span className="activity-dot" />
            <div>
              <span>{labels[e.action]}</span>
              <button className="activity-object" onClick={() => go(obj.path)}>
                {obj.title}
              </button>
              <small>
                {names.get(e.user_id) ? `${names.get(e.user_id)} · ` : ""}
                {shortStamp(e.created_at)}
              </small>
            </div>
          </li>
        );
      })}
    </ul>
  ) : (
    <EmptyText>Chưa có hoạt động phù hợp để hiển thị.</EmptyText>
  );
}

export function AdminDashboard() {
  const { go } = useHub(),
    [revision, setRevision] = useState(0),
    [group, setGroup] = useState<WorkGroup | "all">("all");
  const documents = useLoad<any[]>("/documents", [revision]),
    courses = useLoad<any[]>("/courses", [revision]);
  const jobs = useLoad<any[]>("/ai/jobs", [revision]),
    training = useLoad<{ assignments: Assignment[] }>("/training/dashboard", [
      revision,
    ]);
  const feedback = useLoad<{ items: any[] }>("/admin/feedback", [revision]),
    audit = useLoad<any[]>("/admin/audit", [revision]),
    users = useLoad<any[]>("/admin/users", [revision]);
  const retry = () => setRevision((n) => n + 1),
    sources = [documents, courses, jobs, training, feedback],
    loading = sources.some((s) => s.loading),
    error = sources
      .map((s) => s.error)
      .filter(Boolean)
      .join(" ");
  const tasks = managementWork(
    documents.data || [],
    courses.data || [],
    jobs.data || [],
    training.data?.assignments || [],
    feedback.data?.items || [],
  );
  const visible =
    group === "all" ? tasks : tasks.filter((t) => t.group === group);
  return (
    <div className="task-dashboard admin-dashboard">
      <div className="dashboard-summary" aria-label="Tổng quan công việc">
        {(["waiting", "editing", "action"] as WorkGroup[]).map((key) => (
          <button
            key={key}
            className={group === key ? "selected" : ""}
            disabled={loading || !!error}
            aria-pressed={group === key}
            onClick={() => setGroup(group === key ? "all" : key)}
          >
            <span>{groupLabels[key]}</span>
            <strong>
              {loading || error
                ? "—"
                : tasks.filter((t) => t.group === key).length}
            </strong>
          </button>
        ))}
      </div>
      <Section
        title="Công việc cần xử lý"
        primary
        action={
          <>
            <button
              className="text-button"
              onClick={() => {
                setGroup("all");
                retry();
              }}
              aria-label="Làm mới công việc"
            >
              <RefreshCw size={15} />
            </button>
            <button className="secondary" onClick={() => go("builder/new")}>
              <Plus size={16} />
              Tạo khóa học
            </button>
          </>
        }
      >
        {group !== "all" && (
          <div className="dashboard-filter-label">
            <span>{groupLabels[group]}</span>
            <button className="text-button" onClick={() => setGroup("all")}>
              Xem tất cả
            </button>
          </div>
        )}
        <State loading={loading} error={error} retry={retry} />
        {!loading && !error && <WorkList key={group} tasks={visible} admin />}
      </Section>
      <div className="dashboard-secondary-grid">
        <Section
          title="Tình hình đào tạo"
          action={
            <button className="text-button" onClick={() => go("reports")}>
              Xem báo cáo đào tạo
              <ChevronRight size={14} />
            </button>
          }
        >
          <State
            loading={training.loading}
            error={training.error}
            retry={retry}
          />
          {!training.loading && !training.error && (
            <TrainingOverview assignments={training.data?.assignments || []} />
          )}
        </Section>
        <Section title="Hoạt động gần đây">
          <State
            loading={
              audit.loading ||
              documents.loading ||
              courses.loading ||
              users.loading ||
              training.loading
            }
            error={[
              audit.error,
              documents.error,
              courses.error,
              users.error,
              training.error,
            ]
              .filter(Boolean)
              .join(" ")}
            retry={retry}
          />
          {![audit, documents, courses, users, training].some(
            (s) => s.loading || s.error,
          ) && (
            <RecentActivity
              audit={audit.data || []}
              documents={documents.data || []}
              courses={courses.data || []}
              assignments={training.data?.assignments || []}
              users={users.data || []}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
