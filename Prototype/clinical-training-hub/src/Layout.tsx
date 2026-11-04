import {
  Activity,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  GraduationCap,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  dateStr,
  hasAnyRole,
  lockBodyScroll,
  roleSummary,
  useHub,
  useLoad,
} from "./ui";
import { canOpenPage, workspaceFor, workspaceLabel } from "./workspace";
type NavItem = {
  path: string;
  label: string;
  icon: typeof BookOpen;
  roles: string[];
  group: string;
};
export function ProductMark() {
  return (
    <span className="product-mark" aria-hidden="true">
      <BookOpen size={27} />
      <span>+</span>
    </span>
  );
}
export function AppHeader({
  onMenu,
  onLogout,
  demo,
}: {
  onMenu: () => void;
  onLogout: () => void;
  demo: boolean;
}) {
  const { user, go } = useHub(),
    [query, setQuery] = useState(""),
    [searchRevision, setSearchRevision] = useState(0),
    [menu, setMenu] = useState<"account" | "notifications" | "search" | null>(
      null,
    );
  const workspace = workspaceFor(user);
  const { data: personalReminders } = useLoad<any[]>(
    workspace === "staff" ? "/reminders" : null,
  );
  const { data: docs } = useLoad<any[]>("/documents", [searchRevision]);
  const { data: courses } = useLoad<any[]>(
    hasAnyRole(user, ["ADMIN", "REVIEWER"])
      ? "/courses"
      : "/training/my-courses",
    [searchRevision],
  );
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", f);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", f);
      document.removeEventListener("keydown", k);
    };
  }, []);
  const reminders =
    workspace === "staff"
      ? personalReminders
      : [
          ...(Array.isArray(docs) ? docs : [])
            .filter(
              (d) =>
                (workspace === "review" ? d.can_review : d.can_manage) &&
                d.version.status === "PENDING_REVIEW",
            )
            .map((d) => ({
              id: d.id,
              title: d.title,
              date: d.version.created_at,
              path:
                workspace === "review"
                  ? "reviews?document=" + d.id
                  : "manage-documents?open=" + d.id,
            })),
          ...(Array.isArray(courses) ? courses : [])
            .filter(
              (c) =>
                (workspace === "review" ? c.can_review : c.can_manage) &&
                c.status === "PENDING_REVIEW",
            )
            .map((c) => ({
              id: c.id,
              title: c.title,
              date: c.created_at,
              path:
                workspace === "review"
                  ? "reviews?course=" + c.id
                  : "builder/" + c.id,
            })),
        ];
  const results = (Array.isArray(docs) ? docs : [])
    .filter((d) => workspace !== "review" || d.can_review)
    .filter((d) =>
      d.title.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
    )
    .slice(0, 5);
  const foundCourses = (Array.isArray(courses) ? courses : [])
    .filter((c) => workspace !== "review" || c.can_review)
    .filter((c) =>
      (c.title || c.course_title || "")
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")),
    )
    .slice(0, 4);
  const navigate = (path: string) => {
    go(path);
    setMenu(null);
    setQuery("");
  };
  return (
    <header className="app-header" ref={ref}>
      <button
        className="icon header-menu"
        aria-label="Mở hoặc thu gọn điều hướng"
        onClick={onMenu}
      >
        <Menu size={22} />
      </button>
      <a className="product-name" href="#dashboard">
        <ProductMark />
        <span>
          NỀN TẢNG TRI THỨC & ĐÀO TẠO LÂM SÀNG
          <small>TRI THỨC · HỌC TẬP · THỰC HÀNH</small>
        </span>
      </a>
      <div className="header-tools">
        <div className="global-search">
          <Search size={17} />
          <input
            aria-label="Tìm nhanh toàn hệ thống"
            placeholder="Tìm tài liệu, khóa học…"
            value={query}
            onFocus={() => {
              setMenu("search");
              setSearchRevision((r) => r + 1);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setMenu("search");
            }}
          />
          {query && (
            <button
              className="icon"
              aria-label="Xóa tìm nhanh"
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          )}
          {menu === "search" && (
            <div className="header-popover search-results">
              <b>Tìm nhanh trong phạm vi truy cập</b>
              {!query.trim() ? (
                <p>Nhập tên tài liệu hoặc khóa học cần tìm.</p>
              ) : (
                <>
                  <small>TÀI LIỆU</small>
                  {results.map((d) => (
                    <button
                      key={d.id}
                      onClick={() =>
                        navigate(
                          workspace === "management"
                            ? "manage-documents?open=" + d.id
                            : workspace === "review"
                              ? "reviews?document=" + d.id
                              : "documents?open=" + d.id,
                        )
                      }
                    >
                      <FileText size={17} />
                      <span>
                        {d.title}
                        <small>Phiên bản {d.version.number}</small>
                      </span>
                    </button>
                  ))}
                  <small>KHÓA HỌC</small>
                  {foundCourses.map((c) => (
                    <button
                      key={c.id || c.assignment_id}
                      onClick={() =>
                        navigate(
                          workspace === "review"
                            ? "reviews?course=" + c.id
                            : workspace === "management"
                              ? "courses?open=" + c.id
                              : "my-training",
                        )
                      }
                    >
                      <GraduationCap size={17} />
                      {c.title || c.course_title}
                    </button>
                  ))}
                  {!results.length && !foundCourses.length && (
                    <p>Không tìm thấy kết quả phù hợp.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="header-popup-wrap">
          <button
            className="icon notification-button"
            aria-label="Thông báo và nhắc hạn"
            aria-expanded={menu === "notifications"}
            onClick={() =>
              setMenu(menu === "notifications" ? null : "notifications")
            }
          >
            <Bell size={20} />
            {!!reminders?.length && (
              <span className="notification-count">{reminders.length}</span>
            )}
          </button>
          {menu === "notifications" && (
            <div className="header-popover notifications">
              <b>Thông báo & nhắc hạn</b>
              {reminders?.length ? (
                reminders.slice(0, 5).map((r, i) => (
                  <button
                    key={r.id || i}
                    onClick={() =>
                      navigate(
                        workspace === "staff"
                          ? "calendar"
                          : r.path || "reviews",
                      )
                    }
                  >
                    <Activity size={17} />
                    <span>
                      {r.title || r.message || r.subject || "Nhắc hạn đào tạo"}
                      <small>
                        {r.date || r.due_date
                          ? dateStr(r.date || r.due_date)
                          : "Xem tại lịch đào tạo"}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <p>Không có nhắc hạn mới.</p>
              )}
              <button
                className="text-button"
                onClick={() =>
                  navigate(
                    workspace === "staff"
                      ? "calendar"
                      : workspace === "review"
                        ? "reviews"
                        : "builder",
                  )
                }
              >
                {workspace === "staff"
                  ? "Xem lịch đào tạo"
                  : workspace === "review"
                    ? "Mở kiểm duyệt"
                    : "Xem học liệu"}
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
        <div className="header-popup-wrap">
          <button
            className="account-button"
            aria-expanded={menu === "account"}
            onClick={() => setMenu(menu === "account" ? null : "account")}
          >
            <span className="avatar">{user.name.split(" ").at(-1)?.[0]}</span>
            <span>
              {user.name}
              <small>{user.title}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {menu === "account" && (
            <div className="header-popover account-menu">
              <b>{user.name}</b>
              <p>{user.email}</p>
              <p>{user.department_name}</p>
              <div className="account-roles">
                <ShieldCheck size={17} />
                {roleSummary(user)}
              </div>
              <small>
                {demo ? "Môi trường demo · Dữ liệu đào tạo" : "Đào tạo nội bộ"}
              </small>
              <button
                onClick={() => {
                  setMenu(null);
                  onLogout();
                }}
              >
                <LogOut size={17} />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
export function AppSidebar({
  items,
  page,
  open,
  collapsed,
  onClose,
  onCollapse,
}: {
  items: NavItem[];
  page: string;
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onCollapse: () => void;
}) {
  const { user } = useHub();
  const drawerRef = useRef<HTMLElement>(null);
  const closeDrawer = useRef(onClose);
  closeDrawer.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const unlockScroll = lockBodyScroll();
    drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer.current();
      if (e.key === "Tab") {
        const items = Array.from(
          drawerRef.current?.querySelectorAll<HTMLElement>("a,button") || [],
        ).filter((el) => el.offsetParent !== null);
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
    document.addEventListener("keydown", keydown);
    return () => {
      unlockScroll();
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [open]);
  const [folded, setFolded] = useState<string[]>([]);
  const groups = [
    ["knowledge", "Tri thức", BookOpen],
    ["training", "Đào tạo", GraduationCap],
    ["review", "Kiểm duyệt", ShieldCheck],
    ["admin", "Quản trị hệ thống", Activity],
  ] as const;
  const mapped = items
    .map((n) => ({
      ...n,
      group: ["dashboard", "calendar", "credentials"].includes(n.path)
        ? "standalone"
        : ["documents", "manage-documents", "chat"].includes(n.path)
          ? "knowledge"
          : ["my-training", "builder", "courses", "reports", "jobs"].includes(
                n.path,
              )
            ? "training"
            : n.group,
    }))
    .filter((n) => canOpenPage(user, n.path));
  const link = (n: NavItem) => (
    <a
      key={n.path}
      href={"#" + n.path}
      aria-label={n.label}
      title={collapsed ? n.label : undefined}
      aria-current={page.split(/[/?]/)[0] === n.path ? "page" : undefined}
      className={page.split(/[/?]/)[0] === n.path ? "active" : ""}
    >
      <n.icon size={18} />
      <span>{n.label}</span>
    </a>
  );
  return (
    <>
      {open && (
        <button
          className="drawer-scrim"
          aria-label="Đóng điều hướng"
          onClick={onClose}
        />
      )}
      <aside
        ref={drawerRef}
        className={
          "app-sidebar " +
          (open ? "open " : "") +
          (collapsed ? "collapsed" : "")
        }
      >
        <div className="sidebar-context">
          <Activity size={20} />
          <div>
            <b>{workspaceLabel(user)}</b>
            <small>{user.department_name || "Đào tạo nội bộ"}</small>
          </div>
          <button
            className="icon drawer-close"
            aria-label="Đóng điều hướng"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Điều hướng chính">
          {mapped.filter((n) => n.path === "dashboard").map(link)}
          {groups.map(([id, label, Icon]) => {
            const rows = mapped.filter((n) => n.group === id);
            return rows.length ? (
              <div className="nav-group" key={id}>
                <button
                  className="nav-group-toggle"
                  title={collapsed ? label : undefined}
                  aria-expanded={!folded.includes(id)}
                  onClick={() =>
                    setFolded(
                      folded.includes(id)
                        ? folded.filter((g) => g !== id)
                        : [...folded, id],
                    )
                  }
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  <ChevronDown
                    size={14}
                    className={folded.includes(id) ? "rotated" : ""}
                  />
                </button>
                {!folded.includes(id) && (
                  <div className="nav-children">{rows.map(link)}</div>
                )}
              </div>
            ) : null;
          })}
          {mapped
            .filter((n) => n.group === "standalone" && n.path !== "dashboard")
            .map(link)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-assurance">
            <ShieldCheck size={18} />
            <small>
              Nguồn rõ ràng
              <br />
              Chuyên gia phê duyệt
            </small>
          </div>
          <button
            className="collapse-sidebar"
            onClick={onCollapse}
            aria-label={collapsed ? "Mở rộng điều hướng" : "Thu gọn điều hướng"}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <>
                <PanelLeftClose size={19} />
                <span>Thu gọn điều hướng</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
