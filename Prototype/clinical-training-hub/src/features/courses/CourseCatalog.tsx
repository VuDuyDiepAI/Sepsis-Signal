import { CourseEditor } from "@/features/courses/CourseEditor";
import { AssignmentDialog } from "@/features/training/AssignmentDialog";
import { hasAnyRole } from "@/shared/auth/permissions";
import { useHub } from "@/shared/context/HubContext";
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
import { ArrowUpRight, BookOpen, Sparkles, Users } from "lucide-react";
import { useState } from "react";

export function CourseCatalog({
  builder = false,
  review = false,
}: {
  builder?: boolean;
  review?: boolean;
}) {
  const { user, go } = useHub();
  const [rev, setRev] = useState(0),
    [selected, setSelected] = useState(
      new URLSearchParams(location.hash.split("?")[1] || "").get(
        review ? "course" : "open",
      ) || "",
    ),
    [assign, setAssign] = useState<any>(null),
    [query, setQuery] = useState({ keyword: "", status: "", specialty: "" }),
    [filters, setFilters] = useState(query);
  const { data, loading, error } = useLoad<any[]>(
    "/courses" + (review ? "?status=PENDING_REVIEW" : ""),
    [rev],
  );
  const { data: docs } = useLoad<any[]>("/documents?status=APPROVED");
  return (
    <>
      <SearchFilterPanel
        actions={
          builder &&
          hasAnyRole(user, ["ADMIN"]) && (
            <button
              type="button"
              className="primary"
              onClick={() => go("builder/new")}
            >
              <Sparkles size={17} />
              Tạo khóa học
            </button>
          )
        }
        onSearch={() => setFilters({ ...query })}
        onReset={() => {
          const reset = { keyword: "", status: "", specialty: "" };
          setQuery(reset);
          setFilters(reset);
        }}
      >
        <FormField label="Tên khóa học">
          <input
            value={query.keyword}
            placeholder="Nhập tên hoặc đối tượng học…"
            onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          />
        </FormField>
        <FormField label="Chuyên khoa tài liệu nguồn">
          <select
            value={query.specialty}
            onChange={(e) => setQuery({ ...query, specialty: e.target.value })}
          >
            <option value="">Tất cả chuyên khoa</option>
            {[...new Set((docs || []).map((d) => d.specialty))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Trạng thái">
          <select
            disabled={review || !builder}
            value={
              review ? "PENDING_REVIEW" : !builder ? "PUBLISHED" : query.status
            }
            onChange={(e) => setQuery({ ...query, status: e.target.value })}
          >
            <option value="">Tất cả trạng thái</option>
            {[
              "DRAFT",
              "PENDING_REVIEW",
              "APPROVED",
              "PUBLISHED",
              "REJECTED",
            ].map((s) => (
              <option key={s} value={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
        </FormField>
      </SearchFilterPanel>
      <EnterprisePanel
        title={review ? "Học liệu chờ phê duyệt" : "Danh mục khóa học"}
        heading={review}
        className="data-panel"
      >
        <EnterpriseDataTable
          rows={(data || []).filter(
            (c) =>
              (!review || c.can_review) &&
              (builder || review || c.status === "PUBLISHED") &&
              (!filters.keyword ||
                (c.title + " " + c.audience)
                  .toLocaleLowerCase("vi")
                  .includes(filters.keyword.toLocaleLowerCase("vi"))) &&
              (!filters.status || c.status === filters.status) &&
              (!filters.specialty ||
                c.sources.some((s: any) =>
                  docs?.some(
                    (d) =>
                      d.id === s.document_id &&
                      d.specialty === filters.specialty,
                  ),
                )),
          )}
          rowKey={(c) => c.id}
          loading={loading}
          error={error}
          label="Danh sách khóa học"
          columns={[
            {
              key: "title",
              title: "Tên khóa học",
              value: (c) => c.title,
              render: (c) => (
                <button
                  className="document-cell"
                  onClick={() =>
                    builder
                      ? go("builder/" + c.id + "?edit=1")
                      : setSelected(c.id)
                  }
                >
                  <BookOpen size={20} />
                  <span>
                    <b>{c.title}</b>
                    <small>{c.audience || "Chưa thiết lập đối tượng"}</small>
                    {c.needs_review && (
                      <span className="badge rejected">Nguồn cần rà soát</span>
                    )}
                  </span>
                </button>
              ),
            },
            {
              key: "version",
              title: "Phiên bản",
              value: (c) => c.number,
              render: (c) => <span className="version-tag">v{c.number}.0</span>,
            },
            {
              key: "duration",
              title: "Thời lượng",
              value: (c) => c.duration,
              render: (c) => c.duration + " phút",
            },
            {
              key: "sources",
              title: "Nguồn tài liệu",
              value: (c) => c.sources.length,
              render: (c) => c.sources.length + " nguồn",
            },
            {
              key: "status",
              title: "Trạng thái",
              value: (c) => statusNames[c.status] || c.status,
              render: (c) => <Badge status={c.status} />,
            },
            {
              key: "date",
              title: "Cập nhật",
              value: (c) => c.created_at,
              render: (c) => dateStr(c.created_at),
            },
            {
              key: "actions",
              title: "Thao tác",
              render: (c) => (
                <div className="row-actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      builder
                        ? go("builder/" + c.id + "?edit=1")
                        : setSelected(c.id)
                    }
                  >
                    {review ? "Kiểm duyệt" : "Mở học liệu"}
                    <ArrowUpRight size={15} />
                  </button>
                  {c.status === "PUBLISHED" && c.can_manage && (
                    <button
                      className="secondary"
                      disabled={c.needs_review}
                      onClick={() => setAssign(c)}
                    >
                      <Users size={15} />
                      Phân công
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <details className="context-help">
          <summary>
            {review ? "Quy tắc kiểm duyệt" : "Quy trình học liệu"}
          </summary>
          <p>
            {review
              ? "Chỉ hiển thị học liệu chờ duyệt thuộc phạm vi chuyên môn. Người tạo hoặc chỉnh sửa không được tự duyệt."
              : builder
                ? "Hoàn thiện bản nháp và gửi chuyên gia độc lập phê duyệt trước khi xuất bản."
                : "Chỉ khóa học đã xuất bản mới được phân công. Khóa học có nguồn cần rà soát sẽ bị khóa phân công."}
          </p>
        </details>
      </EnterprisePanel>
      {assign && (
        <AssignmentDialog
          course={assign}
          onClose={() => setAssign(null)}
          onDone={() => {
            setAssign(null);
            setRev((x) => x + 1);
          }}
        />
      )}
      {selected && (
        <CourseEditor
          id={selected}
          onClose={() => setSelected("")}
          onUpdate={() => setRev((x) => x + 1)}
        />
      )}
    </>
  );
}
