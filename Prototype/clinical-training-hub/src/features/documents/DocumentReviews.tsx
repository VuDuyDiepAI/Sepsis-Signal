import { DocumentDetail } from "@/features/documents/DocumentDetail";
import { UploadDialog } from "@/features/documents/UploadDialog";
import { useLoad } from "@/shared/hooks/useLoad";
import { dateStr } from "@/shared/lib/dates";
import { statusNames } from "@/shared/lib/labels";
import { Badge } from "@/shared/ui/Badge";
import {
  EnterpriseDataTable,
  EnterprisePanel,
  FormField,
  SearchFilterPanel,
} from "@/shared/ui/enterprise";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

export function DocumentReviews() {
  const [rev, setRev] = useState(0),
    [selected, setSelected] = useState(
      new URLSearchParams(location.hash.split("?")[1] || "").get("document") ||
        "",
    ),
    [upload, setUpload] = useState<any>(null),
    [query, setQuery] = useState({ keyword: "", status: "PENDING_REVIEW" }),
    [filters, setFilters] = useState(query);
  const { data, loading, error } = useLoad<any[]>(
    "/documents?status=" + filters.status,
    [rev],
  );
  return (
    <>
      <SearchFilterPanel
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", status: "PENDING_REVIEW" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Tìm tài liệu kiểm duyệt">
          <input
            placeholder="Nhập tên tài liệu…"
            value={query.keyword}
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Trạng thái tài liệu">
          <select
            value={query.status}
            onChange={(e) => setQuery({ ...query, status: e.target.value })}
          >
            <option value="">Tất cả trạng thái</option>
            {["PENDING_REVIEW", "APPROVED", "REJECTED", "DRAFT"].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title="Tài liệu trong phạm vi kiểm duyệt"
        className="data-panel"
      >
        <EnterpriseDataTable
          rows={(data || []).filter(
            (d) =>
              d.can_review &&
              d.title
                .toLocaleLowerCase("vi")
                .includes(filters.keyword.toLocaleLowerCase("vi")),
          )}
          rowKey={(d) => d.id}
          loading={loading}
          error={error}
          label="Tài liệu kiểm duyệt"
          columns={[
            {
              key: "title",
              title: "Tên tài liệu",
              value: (d) => d.title,
              render: (d) => (
                <span>
                  <b>{d.title}</b>
                  <small>{d.specialty}</small>
                </span>
              ),
            },
            {
              key: "version",
              title: "Phiên bản",
              value: (d) => d.version.number,
              render: (d) => "v" + d.version.number + ".0",
            },
            {
              key: "date",
              title: "Cập nhật",
              value: (d) => d.version.created_at,
              render: (d) => dateStr(d.version.created_at),
            },
            {
              key: "status",
              title: "Trạng thái",
              value: (d) => d.version.status,
              render: (d) => <Badge status={d.version.status} />,
            },
            {
              key: "action",
              title: "Thao tác",
              render: (d) => (
                <button className="secondary" onClick={() => setSelected(d.id)}>
                  Kiểm tra tài liệu
                  <ArrowUpRight size={16} />
                </button>
              ),
            },
          ]}
        />
      </EnterprisePanel>
      {selected && (
        <DocumentDetail
          id={selected}
          onClose={() => setSelected("")}
          onVersion={() => {
            setUpload(data?.find((d) => d.id === selected) || { id: selected });
            setSelected("");
          }}
          onUpdate={() => setRev((x) => x + 1)}
        />
      )}
      {upload && (
        <UploadDialog
          existing={upload}
          onClose={() => setUpload(null)}
          onDone={() => {
            setUpload(null);
            setRev((r) => r + 1);
          }}
        />
      )}
    </>
  );
}
