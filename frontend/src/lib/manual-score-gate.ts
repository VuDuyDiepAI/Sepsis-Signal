import { allowedOrigins } from "./server/request-policy";
type Claim =
  | { ok: true; release: () => void }
  | { ok: false; status: number; message: string; retryAfter?: number };

/** Per-process admission control. Distributed/public deployments need shared limits and identity auth. */
export class ManualScoreGate {
  private active = 0;
  private arrivals: number[] = [];
  constructor(
    private options: {
      origins?: string[];
      maxConcurrent?: number;
      maxPerMinute?: number;
    } = {},
  ) {}
  claim(request: Request, now = Date.now()): Claim {
    // This gate checks request origin and resource use, never user identity.
    try {
      const target=new URL(request.url), origins=this.options.origins??allowedOrigins();
      // Next.js may normalize request.url to its internal hostname. Validate the
      // external Host/Origin against configuration; identity still requires a session.
      const origin=request.headers.get("origin"),host=request.headers.get("host")??target.host;
      if (!origins.some(value=>new URL(value).host===host) ||
          (origin && (!origins.includes(origin)||new URL(origin).host!==host)) || request.headers.get("sec-fetch-site")==="cross-site")
        return {ok:false,status:403,message:"Nguồn yêu cầu không hợp lệ."};
    } catch { return {ok:false,status:403,message:"Nguồn yêu cầu không hợp lệ."}; }
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
export const manualScoreGate = (scope.sepsisScoreGate ??= new ManualScoreGate());
