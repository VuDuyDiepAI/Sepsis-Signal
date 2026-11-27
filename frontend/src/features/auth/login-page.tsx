"use client";
import { useState } from "react";
import { useAppNavigation, useQuery } from "@/app/navigation";
import {
  Activity,
  Clock3,
  Eye,
  EyeOff,
  LockKeyhole,
  Route,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function destination(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "/dashboard";
  const url = new URL(value, "https://local.invalid");
  return /^\/(dashboard|patients(?:\/[A-Za-z0-9_-]+)?|sample-cases|model-monitoring)$/.test(
    url.pathname,
  )
    ? url.pathname + url.search
    : "/dashboard";
}

const pillars = [
  {
    icon: Clock3,
    title: "Cảnh báo sớm 4–6 giờ",
    detail: "Theo dõi mở rộng [T0, t], khóa đợt 6 giờ chống nhờn báo động.",
  },
  {
    icon: Route,
    title: "Định tuyến ED → Nội trú → ICU",
    detail: "Phân tuyến đúng kíp trực theo khoa, đối chứng qSOFA / SIRS / MEWS.",
  },
  {
    icon: ShieldCheck,
    title: "An toàn & lưu vết kiểm định",
    detail: "Chạy nội viện, không log PHI; tách bạch “đã xem xét” với y lệnh.",
  },
] as const;

export default function LoginPage() {
  const auth = useAuth(),
    router = useAppNavigation(),
    params = useQuery();
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  return (
    <main className="login-screen">
      <section className="login-intro" aria-label="Giới thiệu Sepsis Signal">
        <svg
          className="login-wave"
          viewBox="0 0 640 180"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M0 112 H155 L178 112 L194 64 L214 148 L234 32 L254 128 L272 112 H410 L432 82 L450 132 L468 58 L484 112 H640"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="login-intro-inner">
          <div className="login-org-pill">KHOA CẤP CỨU · VINMEC TIMES CITY</div>
          <div className="login-brand">
            <span className="login-brand-mark">
              <Activity size={26} />
            </span>
            <div>
              <strong>SEPSIS SIGNAL</strong>
              <small>Clinical Intelligence</small>
            </div>
          </div>
          <p className="login-hero-title">
            Hỗ trợ cảnh báo sớm nguy cơ nhiễm khuẩn huyết theo chuỗi thời gian
          </p>
          <p className="login-hero-desc">
            Tổng hợp liên tục sinh hiệu, xét nghiệm và động học từ T0 giúp kíp
            trực ưu tiên đánh giá sớm người bệnh có nguy cơ.
          </p>
          <ul className="login-pillars">
            {pillars.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="login-pillar">
                <span className="login-pillar-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="login-disclaimer">
            Môi trường nghiên cứu &amp; trải nghiệm kỹ thuật trên dữ liệu EMR mô
            phỏng — chưa kết nối hệ thống bệnh viện.
          </p>
        </div>
      </section>

      <section className="login-stage" aria-label="Đăng nhập Sepsis Signal">
        <div className="login-card">
          <div className="login-card-head">
            <span className="login-card-badge">Không gian lâm sàng</span>
            <h1>Đăng nhập</h1>
            <p>
              Sử dụng tài khoản được cấp để mở hồ sơ theo dõi và ghi nhận đánh
              giá cảnh báo.
            </p>
          </div>
          <form
            className="login-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await auth.login(username, password);
                router.replace(destination(params.get("next")));
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Không đăng nhập được.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="login-field">
              <span>Tên đăng nhập</span>
              <span className="login-input-wrap">
                <UserRound size={17} className="login-input-icon" />
                <Input
                  autoComplete="username"
                  placeholder="Ví dụ: bacsi.demo1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  maxLength={80}
                />
              </span>
            </label>
            <label className="login-field">
              <span>Mật khẩu</span>
              <span className="login-input-wrap has-toggle">
                <LockKeyhole size={17} className="login-input-icon" />
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  maxLength={200}
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {(error || auth.error) && (
              <p className="form-error" role="alert">
                {error || auth.error}
              </p>
            )}
            <Button
              type="submit"
              className="login-submit"
              disabled={busy || auth.loading}
            >
              <LockKeyhole size={17} />
              {busy ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
          </form>

          {auth.demoAccounts.length > 0 && (
            <div className="login-demo">
              <div className="login-demo-head">
                <h2>Tài khoản trải nghiệm</h2>
                <span>Chọn để điền nhanh thông tin</span>
              </div>
              <div className="login-demo-list">
                {auth.demoAccounts.map((account) => {
                  const selected = username === account.username;
                  return (
                    <button
                      key={account.username}
                      type="button"
                      className={`login-demo-card ${selected ? "is-selected" : ""}`}
                      onClick={() => {
                        setUsername(account.username);
                        setPassword(account.password);
                        setError("");
                      }}
                    >
                      <span className="login-demo-avatar" aria-hidden="true">
                        BS
                      </span>
                      <span className="login-demo-meta">
                        <strong>{account.displayName}</strong>
                        <span>
                          {account.username} · {account.password}
                        </span>
                      </span>
                      <span className="login-demo-action">
                        {selected ? "Đã chọn" : "Điền nhanh"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
