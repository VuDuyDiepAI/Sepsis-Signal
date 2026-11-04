import { Download, Eye, FileText, Plus } from "lucide-react";
import { useState } from "react";
import {
  DataColumn,
  EnterpriseDataTable,
  EnterprisePanel,
  exportCsv,
  FormField,
  SearchFilterPanel,
} from "./enterprise";
import { DocumentDetail, UploadDialog } from "./Knowledge";
import { Badge, dateStr, hasRole, statusNames, useHub, useLoad } from "./ui";
const blank = {
  keyword: "",
  specialty: "",
  type: "",
  status: "",
  from: "",
  to: "",
};
export function Documents() {
  const { user, notify } = useHub(),
    params = new URLSearchParams(location.hash.split("?")[1] || "");
  const [rev, setRev] = useState(0),
    [filters, setFilters] = useState({
      ...blank,
      keyword: params.get("search") || "",
    }),
    [applied, setApplied] = useState(filters),
    [upload, setUpload] = useState<any>(null),
    [detail, setDetail] = useState<string | null>(params.get("open"));
  const { data, loading, error } = useLoad<any[]>("/documents", [rev]);
  const field = (key: keyof typeof blank, value: string) =>
    setFilters({ ...filters, [key]: value });
  const rows = (data || []).filter((d) => {
    const v = d.version,
      date = v.created_at.slice(0, 10),
      type = v.filename.split(".").at(-1)?.toUpperCase();
    return (
      (!applied.keyword ||
        (d.title + " " + d.id + " " + d.description)
          .toLocaleLowerCase("vi")
          .includes(applied.keyword.toLocaleLowerCase("vi"))) &&
      (!applied.specialty || d.specialty === applied.specialty) &&
      (!applied.type || type === applied.type) &&
      (!applied.status || v.status === applied.status) &&
      (!applied.from || date >= applied.from) &&
      (!applied.to || date <= applied.to)
    );
  });
  const columns: DataColumn<any>[] = [
    {
      key: "index",
      title: "STT",
      render: (_, i) => i + 1,
      className: "center",
    },
    {
      key: "id",
      title: "Mã tài liệu",
      value: (d) => d.id,
      render: (d) => <code title={d.id}>{d.id.slice(0, 8)}</code>,
    },
    {
      key: "title",
      title: "Tên tài liệu",
      value: (d) => d.title,
      render: (d) => (
        <button className="document-cell" onClick={() => setDetail(d.id)}>
          <FileText size={19} />
          <span>
            <b>{d.title}</b>
            <small>
              {d.version.filename.split(".").at(-1)?.toUpperCase()}
              {d.version.processing !== "COMPLETED"
                ? " · " +
                  (statusNames[d.version.processing] || d.version.processing)
                : ""}
            </small>
          </span>
        </button>
      ),
    },
    {
      key: "specialty",
      title: "Chuyên khoa",
      value: (d) => d.specialty || "",
      render: (d) => d.specialty || "Chưa phân loại",
    },
    {
      key: "version",
      title: "Phiên bản",
      value: (d) => d.version.number,
      render: (d) => <span className="version-tag">v{d.version.number}.0</span>,
    },
    {
      key: "effective",
      title: "Ngày hiệu lực",
      value: (d) => d.version.effective_date || "",
      render: (d) => dateStr(d.version.effective_date),
    },
    {
      key: "date",
      title: "Cập nhật lần cuối",
      value: (d) => d.version.created_at,
      render: (d) => (
        <span className="nowrap">{dateStr(d.version.created_at)}</span>
      ),
    },
    {
      key: "status",
      title: "Trạng thái",
      value: (d) => statusNames[d.version.status] || d.version.status,
      render: (d) => <Badge status={d.version.status} />,
    },
    {
      key: "actions",
      title: "Thao tác",
      render: (d) => (
        <div className="row-actions">
          <button
            className="icon"
            aria-label={"Xem " + d.title}
            title="Xem chi tiết"
            onClick={() => setDetail(d.id)}
          >
            <Eye size={18} />
          </button>
          <a
            className="icon button"
            href={"/api/sources/" + d.version.id + "/file"}
            target="_blank"
            rel="noreferrer"
            aria-label={"Mở file gốc " + d.title}
            title="Mở file gốc"
          >
            <Download size={17} />
          </a>
        </div>
      ),
    },
  ];
  const exportData = () => {
    exportCsv(
      "thu-vien-tai-lieu.csv",
      [
        "STT",
        "Mã tài liệu",
        "Tên tài liệu",
        "Chuyên khoa",
        "Phiên bản",
        "Ngày hiệu lực",
        "Cập nhật lần cuối",
        "Trạng thái",
      ],
      rows.map((d, i) => [
        i + 1,
        d.id,
        d.title,
        d.specialty || "",
        d.version.number,
        dateStr(d.version.effective_date),
        dateStr(d.version.created_at),
        statusNames[d.version.status] || d.version.status,
      ]),
    );
    notify("Đã xuất danh sách đang lọc sang CSV.");
  };
  return (
    <>
      <SearchFilterPanel
        actions={
          <>
            {hasRole(user, "ADMIN") && (
              <button
                type="button"
                className="success-button"
                onClick={() => setUpload({})}
              >
                <Plus size={16} />
                Tải lên tài liệu
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={loading || !!error || !rows.length}
              onClick={exportData}
            >
              <Download size={16} />
              Xuất CSV
            </button>
          </>
        }
        onSearch={() => setApplied({ ...filters })}
        onReset={() => {
          setFilters({ ...blank });
          setApplied({ ...blank });
        }}
        advanced={
          <>
            <FormField label="Từ ngày cập nhật">
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => field("from", e.target.value)}
              />
            </FormField>
            <FormField label="Đến ngày cập nhật">
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => field("to", e.target.value)}
              />
            </FormField>
          </>
        }
      >
        <FormField label="Từ khóa">
          <input
            placeholder="Tên hoặc mã tài liệu…"
            value={filters.keyword}
            onChange={(e) => field("keyword", e.target.value)}
          />
        </FormField>
        <FormField label="Chuyên khoa">
          <select
            value={filters.specialty}
            onChange={(e) => field("specialty", e.target.value)}
          >
            <option value="">Tất cả chuyên khoa</option>
            {[
              ...new Set((data || []).map((d) => d.specialty).filter(Boolean)),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Loại tài liệu">
          <select
            value={filters.type}
            onChange={(e) => field("type", e.target.value)}
          >
            <option value="">Tất cả định dạng</option>
            {[
              ...new Set(
                (data || []).map((d) =>
                  d.version.filename.split(".").at(-1)?.toUpperCase(),
                ),
              ),
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Trạng thái">
          <select
            value={filters.status}
            onChange={(e) => field("status", e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {[
              "DRAFT",
              "PENDING_REVIEW",
              "APPROVED",
              "REJECTED",
              "ARCHIVED",
            ].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title="Danh sách tài liệu"
        heading={false}
        className="data-panel"
      >
        <EnterpriseDataTable
          rows={rows}
          columns={columns}
          rowKey={(d) => d.id}
          loading={loading}
          error={error}
          label="Danh sách tài liệu"
        />
      </EnterprisePanel>
      {upload && (
        <UploadDialog
          existing={upload.id ? upload : null}
          onClose={() => setUpload(null)}
          onDone={() => {
            setUpload(null);
            setRev((v) => v + 1);
          }}
        />
      )}
      {detail && (
        <DocumentDetail
          id={detail}
          onClose={() => setDetail(null)}
          onVersion={() => {
            setUpload(data?.find((d) => d.id === detail) || { id: detail });
            setDetail(null);
          }}
          onUpdate={() => setRev((v) => v + 1)}
        />
      )}
    </>
  );
}
