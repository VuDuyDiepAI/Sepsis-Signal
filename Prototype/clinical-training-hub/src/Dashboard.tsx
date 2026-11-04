import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
} from "lucide-react";
import { useState } from "react";
import { CourseEditor } from "./Courses";
import { EnterprisePanel } from "./enterprise";
import { DocumentDetail, UploadDialog } from "./Knowledge";
import { Badge, Empty, LoadState, dateStr, useHub, useLoad } from "./ui";
import { canOpenPage, workspaceFor } from "./workspace";
import { AdminDashboard, EmployeeDashboard } from "./TaskDashboards";

type Task = {
  id: string;
  title: string;
  type: string;
  date: string;
  status: string;
  action: () => void;
  actionLabel?: string;
};
function Metric({
  label,
  value,
  icon,
  path,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  path: string;
}) {
  const { go, user } = useHub();
  return (
    <button
      className="overview-metric"
      disabled={!canOpenPage(user, path)}
      onClick={() => go(path)}
    >
      <span className="metric-icon">{icon}</span>
      <span>
        <span className="metric-label">{label}</span>
        <strong>{value}</strong>
      </span>
    </button>
  );
}
function TaskTable({
  tasks,
  loading,
  error,
  dateLabel = "Hạn hoàn thành",
}: {
  tasks: Task[];
  loading?: boolean;
  error?: string;
  dateLabel?: string;
}) {
  return (
    <>
      <LoadState loading={!!loading} error={error || ""} />
      {!loading &&
        !error &&
        (tasks.length ? (
          <div className="overview-table-region">
            <div className="scroll-hint">
              ↔ Vuốt ngang để xem hạn và thao tác
            </div>
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Công việc — có thể cuộn ngang"
            >
              <table className="overview-task-table">
                <thead>
                  <tr>
                    <th>Nhiệm vụ</th>
                    <th>{dateLabel}</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.slice(0, 5).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <button className="task-title" onClick={t.action}>
                          {t.title}
                        </button>
                        <small>
                          {t.type} · <Badge status={t.status} />
                        </small>
                      </td>
                      <td className="nowrap">{dateStr(t.date)}</td>
                      <td>
                        <button className="text-button" onClick={t.action}>
                          {t.actionLabel || "Xử lý"}
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Empty text="Không có công việc cần xử lý">
            <p>Các nhiệm vụ mới sẽ xuất hiện tại đây.</p>
          </Empty>
        ))}
    </>
  );
}
export default function Dashboard() {
  const { user } = useHub();
  const workspace = workspaceFor(user);
  return workspace === "staff" ? (
    <EmployeeDashboard />
  ) : workspace === "management" ? (
    <AdminDashboard />
  ) : (
    <ReviewerDashboard />
  );
}
function ReviewerDashboard() {
  const [revision, setRevision] = useState(0),
    [documentId, setDocumentId] = useState(""),
    [courseId, setCourseId] = useState(""),
    [upload, setUpload] = useState<any>(null);
  const documents = useLoad<any[]>("/documents", [revision]),
    courses = useLoad<any[]>("/courses", [revision]);
  const docs = (documents.data || []).filter((d) => d.can_review),
    content = (courses.data || []).filter((c) => c.can_review);
  const pendingDocs = docs.filter((d) => d.version.status === "PENDING_REVIEW"),
    pendingCourses = content.filter((c) => c.status === "PENDING_REVIEW");
  const tasks: Task[] = [
    ...pendingDocs.map((d) => ({
      id: d.id,
      title: d.title,
      type: "Tài liệu chờ kiểm duyệt",
      date: d.version.created_at,
      status: d.version.status,
      actionLabel: "Kiểm duyệt",
      action: () => setDocumentId(d.id),
    })),
    ...pendingCourses.map((c) => ({
      id: c.id,
      title: c.title,
      type: "Học liệu chờ kiểm duyệt",
      date: c.created_at,
      status: c.status,
      actionLabel: "Kiểm duyệt",
      action: () => setCourseId(c.id),
    })),
  ];
  const loading = documents.loading || courses.loading,
    error = documents.error || courses.error;
  return (
    <div className="overview-page">
      <div className="overview-metrics">
        <Metric
          label="Tài liệu chờ duyệt"
          value={documents.data ? pendingDocs.length : "—"}
          icon={<FileText size={22} />}
          path="reviews"
        />
        <Metric
          label="Học liệu chờ duyệt"
          value={courses.data ? pendingCourses.length : "—"}
          icon={<ClipboardCheck size={22} />}
          path="reviews"
        />
        <Metric
          label="Tài liệu đã duyệt"
          value={
            documents.data
              ? docs.filter((d) => d.version.status === "APPROVED").length
              : "—"
          }
          icon={<CheckCircle2 size={22} />}
          path="reviews"
        />
        <Metric
          label="Học liệu đã duyệt"
          value={
            courses.data
              ? content.filter((c) =>
                  ["APPROVED", "PUBLISHED"].includes(c.status),
                ).length
              : "—"
          }
          icon={<BookOpen size={22} />}
          path="reviews"
        />
      </div>
      <div className="overview-main">
        <EnterprisePanel
          title="Danh sách cần kiểm duyệt"
          className="overview-tasks"
          actions={
            <>
              <span className="overview-count">
                {loading ? "Đang tải…" : `${tasks.length} công việc`}
              </span>
            </>
          }
        >
          <TaskTable
            tasks={tasks}
            loading={loading}
            error={error}
            dateLabel="Ngày cập nhật"
          />
          {tasks.length > 5 && (
            <div className="data-note">
              Hiển thị 5 công việc đầu tiên. Mở từng phân hệ để xem đầy đủ.
            </div>
          )}
        </EnterprisePanel>
        <EnterprisePanel
          title="Khối lượng chờ duyệt"
          className="overview-progress"
        >
          <LoadState loading={loading} error={error} />
          {!loading && !error && (
            <div className="review-workload">
              <strong>{pendingDocs.length + pendingCourses.length}</strong>
              <p>Nội dung cần kiểm tra</p>
              <div>
                <span>Tài liệu</span>
                <b>{pendingDocs.length}</b>
              </div>
              <div>
                <span>Học liệu</span>
                <b>{pendingCourses.length}</b>
              </div>
            </div>
          )}
          <p className="overview-caption">
            Chỉ phê duyệt nội dung thuộc chuyên môn; người tạo hoặc gửi duyệt
            không được tự duyệt.
          </p>
        </EnterprisePanel>
      </div>
      {documentId && (
        <DocumentDetail
          id={documentId}
          onClose={() => setDocumentId("")}
          onVersion={() => {
            setUpload(docs.find((d) => d.id === documentId));
            setDocumentId("");
          }}
          onUpdate={() => setRevision((r) => r + 1)}
        />
      )}
      {courseId && (
        <CourseEditor
          id={courseId}
          onClose={() => setCourseId("")}
          onUpdate={() => setRevision((r) => r + 1)}
        />
      )}
      {upload && (
        <UploadDialog
          existing={upload}
          onClose={() => setUpload(null)}
          onDone={() => {
            setUpload(null);
            setRevision((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
