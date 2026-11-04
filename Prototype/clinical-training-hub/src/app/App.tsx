import { AppHeader, AppSidebar, ProductMark } from "@/app/layout/Layout";
import { canOpenPage, workspaceFor } from "@/app/workspace";
import { Admin } from "@/features/administration/Admin";
import { Chat } from "@/features/assistant/Chat";
import { TrainingCalendar } from "@/features/calendar/TrainingCalendar";
import { CourseBuilderPage } from "@/features/courses/CourseBuilder";
import { CourseCatalog } from "@/features/courses/CourseCatalog";
import { Credentials } from "@/features/credentials/Credentials";
import Dashboard from "@/features/dashboard/Dashboard";
import { Documents } from "@/features/documents/DocumentLibrary";
import { DocumentReviews } from "@/features/documents/DocumentReviews";
import { SourceViewer } from "@/features/documents/SourceViewer";
import { FeedbackCenter } from "@/features/feedback/FeedbackCenter";
import { FeedbackForm } from "@/features/feedback/FeedbackForm";
import Jobs from "@/features/jobs/Jobs";
import { ResearchAssistant } from "@/features/research/index";
import { Reports } from "@/features/reports/Reports";
import { Learning } from "@/features/training/Learning";
import { MyTraining } from "@/features/training/MyTraining";
import { api, post } from "@/shared/api/client";
import { type User } from "@/shared/auth/types";
import { Hub, useHub } from "@/shared/context/HubContext";
import { useLoad } from "@/shared/hooks/useLoad";
import { Empty } from "@/shared/ui/Empty";
import { Toast } from "@/shared/ui/enterprise";
import { Modal } from "@/shared/ui/Modal";
import {
  Activity,
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Library,
  MessageSquarePlus,
  MessagesSquare,
  Settings,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

const navItems = [
  {
    path: "research",
    label: "Trợ lý nghiên cứu AI",
    icon: Search,
    roles: ["STAFF", "ADMIN", "REVIEWER"],
    group: "standalone",
  },
  {
    path: "dashboard",
    label: "Tổng quan",
    icon: LayoutDashboard,
    roles: ["STAFF", "ADMIN", "REVIEWER"],
    group: "personal",
  },
  {
    path: "chat",
    label: "Trợ lý tri thức AI",
    icon: MessagesSquare,
    roles: ["STAFF"],
    group: "personal",
  },
  {
    path: "documents",
    label: "Thư viện tài liệu",
    icon: Library,
    roles: ["STAFF"],
    group: "personal",
  },
  {
    path: "my-training",
    label: "Khóa học của tôi",
    icon: GraduationCap,
    roles: ["STAFF"],
    group: "personal",
  },
  {
    path: "calendar",
    label: "Lịch đào tạo",
    icon: CalendarDays,
    roles: ["STAFF"],
    group: "personal",
  },
  {
    path: "credentials",
    label: "Chứng chỉ",
    icon: Award,
    roles: ["STAFF"],
    group: "personal",
  },
  {
    path: "manage-documents",
    label: "Quản lý tài liệu",
    icon: Library,
    roles: ["ADMIN"],
    group: "training",
  },
  {
    path: "builder",
    label: "Xây dựng học liệu",
    icon: Sparkles,
    roles: ["ADMIN"],
    group: "training",
  },
  {
    path: "courses",
    label: "Phân công đào tạo",
    icon: BookOpen,
    roles: ["ADMIN"],
    group: "training",
  },
  {
    path: "reports",
    label: "Báo cáo đào tạo",
    icon: Activity,
    roles: ["ADMIN"],
    group: "training",
  },
  {
    path: "jobs",
    label: "Tác vụ xử lý",
    icon: Clock3,
    roles: ["ADMIN"],
    group: "training",
  },
  {
    path: "reviews",
    label: "Kiểm duyệt chuyên môn",
    icon: ClipboardCheck,
    roles: ["REVIEWER"],
    group: "review",
  },
  {
    path: "admin",
    label: "Quản trị hệ thống",
    icon: Settings,
    roles: ["ADMIN"],
    group: "admin",
  },
  {
    path: "feedback",
    label: "Trung tâm góp ý",
    icon: MessageSquarePlus,
    roles: ["ADMIN"],
    group: "admin",
  },
];

export default function App() {
  const { data: health } = useLoad<any>("/health");
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [page, setPage] = useState(location.hash.slice(1) || "dashboard"),
    [toast, setToast] = useState(""),
    [toastError, setToastError] = useState(false),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [source, setSource] = useState<{ id: string; chunk?: string } | null>(null),
    [feedback, setFeedback] = useState(false),
    [error, setError] = useState("");
  const currentPage = useRef(page);
  currentPage.current = page;
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
    const f = () => {
      const next = location.hash.slice(1) || "dashboard";
      const before = new CustomEvent("hub-before-navigate", {
        cancelable: true,
        detail: { path: next },
      });
      if (!window.dispatchEvent(before)) {
        history.replaceState(null, "", "#" + currentPage.current);
        return;
      }
      setPage(next);
      setMobile(false);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (!active) return;
        if (response.status === 401) setUser(null);
        else if (response.ok) setUser(await response.json());
      } catch {}
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("hub-permissions-updated", refresh);
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("hub-permissions-updated", refresh);
    };
  }, [user?.id]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      setUser(await post("/auth/login", Object.fromEntries(f)));
      location.hash = "dashboard";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToastError(true);
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!ready)
    return (
      <div className="boot">
        <ProductMark />
        <p>Đang kết nối trung tâm đào tạo…</p>
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <div className="login-story">
          <div className="wordmark">
            <ProductMark />
            <b>
              TRI THỨC Y KHOA <small>NỀN TẢNG ĐÀO TẠO LÂM SÀNG</small>
            </b>
          </div>
          <span className="pill">TRI THỨC • ĐÀO TẠO • KẾT NỐI</span>
          <h1>
            Nền tảng tri thức
            <br />& đào tạo lâm sàng.
          </h1>
          <p>
            Một không gian chung cho tài liệu chuyên môn, học liệu AI và hành
            trình phát triển năng lực của đội ngũ y tế.
          </p>
          <div className="login-orbit">
            <Library size={42} />
            <span />
            <GraduationCap size={42} />
            <span />
            <ShieldCheck size={42} />
          </div>
          <small>Prototype đào tạo nội bộ • Dữ liệu giả lập</small>
        </div>
        <div className="login-form">
          <form onSubmit={login}>
            <div className="eyebrow">CHÀO MỪNG TRỞ LẠI</div>
            <h2>Đăng nhập hệ thống</h2>
            <p>Đăng nhập bằng tài khoản được đơn vị cấp.</p>
            <label>
              Email công việc
              <input
                name="email"
                type="email"
                placeholder="Nhập địa chỉ email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Mật khẩu
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                required
              />
            </label>
            <label className="password-toggle">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Hiện mật khẩu
            </label>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Đang đăng nhập…" : "Đăng nhập"}
              <ArrowUpRight size={18} />
            </button>
            <div className="login-note">
              <ShieldCheck size={18} />
              Tài khoản và quyền truy cập do quản trị viên cấp.
            </div>
          </form>
          <p className="fine">
            Công cụ hỗ trợ đào tạo, không thay thế nhận định chuyên môn.
          </p>
        </div>
      </div>
    );
  const go = (path: string) => {
    location.hash = path;
  };
  const active = navItems.find((n) => n.path === page.split(/[/?]/)[0]);
  return (
    <Hub.Provider
      value={{
        user,
        go,
        notify: (message) => {
          setToastError(false);
          setToast(message);
        },
        act,
        busy,
        source: (id, chunk) => setSource({ id, chunk }),
      }}
    >
      <div
        className={
          "app " +
          (page === "research" ? "research-workspace " : "") +
          (collapsed ? "sidebar-collapsed" : "")
        }
      >
        <AppHeader
          onMenu={() => {
            if (window.innerWidth <= 1000) setMobile(!mobile);
            else setCollapsed(!collapsed);
          }}
          demo={Boolean(health?.demo_mode)}
          onLogout={() => {
            const run = () =>
              act(async () => {
                await post("/auth/logout");
                setUser(null);
              });
            const before = new CustomEvent("hub-before-logout", {
              cancelable: true,
              detail: { run },
            });
            if (window.dispatchEvent(before)) run();
          }}
        />
        <AppSidebar
          items={navItems}
          page={page}
          open={mobile}
          collapsed={collapsed}
          onClose={() => setMobile(false)}
          onCollapse={() => setCollapsed(!collapsed)}
        />
        <div className="main-wrap">
          <div className="breadcrumb">
            <a href="#dashboard">Trang chủ</a>
            <ChevronRight size={14} />
            <span>{active?.label || "Chi tiết khóa học"}</span>
          </div>
          <main key={page} data-page={page}>
            <h1 className="sr-only">{active?.label || "Chi tiết khóa học"}</h1>
            <AuthorizedPage page={page} />
          </main>
        </div>
        {workspaceFor(user) === "staff" && (
          <button className="feedback-float" onClick={() => setFeedback(true)}>
            <MessageSquarePlus size={17} />
            Gửi góp ý
          </button>
        )}
        {toast && (
          <Toast
            message={toast}
            error={toastError}
            onClose={() => setToast("")}
          />
        )}
        {source && (
          <SourceViewer
            id={source.id}
            chunk={source.chunk}
            onClose={() => setSource(null)}
          />
        )}
        {feedback && (
          <Modal title="Gửi góp ý" onClose={() => setFeedback(false)}>
            <FeedbackForm onDone={() => setFeedback(false)} />
          </Modal>
        )}
      </div>
    </Hub.Provider>
  );
}

