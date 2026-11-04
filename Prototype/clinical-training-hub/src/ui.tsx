import { ArrowUpRight, BookOpen, X } from "lucide-react";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api";
export type User = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  role_grants: {
    role: string;
    department_id: string;
    review_specialties: string[];
  }[];
  title: string;
  department_id: string;
  department_name?: string;
};
export const Hub = createContext<{
  user: User;
  notify: (s: string) => void;
  go: (s: string) => void;
  source: (id: string, chunk?: string) => void;
  act: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
}>(null!);
export const useHub = () => useContext(Hub);
export const hasRole = (u: User, role: string, departmentId?: string) =>
  departmentId
    ? u.role_grants?.some(
        (g) => g.role === role && g.department_id === departmentId,
      )
    : u.roles?.includes(role) || false;
export const hasAnyRole = (u: User, roles: string[]) =>
  roles.some((r) => hasRole(u, r));
export const roleSummary = (u: User) =>
  (u.roles || []).map((r) => roleNames[r] || r).join(" · ");
const modalStack: symbol[] = [];
let scrollLocks = 0;
let originalOverflow = "";
export function lockBodyScroll() {
  if (scrollLocks++ === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
  };
}
export const statusNames: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_REVIEW: "Chờ phê duyệt",
  APPROVED: "Đã phê duyệt",
  ARCHIVED: "Đã lưu trữ",
  REJECTED: "Cần chỉnh sửa",
  PUBLISHED: "Đã xuất bản",
  COMPLETED: "Hoàn thành",
  IN_PROGRESS: "Đang học",
  NOT_STARTED: "Chưa bắt đầu",
  OVERDUE: "Quá hạn",
  QUEUED: "Đang chờ",
  RUNNING: "Đang xử lý",
  FAILED: "Xử lý lỗi",
  NEW: "Mới",
  REVIEWING: "Đang xử lý",
  RESOLVED: "Đã giải quyết",
  UNVERIFIED: "Chưa xác minh",
  VERIFIED: "Đã xác minh",
};
export const roleNames: Record<string, string> = {
  ADMIN: "Quản trị viên",
  REVIEWER: "Chuyên gia kiểm duyệt",
  STAFF: "Nhân viên y tế",
};
export const dateStr = (s: string) =>
  s
    ? new Date(
        s.length === 10 ? s + "T12:00:00" : s.endsWith("Z") ? s : s + "Z",
      ).toLocaleDateString("vi-VN")
    : "Chưa thiết lập";
export function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status.toLowerCase()}>
      <span />
      {statusNames[status] || status}
    </span>
  );
}
export function Empty({
  text = "Chưa có dữ liệu",
  children,
}: {
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dirty,
  guardChanges = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dirty?: boolean;
  guardChanges?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [changed, setChanged] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const isDirty = guardChanges && (dirty ?? changed);
  const requestClose = () => {
    if (isDirty) setConfirmClose(true);
    else onClose();
  };
  const close = useRef(requestClose);
  close.current = requestClose;
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
  useEffect(() => {
    const id = Symbol("modal");
    modalStack.push(id);
    const unlockScroll = lockBodyScroll();
    const previous = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")
      ?.focus();
    const f = (e: KeyboardEvent) => {
      if (modalStack.at(-1) !== id) return;
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ) || [],
        ).filter((x) => x.offsetParent !== null);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", f);
    return () => {
      document.removeEventListener("keydown", f);
      modalStack.splice(modalStack.indexOf(id), 1);
      unlockScroll();
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay" onClick={requestClose}>
      <section
        ref={ref}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onChangeCapture={() => setChanged(true)}
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("button[data-dirty]"))
            setChanged(true);
          const target = (e.target as HTMLElement).closest(
            "button[data-modal-dismiss]",
          );
          if (target && isDirty) {
            e.preventDefault();
            e.stopPropagation();
            setConfirmClose(true);
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="Đóng" onClick={requestClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {confirmClose && (
          <Modal
            title="Thay đổi chưa được lưu"
            guardChanges={false}
            onClose={() => setConfirmClose(false)}
          >
            <p>
              Bạn có thay đổi chưa lưu. Đóng màn hình sẽ bỏ các thay đổi này.
            </p>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setConfirmClose(false)}
              >
                Tiếp tục chỉnh sửa
              </button>
              <button className="danger" onClick={onClose}>
                Bỏ thay đổi và đóng
              </button>
            </div>
          </Modal>
        )}
      </section>
    </div>
  );
}
export function useLoad<T>(path: string | null, deps: unknown[] = []) {
  const hub = useContext(Hub);
  const accessKey = hub
    ? JSON.stringify([
        hub.user.id,
        hub.user.department_id,
        hub.user.roles,
        hub.user.role_grants,
      ])
    : "public";
  const [loadedAccess, setLoadedAccess] = useState(accessKey);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!path) {
      setData(null);
      setError("");
      setLoading(false);
      setLoadedAccess(accessKey);
      return;
    }
    setLoading(true);
    api(path)
      .then((x) => {
        if (active) {
          setData(x);
          setError("");
          setLoadedAccess(accessKey);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
        if (active) setData(null);
        if (active) setLoadedAccess(accessKey);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, accessKey, ...deps]);
  const accessChanged = loadedAccess !== accessKey;
  return {
    data: accessChanged ? null : data,
    error: accessChanged ? "" : error,
    loading: accessChanged || loading,
  };
}
export function LoadState({
  loading,
  error,
}: {
  loading: boolean;
  error: string;
}) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : loading ? (
    <div className="skeleton" role="status" aria-label="Đang tải dữ liệu">
      <i />
      <i />
      <i />
    </div>
  ) : null;
}
export function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="icon-box">{icon}</span>
        <ArrowUpRight size={16} />
      </div>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  );
}

export const StatusBadge = Badge;
