"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity,
  BellRing,
  CircleHelp,
  Database,
  Menu,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useReviews } from "@/components/review-context";
import { useDemo } from "@/components/demo-context";
import { hourLabel, percent } from "@/lib/clinical-data";
import { DATA_SOURCES } from "@/lib/workspace-data";

const primaryLinks = [
  { href: "/dashboard", label: "Bảng ca trực" },
  { href: "/sample-cases", label: "Tua ca mẫu" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { reviews, reset } = useReviews();
  const demo = useDemo();

  const reviewCount = Object.keys(reviews).length;
  const activeSourceMeta = DATA_SOURCES.find((s) => s.id === demo.sourceId);
  const progressPct = Math.round((demo.demoHour / demo.demoMaxHour) * 100);

  function isPrimaryActive(href: string) {
    if (href === "/dashboard") {
      return (
        path === "/dashboard" ||
        path === "/patients" ||
        path.startsWith("/patients/")
      );
    }
    return path === href;
  }

  return (
    <div className="clinical-shell">
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <header className="clinical-topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mobile-menu-btn"
                    aria-label="Mở điều hướng"
                  />
                }
              >
                <Menu size={19} />
              </DialogTrigger>
              <DialogContent className="max-w-xs p-5">
                <DialogTitle className="flex items-center gap-2 text-sm font-bold">
                  <span className="brand-emblem">
                    <Activity size={16} />
                  </span>
                  <span>SEPSIS SIGNAL</span>
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Điều hướng khu vực làm việc lâm sàng
                </DialogDescription>
                <nav
                  aria-label="Điều hướng di động"
                  className="mt-2 flex flex-col gap-1"
                >
                  {primaryLinks.map(({ href, label }) => {
                    const active = isPrimaryActive(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`topbar-link justify-between ${active ? "active" : ""}`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                      >
                        <span>{label}</span>
                      </Link>
                    );
                  })}
                  <div className="my-2 border-t border-slate-200" />
                  <Link
                    href="/model-monitoring"
                    className={`topbar-link ${path === "/model-monitoring" ? "active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    Thẩm định mô hình
                  </Link>
                  <button
                    type="button"
                    className="link-button mt-2 w-full"
                    onClick={() => {
                      if (demo.demoActive) demo.stopDemo();
                      else demo.startDemo();
                      setMobileOpen(false);
                    }}
                  >
                    <Play size={14} />
                    {demo.demoActive ? "Dừng Demo" : "Chạy Demo ca trực"}
                  </button>
                  <Link
                    href="/patients/new"
                    className="link-button primary mt-1 w-full"
                    onClick={() => setMobileOpen(false)}
                  >
                    <Plus size={14} />
                    Tiếp nhận ca
                  </Link>
                </nav>
              </DialogContent>
            </Dialog>

            <Link
              href="/dashboard"
              className="brand-link"
              aria-label="Sepsis Signal — Bảng ca trực"
            >
              <span className="brand-emblem">
                <Activity size={16} />
              </span>
              <span className="brand-meta">
                <strong>SEPSIS SIGNAL</strong>
                <small>Cấp cứu · Vinmec</small>
              </span>
            </Link>

            <nav className="topbar-nav" aria-label="Điều hướng chính">
              {primaryLinks.map(({ href, label }) => {
                const active = isPrimaryActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`topbar-link ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="topbar-right">
            <Link
              href="/model-monitoring"
              className={`topbar-secondary-link ${path === "/model-monitoring" ? "active" : ""}`}
              aria-current={path === "/model-monitoring" ? "page" : undefined}
            >
              Mô hình
            </Link>

            <button
              type="button"
              className={`demo-run-btn ${demo.demoActive ? "is-live" : ""}`}
              onClick={() =>
                demo.demoActive ? demo.togglePause() : demo.startDemo()
              }
              aria-label={
                demo.demoActive
                  ? demo.demoRunning
                    ? "Tạm dừng chạy Demo"
                    : "Tiếp tục chạy Demo"
                  : "Chạy Demo dữ liệu theo thời gian"
              }
            >
              {demo.demoActive ? (
                <>
                  <span
                    className={`live-pulse-dot ${demo.demoRunning ? "running" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="num">Demo · {hourLabel(demo.demoHour)}</span>
                </>
              ) : (
                <>
                  <Play size={13} aria-hidden="true" />
                  <span>Demo</span>
                </>
              )}
            </button>

            <Link href="/patients/new" className="link-button primary">
              <Plus size={14} />
              <span>Tiếp nhận ca</span>
            </Link>

            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Thông tin nguồn dữ liệu"
                  />
                }
              >
                <CircleHelp size={17} />
              </DialogTrigger>
              <DialogContent>
                <DialogTitle className="flex items-center gap-2">
                  <Database size={16} />
                  Nguồn dữ liệu & Mô phỏng · Sepsis Signal
                </DialogTitle>
                <DialogDescription>
                  Đang kết nối bộ dữ liệu:{" "}
                  <strong>{activeSourceMeta?.label}</strong> (
                  {activeSourceMeta?.sourceFile}).
                </DialogDescription>
                <div className="space-y-2 text-[13px] leading-relaxed text-slate-700">
                  <p>
                    Bấm nút <strong>Demo</strong> trên thanh trên để chạy mô
                    phỏng ca trực từ <strong>T0 → T0+12h</strong>. Sinh hiệu
                    (eForm), xét nghiệm (Labtc) và cảnh báo sớm sẽ cập nhật trực
                    tiếp theo từng giờ mà không rò rỉ dữ liệu tương lai.
                  </p>
                  <p className="secondary-text">
                    Ghi nhận đánh giá và bảng kiểm gói 1 giờ chỉ lưu cục bộ
                    trong phiên trình duyệt hiện tại.
                  </p>
                </div>
                {reviewCount > 0 && (
                  <Button
                    variant="outline"
                    onClick={reset}
                    className="mt-1 justify-center gap-2"
                  >
                    <RotateCcw size={14} />
                    Xóa {reviewCount} ghi nhận trong phiên này
                  </Button>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* LIVE DEMO TICKER BAR (Only visible when Demo is running/active) */}
        {demo.demoActive && (
          <div
            className="demo-live-bar"
            role="region"
            aria-label="Thanh điều khiển Demo trực tiếp"
          >
            <div className="demo-live-inner">
              <div className="demo-live-status">
                <span
                  className={`live-pulse-dot ${demo.demoRunning ? "running" : ""}`}
                  aria-hidden="true"
                />
                <strong>
                  {demo.demoRunning
                    ? "Đang chạy Demo"
                    : demo.demoHour >= demo.demoMaxHour
                      ? "Hoàn tất Demo (12h)"
                      : "Đang tạm dừng"}
                </strong>
                <span className="num demo-clock-pill">
                  {hourLabel(demo.demoHour)} / {demo.demoMaxHour}h
                </span>
                <span className="secondary-text hidden sm:inline">
                  {activeSourceMeta?.shortLabel}
                </span>
              </div>

              <div className="demo-progress-wrap" aria-label="Tiến độ mô phỏng">
                <div className="demo-progress-track">
                  <div
                    className="demo-progress-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              <div className="demo-live-actions">
                <button
                  type="button"
                  className="demo-mini-btn"
                  onClick={demo.togglePause}
                >
                  {demo.demoRunning ? (
                    <>
                      <Pause size={12} /> Tạm dừng
                    </>
                  ) : (
                    <>
                      <Play size={12} />{" "}
                      {demo.demoHour >= demo.demoMaxHour
                        ? "Chạy lại"
                        : "Tiếp tục"}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="demo-mini-btn num"
                  onClick={() => demo.setDemoSpeed(demo.demoSpeed === 1 ? 2 : 1)}
                  title="Đổi tốc độ chạy Demo"
                >
                  {demo.demoSpeed}x
                </button>
                <button
                  type="button"
                  className="demo-mini-btn"
                  onClick={demo.restartDemo}
                  aria-label="Chạy lại từ T0"
                >
                  <RotateCcw size={12} />
                </button>
                <button
                  type="button"
                  className="demo-mini-btn"
                  onClick={demo.stopDemo}
                  aria-label="Thoát chế độ Demo"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* NON-BLOCKING F1-RADIO LIVE ALERT TOAST DURING DEMO */}
      {demo.demoActive && demo.liveToast && (
        <aside className="demo-toast" role="status" aria-live="polite">
          <div className="demo-toast-body">
            <BellRing size={15} className="text-red-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-[12.5px] font-bold text-slate-900">
                Cảnh báo mới tại {hourLabel(demo.liveToast.hour)}
              </div>
              <div className="text-[12px] text-slate-600">
                <span className="num font-semibold text-red-700">
                  {demo.liveToast.encounterId}
                </span>{" "}
                vượt ngưỡng ({percent(demo.liveToast.score)})
              </div>
            </div>
          </div>
          <div className="demo-toast-actions">
            <Link
              href={`/patients/${demo.liveToast.encounterId}?hour=${demo.liveToast.hour}`}
              className="demo-toast-link"
              onClick={demo.dismissToast}
            >
              Xem ca →
            </Link>
            <button
              type="button"
              className="demo-toast-close"
              onClick={demo.dismissToast}
              aria-label="Đóng thông báo"
            >
              <X size={13} />
            </button>
          </div>
        </aside>
      )}

      <main id="main-content" className="page-canvas">
        {children}
      </main>
    </div>
  );
}