function AuthorizedPage({ page }: { page: string }) {
  const { user } = useHub();
  if (!canOpenPage(user, page))
    return (
      <section className="panel">
        <Empty text="Bạn không có quyền truy cập chức năng này" />
      </section>
    );
  return renderPage(page.split("?")[0]);
}

function renderPage(page: string) {
  if (page.startsWith("builder/"))
    return <CourseBuilderPage id={page.split("/")[1]} />;
  if (page.startsWith("learn/")) return <Learning parts={page.split("/")} />;
  switch (page) {
    case "research":
      return <ResearchAssistant />;
    case "jobs":
      return <Jobs />;
    case "feedback":
      return <FeedbackCenter />;
    case "admin":
      return <Admin />;
    case "my-training":
      return <MyTraining />;
    case "calendar":
      return <TrainingCalendar />;
    case "credentials":
      return <Credentials />;
    case "reports":
      return <Reports />;
    case "manage-documents":
    case "documents":
      return <Documents />;
    case "chat":
      return <Chat />;
    case "builder":
      return <CourseCatalog builder />;
    case "courses":
      return <CourseCatalog />;
    case "reviews":
      return (
        <>
          <DocumentReviews />
          <CourseCatalog review />
        </>
      );
    case "dashboard":
      return <Dashboard />;
    default:
      return (
        <section className="panel">
          <Empty text="Không tìm thấy trang này">
            <p>{navItems.find((n) => n.path === page)?.label}</p>
          </Empty>
        </section>
      );
  }
}
