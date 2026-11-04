import {
  Activity,
  CheckCircle2,
  Eye,
  MessageSquarePlus,
  Plus,
  Star,
} from "lucide-react";
import { useState } from "react";
import { FeedbackForm } from "./Admin";
import { api } from "./api";
import {
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
} from "./enterprise";
import {
  Badge,
  Modal,
  Stat,
  dateStr,
  hasRole,
  statusNames,
  useHub,
  useLoad,
} from "./ui";
export function FeedbackCenter() {
  const { user, act, busy, notify } = useHub(),
    admin = hasRole(user, "ADMIN");
  const [rev, setRev] = useState(0),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState(
      new URLSearchParams(location.hash.split("?")[1] || "").get("open") || "",
    ),
    [query, setQuery] = useState({ keyword: "", status: "" }),
    [filters, setFilters] = useState(query);
  const { data, loading, error } = useLoad<any>(
    admin ? "/admin/feedback" : "/feedback/mine",
    [rev],
  );
  const items: any[] = (admin ? data?.items : data) || [],
    chosen = items.find((f) => f.id === selected);
  const rows = items.filter(
    (f) =>
      (!filters.keyword ||
        (f.feature + " " + f.name + " " + f.issues + " " + f.suggestions)
          .toLocaleLowerCase("vi")
          .includes(filters.keyword.toLocaleLowerCase("vi"))) &&
      (!filters.status || f.status === filters.status),
  );
  return (
    <>
      {admin && data && (
        <div className="stat-grid">
          <Stat
            icon={<MessageSquarePlus />}
            value={data.total}
            label="Tổng số phản hồi"
          />
          <Stat
            icon={<Star />}
            value={data.average_rating ? data.average_rating + "/5" : "—"}
            label="Điểm hài lòng trung bình"
          />
          <Stat
            icon={<Activity />}
            value={items.filter((f) => f.status === "NEW").length}
            label="Phản hồi mới"
          />
          <Stat
            icon={<CheckCircle2 />}
            value={items.filter((f) => f.status === "RESOLVED").length}
            label="Đã giải quyết"
          />
        </div>
      )}
      <SearchFilterPanel
        actions={
          !admin && (
            <button
              type="button"
              className="primary"
              onClick={() => setAdding(true)}
            >
              <Plus size={17} />
              Tạo phản hồi
            </button>
          )
        }
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", status: "" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Từ khóa">
          <input
            placeholder="Tính năng, người gửi, nội dung…"
            value={query.keyword}
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Trạng thái xử lý">
          <select
            value={query.status}
            onChange={(e) => setQuery({ ...query, status: e.target.value })}
          >
            <option value="">Tất cả</option>
            {["NEW", "REVIEWING", "RESOLVED"].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title="Danh sách phản hồi"
        heading={false}
        className="data-panel"
      >
        <EnterpriseDataTable
          rows={rows}
          rowKey={(f) => f.id}
          loading={loading}
          error={error}
          label="Danh sách phản hồi"
          columns={[
            { key: "index", title: "STT", render: (_, i) => i + 1 },
            {
              key: "feature",
              title: "Tính năng",
              value: (f) => f.feature,
              render: (f) => (
                <button
                  className="text-button"
                  onClick={() => setSelected(f.id)}
                >
                  {f.feature}
                </button>
              ),
            },
            {
              key: "user",
              title: "Người gửi",
              value: (f) => f.name || "",
              render: (f) => f.name || user.name,
            },
            {
              key: "rating",
              title: "Đánh giá",
              value: (f) => f.rating,
              render: (f) => (
                <span className="rating-cell">
                  <Star size={15} />
                  {f.rating}/5
                </span>
              ),
            },
            {
              key: "date",
              title: "Ngày gửi",
              value: (f) => f.created_at,
              render: (f) => dateStr(f.created_at),
            },
            {
              key: "status",
              title: "Trạng thái",
              value: (f) => f.status,
              render: (f) => <Badge status={f.status} />,
            },
            {
              key: "actions",
              title: "Thao tác",
              render: (f) => (
                <button
                  className="icon"
                  aria-label={"Xem phản hồi " + f.feature}
                  onClick={() => setSelected(f.id)}
                >
                  <Eye size={18} />
                </button>
              ),
            },
          ]}
        />
      </EnterprisePanel>
      {admin && data?.by_feature?.length > 0 && (
        <EnterprisePanel title="Đánh giá theo tính năng">
          {data.by_feature.map((f: any) => (
            <div className="feature-rating" key={f.feature}>
              <span>{f.feature}</span>
              <div className="progress-track">
                <div style={{ width: (f.average / 5) * 100 + "%" }} />
              </div>
              <b>{f.average}/5</b>
              <small>{f.count} phản hồi</small>
            </div>
          ))}
        </EnterprisePanel>
      )}
      {chosen && (
        <Modal
          title="Chi tiết phản hồi"
          dirty={false}
          onClose={() => setSelected("")}
        >
          <div className="detail-top">
            <Badge status={chosen.status} />
            <span>
              {dateStr(chosen.created_at)} · {chosen.name || user.name}
            </span>
          </div>
          <EnterprisePanel title={chosen.feature}>
            <p className="rating-cell">
              <Star size={18} />
              {chosen.rating}/5
            </p>
            {[
              ["Điểm hoạt động tốt", chosen.positives],
              ["Vấn đề gặp phải", chosen.issues],
              ["Đề xuất cải thiện", chosen.suggestions],
            ].map(([label, text]) => (
              <div className="feedback-text" key={label}>
                <b>{label}</b>
                <p>{text || "Không có nội dung"}</p>
              </div>
            ))}
          </EnterprisePanel>
          {admin && (
            <FormField label="Cập nhật trạng thái xử lý">
              <select
                value={chosen.status}
                disabled={busy}
                onChange={(e) => {
                  const status = e.target.value;
                  act(async () => {
                    await api("/admin/feedback/" + chosen.id, {
                      method: "PUT",
                      body: JSON.stringify({ status }),
                    });
                    setRev((r) => r + 1);
                    notify("Đã lưu trạng thái xử lý.");
                  });
                }}
              >
                {["NEW", "REVIEWING", "RESOLVED"].map((s) => (
                  <option key={s} value={s}>
                    {statusNames[s]}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        </Modal>
      )}
      {adding && (
        <Modal title="Tạo phản hồi" onClose={() => setAdding(false)}>
          <FeedbackForm
            onDone={() => {
              setAdding(false);
              setRev((r) => r + 1);
            }}
          />
        </Modal>
      )}
    </>
  );
}
