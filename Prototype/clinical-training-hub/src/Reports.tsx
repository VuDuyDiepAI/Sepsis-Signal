import { Award, Download, Eye, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
  exportCsv,
  type DataColumn,
} from "./enterprise";
import {
  filterReportRows,
  reportSummary,
  type ReportAssignment,
  type ReportView,
} from "./report-data";
import {
  Badge,
  LoadState,
  Modal,
  dateStr,
  statusNames,
  useHub,
  useLoad,
} from "./ui";

type ReportResponse = {
  assignments: ReportAssignment[];
  upcoming_credentials: any[];
};
const blankView: ReportView = { keyword: "", status: "", dueSoon: false };
const dateTime = (value?: string | null) =>
  !value
    ? "Chưa ghi nhận"
    : new Date(
        /(Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + "Z",
      ).toLocaleString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
function Progress({ row }: { row: ReportAssignment }) {
  return (
    <div className="report-progress">
      <div>
        <strong>{row.progress}%</strong>
        <small>
          {row.completed_lessons.length}/{row.lesson_count} bài
        </small>
      </div>
      <progress
        value={row.progress}
        max={100}
        aria-label={`Tiến độ ${row.name}, ${row.title}`}
      />
    </div>
  );
}
function Retry({ error, onRetry }: { error: string; onRetry: () => void }) {
  return error ? (
    <div className="report-error" role="alert">
      <span>{error}</span>
      <button className="secondary" onClick={onRetry}>
        <RefreshCw size={15} />
        Thử lại
      </button>
    </div>
  ) : null;
}
export function Reports() {
  const { act, notify, go } = useHub(),
    params = new URLSearchParams(location.hash.split("?")[1] || "");
  const [draft, setDraft] = useState({
      department: params.get("department_id") || "",
      group: params.get("group_id") || "",
      course: params.get("course_id") || "",
    }),
    [applied, setApplied] = useState(draft);
  const [view, setView] = useState<ReportView>(blankView),
    [revision, setRevision] = useState(0),
    [selectedId, setSelectedId] = useState(""),
    [credentialId, setCredentialId] = useState(""),
    [allCredentials, setAllCredentials] = useState(false);
  const query = new URLSearchParams({
    department_id: applied.department,
    group_id: applied.group,
    course_id: applied.course,
  });
  const { data, loading, error } = useLoad<ReportResponse>(
    `/training/dashboard?${query}`,
    [revision],
  );
  const org = useLoad<any>("/organization", [revision]),
    courses = useLoad<any[]>("/courses", [revision]);
  const retry = () => setRevision((n) => n + 1);
  const rows = useMemo(
      () => filterReportRows(data?.assignments || [], view),
      [data, view],
    ),
    summary = useMemo(() => reportSummary(rows), [rows]);
  const groups = (org.data?.groups || []).filter(
    (g: any) =>
      g.can_manage &&
      (!draft.department || g.department_id === draft.department),
  );
  const selected =
    !loading && !error ? rows.find((row) => row.id === selectedId) : undefined;
  const certificates = [...(data?.upcoming_credentials || [])].sort(
    (a, b) => a.days_left - b.days_left || a.name.localeCompare(b.name, "vi"),
  );
  const selectedCredential =
    !loading && !error
      ? certificates.find((c) => c.id === credentialId)
      : undefined;
  const selectedCourse = courses.data?.find(
    (c) => c.id === selected?.course_id && c.can_manage,
  );
  const currentCourseTitle = data?.assignments.find(
    (a) => a.course_id === draft.course,
  )?.title;
  const columns: DataColumn<ReportAssignment>[] = [
    {
      key: "name",
      title: "Nhân viên / Khóa học",
      value: (r) => r.name,
      render: (r) => (
        <span className="report-person">
          <b>{r.name}</b>
          <small>{r.title}</small>
        </span>
      ),
    },
    {
      key: "due",
      title: "Hạn hoàn thành",
      value: (r) => r.due_date,
      render: (r) => <time dateTime={r.due_date}>{dateStr(r.due_date)}</time>,
    },
    {
      key: "progress",
      title: "Tiến độ",
      value: (r) => r.progress,
      render: (r) => <Progress row={r} />,
    },
    {
      key: "score",
      title: "Điểm cao nhất",
      value: (r) => r.best_score ?? -1,
      render: (r) =>
        r.best_score === null ? (
          <span className="muted">Chưa làm bài</span>
        ) : (
          <span>{r.best_score}/100</span>
        ),
    },
    {
      key: "status",
      title: "Trạng thái",
      value: (r) => statusNames[r.status] || r.status,
      render: (r) => <Badge status={r.status} />,
    },
    {
      key: "detail",
      title: "Chi tiết",
      render: (r) => (
        <button
          className="icon"
          aria-label={`Xem tiến độ ${r.name} – ${r.title}`}
          title="Xem chi tiết tiến độ"
          onClick={() => setSelectedId(r.id)}
        >
          <Eye size={18} />
        </button>
      ),
    },
  ];
  const exportReport = () =>
    act(async () => {
      if (loading || error || !rows.length) return;
      exportCsv(
        "bao-cao-dao-tao.csv",
        [
          "Nhân viên",
          "Khóa học",
          "Hạn hoàn thành",
          "Tiến độ (%)",
          "Điểm cao nhất (/100)",
          "Trạng thái",
          "Số lần kiểm tra",
          "Bắt đầu",
          "Hoàn thành",
        ],
        rows.map((r) => [
          r.name,
          r.title,
          dateStr(r.due_date),
          r.progress,
          r.best_score ?? "Chưa làm bài",
          statusNames[r.status] || r.status,
          r.attempt_count,
          dateTime(r.started_at),
          dateTime(r.completed_at),
        ]),
      );
      notify(`Đã tạo tệp CSV gồm ${rows.length} kết quả đang lọc.`);
    });
  return (
    <div className="reports-page">
      <SearchFilterPanel
        compact
        onSearch={() => {
          setApplied({ ...draft });
          setSelectedId("");
          setCredentialId("");
          setAllCredentials(false);
        }}
        onReset={() => {
          const reset = { department: "", group: "", course: "" };
          setDraft(reset);
          setApplied(reset);
          setView(blankView);
          setSelectedId("");
          setCredentialId("");
          setAllCredentials(false);
        }}
      >
        <FormField label="Khoa/phòng">
          <select
            aria-label="Lọc khoa báo cáo"
            disabled={org.loading || !!org.error}
            value={draft.department}
            onChange={(e) => {
              const department = e.target.value;
              setDraft((previous) => ({
                ...previous,
                department,
                group: org.data.groups.some(
                  (g: any) =>
                    g.id === previous.group &&
                    (!department || g.department_id === department),
                )
                  ? previous.group
                  : "",
              }));
            }}
          >
            <option value="">Tất cả khoa/phòng</option>
            {org.data?.departments
              .filter((d: any) => d.can_manage)
              .map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Nhóm đào tạo">
          <select
            aria-label="Lọc nhóm báo cáo"
            disabled={org.loading || !!org.error}
            value={draft.group}
            onChange={(e) => {
              const group = e.target.value;
              setDraft((previous) => ({ ...previous, group }));
            }}
          >
            <option value="">Tất cả nhóm đào tạo</option>
            {groups.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Khóa học">
          <select
            aria-label="Lọc khóa học báo cáo"
            disabled={courses.loading || !!courses.error}
            value={draft.course}
            onChange={(e) =>
              setDraft((previous) => ({ ...previous, course: e.target.value }))
            }
          >
            <option value="">Tất cả khóa học</option>
            {draft.course &&
              currentCourseTitle &&
              !courses.data?.some((c) => c.id === draft.course) && (
                <option value={draft.course}>{currentCourseTitle}</option>
              )}
            {courses.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <Retry
        error={[org.error, courses.error].filter(Boolean).join(" ")}
        onRetry={retry}
      />
      <div
        className="report-metrics"
        aria-label="Thống kê nhân viên trong kết quả đang lọc"
      >
        {[
          { label: "Nhân viên được giao học", value: summary.people },
          { label: "Hoàn thành mọi phân công", value: summary.completed },
          {
            label: "Tỷ lệ nhân viên hoàn thành",
            value:
              summary.rate === null ? "Chưa có dữ liệu" : `${summary.rate}%`,
          },
        ].map((metric) => (
          <div className="report-metric" key={metric.label}>
            <span>{metric.label}</span>
            {loading ? (
              <LoadState loading error="" />
            ) : (
              <strong
                className={metric.value === "Chưa có dữ liệu" ? "no-data" : ""}
              >
                {error || !data ? "—" : metric.value}
              </strong>
            )}
          </div>
        ))}
      </div>
      <EnterprisePanel
        title="Tiến độ nhân viên"
        className="data-panel report-main-table"
        actions={
          <button
            className="secondary"
            title="Xuất toàn bộ kết quả đang lọc, không chỉ trang hiện tại"
            disabled={loading || !!error || !rows.length}
            onClick={exportReport}
          >
            <Download size={16} />
            Xuất CSV
          </button>
        }
      >
        <div className="report-table-filters">
          <label className="report-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Tìm nhân viên hoặc khóa học"
              placeholder="Nhân viên hoặc khóa học…"
              disabled={loading || !!error}
              value={view.keyword}
              onChange={(e) =>
                setView((previous) => ({
                  ...previous,
                  keyword: e.target.value,
                }))
              }
            />
          </label>
          <select
            aria-label="Lọc trạng thái học tập"
            disabled={loading || !!error}
            value={view.status}
            onChange={(e) =>
              setView((previous) => ({
                ...previous,
                status: e.target.value,
                dueSoon: ["COMPLETED", "OVERDUE"].includes(e.target.value)
                  ? false
                  : previous.dueSoon,
              }))
            }
          >
            <option value="">Tất cả trạng thái</option>
            {["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE"].map(
              (status) => (
                <option key={status} value={status}>
                  {statusNames[status]}
                </option>
              ),
            )}
          </select>
          <label className="report-due-soon">
            <input
              type="checkbox"
              disabled={loading || !!error}
              checked={view.dueSoon}
              onChange={(e) =>
                setView((previous) => ({
                  ...previous,
                  dueSoon: e.target.checked,
                  status:
                    e.target.checked &&
                    ["COMPLETED", "OVERDUE"].includes(previous.status)
                      ? ""
                      : previous.status,
                }))
              }
            />
            Sắp đến hạn (7 ngày)
          </label>
        </div>
        <Retry error={loading ? "" : error} onRetry={retry} />
        {(!error || loading) && (
          <EnterpriseDataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            loading={loading}
            label="Tiến độ theo nhân viên"
            empty="Không có phân công phù hợp"
          />
        )}
        <details className="context-help">
          <summary>Cách tính số liệu</summary>
          <p>
            Ba chỉ số tính trên kết quả đang lọc. Mỗi nhân viên chỉ được đếm một
            lần và chỉ được tính hoàn thành khi tất cả phân công trong kết quả
            đều có trạng thái Hoàn thành. Không có nhân viên trong kết quả thì
            chưa có tỷ lệ hoàn thành. Tiến độ, điểm cao nhất và trạng thái được
            giữ nguyên từ hệ thống.
          </p>
        </details>
      </EnterprisePanel>
      <section className="report-certificates" aria-label="Chứng chỉ cần lưu ý">
        <header>
          <h2>Chứng chỉ cần lưu ý</h2>
          <small>
            Theo khoa/phòng và nhóm
            {applied.course ? "; không phụ thuộc khóa học đang chọn" : ""}
          </small>
        </header>
        <LoadState loading={loading} error="" />
        {!loading &&
          !error &&
          (certificates.length ? (
            <>
              <ul>
                {certificates
                  .slice(0, allCredentials ? certificates.length : 4)
                  .map((c) => (
                    <li key={c.id}>
                      <Award size={19} />
                      <div>
                        <b>{c.name}</b>
                        <span>{c.title}</span>
                      </div>
                      <span
                        className={
                          c.days_left < 0 ? "report-expired" : "report-expiring"
                        }
                      >
                        {c.days_left < 0
                          ? `Hết hạn ${Math.abs(c.days_left)} ngày`
                          : c.days_left === 0
                            ? "Đến hạn hôm nay"
                            : `Còn ${c.days_left} ngày`}
                      </span>
                      <button
                        className="icon"
                        aria-label={`Xem chứng chỉ ${c.name} – ${c.title}`}
                        onClick={() => setCredentialId(c.id)}
                      >
                        <Eye size={17} />
                      </button>
                    </li>
                  ))}
              </ul>
              {certificates.length > 4 && (
                <button
                  className="text-button"
                  onClick={() => setAllCredentials(!allCredentials)}
                >
                  {allCredentials
                    ? "Thu gọn"
                    : `Xem tất cả ${certificates.length} chứng chỉ`}
                </button>
              )}
            </>
          ) : (
            <p className="report-empty-note">
              Chưa có chứng chỉ cần lưu ý trong phạm vi này.
            </p>
          ))}
        {!loading && error && (
          <p className="report-empty-note">Chưa tải được dữ liệu chứng chỉ.</p>
        )}
      </section>
      {selected && (
        <Modal
          title="Chi tiết tiến độ đào tạo"
          onClose={() => setSelectedId("")}
        >
          <div className="report-detail-title">
            <h3>{selected.name}</h3>
            <p>{selected.title}</p>
            <Badge status={selected.status} />
          </div>
          <Progress row={selected} />
          <dl className="report-detail-grid">
            {[
              ["Hạn hoàn thành", dateStr(selected.due_date)],
              [
                "Bài đã hoàn thành",
                `${selected.completed_lessons.length}/${selected.lesson_count}`,
              ],
              [
                "Điểm cao nhất",
                selected.best_score === null
                  ? "Chưa làm bài"
                  : `${selected.best_score}/100`,
              ],
              ["Số lần kiểm tra", selected.attempt_count],
              ["Bắt đầu", dateTime(selected.started_at)],
              ["Hoàn thành", dateTime(selected.completed_at)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {selected.status === "OVERDUE" && (
            <p className="report-expired">
              Phân công đã quá hạn, cần theo dõi việc hoàn thành với nhân viên.
            </p>
          )}
          {selectedCourse && (
            <button
              className="secondary"
              onClick={() => {
                setSelectedId("");
                go(`builder/${selected.course_id}`);
              }}
            >
              Xem học liệu
            </button>
          )}
        </Modal>
      )}
      {selectedCredential && (
        <Modal title="Chi tiết chứng chỉ" onClose={() => setCredentialId("")}>
          <div className="report-detail-title">
            <h3>{selectedCredential.name}</h3>
            <p>{selectedCredential.title}</p>
            <Badge
              status={selectedCredential.verified ? "VERIFIED" : "UNVERIFIED"}
            />
          </div>
          <dl className="report-detail-grid">
            {[
              ["Đơn vị cấp", selectedCredential.issuer],
              ["Loại chứng chỉ", selectedCredential.kind],
              ["Ngày cấp", dateStr(selectedCredential.issue_date)],
              ["Ngày hết hạn", dateStr(selectedCredential.expiry_date)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="fine">
            Hoàn thành khóa học không tự gia hạn chứng chỉ hoặc công nhận CME.
          </p>
        </Modal>
      )}
    </div>
  );
}
