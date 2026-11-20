"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity,
  LayoutDashboard,
  UsersRound,
  FlaskConical,
  ChartNoAxesCombined,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  CircleHelp,
  Stethoscope,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useReviews } from "@/components/review-context";
const links = [
  {
    href: "/dashboard",
    label: "Theo dõi & Cảnh báo",
    icon: LayoutDashboard,
    group: "KHÔNG GIAN LÂM SÀNG",
  },
  { href: "/patients", label: "Hồ sơ theo dõi", icon: UsersRound },
  {
    href: "/sample-cases",
    label: "Diễn tiến ca mẫu",
    icon: FlaskConical,
    group: "DỮ LIỆU & MÔ HÌNH",
  },
  {
    href: "/model-monitoring",
    label: "Đánh giá mô hình",
    icon: ChartNoAxesCombined,
  },
];
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { reviews, reset } = useReviews();
  const nav = (
    <nav aria-label="Điều hướng chính">
      {links.map(({ href, label, icon: Icon, group }) => (
        <div key={href}>
          {group && <div className="nav-section">{group}</div>}
          <Link
            href={href}
            className={`nav-link ${path === href || (href === "/patients" && path.startsWith("/patients/")) ? "active" : ""}`}
            aria-current={path === href ? "page" : undefined}
            title={collapsed ? label : undefined}
            onClick={() => setMobile(false)}
          >
            <Icon />
            <span className="nav-text">{label}</span>
          </Link>
        </div>
      ))}
    </nav>
  );
  const brand = (
    <Link
      href="/dashboard"
      className="brand"
      aria-label="Sepsis Signal — Theo dõi và Cảnh báo"
    >
      <span className="brand-mark">
        <Activity size={25} />
      </span>
      <span className="brand-text">
        <strong>SEPSIS SIGNAL</strong>
        <small>Clinical Intelligence</small>
      </span>
    </Link>
  );
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <aside className="sidebar">
        {brand}
        {nav}
        <div className="sidebar-foot">
          Khoa Cấp cứu · Vinmec
          <br />
          Không gian trải nghiệm nghiên cứu
        </div>
        <button
          className="collapse-control"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={
            collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"
          }
        >
          {collapsed ? (
            <PanelLeftOpen size={19} />
          ) : (
            <PanelLeftClose size={19} />
          )}
          <span className="nav-text">Thu gọn điều hướng</span>
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <Dialog open={mobile} onOpenChange={setMobile}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    className="mobile-menu"
                    aria-label="Mở điều hướng"
                  />
                }
              >
                <Menu size={21} />
              </DialogTrigger>
              <DialogContent className="mobile-nav-content">
                <DialogTitle className="sr-only">
                  Điều hướng Sepsis Signal
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Chọn khu vực làm việc
                </DialogDescription>
                {brand}
                {nav}
              </DialogContent>
            </Dialog>
            <div className="topbar-brand">
              <strong>Khoa Cấp cứu · Vinmec</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="demo-chip">
              <Database size={14} />
              EMR mô phỏng
            </span>
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    aria-label="Hướng dẫn trải nghiệm"
                    size="icon"
                  />
                }
              >
                <CircleHelp size={20} />
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Trải nghiệm Sepsis Signal</DialogTitle>
                <DialogDescription>
                  Hồ sơ và điểm dự báo lấy từ dữ liệu mô phỏng trong repository.
                </DialogDescription>
                <p>
                  T0 là lúc hoàn tất phân loại. Mô hình chấm từ T0+1h, dự báo 6
                  giờ tiếp theo, dùng dữ liệu đã có trên EMR từ T0.
                </p>
                <p className="secondary-text">
                  Ghi nhận xem xét được giữ khi tải lại trong cùng tab, tối đa 8
                  giờ. Chưa kết nối hệ thống bệnh viện.
                </p>
                {Object.keys(reviews).length > 0 && (
                  <Button variant="outline" onClick={reset}>
                    Xóa ghi nhận trong phiên trải nghiệm
                  </Button>
                )}
              </DialogContent>
            </Dialog>
            <span
              className="user-avatar"
              title="Không gian trải nghiệm, chưa kết nối đăng nhập bệnh viện"
            >
              <Stethoscope size={21} />
            </span>
          </div>
        </header>
        <main id="main-content" className="page">
          {children}
        </main>
      </div>
    </div>
  );
}
