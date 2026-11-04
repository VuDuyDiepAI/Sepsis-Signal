import {
  Activity,
  ArrowUpRight,
  MessageSquarePlus,
  Plus,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { api, post } from "./api";
import {
  EnterpriseDataTable,
  FormField,
  SearchFilterPanel,
} from "./enterprise";
import {
  Empty,
  LoadState,
  Modal,
  hasRole,
  roleNames,
  roleSummary,
  useHub,
  useLoad,
} from "./ui";

const features = [
  "Tìm kiếm tài liệu",
  "Chất lượng câu trả lời AI",
  "Tính hữu ích của trích dẫn",
  "Tạo nội dung khóa học",
  "Chỉnh sửa bài học",
  "Chất lượng câu hỏi kiểm tra",
  "Trải nghiệm học tập",
  "Dashboard quản lý",
  "Mức độ dễ sử dụng tổng thể",
];
export function FeedbackForm({ onDone }: { onDone: () => void }) {
  const { act, busy, notify } = useHub();
  const [rating, setRating] = useState(5);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      await post("/feedback", { ...Object.fromEntries(f), rating });
      notify("Cảm ơn bạn! Góp ý đã được lưu để nhóm pilot xử lý.");
      onDone();
    });
  }
  return (
    <form onSubmit={submit}>
      <div className="notice">
        <ShieldCheck size={18} />
        <span>
          Phản hồi giúp cải thiện prototype. Vui lòng không nhập thông tin người
          bệnh hoặc dữ liệu nhạy cảm.
        </span>
      </div>
      <label>
        Tính năng được đánh giá
        <select name="feature">
          {features.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label>Mức độ hài lòng</label>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`Đánh giá ${n} sao`}
            aria-pressed={rating === n}
            onClick={() => setRating(n)}
          >
            <Star
              size={29}
              fill={n <= rating ? "#b45309" : "none"}
              stroke={n <= rating ? "#b45309" : "#cbd8df"}
            />
          </button>
        ))}
        <span>
          {rating}/5 · {rating >= 4 ? "Hài lòng" : "Cần cải thiện"}
        </span>
      </div>
      <label>
        Điểm hoạt động tốt
        <textarea
          name="positives"
          rows={2}
          maxLength={4000}
          placeholder="Điều gì hữu ích với công việc đào tạo của bạn?"
        />
      </label>
      <label>
        Vấn đề gặp phải
        <textarea
          name="issues"
          rows={2}
          maxLength={4000}
          placeholder="Mô tả lỗi hoặc bước thao tác chưa rõ…"
        />
      </label>
      <label>
        Đề xuất cải thiện
        <textarea name="suggestions" rows={2} maxLength={4000} />
      </label>
      <div className="modal-actions">
        <button className="primary" disabled={busy}>
          <MessageSquarePlus size={17} />
          {busy ? "Đang gửi…" : "Gửi phản hồi"}
        </button>
      </div>
    </form>
  );
}

export { FeedbackCenter } from "./FeedbackCenter";

