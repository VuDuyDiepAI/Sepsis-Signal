import { createHash, timingSafeEqual } from "node:crypto";
type Claim =
  | { ok: true; release: () => void }
  | { ok: false; status: number; message: string; retryAfter?: number };
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** Per-process admission control. Distributed/public deployments need shared limits and identity auth. */
export class ManualScoreGate {
  private active = 0;
  private arrivals: number[] = [];
  constructor(
    private options: {
      token?: string;
      maxConcurrent?: number;
      maxPerMinute?: number;
    } = {},
  ) {}
  claim(request: Request, now = Date.now()): Claim {
    const host = request.headers.get("host") ?? new URL(request.url).host;
    let hostname: string;
    try {
      hostname = new URL("http://" + host).hostname;
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).host !== host)
        return {
          ok: false,
          status: 403,
          message: "Nguồn yêu cầu không hợp lệ.",
        };
    } catch {
      return { ok: false, status: 403, message: "Nguồn yêu cầu không hợp lệ." };
    }
    const token = this.options.token;
    if (token) {
      const provided =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (
        !timingSafeEqual(
          createHash("sha256").update(provided).digest(),
          createHash("sha256").update(token).digest(),
        )
      )
        return {
          ok: false,
          status: 401,
          message: "Bộ chấm yêu cầu xác thực truy cập.",
        };
    } else if (
      !loopback.has(hostname) ||
      request.headers.has("forwarded") ||
      (request.headers.has("x-forwarded-host") &&
        request.headers.get("x-forwarded-host") !== host)
    ) {
      return {
        ok: false,
        status: 403,
        message:
          "Bộ chấm demo chỉ cho phép truy cập trên máy cục bộ. Truy cập từ xa cần cấu hình xác thực.",
      };
    }
    this.arrivals = this.arrivals.filter((t) => now - t < 60000);
    if (this.arrivals.length >= (this.options.maxPerMinute ?? 20))
      return {
        ok: false,
        status: 429,
        message:
          "Đã đạt giới hạn chấm điểm trong một phút. Vui lòng đợi rồi thử lại.",
        retryAfter: Math.max(
          1,
          Math.ceil((60000 - (now - this.arrivals[0])) / 1000),
        ),
      };
    if (this.active >= (this.options.maxConcurrent ?? 2))
      return {
        ok: false,
        status: 429,
        message:
          "Bộ chấm đang xử lý các hồ sơ khác. Vui lòng thử lại sau vài giây.",
        retryAfter: 2,
      };
    this.arrivals.push(now);
    this.active++;
    let released = false;
    return {
      ok: true,
      release: () => {
        if (!released) {
          this.active--;
          released = true;
        }
      },
    };
  }
}
const scope = globalThis as typeof globalThis & {
  sepsisScoreGate?: ManualScoreGate;
};
export const manualScoreGate = (scope.sepsisScoreGate ??= new ManualScoreGate({
  token: process.env.SEPSIS_API_TOKEN,
}));
