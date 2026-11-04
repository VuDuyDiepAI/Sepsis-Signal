import { api } from "@/shared/api/client";
import { hasAnyRole } from "@/shared/auth/permissions";
import { useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/Badge";
import {
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
} from "@/shared/ui/enterprise";
import { Modal } from "@/shared/ui/Modal";
import { Plus } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

export function Credentials() {
  const { user, act, busy, notify } = useHub();
  const [rev, setRev] = useState(0),
    [editing, setEditing] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [query, setQuery] = useState({ keyword: "", expiry: "" }),
    [filters, setFilters] = useState(query);
  const { data, loading, error } = useLoad<any[]>("/credentials", [rev]);
  const requested = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "open",
    ),
    opened = useRef("");
  useEffect(() => {
    if (!requested || !data || opened.current === requested) return;
    const credential = data.find((c) => c.id === requested);
    if (credential) setSelected(credential);
    opened.current = requested;
  }, [requested, data]);
  const { data: users } = useLoad<any[]>(
    hasAnyRole(user, ["ADMIN"]) ? "/admin/users" : "/auth/me",
  );
  const manager = hasAnyRole(user, ["ADMIN"]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      const b = {
        ...Object.fromEntries(f),
        verified: f.get("verified") === "on",
        reminder_days: String(f.get("reminder_days")).split(",").map(Number),
      };
      await api("/credentials" + (editing?.id ? "/" + editing.id : ""), {
        method: editing?.id ? "PUT" : "POST",
        body: JSON.stringify(b),
      });
      setEditing(null);
      setRev((x) => x + 1);
      notify("Đã lưu chứng chỉ và các mốc nhắc hạn.");
    });
  };
  return (
    <>
      <SearchFilterPanel
        compact
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", expiry: "" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Từ khóa">
          <input
            placeholder="Chứng chỉ, nhân viên, đơn vị cấp…"
            value={query.keyword}
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Thời hạn">
          <select
            value={query.expiry}
            onChange={(e) => setQuery({ ...query, expiry: e.target.value })}
          >
            <option value="">Tất cả thời hạn</option>
            <option value="expired">Đã hết hạn</option>
            <option value="upcoming">Sắp hết hạn (60 ngày)</option>
            <option value="valid">Còn thời hạn</option>
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title="Danh sách chứng chỉ"
        heading={false}
        className="data-panel"
        actions={
          manager && (
            <button className="secondary" onClick={() => setEditing({})}>
              <Plus size={17} />
              Thêm chứng chỉ
            </button>
          )
        }
      >
        <EnterpriseDataTable
          rows={(data || []).filter(
            (c) =>
              (!filters.keyword ||
                (c.title + " " + c.name + " " + c.issuer)
                  .toLocaleLowerCase("vi")
                  .includes(filters.keyword.toLocaleLowerCase("vi"))) &&
              (!filters.expiry ||
                (filters.expiry === "expired"
                  ? c.days_left < 0
                  : filters.expiry === "upcoming"
                    ? c.days_left >= 0 && c.days_left <= 60
                    : c.days_left >= 0)),
          )}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          empty="Chưa có chứng chỉ phù hợp"
          label="Danh sách chứng chỉ"
          columns={[
            {
              key: "title",
              title: "Chứng chỉ",
              value: (c) => c.title,
              render: (c) => (
                <span>
                  <b>{c.title}</b>
                  <small>{c.kind}</small>
                </span>
              ),
            },
            {
              key: "name",
              title: "Nhân viên",
              value: (c) => c.name,
              render: (c) => c.name,
            },
            {
              key: "issuer",
              title: "Đơn vị cấp",
              value: (c) => c.issuer,
              render: (c) => c.issuer,
            },
            {
              key: "issue",
              title: "Ngày cấp",
              value: (c) => c.issue_date,
              render: (c) => dateStr(c.issue_date),
            },
            {
              key: "expiry",
              title: "Ngày hết hạn",
              value: (c) => c.expiry_date,
              render: (c) => (
                <span>
                  {dateStr(c.expiry_date)}
                  <small className={c.days_left < 0 ? "expiry-danger" : ""}>
                    {c.days_left < 0
                      ? "Đã hết hạn " + -c.days_left + " ngày"
                      : "Còn " + c.days_left + " ngày"}
                  </small>
                </span>
              ),
            },
            {
              key: "status",
              title: "Xác minh",
              value: (c) => (c.verified ? 1 : 0),
              render: (c) => (
                <Badge status={c.verified ? "VERIFIED" : "UNVERIFIED"} />
              ),
            },
            {
              key: "action",
              title: "Thao tác",
              render: (c) => (
                <div className="row-actions">
                  <button
                    className="text-button"
                    onClick={() => setSelected(c)}
                  >
                    Chi tiết
                  </button>
                  {manager && (
                    <button className="secondary" onClick={() => setEditing(c)}>
                      Chỉnh sửa
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </EnterprisePanel>
      {selected && (
        <Modal title="Chi tiết chứng chỉ" onClose={() => setSelected(null)}>
          <EnterprisePanel title={selected.title}>
            <div className="metadata-grid">
              <dl>
                <dt>Nhân viên</dt>
                <dd>{selected.name}</dd>
              </dl>
              <dl>
                <dt>Đơn vị cấp</dt>
                <dd>{selected.issuer}</dd>
              </dl>
              <dl>
                <dt>Loại chứng chỉ</dt>
                <dd>{selected.kind}</dd>
              </dl>
              <dl>
                <dt>Ngày cấp</dt>
                <dd>{dateStr(selected.issue_date)}</dd>
              </dl>
              <dl>
                <dt>Ngày hết hạn</dt>
                <dd>{dateStr(selected.expiry_date)}</dd>
              </dl>
              <dl>
                <dt>Xác minh</dt>
                <dd>
                  <Badge
                    status={selected.verified ? "VERIFIED" : "UNVERIFIED"}
                  />
                </dd>
              </dl>
            </div>
          </EnterprisePanel>
          <p>Mốc nhắc: {selected.reminder_days.join(", ")} ngày trước hạn.</p>
          <p className="fine">
            Hoàn thành khóa học không tự gia hạn chứng chỉ, công nhận CME hoặc
            xác nhận điều kiện pháp lý.
          </p>
          {selected.alert && (
            <div className="error">
              {selected.days_left < 0
                ? "Chứng chỉ đã hết hạn."
                : "Chứng chỉ sắp hết hạn."}{" "}
              Cần rà soát theo quy trình của đơn vị.
            </div>
          )}
          <div className="notice">
            Chưa có tệp chứng chỉ để xem hoặc tải xuống.
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title={editing.id ? "Cập nhật chứng chỉ" : "Thêm chứng chỉ"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit}>
            <label>
              Nhân viên
              <select
                name="user_id"
                defaultValue={
                  editing.user_id || (Array.isArray(users) ? users[0]?.id : "")
                }
              >
                {Array.isArray(users) &&
                  users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tên chứng chỉ
              <input
                name="title"
                required
                minLength={3}
                defaultValue={editing.title}
              />
            </label>
            <label>
              Loại chứng chỉ
              <input
                name="kind"
                defaultValue={editing.kind || "Đào tạo nội bộ"}
              />
            </label>
            <label>
              Đơn vị cấp
              <input name="issuer" required defaultValue={editing.issuer} />
            </label>
            <div className="form-grid">
              <label>
                Ngày cấp
                <input
                  type="date"
                  name="issue_date"
                  required
                  defaultValue={editing.issue_date}
                />
              </label>
              <label>
                Ngày hết hạn
                <input
                  type="date"
                  name="expiry_date"
                  required
                  defaultValue={editing.expiry_date}
                />
              </label>
            </div>
            <label>
              Nhắc trước hạn (số ngày, ngăn cách bằng dấu phẩy)
              <input
                name="reminder_days"
                required
                defaultValue={(editing.reminder_days || [30, 14, 7]).join(",")}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="verified"
                defaultChecked={editing.verified}
              />
              Đã kiểm tra và xác minh chứng chỉ
            </label>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Lưu chứng chỉ
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
