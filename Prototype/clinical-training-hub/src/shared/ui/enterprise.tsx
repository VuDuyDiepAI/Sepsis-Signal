import { Empty } from "@/shared/ui/Empty";
import { LoadState } from "@/shared/ui/LoadState";
import { Modal } from "@/shared/ui/Modal";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Info,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ReactNode, useEffect, useId, useMemo, useState } from "react";

export function SectionHeader({
  title,
  icon,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div className="section-heading">
        {icon}
        <h2>{title}</h2>
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function EnterprisePanel({
  title,
  icon,
  actions,
  children,
  className = "",
  heading = true,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  heading?: boolean;
}) {
  return (
    <section
      className={"enterprise-panel " + className}
      aria-label={!heading && typeof title === "string" ? title : undefined}
    >
      {heading ? (
        <SectionHeader title={title} icon={icon}>
          {actions}
        </SectionHeader>
      ) : actions ? (
        <div className="panel-toolbar">
          <div className="actions">{actions}</div>
        </div>
      ) : null}
      <div className="panel-content">{children}</div>
    </section>
  );
}

export function FormField({
  label,
  children,
  hint,
  required,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={"form-field " + className}>
      <span>
        {label}
        {required && <em aria-hidden="true"> *</em>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function SearchFilterPanel({
  children,
  advanced,
  compact = false,
  actions,
  onSearch,
  onReset,
}: {
  children: ReactNode;
  advanced?: ReactNode;
  compact?: boolean;
  actions?: ReactNode;
  onSearch: () => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <form
      className={"search-filter-panel" + (compact ? " compact-filters" : "")}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <div className="filter-fields">
        {children}
        {expanded && advanced}
      </div>
      <div className="filter-actions">
        {advanced && (
          <button
            type="button"
            className="text-button"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={16} />
            {expanded ? "Thu gọn bộ lọc" : "Bộ lọc nâng cao"}
          </button>
        )}
        <span id={id} className="sr-only">
          {expanded
            ? "Đang hiển thị bộ lọc nâng cao"
            : "Bộ lọc nâng cao đã thu gọn"}
        </span>
        <button className="primary" type="submit">
          <Search size={16} />
          Tìm kiếm
        </button>
        <button type="button" className="secondary" onClick={onReset}>
          <RotateCcw size={15} />
          Đặt lại
        </button>
        {actions}
      </div>
    </form>
  );
}

export type DataColumn<T> = {
  key: string;
  title: string;
  render: (row: T, index: number) => ReactNode;
  value?: (row: T) => string | number;
  className?: string;
};

export function EnterpriseDataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  error = "",
  empty = "Không có kết quả phù hợp",
  label = "Danh sách dữ liệu",
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string;
  empty?: string;
  label?: string;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [page, setPage] = useState(1),
    [size, setSize] = useState(10);
  const rowSignature = rows.map(rowKey).join("|");
  useEffect(() => setPage(1), [rowSignature, size]);
  const sorted = useMemo(() => {
    const getter = columns.find((c) => c.key === sort?.key)?.value;
    return getter
      ? [...rows].sort((a, b) => {
          const av = getter(a),
            bv = getter(b);
          return (
            (typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av).localeCompare(String(bv), "vi", { numeric: true })) *
            (sort?.desc ? -1 : 1)
          );
        })
      : rows;
  }, [rows, columns, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / size)),
    current = Math.min(page, pages),
    start = (current - 1) * size;
  return (
    <div className="enterprise-table">
      <LoadState loading={loading} error={error} />
      {!loading && !error && (
        <>
          <div className="scroll-hint">↔ Vuốt ngang để xem đầy đủ các cột</div>
          <div
            className="table-wrap"
            tabIndex={0}
            aria-label={label + " — có thể cuộn ngang"}
          >
            <table aria-label={label}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={
                        sort?.key === c.key
                          ? sort.desc
                            ? "descending"
                            : "ascending"
                          : undefined
                      }
                    >
                      {c.value ? (
                        <button
                          className="sort-button"
                          onClick={() => {
                            setSort({
                              key: c.key,
                              desc: sort?.key === c.key ? !sort.desc : false,
                            });
                            setPage(1);
                          }}
                        >
                          {c.title}
                          {sort?.key === c.key ? (
                            sort.desc ? (
                              <ArrowDown size={13} />
                            ) : (
                              <ArrowUp size={13} />
                            )
                          ) : (
                            <ChevronsUpDown size={13} />
                          )}
                        </button>
                      ) : (
                        c.title
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.slice(start, start + size).map((r, i) => (
                  <tr key={rowKey(r)}>
                    {columns.map((c) => (
                      <td key={c.key} className={c.className}>
                        {c.render(r, start + i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <Empty text={empty}>
              <p>Thử thay đổi bộ lọc hoặc quay lại sau.</p>
            </Empty>
          )}
          <div className="table-footer">
            <span>
              {rows.length
                ? `${start + 1}–${Math.min(start + size, rows.length)}`
                : "0"}{" "}
              / {rows.length} kết quả
            </span>
            <div className="pagination">
              <label>
                Số dòng
                <select
                  aria-label="Số dòng mỗi trang"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button
                className="icon secondary"
                aria-label="Trang trước"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                Trang {current}/{pages}
              </span>
              <button
                className="icon secondary"
                aria-label="Trang tiếp"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ConfirmationDialog({
  title,
  children,
  confirm = "Xác nhận",
  danger,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  confirm?: string;
  danger?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="confirmation-body">
        <AlertTriangle size={30} />
        <div>{children}</div>
      </div>
      <div className="modal-actions">
        <button className="secondary" disabled={busy} onClick={onClose}>
          Hủy
        </button>
        <button
          className={danger ? "danger" : "primary"}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Đang xử lý…" : confirm}
        </button>
      </div>
    </Modal>
  );
}

export function Toast({
  message,
  onClose,
  error = false,
}: {
  message: string;
  onClose: () => void;
  error?: boolean;
}) {
  const isError = error;
  return (
    <div
      className={"toast " + (isError ? "toast-error" : "toast-info")}
      role={isError ? "alert" : "status"}
    >
      {isError ? <Info size={20} /> : <CheckCircle2 size={20} />}
      <span>{message}</span>
      <button className="icon" aria-label="Đóng thông báo" onClick={onClose}>
        <X size={17} />
      </button>
    </div>
  );
}

export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const cell = (v: string | number) =>
    '"' +
    String(v)
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const blob = new Blob(
    [
      "\ufeff" +
        [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