export function Admin() {
  const { user, act, busy, notify } = useHub();
  const [tab, setTab] = useState("users"),
    [rev, setRev] = useState(0),
    [editing, setEditing] = useState<any>(null),
    [orgModal, setOrgModal] = useState(""),
    [orgEditing, setOrgEditing] = useState<any>(null),
    [query, setQuery] = useState({ keyword: "", role: "" }),
    [filters, setFilters] = useState(query),
    [auditSearch, setAuditSearch] = useState("");
  const {
    data: users,
    loading,
    error,
  } = useLoad<any[]>("/admin/users?scope=admin", [rev]);
  const { data: org } = useLoad<any>("/organization", [rev]);
  const { data: settings } = useLoad<any>("/admin/settings", [rev]);
  const { data: logs } = useLoad<any[]>("/admin/audit", [rev]);
  const { data: members } = useLoad<any[]>("/admin/memberships", [rev]);
  if (!hasRole(user, "ADMIN"))
    return <Empty text="Bạn không có quyền truy cập khu vực quản trị" />;
  const createOrg = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      await api(
        "/admin/organization/" +
          orgModal +
          (orgEditing?.id ? "/" + orgEditing.id : ""),
        {
          method: orgEditing?.id ? "PUT" : "POST",
          body: JSON.stringify(Object.fromEntries(f)),
        },
      );
      setRev((x) => x + 1);
      setOrgModal("");
      setOrgEditing(null);
      notify("Đã bổ sung thông tin tổ chức.");
    });
  };
  const actionLabel = (s: string) =>
    ({
      "auth.login": "Đăng nhập",
      "user.save": "Cập nhật tài khoản",
      "document.upload": "Tải tài liệu lên",
      "course.generate": "Tạo học liệu",
      "course.edit": "Sửa bản nháp",
      "course.approve": "Phê duyệt học liệu",
      "course.publish": "Xuất bản khóa học",
      "training.assign": "Phân công đào tạo",
      "training.quiz-submit": "Nộp bài kiểm tra",
      "credential.save": "Cập nhật chứng chỉ",
      "feedback.create": "Gửi phản hồi",
      "feedback.status": "Xử lý phản hồi",
    })[s] || "Thao tác quản trị / kiểm duyệt";
  return (
    <>
      <div className="tabs">
        {[
          ["users", "Nhân viên"],
          ["organization", "Khoa/phòng & nhóm"],
          ["settings", "Cấu hình AI & hệ thống"],
          ["audit", "Nhật ký hoạt động"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={tab === v ? "active" : ""}
            onClick={() => setTab(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <LoadState loading={loading} error={error} />
      {tab === "users" && (
        <section className="panel">
          <SearchFilterPanel
            actions={
              <button
                type="button"
                className="primary"
                onClick={() => setEditing({})}
              >
                <Plus size={16} />
                Thêm tài khoản
              </button>
            }
            onSearch={() => setFilters({ ...query })}
            onReset={() => {
              const reset = { keyword: "", role: "" };
              setQuery(reset);
              setFilters(reset);
            }}
          >
            <FormField label="Tìm nhân viên">
              <input
                placeholder="Họ tên, email, mã nhân viên…"
                value={query.keyword}
                onChange={(e) =>
                  setQuery({ ...query, keyword: e.target.value })
                }
              />
            </FormField>
            <FormField label="Vai trò">
              <select
                value={query.role}
                onChange={(e) => setQuery({ ...query, role: e.target.value })}
              >
                <option value="">Tất cả vai trò</option>
                {Object.entries(roleNames).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </SearchFilterPanel>
          <EnterpriseDataTable
            rows={(users || []).filter(
              (u) =>
                (!filters.keyword ||
                  (u.name + " " + u.email + " " + u.staff_code)
                    .toLocaleLowerCase("vi")
                    .includes(filters.keyword.toLocaleLowerCase("vi"))) &&
                (!filters.role || hasRole(u, filters.role)),
            )}
            rowKey={(u) => u.id}
            label="Danh sách nhân viên"
            loading={loading}
            error={error}
            columns={[
              {
                key: "name",
                title: "Nhân viên",
                value: (u) => u.name,
                render: (u) => (
                  <span>
                    <b>{u.name}</b>
                    <small>
                      {u.staff_code} · {u.title}
                    </small>
                  </span>
                ),
              },
              {
                key: "email",
                title: "Email",
                value: (u) => u.email,
                render: (u) => u.email,
              },
              {
                key: "department",
                title: "Khoa/phòng",
                value: (u) =>
                  org?.departments.find((d: any) => d.id === u.department_id)
                    ?.name || "",
                render: (u) =>
                  org?.departments.find((d: any) => d.id === u.department_id)
                    ?.name || "Chưa xác định",
              },
              {
                key: "roles",
                title: "Vai trò & quyền",
                value: (u) => roleSummary(u),
                render: (u) => (
                  <span className="role-list">
                    {(u.roles || []).map((role: string) => (
                      <span key={role} className="role-chip">
                        {roleNames[role] || role}
                      </span>
                    ))}
                  </span>
                ),
              },
              {
                key: "status",
                title: "Trạng thái",
                value: (u) => (u.active ? 1 : 0),
                render: (u) => (
                  <span
                    className={"badge " + (u.active ? "approved" : "archived")}
                  >
                    {u.active ? "Hoạt động" : "Ngừng hoạt động"}
                  </span>
                ),
              },
              {
                key: "action",
                title: "Thao tác",
                render: (u) => (
                  <button className="text-button" onClick={() => setEditing(u)}>
                    Chỉnh sửa
                    <ArrowUpRight size={16} />
                  </button>
                ),
              },
            ]}
          />
        </section>
      )}
      {tab === "organization" && (
        <div className="two-col">
          <section className="panel">
            <div className="section-head">
              <h2>Khoa/phòng</h2>
              <button
                className="secondary"
                onClick={() => {
                  setOrgEditing(org?.departments.find((d: any) => d.can_admin));
                  setOrgModal("departments");
                }}
              >
                <Plus size={15} />
                Cập nhật khoa/phòng
              </button>
            </div>
            {org?.departments.map((d: any) => (
              <div className="list-row" key={d.id}>
                <span className="icon-box">
                  <Activity size={19} />
                </span>
                <div>
                  <b>{d.name}</b>
                  <small>
                    {users?.filter((u) => u.department_id === d.id).length || 0}{" "}
                    tài khoản
                  </small>
                </div>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="section-head">
              <h2>Nhóm đào tạo</h2>
              <button
                className="secondary"
                onClick={() => {
                  setOrgEditing(null);
                  setOrgModal("groups");
                }}
              >
                <Plus size={15} />
                Thêm nhóm
              </button>
            </div>
            {org?.groups.map((g: any) => (
              <div className="list-row" key={g.id}>
                <span className="icon-box">
                  <Users size={19} />
                </span>
                <div>
                  <b>{g.name}</b>
                  <small>
                    {members?.filter((m) => m.group_id === g.id).length || 0}{" "}
                    thành viên ·{" "}
                    {
                      org.departments.find((d: any) => d.id === g.department_id)
                        ?.name
                    }
                  </small>
                </div>
              </div>
            ))}
            <div className="notice">
              Chọn nhóm cho từng người trong màn hình chỉnh sửa tài khoản.
            </div>
          </section>
        </div>
      )}
      {tab === "settings" && settings && (
        <section className="panel">
          <h2>Cấu hình đang áp dụng</h2>
          <div className="info-strip">
            <ShieldCheck size={18} />
            <span>
              {settings.provider_note} Secrets không xuất hiện trong giao diện
              hoặc database.
            </span>
          </div>
          {[
            [
              "Chế độ dữ liệu",
              settings.demo_mode
                ? "Demo / dữ liệu giả lập"
                : "Tổ chức tự cấp tài khoản",
            ],
            [
              "Bộ xử lý AI",
              settings.ai_provider === "demo"
                ? "Demo — truy xuất từ khóa và template"
                : settings.ai_provider,
            ],
            ["Mô hình sinh nội dung", settings.ai_model],
            [
              "Mô hình embedding",
              settings.ai_provider === "demo"
                ? "Hash vector demo (không phải embedding ngữ nghĩa)"
                : settings.embedding_model,
            ],
            [
              "Gửi tới AI bên ngoài",
              settings.external_ai_allowed
                ? "Được bật trong cấu hình tổ chức"
                : "Đang tắt",
            ],
            [
              "API key",
              settings.api_key_configured ? "Đã cấu hình" : "Chưa cấu hình",
            ],
            ["Cơ sở dữ liệu", settings.database],
            [
              "Lưu trữ tài liệu",
              "Lưu riêng trên máy chủ, kiểm tra quyền trước khi truy cập",
            ],
            ["Dung lượng upload tối đa", settings.max_upload_mb + " MB"],
          ].map(([l, v]) => (
            <div className="setting-row" key={l}>
              <span>{l}</span>
              <b>{v}</b>
            </div>
          ))}
        </section>
      )}
      {tab === "audit" && (
        <section className="panel">
          <h2>Nhật ký hoạt động gần nhất</h2>
          <div className="notice">
            Không ghi nội dung tài liệu, prompt hoặc secrets vào audit log.
          </div>
          <label className="audit-search">
            Tìm trong nhật ký
            <input
              placeholder="Tài khoản, hành động, mã đối tượng…"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
          </label>
          <EnterpriseDataTable
            rows={(logs || []).filter((l) =>
              (
                actionLabel(l.action) +
                " " +
                (users?.find((u) => u.id === l.user_id)?.name || "Hệ thống") +
                " " +
                (l.target_id || "")
              )
                .toLocaleLowerCase("vi")
                .includes(auditSearch.toLocaleLowerCase("vi")),
            )}
            rowKey={(l) => l.id}
            label="Nhật ký hoạt động"
            columns={[
              {
                key: "date",
                title: "Thời gian",
                value: (l) => l.created_at,
                render: (l) =>
                  new Date(l.created_at + "Z").toLocaleString("vi-VN"),
              },
              {
                key: "user",
                title: "Tài khoản",
                value: (l) =>
                  users?.find((u) => u.id === l.user_id)?.name || "Hệ thống",
                render: (l) =>
                  users?.find((u) => u.id === l.user_id)?.name || "Hệ thống",
              },
              {
                key: "action",
                title: "Hoạt động",
                value: (l) => l.action,
                render: (l) => (
                  <span>
                    {actionLabel(l.action)}
                    <small>{l.action}</small>
                  </span>
                ),
              },
              {
                key: "target",
                title: "Mã đối tượng",
                value: (l) => l.target_id || "",
                render: (l) => <code>{l.target_id || "—"}</code>,
              },
            ]}
          />
        </section>
      )}
      {editing && (
        <UserEditor
          employee={editing}
          org={org}
          members={members || []}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            setRev((x) => x + 1);
            window.dispatchEvent(new Event("hub-permissions-updated"));
          }}
        />
      )}
      {orgModal && (
        <Modal
          title={
            orgModal === "groups" ? "Thêm nhóm đào tạo" : "Cập nhật khoa/phòng"
          }
          onClose={() => {
            setOrgModal("");
            setOrgEditing(null);
          }}
        >
          <form onSubmit={createOrg}>
            <label>
              Tên
              <input
                name="name"
                required
                minLength={2}
                defaultValue={orgEditing?.name}
              />
            </label>
            {orgModal === "groups" && (
              <label>
                Khoa/phòng
                <select name="department_id">
                  {org?.departments
                    .filter((d: any) => d.can_admin)
                    .map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Lưu thông tin
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function UserEditor({
  employee,
  org,
  members,
  onClose,
  onDone,
}: {
  employee: any;
  org: any;
  members: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { act, busy, notify } = useHub();
  const departments = (org?.departments || []).filter((d: any) => d.can_admin);
  const [dep, setDep] = useState(
    employee.department_id || departments[0]?.id || "",
  );
  const [title, setTitle] = useState(employee.title || "Điều dưỡng");
  const [role, setRole] = useState(employee.roles?.[0] || "STAFF");
  const [scopes, setScopes] = useState<string[]>(
    employee.role_grants?.length
      ? employee.role_grants.map((g: any) => g.department_id)
      : [employee.department_id || departments[0]?.id],
  );
  const [specs, setSpecs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (employee.role_grants || []).map((g: any) => [
        g.department_id,
        (g.review_specialties || []).join(", "),
      ]),
    ),
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const role_grants = departments
      .filter((d: any) => scopes.includes(d.id) || d.id === dep)
      .map((d: any) => ({
        role,
        department_id: d.id,
        review_specialties:
          role === "REVIEWER"
            ? (specs[d.id] || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      }));
    act(async () => {
      await api("/admin/users" + (employee.id ? "/" + employee.id : ""), {
        method: employee.id ? "PUT" : "POST",
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email"),
          staff_code: f.get("staff_code"),
          title,
          department_id: dep,
          active: f.get("active") === "on",
          password: f.get("password") || undefined,
          group_ids: f.getAll("group_ids"),
          role_grants,
        }),
      });
      notify("Đã lưu tài khoản, vai trò và phạm vi khoa/phòng.");
      onDone();
    });
  }
  return (
    <Modal
      title={employee.id ? "Chỉnh sửa tài khoản" : "Thêm tài khoản"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="notice">
          Mỗi tài khoản có một vai trò duy nhất. Admin quản trị và quản lý đào
          tạo; Reviewer kiểm duyệt chuyên môn; Staff học tập và làm quiz.
        </div>
        <div className="form-grid">
          <label>
            Họ và tên
            <input
              name="name"
              required
              minLength={2}
              defaultValue={employee.name}
            />
          </label>
          <label>
            Mã nhân viên
            <input
              name="staff_code"
              required
              defaultValue={employee.staff_code}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              defaultValue={employee.email}
            />
          </label>
          <label>
            Chức danh
            <select
              aria-label="Chức danh"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            >
              {Array.from(
                new Set(
                  [
                    "Trưởng khoa (Bác sĩ)",
                    "Điều dưỡng trưởng",
                    "Bác sĩ",
                    "Điều dưỡng",
                    employee.title,
                  ].filter(Boolean),
                ),
              ).map((t: any) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Khoa/phòng chính
            <select
              aria-label="Khoa/phòng chính"
              value={dep}
              onChange={(e) => {
                setDep(e.target.value);
                setScopes([...new Set([...scopes, e.target.value])]);
              }}
            >
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vai trò hệ thống
            <select
              aria-label="Vai trò hệ thống"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {Object.entries(roleNames).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="secondary"
          type="button"
          data-dirty
          onClick={() =>
            setRole(
              [
                "Trưởng khoa (Bác sĩ)",
                "Trưởng khoa",
                "Điều dưỡng trưởng",
              ].includes(title)
                ? "ADMIN"
                : "STAFF",
            )
          }
        >
          Áp dụng vai trò mặc định theo chức danh
        </button>
        <h3>Phạm vi khoa/phòng</h3>
        {departments.map((d: any) => (
          <fieldset className="permission-fieldset" key={d.id}>
            <legend>{d.name}</legend>
            <label className="check-row">
              <input
                type="checkbox"
                aria-label={"Cấp quyền tại " + d.name}
                checked={scopes.includes(d.id) || d.id === dep}
                disabled={d.id === dep}
                onChange={(e) =>
                  setScopes(
                    e.target.checked
                      ? [...scopes, d.id]
                      : scopes.filter((id) => id !== d.id),
                  )
                }
              />
              {roleNames[role]} tại {d.name}
            </label>
            {role === "REVIEWER" && (scopes.includes(d.id) || d.id === dep) && (
              <label>
                Chuyên môn được phân công kiểm duyệt
                <input
                  aria-label={"Chuyên môn kiểm duyệt tại " + d.name}
                  required
                  value={specs[d.id] || ""}
                  placeholder="Ví dụ: Cấp cứu"
                  onChange={(e) =>
                    setSpecs({ ...specs, [d.id]: e.target.value })
                  }
                />
                <small>
                  Ngăn cách các chuyên môn bằng dấu phẩy. Không dùng phạm vi tất
                  cả (*).
                </small>
              </label>
            )}
          </fieldset>
        ))}
        <label>
          {employee.id ? "Mật khẩu mới (để trống để giữ nguyên)" : "Mật khẩu"}
          <input
            name="password"
            type="password"
            required={!employee.id}
            minLength={10}
            autoComplete="new-password"
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            name="active"
            defaultChecked={employee.active ?? true}
          />
          Tài khoản đang hoạt động
        </label>
        <h3>Thành viên nhóm</h3>
        {org?.groups
          .filter((g: any) => g.department_id === dep)
          .map((g: any) => (
            <label className="check-row" key={g.id}>
              <input
                type="checkbox"
                name="group_ids"
                value={g.id}
                defaultChecked={members.some(
                  (m) => m.user_id === employee.id && m.group_id === g.id,
                )}
              />
              {g.name}
            </label>
          ))}
        <div className="modal-actions">
          <button className="primary" disabled={busy}>
            Lưu tài khoản
          </button>
        </div>
      </form>
    </Modal>
  );
}
